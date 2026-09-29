use std::{
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const MAX_OUTPUT_BYTES: usize = 1_000_000;
const COMMAND_TIMEOUT: Duration = Duration::from_secs(60);

fn canonical_repository(path: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(path);
    let canonical = candidate
        .canonicalize()
        .map_err(|_| "Repository path does not exist.".to_string())?;
    if !canonical.is_dir() {
        return Err("Repository path must be a directory.".to_string());
    }
    if canonical.components().count() < 2 {
        return Err("Refusing to analyze a filesystem root.".to_string());
    }
    let display = canonical.to_string_lossy();
    if display.contains('\0') {
        return Err("Invalid repository path.".to_string());
    }
    Ok(canonical)
}

#[tauri::command]
fn validate_repository_path(path: String) -> Result<String, String> {
    Ok(canonical_repository(&path)?.to_string_lossy().to_string())
}

fn operation_spec(operation: &str) -> Option<(&'static str, &'static [&'static str])> {
    match operation {
        "senten.version" => Some(("senten", &["--version"])),
        "senten.doctor" => Some(("senten", &["doctor"])),
        "senten.project" => Some(("senten", &["ask", "project", "--format", "json"])),
        "senten.architecture" => Some(("senten", &["ask", "architecture", "--format", "json"])),
        "senten.security" => Some(("senten", &["security", "status"])),
        "senten.evidence" => Some(("senten", &["evidence", "summary"])),
        "senten.proof" => Some(("senten", &["proof"])),
        "senten.runtime-alignment" => Some(("senten", &["runtime", "alignment"])),
        "senten.assurance-claims" => Some(("senten", &["assurance", "claims"])),
        "senten.launchproof-status" => Some(("senten", &["launchproof", "status"])),
        "senten.launchproof-export" => Some(("senten", &["launchproof", "export"])),
        "git.status" => Some(("git", &["status", "--porcelain=v1", "--branch"])),
        "docker.version" => Some(("docker", &["version", "--format", "{{json .Client}}"])),
        _ => None,
    }
}

fn temporary_output_file(kind: &str) -> Result<(PathBuf, File), String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "System clock error.".to_string())?
        .as_nanos();
    let path = std::env::temp_dir().join(format!(
        "launchproof-{}-{}-{}.log",
        kind,
        std::process::id(),
        stamp
    ));
    let file = File::create(&path)
        .map_err(|error| format!("Unable to create bounded command output file: {error}"))?;
    Ok((path, file))
}

fn read_bounded(path: &Path) -> Result<String, String> {
    let file =
        File::open(path).map_err(|error| format!("Unable to read command output: {error}"))?;
    let mut buffer = Vec::new();
    file.take(MAX_OUTPUT_BYTES as u64)
        .read_to_end(&mut buffer)
        .map_err(|error| format!("Unable to read command output: {error}"))?;
    Ok(String::from_utf8_lossy(&buffer).to_string())
}

fn approved_command(program: &str, args: &[&str]) -> Command {
    #[cfg(target_os = "windows")]
    {
        if program == "senten" {
            // Senten is distributed through npm. On Windows the stable package is exposed
            // as senten.cmd. The shell boundary is fixed here: neither executable nor
            // arguments come from the webview.
            let mut command = Command::new("cmd.exe");
            command.args(["/d", "/s", "/c", "senten.cmd"]);
            command.args(args);
            return command;
        }
    }

    let mut command = Command::new(program);
    command.args(args);
    command
}

#[tauri::command]
fn run_native_operation(
    operation: String,
    repository_path: String,
) -> Result<serde_json::Value, String> {
    let repository = canonical_repository(&repository_path)?;
    let (program, args) = operation_spec(&operation)
        .ok_or_else(|| "Operation is not allowlisted by LaunchProof desktop.".to_string())?;
    let (stdout_path, stdout_file) = temporary_output_file("stdout")?;
    let (stderr_path, stderr_file) = temporary_output_file("stderr")?;

    let mut command = approved_command(program, args);
    let mut child = command
        .current_dir(&repository)
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file))
        .spawn()
        .map_err(|error| format!("Unable to start approved native operation {operation}: {error}"))?;

    let started = Instant::now();
    let status = loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Unable to observe native operation: {error}"))?
        {
            break status;
        }
        if started.elapsed() >= COMMAND_TIMEOUT {
            let _ = child.kill();
            let _ = child.wait();
            let stdout = read_bounded(&stdout_path).unwrap_or_default();
            let stderr = read_bounded(&stderr_path).unwrap_or_default();
            let _ = fs::remove_file(&stdout_path);
            let _ = fs::remove_file(&stderr_path);
            return Ok(serde_json::json!({
                "operation": operation,
                "ok": false,
                "timedOut": true,
                "exitCode": null,
                "stdout": stdout,
                "stderr": stderr
            }));
        }
        thread::sleep(Duration::from_millis(50));
    };

    let stdout = read_bounded(&stdout_path)?;
    let stderr = read_bounded(&stderr_path)?;
    let _ = fs::remove_file(&stdout_path);
    let _ = fs::remove_file(&stderr_path);
    Ok(serde_json::json!({
        "operation": operation,
        "ok": status.success(),
        "timedOut": false,
        "exitCode": status.code(),
        "stdout": stdout,
        "stderr": stderr,
        "outputTruncatedAtBytes": MAX_OUTPUT_BYTES,
    }))
}

#[tauri::command]
fn desktop_capabilities() -> serde_json::Value {
    serde_json::json!({
        "filesystem": "narrow-command-boundary",
        "process": "allowlisted-native-operations-only",
        "shell": "fixed-windows-npm-shim-only",
        "credentials": "not-exposed-to-webview",
        "analysis": "delegated-to-launchproof-core-service",
        "sentenTarget": "1.0.3",
        "nativeOperations": [
            "senten.version",
            "senten.doctor",
            "senten.project",
            "senten.architecture",
            "senten.security",
            "senten.evidence",
            "senten.proof",
            "senten.runtime-alignment",
            "senten.assurance-claims",
            "senten.launchproof-status",
            "senten.launchproof-export",
            "git.status",
            "docker.version"
        ]
    })
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            validate_repository_path,
            run_native_operation,
            desktop_capabilities
        ])
        .run(tauri::generate_context!())
        .expect("error while running LaunchProof desktop");
}
