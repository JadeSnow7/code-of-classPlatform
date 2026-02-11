# simulation-rs

Rust numerical kernels for simulation service, exposed to Python through PyO3.

## Scope

- `simulate_wave_1d`: FDTD kernel only.
- Visualization remains in Python (`matplotlib`) in `code/simulation`.

## Build (local)

```bash
cd code/simulation-rs
cargo build
```

For Python packaging, use maturin or a custom wheel pipeline later.
