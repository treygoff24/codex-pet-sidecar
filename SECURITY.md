# Security

Report security issues privately to the repository maintainer before opening a public issue.

Public defaults favor safety: ephemeral sessions, workspace-write sandboxing, and approval-on-request behavior when supported by the installed Codex app-server protocol. Power mode is an explicit opt-in for trusted local use only.

Pet imports validate package-relative asset paths and reject absolute paths, traversal, symlink escapes, and non-regular files before exposing assets to the app.
