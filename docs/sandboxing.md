# Sandboxing and Dynamic Verification

Static inspection is the default. Target code is never implicitly executed.

## Authorization model

Dynamic verification requires all of the following:

1. `.drantis.yml` explicitly enables verification;
2. the policy defines the verification command and purpose;
3. the command identifies a runner image;
4. the Drantis host independently allowlists that exact image;
5. the image is pinned by sha256 digest or image ID by default;
6. the invocation explicitly supplies execution authorization (`launchproof verify --allow-execution --runner-image sha256:<id>`);
7. an `IsolatedRunner` implementation is configured.

If policy requests verification but invocation authorization is absent, Drantis emits `verification.authorization-missing` evidence and does not execute the command.

## Docker runner controls

`DockerEphemeralRunner` uses:

- direct argument spawning (`shell: false`);
- a host-owned image allowlist that is independent from repository policy;
- sha256-pinned images/image IDs by default;
- read-only bind mount of the repository;
- read-only container root filesystem;
- `--cap-drop=ALL`;
- `no-new-privileges`;
- memory, CPU and PID limits;
- bounded temporary filesystems;
- timeout with forced termination;
- bounded stdout/stderr capture;
- provider/credential pattern redaction before command output is retained as evidence;
- network `none`; `restricted` egress currently fails closed until an explicit egress policy/proxy is configured;
- automatic container removal.

The runner receives no Drantis/provider credentials by default.

## What is still untrusted

A container boundary reduces host exposure but does not turn malicious code into trusted code. Operators should maintain the container runtime, restrict allowed images, avoid mounting Docker socket into Drantis services, and use stronger workload isolation (for example VM/microVM or hardened sandbox runtime) when threat models require it.
