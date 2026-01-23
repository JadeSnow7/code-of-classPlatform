"""API routes for magnetostatics simulations."""

from __future__ import annotations

from typing import Annotated, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.solvers.magnetostatics import (
    InfiniteWire,
    calculate_infinite_wire_field,
    plot_magnetic_field,
    calculate_solenoid_field,
    calculate_ampere_loop,
)

router = APIRouter(prefix="/v1/sim", tags=["magnetostatics"])


class WireInput(BaseModel):
    """Input for an infinite straight wire."""
    x: float = Field(description="x position in meters")
    y: float = Field(description="y position in meters")
    current: float = Field(description="Current in Amperes (positive = out of page)")


class WireFieldRequest(BaseModel):
    """Request for magnetic field from wires."""
    wires: List[WireInput] = Field(min_length=1, max_length=10)
    x_min: float = -0.1
    x_max: float = 0.1
    y_min: float = -0.1
    y_max: float = 0.1
    grid_size: Annotated[int, Field(ge=20, le=200)] = 50
    show_magnitude: bool = True
    show_field_lines: bool = True


class WireFieldResponse(BaseModel):
    """Response with magnetic field visualization."""
    png_base64: str
    b_max: float


class SolenoidRequest(BaseModel):
    """Request for solenoid field calculation."""
    n_turns: Annotated[int, Field(ge=10, le=10000)] = 100
    length: Annotated[float, Field(gt=0.001, le=1.0)] = 0.1
    radius: Annotated[float, Field(gt=0.001, le=0.1)] = 0.02
    current: float = 1.0


class SolenoidResponse(BaseModel):
    """Response with solenoid field values."""
    n_turns: int
    length: float
    radius: float
    current: float
    turns_per_meter: float
    B_inside: float
    B_outside: float
    B_inside_mT: float
    formula: str


class AmpereLoopRequest(BaseModel):
    """Request for Ampere's law verification."""
    wires: List[WireInput] = Field(min_length=1, max_length=10)
    center_x: float = 0.0
    center_y: float = 0.0
    radius: float = 0.05
    num_points: Annotated[int, Field(ge=50, le=500)] = 100


class AmpereLoopResponse(BaseModel):
    """Response with Ampere's law verification results."""
    line_integral: float
    enclosed_current: float
    theoretical_value: float
    relative_error: float
    ampere_law_verified: bool


@router.post("/wire_field", response_model=WireFieldResponse)
def wire_magnetic_field(req: WireFieldRequest) -> WireFieldResponse:
    """
    Calculate and visualize magnetic field from infinite straight wires.

    Uses Biot-Savart law: B = μ₀I / (2πr)
    """
    try:
        wires = [
            InfiniteWire(x=w.x, y=w.y, current=w.current)
            for w in req.wires
        ]

        result = calculate_infinite_wire_field(
            wires=wires,
            x_range=(req.x_min, req.x_max),
            y_range=(req.y_min, req.y_max),
            grid_size=req.grid_size,
        )

        png_b64 = plot_magnetic_field(
            result=result,
            wires=wires,
            show_magnitude=req.show_magnitude,
            show_field_lines=req.show_field_lines,
        )

        return WireFieldResponse(
            png_base64=png_b64,
            b_max=float(result.field_magnitude.max()),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/solenoid", response_model=SolenoidResponse)
def solenoid_field(req: SolenoidRequest) -> SolenoidResponse:
    """
    Calculate magnetic field inside a solenoid.

    Uses formula: B = μ₀nI
    """
    try:
        result = calculate_solenoid_field(
            n_turns=req.n_turns,
            length=req.length,
            radius=req.radius,
            current=req.current,
        )
        return SolenoidResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/ampere_loop", response_model=AmpereLoopResponse)
def ampere_loop_verification(req: AmpereLoopRequest) -> AmpereLoopResponse:
    """
    Verify Ampere's circuital law: ∮B·dl = μ₀I_enc

    Computes line integral of B around a circular path.
    """
    try:
        wires = [
            InfiniteWire(x=w.x, y=w.y, current=w.current)
            for w in req.wires
        ]

        result = calculate_ampere_loop(
            wires=wires,
            center=(req.center_x, req.center_y),
            radius=req.radius,
            num_points=req.num_points,
        )

        return AmpereLoopResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
