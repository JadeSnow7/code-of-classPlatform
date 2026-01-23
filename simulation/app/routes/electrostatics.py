"""API routes for electrostatics simulations."""

from __future__ import annotations

from typing import Annotated, List, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.solvers.electrostatics import (
    PointCharge,
    calculate_point_charges_field,
    plot_potential_and_field,
    calculate_gauss_flux,
)

router = APIRouter(prefix="/v1/sim", tags=["electrostatics"])


class ChargeInput(BaseModel):
    """Input for a single point charge."""
    x: float = Field(description="x coordinate in meters")
    y: float = Field(description="y coordinate in meters")
    q: float = Field(description="Charge in Coulombs (e.g., 1e-9 for 1 nC)")


class PointChargesRequest(BaseModel):
    """Request for point charges field calculation."""
    charges: List[ChargeInput] = Field(min_length=1, max_length=20)
    x_min: float = -1.0
    x_max: float = 1.0
    y_min: float = -1.0
    y_max: float = 1.0
    grid_size: Annotated[int, Field(ge=20, le=200)] = 50
    show_potential: bool = True
    show_field_lines: bool = True
    show_field_arrows: bool = False


class PointChargesResponse(BaseModel):
    """Response with visualization and field data."""
    png_base64: str
    v_min: float
    v_max: float
    e_max: float


class GaussFluxRequest(BaseModel):
    """Request for Gauss's law verification."""
    charges: List[ChargeInput] = Field(min_length=1, max_length=20)
    center_x: float = 0.0
    center_y: float = 0.0
    radius: float = 0.5
    num_points: Annotated[int, Field(ge=50, le=500)] = 100


class GaussFluxResponse(BaseModel):
    """Response with Gauss's law verification results."""
    calculated_flux: float
    enclosed_charge: float
    theoretical_flux: float
    relative_error: float
    gauss_law_verified: bool


@router.post("/point_charges", response_model=PointChargesResponse)
def point_charges_field(req: PointChargesRequest) -> PointChargesResponse:
    """
    Calculate and visualize electric field from point charges.

    - Computes electric potential and field at each grid point
    - Generates visualization with potential contours and field lines
    """
    try:
        charges = [
            PointCharge(x=c.x, y=c.y, q=c.q)
            for c in req.charges
        ]

        result = calculate_point_charges_field(
            charges=charges,
            x_range=(req.x_min, req.x_max),
            y_range=(req.y_min, req.y_max),
            grid_size=req.grid_size,
        )

        png_b64 = plot_potential_and_field(
            result=result,
            charges=charges,
            show_potential=req.show_potential,
            show_field_lines=req.show_field_lines,
            show_field_arrows=req.show_field_arrows,
        )

        return PointChargesResponse(
            png_base64=png_b64,
            v_min=float(result.potential.min()),
            v_max=float(result.potential.max()),
            e_max=float(result.field_magnitude.max()),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/gauss_flux", response_model=GaussFluxResponse)
def gauss_flux_verification(req: GaussFluxRequest) -> GaussFluxResponse:
    """
    Verify Gauss's law by computing electric flux through a Gaussian surface.

    - Calculates flux numerically by integrating E·dA around a circular path
    - Compares with theoretical value Q_enc/ε₀
    """
    try:
        charges = [
            PointCharge(x=c.x, y=c.y, q=c.q)
            for c in req.charges
        ]

        result = calculate_gauss_flux(
            charges=charges,
            center=(req.center_x, req.center_y),
            radius=req.radius,
            num_points=req.num_points,
        )

        return GaussFluxResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
