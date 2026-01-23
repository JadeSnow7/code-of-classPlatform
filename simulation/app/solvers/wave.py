"""Wave equation solvers using FDTD method."""

from __future__ import annotations

import io
import base64
from dataclasses import dataclass
from typing import Literal

import numpy as np
import matplotlib
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation

matplotlib.use("Agg")


@dataclass
class Wave1DResult:
    """Result of 1D wave equation simulation."""
    x: np.ndarray
    time_steps: np.ndarray
    field_history: np.ndarray  # shape: (n_time, n_x)
    dx: float
    dt: float
    c: float


def simulate_wave_1d(
    length: float = 1.0,
    nx: int = 200,
    c: float = 3e8,  # Speed of light in vacuum
    total_time: float = 10e-9,  # 10 nanoseconds
    source_type: Literal["gaussian", "sinusoidal", "step"] = "gaussian",
    source_position: float = 0.2,
    source_frequency: float = 1e9,  # 1 GHz
    boundary_condition: Literal["absorbing", "reflecting", "periodic"] = "absorbing",
    save_every: int = 10,
) -> Wave1DResult:
    """
    Simulate 1D wave equation using FDTD method.

    ∂²E/∂t² = c² ∂²E/∂x²

    Args:
        length: Length of simulation domain in meters
        nx: Number of spatial grid points
        c: Wave speed (default: speed of light)
        total_time: Total simulation time
        source_type: Type of source ("gaussian", "sinusoidal", "step")
        source_position: Position of source (fraction of length)
        source_frequency: Frequency for sinusoidal source
        boundary_condition: Boundary type
        save_every: Save field every N time steps

    Returns:
        Wave1DResult with simulation data
    """
    dx = length / (nx - 1)
    dt = 0.5 * dx / c  # CFL condition: c*dt/dx <= 1

    n_time_steps = int(total_time / dt)
    source_index = int(source_position * nx)

    # Initialize fields (using leapfrog scheme)
    E = np.zeros(nx)
    E_prev = np.zeros(nx)
    E_next = np.zeros(nx)

    # Courant number
    S = c * dt / dx

    # Storage for history
    saved_times = []
    field_history = []

    for n in range(n_time_steps):
        t = n * dt

        # Source term
        if source_type == "gaussian":
            # Gaussian pulse
            t0 = 3e-9
            sigma = 0.5e-9
            source = np.exp(-((t - t0) ** 2) / (2 * sigma**2))
        elif source_type == "sinusoidal":
            # Continuous sine wave
            source = np.sin(2 * np.pi * source_frequency * t)
        else:  # step
            source = 1.0 if t > 1e-9 else 0.0

        # Update interior points using central difference scheme
        E_next[1:-1] = (
            2 * E[1:-1]
            - E_prev[1:-1]
            + S**2 * (E[2:] - 2 * E[1:-1] + E[:-2])
        )

        # Add source (soft source)
        E_next[source_index] += source * dt**2

        # Apply boundary conditions
        if boundary_condition == "absorbing":
            # Mur's first-order ABC
            E_next[0] = E[1] + (S - 1) / (S + 1) * (E_next[1] - E[0])
            E_next[-1] = E[-2] + (S - 1) / (S + 1) * (E_next[-2] - E[-1])
        elif boundary_condition == "reflecting":
            E_next[0] = 0
            E_next[-1] = 0
        else:  # periodic
            E_next[0] = E_next[-2]
            E_next[-1] = E_next[1]

        # Swap arrays
        E_prev = E.copy()
        E = E_next.copy()

        # Save history
        if n % save_every == 0:
            saved_times.append(t)
            field_history.append(E.copy())

    x = np.linspace(0, length, nx)

    return Wave1DResult(
        x=x,
        time_steps=np.array(saved_times),
        field_history=np.array(field_history),
        dx=dx,
        dt=dt,
        c=c,
    )


def plot_wave_snapshot(
    result: Wave1DResult,
    time_index: int = -1,
) -> str:
    """
    Plot a single snapshot of the wave field.

    Args:
        result: Wave1DResult from simulation
        time_index: Which time step to plot (-1 for last)

    Returns:
        Base64-encoded PNG string
    """
    fig, ax = plt.subplots(figsize=(10, 4), dpi=150)

    E = result.field_history[time_index]
    t = result.time_steps[time_index]

    ax.plot(result.x * 1e2, E, "b-", linewidth=1.5)
    ax.fill_between(result.x * 1e2, E, alpha=0.3)

    ax.set_xlabel("x (cm)")
    ax.set_ylabel("E (归一化)")
    ax.set_title(f"1D 电磁波传播 (t = {t*1e9:.2f} ns)")
    ax.grid(True, alpha=0.3)
    ax.set_ylim(-1.5, 1.5)
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png")
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def plot_wave_spacetime(
    result: Wave1DResult,
) -> str:
    """
    Plot a space-time diagram (x vs t) showing wave propagation.

    Args:
        result: Wave1DResult from simulation

    Returns:
        Base64-encoded PNG string
    """
    fig, ax = plt.subplots(figsize=(10, 6), dpi=150)

    # Create meshgrid for plotting
    X, T = np.meshgrid(result.x * 1e2, result.time_steps * 1e9)

    # Plot as pseudocolor
    vmax = np.max(np.abs(result.field_history)) * 0.8
    im = ax.pcolormesh(
        X, T, result.field_history,
        shading="auto",
        cmap="RdBu_r",
        vmin=-vmax,
        vmax=vmax,
    )

    fig.colorbar(im, ax=ax, label="E (归一化)")
    ax.set_xlabel("x (cm)")
    ax.set_ylabel("t (ns)")
    ax.set_title("1D 波动方程时空图")
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png")
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def calculate_reflection_coefficient(
    n1: float,
    n2: float,
    theta_i: float = 0.0,
    polarization: Literal["s", "p"] = "s",
) -> dict:
    """
    Calculate reflection and transmission coefficients at interface.

    Args:
        n1: Refractive index of medium 1
        n2: Refractive index of medium 2
        theta_i: Angle of incidence in degrees
        polarization: "s" (TE) or "p" (TM) polarization

    Returns:
        Dictionary with coefficients and angles
    """
    theta_i_rad = np.radians(theta_i)

    # Snell's law
    sin_theta_t = n1 / n2 * np.sin(theta_i_rad)

    if abs(sin_theta_t) > 1:
        # Total internal reflection
        return {
            "theta_i": theta_i,
            "theta_t": None,
            "total_internal_reflection": True,
            "r": 1.0,
            "t": 0.0,
            "R": 1.0,
            "T": 0.0,
            "critical_angle": np.degrees(np.arcsin(n2 / n1)),
        }

    theta_t_rad = np.arcsin(sin_theta_t)
    theta_t = np.degrees(theta_t_rad)

    cos_i = np.cos(theta_i_rad)
    cos_t = np.cos(theta_t_rad)

    if polarization == "s":
        # Fresnel equations for s-polarization (TE)
        r = (n1 * cos_i - n2 * cos_t) / (n1 * cos_i + n2 * cos_t)
        t = 2 * n1 * cos_i / (n1 * cos_i + n2 * cos_t)
    else:
        # Fresnel equations for p-polarization (TM)
        r = (n2 * cos_i - n1 * cos_t) / (n2 * cos_i + n1 * cos_t)
        t = 2 * n1 * cos_i / (n2 * cos_i + n1 * cos_t)

    R = r**2
    T = (n2 * cos_t) / (n1 * cos_i) * t**2

    return {
        "theta_i": theta_i,
        "theta_t": theta_t,
        "total_internal_reflection": False,
        "r": float(r),
        "t": float(t),
        "R": float(R),
        "T": float(T),
        "n1": n1,
        "n2": n2,
        "polarization": polarization,
        "conservation_check": R + T,  # Should be ~1
    }
