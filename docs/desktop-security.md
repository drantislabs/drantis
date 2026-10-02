# Desktop Security

Drantis Desktop uses a Tauri 2 shell under `apps/desktop`.

The webview is deliberately not granted unrestricted filesystem, shell/process, Docker or credential capabilities. The current native boundary exposes only narrow commands such as repository-path validation and capability reporting. Analysis remains a Drantis Core responsibility rather than a second Rust implementation.

Future desktop integration should communicate with a packaged local Drantis Core service or narrowly scoped sidecar. Any privileged operation must have an explicit command contract, input validation and least-privilege Tauri capability declaration. Provider credentials should use OS-backed secure storage and never enter the webview DOM or serialized analysis report.

## Native operation bridge

The desktop webview does not receive shell access. Approved Senten/Git/Docker actions use fixed operation IDs mapped in Rust to fixed executable/argument vectors. Repository paths are canonicalized natively. The bridge does not accept user-supplied program names or argument arrays, does not invoke a shell, has a fixed timeout and bounds captured output.

Windows npm `.cmd` shims are not automatically executed through `cmd.exe`; a sidecar-safe Senten packaging path must pass the release-candidate checkpoint before this bridge is called production-ready on Windows.
