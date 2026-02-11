use pyo3::exceptions::PyValueError;
use pyo3::prelude::*;

#[derive(Clone, Debug)]
struct WaveParams {
    length: f64,
    nx: usize,
    c: f64,
    total_time: f64,
    source_type: String,
    source_position: f64,
    source_frequency: f64,
    boundary_condition: String,
    save_every: usize,
}

#[pyclass]
#[derive(Clone, Debug)]
pub struct Wave1DResult {
    #[pyo3(get)]
    pub x: Vec<f64>,
    #[pyo3(get)]
    pub time_steps: Vec<f64>,
    #[pyo3(get)]
    pub field_history: Vec<Vec<f64>>,
    #[pyo3(get)]
    pub dx: f64,
    #[pyo3(get)]
    pub dt: f64,
    #[pyo3(get)]
    pub c: f64,
}

fn validate_choice(value: &str, allowed: &[&str], field: &str) -> Result<(), String> {
    if allowed.contains(&value) {
        return Ok(());
    }
    Err(format!(
        "invalid {}='{}', allowed: {}",
        field,
        value,
        allowed.join(", ")
    ))
}

fn simulate_wave_1d_native(params: &WaveParams) -> Result<Wave1DResult, String> {
    if params.length <= 0.0 {
        return Err("length must be > 0".to_string());
    }
    if params.nx < 3 {
        return Err("nx must be >= 3".to_string());
    }
    if params.c <= 0.0 {
        return Err("c must be > 0".to_string());
    }
    if params.total_time <= 0.0 {
        return Err("total_time must be > 0".to_string());
    }
    if params.save_every == 0 {
        return Err("save_every must be >= 1".to_string());
    }

    validate_choice(
        &params.source_type,
        &["gaussian", "sinusoidal", "step"],
        "source_type",
    )?;
    validate_choice(
        &params.boundary_condition,
        &["absorbing", "reflecting", "periodic"],
        "boundary_condition",
    )?;

    let dx = params.length / (params.nx as f64 - 1.0);
    let dt = 0.5 * dx / params.c;
    let n_time_steps = ((params.total_time / dt).floor() as usize).max(1);

    let source_index = (params.source_position * params.nx as f64)
        .floor()
        .clamp(0.0, (params.nx - 1) as f64) as usize;

    let mut e = vec![0.0; params.nx];
    let mut e_prev = vec![0.0; params.nx];
    let mut e_next = vec![0.0; params.nx];

    let courant = params.c * dt / dx;
    let s2 = courant * courant;

    let mut saved_times = Vec::with_capacity(n_time_steps / params.save_every + 1);
    let mut field_history = Vec::with_capacity(n_time_steps / params.save_every + 1);

    for n in 0..n_time_steps {
        let t = n as f64 * dt;

        let source = match params.source_type.as_str() {
            "gaussian" => {
                let t0 = 3e-9;
                let sigma = 0.5e-9;
                (-((t - t0).powi(2)) / (2.0 * sigma * sigma)).exp()
            }
            "sinusoidal" => (2.0 * std::f64::consts::PI * params.source_frequency * t).sin(),
            _ => {
                if t > 1e-9 {
                    1.0
                } else {
                    0.0
                }
            }
        };

        for i in 1..(params.nx - 1) {
            e_next[i] = 2.0 * e[i] - e_prev[i] + s2 * (e[i + 1] - 2.0 * e[i] + e[i - 1]);
        }

        e_next[source_index] += source * dt * dt;

        match params.boundary_condition.as_str() {
            "absorbing" => {
                e_next[0] = e[1] + (courant - 1.0) / (courant + 1.0) * (e_next[1] - e[0]);
                e_next[params.nx - 1] = e[params.nx - 2]
                    + (courant - 1.0) / (courant + 1.0)
                        * (e_next[params.nx - 2] - e[params.nx - 1]);
            }
            "reflecting" => {
                e_next[0] = 0.0;
                e_next[params.nx - 1] = 0.0;
            }
            _ => {
                e_next[0] = e_next[params.nx - 2];
                e_next[params.nx - 1] = e_next[1];
            }
        }

        std::mem::swap(&mut e_prev, &mut e);
        std::mem::swap(&mut e, &mut e_next);

        if n % params.save_every == 0 {
            saved_times.push(t);
            field_history.push(e.clone());
        }
    }

    let x = (0..params.nx)
        .map(|idx| idx as f64 * params.length / (params.nx as f64 - 1.0))
        .collect();

    Ok(Wave1DResult {
        x,
        time_steps: saved_times,
        field_history,
        dx,
        dt,
        c: params.c,
    })
}

#[pyfunction]
#[pyo3(signature = (
    length=1.0,
    nx=200,
    c=3e8,
    total_time=10e-9,
    source_type="gaussian",
    source_position=0.2,
    source_frequency=1e9,
    boundary_condition="absorbing",
    save_every=10
))]
pub fn simulate_wave_1d(
    length: f64,
    nx: usize,
    c: f64,
    total_time: f64,
    source_type: &str,
    source_position: f64,
    source_frequency: f64,
    boundary_condition: &str,
    save_every: usize,
) -> PyResult<Wave1DResult> {
    let params = WaveParams {
        length,
        nx,
        c,
        total_time,
        source_type: source_type.to_string(),
        source_position,
        source_frequency,
        boundary_condition: boundary_condition.to_string(),
        save_every,
    };

    simulate_wave_1d_native(&params).map_err(PyValueError::new_err)
}

#[pymodule]
fn simulation_rs(_py: Python<'_>, m: &Bound<'_, PyModule>) -> PyResult<()> {
    m.add_class::<Wave1DResult>()?;
    m.add_function(wrap_pyfunction!(simulate_wave_1d, m)?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_kernel_returns_data() {
        let params = WaveParams {
            length: 1.0,
            nx: 120,
            c: 3e8,
            total_time: 5e-9,
            source_type: "gaussian".to_string(),
            source_position: 0.2,
            source_frequency: 1e9,
            boundary_condition: "absorbing".to_string(),
            save_every: 5,
        };

        let out = simulate_wave_1d_native(&params).expect("kernel should succeed");

        assert_eq!(out.x.len(), 120);
        assert!(!out.time_steps.is_empty());
        assert_eq!(out.time_steps.len(), out.field_history.len());
    }
}
