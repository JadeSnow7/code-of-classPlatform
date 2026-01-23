"""Magnetostatics solvers for magnetic field calculations."""

from __future__ import annotations

import io
import base64
from dataclasses import dataclass
from typing import List, Tuple

import numpy as np
import matplotlib
import matplotlib.pyplot as plt

matplotlib.use("Agg")

# Permeability of free space
MU_0 = 4 * np.pi * 1e-7  # H/m


@dataclass
class CurrentElement:
    """A current-carrying wire segment."""
    x1: float  # Start x
    y1: float  # Start y
    x2: float  # End x
    y2: float  # End y
    current: float  # Current in Amperes


@dataclass
class InfiniteWire:
    """An infinite straight wire perpendicular to the xy-plane."""
    x: float  # x position
    y: float  # y position
    current: float  # Current in Amperes (positive = out of page)


@dataclass
class MagneticFieldResult:
    """Result of magnetic field calculation."""
    x_grid: np.ndarray
    y_grid: np.ndarray
    field_x: np.ndarray
    field_y: np.ndarray
    field_magnitude: np.ndarray


def calculate_infinite_wire_field(
    wires: List[InfiniteWire],
    x_range: Tuple[float, float] = (-1.0, 1.0),
    y_range: Tuple[float, float] = (-1.0, 1.0),
    grid_size: int = 50,
    min_distance: float = 0.02,
) -> MagneticFieldResult:
    """
    Calculate magnetic field from infinite straight wires using Biot-Savart law.

    For an infinite wire: B = μ₀I / (2πr)

    Args:
        wires: List of infinite wire definitions
        x_range: (x_min, x_max) for calculation domain
        y_range: (y_min, y_max) for calculation domain
        grid_size: Number of grid points in each direction
        min_distance: Minimum distance from wires to avoid singularities

    Returns:
        MagneticFieldResult with field components
    """
    x = np.linspace(x_range[0], x_range[1], grid_size)
    y = np.linspace(y_range[0], y_range[1], grid_size)
    X, Y = np.meshgrid(x, y)

    Bx = np.zeros_like(X)
    By = np.zeros_like(X)

    for wire in wires:
        dx = X - wire.x
        dy = Y - wire.y
        r = np.sqrt(dx**2 + dy**2)
        r = np.maximum(r, min_distance)

        # Magnitude of B field: B = μ₀I / (2πr)
        B_mag = MU_0 * wire.current / (2 * np.pi * r)

        # Direction: perpendicular to radius, following right-hand rule
        # B = B_mag * (−sinθ, cosθ) where θ is angle from wire to point
        # This gives tangent direction
        Bx += B_mag * (-dy / r)
        By += B_mag * (dx / r)

    B_magnitude = np.sqrt(Bx**2 + By**2)

    return MagneticFieldResult(
        x_grid=X,
        y_grid=Y,
        field_x=Bx,
        field_y=By,
        field_magnitude=B_magnitude,
    )


def calculate_solenoid_field(
    n_turns: int = 100,
    length: float = 0.1,
    radius: float = 0.02,
    current: float = 1.0,
) -> dict:
    """
    Calculate magnetic field inside and outside a solenoid.

    Inside: B = μ₀nI (approximately uniform)
    Outside: B ≈ 0 (for ideal infinite solenoid)

    Args:
        n_turns: Number of turns
        length: Length of solenoid in meters
        radius: Radius of solenoid in meters
        current: Current in Amperes

    Returns:
        Dictionary with field values and parameters
    """
    n = n_turns / length  # turns per unit length

    B_inside = MU_0 * n * current
    B_outside = 0.0  # Idealized

    return {
        "n_turns": n_turns,
        "length": length,
        "radius": radius,
        "current": current,
        "turns_per_meter": n,
        "B_inside": B_inside,
        "B_outside": B_outside,
        "B_inside_mT": B_inside * 1000,
        "formula": "B = μ₀nI",
    }


def plot_magnetic_field(
    result: MagneticFieldResult,
    wires: List[InfiniteWire],
    show_magnitude: bool = True,
    show_field_lines: bool = True,
) -> str:
    """
    Generate a visualization of magnetic field.

    Args:
        result: MagneticFieldResult from calculation
        wires: List of wire positions (for drawing markers)
        show_magnitude: Whether to show field magnitude as heatmap
        show_field_lines: Whether to show field lines

    Returns:
        Base64-encoded PNG string
    """
    fig, ax = plt.subplots(figsize=(8, 6), dpi=150)

    X, Y = result.x_grid, result.y_grid

    if show_magnitude:
        # Log scale for better visualization
        B_log = np.log10(result.field_magnitude + 1e-10)
        im = ax.contourf(X, Y, B_log, levels=20, cmap="magma", alpha=0.8)
        cbar = fig.colorbar(im, ax=ax, label="log₁₀(|B|) (T)")

    if show_field_lines:
        # Normalize field for streamplot
        Bx_norm = result.field_x / (result.field_magnitude + 1e-10)
        By_norm = result.field_y / (result.field_magnitude + 1e-10)
        ax.streamplot(
            X, Y, Bx_norm, By_norm,
            density=1.5,
            color="white" if show_magnitude else "black",
            linewidth=0.8,
            arrowsize=0.8,
        )

    # Draw wire markers
    for wire in wires:
        color = "cyan" if wire.current > 0 else "orange"
        marker = "o" if wire.current > 0 else "x"
        label = "⊙" if wire.current > 0 else "⊗"
        ax.plot(wire.x, wire.y, marker, markersize=12, color=color,
                markeredgewidth=2, markerfacecolor="white" if wire.current > 0 else color)
        ax.annotate(f"I={wire.current:.2f}A", (wire.x, wire.y),
                   xytext=(5, 5), textcoords="offset points",
                   fontsize=8, color="white" if show_magnitude else "black")

    ax.set_xlabel("x (m)")
    ax.set_ylabel("y (m)")
    ax.set_title("载流导线磁场分布 (Biot-Savart)")
    ax.set_aspect("equal")
    ax.grid(True, alpha=0.3)
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png")
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def calculate_ampere_loop(
    wires: List[InfiniteWire],
    center: Tuple[float, float],
    radius: float,
    num_points: int = 100,
) -> dict:
    """
    Verify Ampere's circuital law by computing ∮B·dl around a circular path.

    Args:
        wires: List of infinite wires
        center: (x, y) center of integration path
        radius: Radius of circular path
        num_points: Number of integration points

    Returns:
        Dictionary with line integral result and verification
    """
    theta = np.linspace(0, 2 * np.pi, num_points, endpoint=False)
    d_theta = 2 * np.pi / num_points

    # Points on the circle
    x_circle = center[0] + radius * np.cos(theta)
    y_circle = center[1] + radius * np.sin(theta)

    # Tangent vectors (dl direction)
    tx = -np.sin(theta)
    ty = np.cos(theta)

    # Calculate B field at each point
    Bx_total = np.zeros(num_points)
    By_total = np.zeros(num_points)

    for wire in wires:
        dx = x_circle - wire.x
        dy = y_circle - wire.y
        r = np.sqrt(dx**2 + dy**2)
        r = np.maximum(r, 1e-10)

        B_mag = MU_0 * wire.current / (2 * np.pi * r)
        Bx_total += B_mag * (-dy / r)
        By_total += B_mag * (dx / r)

    # B·dl, where dl = r * d_theta * t̂
    B_dot_t = Bx_total * tx + By_total * ty
    line_integral = np.sum(B_dot_t * radius * d_theta)

    # Calculate enclosed current
    enclosed_current = 0.0
    for wire in wires:
        dist = np.sqrt((wire.x - center[0])**2 + (wire.y - center[1])**2)
        if dist < radius:
            enclosed_current += wire.current

    # Ampere's law: ∮B·dl = μ₀I_enc
    theoretical = MU_0 * enclosed_current

    return {
        "line_integral": line_integral,
        "enclosed_current": enclosed_current,
        "theoretical_value": theoretical,
        "relative_error": abs(line_integral - theoretical) / (abs(theoretical) + 1e-20),
        "ampere_law_verified": abs(line_integral - theoretical) / (abs(theoretical) + 1e-20) < 0.05,
    }
