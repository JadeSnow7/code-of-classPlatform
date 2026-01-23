"""Electrostatics solvers for point charges and field calculations."""

from __future__ import annotations

import io
import base64
from dataclasses import dataclass
from typing import List, Tuple

import numpy as np
import matplotlib
import matplotlib.pyplot as plt
from matplotlib.patches import Circle

matplotlib.use("Agg")

# Coulomb constant (in vacuum, SI units)
K_E = 8.9875517873681764e9  # N·m²/C²
EPSILON_0 = 8.8541878128e-12  # F/m


@dataclass
class PointCharge:
    """A point charge in 2D space."""
    x: float
    y: float
    q: float  # Charge in Coulombs


@dataclass
class FieldResult:
    """Result of electric field calculation."""
    x_grid: np.ndarray
    y_grid: np.ndarray
    potential: np.ndarray
    field_x: np.ndarray
    field_y: np.ndarray
    field_magnitude: np.ndarray


def calculate_point_charges_field(
    charges: List[PointCharge],
    x_range: Tuple[float, float] = (-1.0, 1.0),
    y_range: Tuple[float, float] = (-1.0, 1.0),
    grid_size: int = 50,
    min_distance: float = 0.02,
) -> FieldResult:
    """
    Calculate electric potential and field from point charges.

    Args:
        charges: List of point charges
        x_range: (x_min, x_max) for the calculation domain
        y_range: (y_min, y_max) for the calculation domain
        grid_size: Number of grid points in each direction
        min_distance: Minimum distance from charges to avoid singularities

    Returns:
        FieldResult with potential and field components
    """
    x = np.linspace(x_range[0], x_range[1], grid_size)
    y = np.linspace(y_range[0], y_range[1], grid_size)
    X, Y = np.meshgrid(x, y)

    V = np.zeros_like(X)
    Ex = np.zeros_like(X)
    Ey = np.zeros_like(X)

    for charge in charges:
        dx = X - charge.x
        dy = Y - charge.y
        r = np.sqrt(dx**2 + dy**2)
        # Avoid singularity at charge location
        r = np.maximum(r, min_distance)

        # Potential: V = kQ/r
        V += K_E * charge.q / r

        # Electric field: E = kQ/r² * r̂
        E_mag = K_E * charge.q / r**2
        Ex += E_mag * dx / r
        Ey += E_mag * dy / r

    E_magnitude = np.sqrt(Ex**2 + Ey**2)

    return FieldResult(
        x_grid=X,
        y_grid=Y,
        potential=V,
        field_x=Ex,
        field_y=Ey,
        field_magnitude=E_magnitude,
    )


def plot_potential_and_field(
    result: FieldResult,
    charges: List[PointCharge],
    show_potential: bool = True,
    show_field_lines: bool = True,
    show_field_arrows: bool = False,
    num_field_lines: int = 16,
    potential_levels: int = 20,
) -> str:
    """
    Generate a visualization of electric potential and field.

    Args:
        result: FieldResult from calculation
        charges: List of point charges (for drawing markers)
        show_potential: Whether to show potential contours/heatmap
        show_field_lines: Whether to show field lines
        show_field_arrows: Whether to show field arrows (quiver)
        num_field_lines: Number of field lines per charge
        potential_levels: Number of contour levels

    Returns:
        Base64-encoded PNG string
    """
    fig, ax = plt.subplots(figsize=(8, 6), dpi=150)

    X, Y = result.x_grid, result.y_grid

    if show_potential:
        # Clip extreme values for better visualization
        V_clipped = np.clip(result.potential, -1e6, 1e6)
        levels = np.linspace(V_clipped.min(), V_clipped.max(), potential_levels)
        cs = ax.contourf(X, Y, V_clipped, levels=levels, cmap="RdBu_r", alpha=0.8)
        fig.colorbar(cs, ax=ax, label="V (电势)")
        ax.contour(X, Y, V_clipped, levels=levels, colors="k", linewidths=0.3, alpha=0.5)

    if show_field_lines:
        # Use streamplot for field lines
        Ex_norm = result.field_x / (result.field_magnitude + 1e-10)
        Ey_norm = result.field_y / (result.field_magnitude + 1e-10)
        ax.streamplot(
            X, Y, Ex_norm, Ey_norm,
            density=1.5,
            color="k",
            linewidth=0.8,
            arrowsize=0.8,
            arrowstyle="->",
        )

    if show_field_arrows:
        skip = max(1, result.x_grid.shape[0] // 15)
        ax.quiver(
            X[::skip, ::skip],
            Y[::skip, ::skip],
            result.field_x[::skip, ::skip],
            result.field_y[::skip, ::skip],
            color="green",
            alpha=0.7,
        )

    # Draw charge markers
    for charge in charges:
        color = "red" if charge.q > 0 else "blue"
        marker = "+" if charge.q > 0 else "_"
        ax.plot(charge.x, charge.y, marker, markersize=15, color=color, 
                markeredgewidth=3)
        circle = Circle((charge.x, charge.y), 0.03, color=color, fill=True, alpha=0.8)
        ax.add_patch(circle)

    ax.set_xlabel("x (m)")
    ax.set_ylabel("y (m)")
    ax.set_title("点电荷电场分布")
    ax.set_aspect("equal")
    ax.grid(True, alpha=0.3)
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png")
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def calculate_gauss_flux(
    charges: List[PointCharge],
    center: Tuple[float, float],
    radius: float,
    num_points: int = 100,
) -> dict:
    """
    Calculate the electric flux through a circular Gaussian surface (2D).

    In 2D, the "closed surface" is a circle, and we calculate the line integral
    of E·n̂ around the circle.

    Args:
        charges: List of point charges
        center: (x, y) center of the Gaussian circle
        radius: Radius of the Gaussian circle
        num_points: Number of points to sample on the circle

    Returns:
        Dictionary with flux, enclosed charge, and verification data
    """
    theta = np.linspace(0, 2 * np.pi, num_points, endpoint=False)
    d_theta = 2 * np.pi / num_points

    # Points on the circle
    x_circle = center[0] + radius * np.cos(theta)
    y_circle = center[1] + radius * np.sin(theta)

    # Outward normal vectors
    nx = np.cos(theta)
    ny = np.sin(theta)

    # Calculate E field at each point on the circle
    Ex_total = np.zeros(num_points)
    Ey_total = np.zeros(num_points)

    for charge in charges:
        dx = x_circle - charge.x
        dy = y_circle - charge.y
        r = np.sqrt(dx**2 + dy**2)
        r = np.maximum(r, 1e-10)

        E_mag = K_E * charge.q / r**2
        Ex_total += E_mag * dx / r
        Ey_total += E_mag * dy / r

    # E·n̂ * dl, where dl = r * d_theta
    E_dot_n = Ex_total * nx + Ey_total * ny
    flux = np.sum(E_dot_n * radius * d_theta)

    # Calculate enclosed charge
    enclosed_charge = 0.0
    for charge in charges:
        dist = np.sqrt((charge.x - center[0])**2 + (charge.y - center[1])**2)
        if dist < radius:
            enclosed_charge += charge.q

    # Theoretical flux (2D Gauss's law): Φ = Q_enc / ε₀ (for 2D, it's per unit length)
    # For 2D line charge analogy: Φ = Q_enc / (2πε₀) * 2π = Q_enc / ε₀
    theoretical_flux = enclosed_charge / EPSILON_0

    return {
        "calculated_flux": flux,
        "enclosed_charge": enclosed_charge,
        "theoretical_flux": theoretical_flux,
        "relative_error": abs(flux - theoretical_flux) / (abs(theoretical_flux) + 1e-20),
        "gauss_law_verified": abs(flux - theoretical_flux) / (abs(theoretical_flux) + 1e-20) < 0.05,
    }
