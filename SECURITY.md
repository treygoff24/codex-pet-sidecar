# Security

Report security issues via [private vulnerability reporting](https://github.com/treygoff24/codex-pet-sidecar/security/advisories/new). For non-security questions, open an [issue](https://github.com/treygoff24/codex-pet-sidecar/issues).

Public defaults favor safety: ephemeral sessions, workspace-write sandboxing, and approval-on-request behavior when supported by the installed Codex app-server protocol. Power mode is an explicit opt-in for trusted local use only.

Pet imports validate package-relative asset paths and reject absolute paths, traversal, symlink escapes, and non-regular files before exposing assets to the app.
