# desktop-tauri (POC shell)

This folder hosts the desktop edge shell for Tauri integration.

## Current scope

- Exposes `router_decide` command from `router_core`.
- Keeps the command contract JSON-compatible for frontend calls.

Build with Tauri command feature when the full desktop app scaffolding is ready:

```bash
cd src-tauri
cargo run --features tauri-command
```
