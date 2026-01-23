"""Laplace equation solvers for electrostatic potential."""

from __future__ import annotations

import io
import base64
from dataclasses import dataclass

import numpy as np
import matplotlib
import matplotlib.pyplot as plt

matplotlib.use("Agg")


@dataclass
class Laplace2DResult:
    """Result of 2D Laplace equation solver."""
    potential: np.ndarray
    electric_field_x: np.ndarray
    electric_field_y: np.ndarray
    iterations: int
    converged: bool


def solve_laplace_2d(
    nx: int = 60,
    ny: int = 40,
    v_top: float = 1.0,
    v_bottom: float = 0.0,
    v_left: float = 0.0,
    v_right: float = 0.0,
    max_iter: int = 2000,
    tolerance: float = 1e-5,
) -> Laplace2DResult:
    """
    Solve 2D Laplace equation with Dirichlet boundary conditions using
    Jacobi iteration method.

    Args:
        nx: Number of grid points in x direction
        ny: Number of grid points in y direction
        v_top: Potential at top boundary
        v_bottom: Potential at bottom boundary
        v_left: Potential at left boundary
        v_right: Potential at right boundary
        max_iter: Maximum number of iterations
        tolerance: Convergence tolerance

    Returns:
        Laplace2DResult containing potential and electric field
    """
    v = np.zeros((ny, nx), dtype=np.float64)
    v[0, :] = v_top
    v[-1, :] = v_bottom
    v[:, 0] = v_left
    v[:, -1] = v_right

    converged = False
    it = 0
    for it in range(1, max_iter + 1):
        old = v.copy()
        v[1:-1, 1:-1] = 0.25 * (
            v[1:-1, 2:] + v[1:-1, :-2] + v[2:, 1:-1] + v[:-2, 1:-1]
        )
        diff = np.max(np.abs(v - old))
        if diff < tolerance:
            converged = True
            break

    # Compute electric field: E = -∇V
    ey, ex = np.gradient(-v)

    return Laplace2DResult(
        potential=v,
        electric_field_x=ex,
        electric_field_y=ey,
        iterations=it,
        converged=converged,
    )


def plot_laplace_2d_potential(
    result: Laplace2DResult,
    title: str = "2D Laplace Potential (Dirichlet BC)",
    show_field_arrows: bool = False,
    arrow_density: int = 10,
) -> str:
    """
    Generate a PNG plot of the potential distribution.

    Args:
        result: Laplace2DResult from solver
        title: Plot title
        show_field_arrows: Whether to overlay electric field arrows
        arrow_density: Density of arrow grid

    Returns:
        Base64-encoded PNG string
    """
    fig = plt.figure(figsize=(6, 3.5), dpi=150)
    ax = fig.add_subplot(111)

    im = ax.imshow(result.potential, origin="upper", cmap="viridis", aspect="auto")
    ax.set_title(title)
    ax.set_xlabel("x")
    ax.set_ylabel("y")
    fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04, label="V")

    if show_field_arrows:
        ny, nx = result.potential.shape
        step = max(1, min(nx, ny) // arrow_density)
        x = np.arange(0, nx, step)
        y = np.arange(0, ny, step)
        X, Y = np.meshgrid(x, y)
        Ex = result.electric_field_x[::step, ::step]
        Ey = result.electric_field_y[::step, ::step]
        ax.quiver(X, Y, Ex, -Ey, color="white", alpha=0.7, scale=20)

    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png")
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode("ascii")
