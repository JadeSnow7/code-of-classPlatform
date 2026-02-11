# rust-core

Shared Rust workspace for edge routing and sync logic.

## Crates

- `router_core`: deterministic routing decisions (`local` vs `cloud`).
- `sync_core`: offline-first sync planning.
- `ffi_bridge`: JSON bridge helpers for Tauri and React Native bindings.

## Quick start

```bash
cargo fmt --check
cargo test
```
