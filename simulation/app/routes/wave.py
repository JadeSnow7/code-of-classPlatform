"""API routes for wave equation simulations."""

from __future__ import annotations

import os
from typing import Annotated, Any, Literal, Optional

import numpy as np

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.solvers.wave import (
    Wave1DResult,
    simulate_wave_1d as simulate_wave_1d_python,
    plot_wave_snapshot,
    plot_wave_spacetime,
    calculate_reflection_coefficient,
)

router = APIRouter(prefix="/v1/sim", tags=["wave"])

SIM_ENGINE_ENV = "SIM_ENGINE"
SIM_ENGINE_DEFAULT = "python"
_RUST_SIMULATE_WAVE: Any | None = None
_RUST_IMPORT_ERROR: Exception | None = None


def _resolve_sim_engine() -> Literal["python", "rust"]:
    raw_value = os.getenv(SIM_ENGINE_ENV, SIM_ENGINE_DEFAULT).strip().lower()
    if raw_value in {"python", "rust"}:
        return raw_value  # type: ignore[return-value]
    return "python"


def _load_rust_wave_kernel() -> Any | None:
    global _RUST_SIMULATE_WAVE, _RUST_IMPORT_ERROR
    if _RUST_SIMULATE_WAVE is not None:
        return _RUST_SIMULATE_WAVE
    if _RUST_IMPORT_ERROR is not None:
        return None

    try:
        from simulation_rs import simulate_wave_1d as simulate_wave_1d_rust

        _RUST_SIMULATE_WAVE = simulate_wave_1d_rust
    except Exception as exc:  # noqa: BLE001
        _RUST_IMPORT_ERROR = exc
        return None

    return _RUST_SIMULATE_WAVE


def _simulate_wave(req: "Wave1DRequest") -> Wave1DResult:
    engine = _resolve_sim_engine()
    if engine == "rust":
        rust_kernel = _load_rust_wave_kernel()
        if rust_kernel is not None:
            rust_result = rust_kernel(
                length=req.length,
                nx=req.nx,
                c=req.c,
                total_time=req.total_time,
                source_type=req.source_type,
                source_position=req.source_position,
                source_frequency=req.source_frequency,
                boundary_condition=req.boundary_condition,
                save_every=10,
            )
            return Wave1DResult(
                x=np.asarray(rust_result.x, dtype=np.float64),
                time_steps=np.asarray(rust_result.time_steps, dtype=np.float64),
                field_history=np.asarray(rust_result.field_history, dtype=np.float64),
                dx=float(rust_result.dx),
                dt=float(rust_result.dt),
                c=float(rust_result.c),
            )

    return simulate_wave_1d_python(
        length=req.length,
        nx=req.nx,
        c=req.c,
        total_time=req.total_time,
        source_type=req.source_type,
        source_position=req.source_position,
        source_frequency=req.source_frequency,
        boundary_condition=req.boundary_condition,
    )


class Wave1DRequest(BaseModel):
    """Request for 1D wave simulation."""
    length: Annotated[float, Field(gt=0, le=10)] = 1.0
    nx: Annotated[int, Field(ge=50, le=500)] = 200
    c: float = 3e8  # Speed of light
    total_time: Annotated[float, Field(gt=0, le=1e-6)] = 10e-9
    source_type: Literal["gaussian", "sinusoidal", "step"] = "gaussian"
    source_position: Annotated[float, Field(ge=0, le=1)] = 0.2
    source_frequency: float = 1e9
    boundary_condition: Literal["absorbing", "reflecting", "periodic"] = "absorbing"
    output_type: Literal["snapshot", "spacetime"] = "spacetime"
    snapshot_index: int = -1


class Wave1DResponse(BaseModel):
    """Response with wave simulation visualization."""
    png_base64: str
    n_time_steps: int
    dx: float
    dt: float


class ReflectionRequest(BaseModel):
    """Request for reflection/transmission coefficient calculation."""
    n1: Annotated[float, Field(gt=0)] = 1.0
    n2: Annotated[float, Field(gt=0)] = 1.5
    theta_i: Annotated[float, Field(ge=0, le=90)] = 0.0
    polarization: Literal["s", "p"] = "s"


class ReflectionResponse(BaseModel):
    """Response with Fresnel coefficients."""
    theta_i: float
    theta_t: Optional[float]
    total_internal_reflection: bool
    r: float
    t: float
    R: float
    T: float
    n1: float
    n2: float
    polarization: str
    conservation_check: float
    critical_angle: Optional[float] = None


@router.post("/wave_1d", response_model=Wave1DResponse)
def wave_1d_simulation(req: Wave1DRequest) -> Wave1DResponse:
    """
    Simulate 1D electromagnetic wave propagation using FDTD method.

    - Supports Gaussian, sinusoidal, and step sources
    - Supports absorbing, reflecting, and periodic boundaries
    """
    try:
        result = _simulate_wave(req)

        if req.output_type == "snapshot":
            png_b64 = plot_wave_snapshot(result, time_index=req.snapshot_index)
        else:
            png_b64 = plot_wave_spacetime(result)

        return Wave1DResponse(
            png_base64=png_b64,
            n_time_steps=len(result.time_steps),
            dx=result.dx,
            dt=result.dt,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/fresnel", response_model=ReflectionResponse)
def fresnel_coefficients(req: ReflectionRequest) -> ReflectionResponse:
    """
    Calculate Fresnel reflection and transmission coefficients.

    - Supports s-polarization (TE) and p-polarization (TM)
    - Handles total internal reflection
    """
    try:
        result = calculate_reflection_coefficient(
            n1=req.n1,
            n2=req.n2,
            theta_i=req.theta_i,
            polarization=req.polarization,
        )

        # Handle None values for response
        return ReflectionResponse(
            theta_i=result["theta_i"],
            theta_t=result.get("theta_t"),
            total_internal_reflection=result["total_internal_reflection"],
            r=result.get("r", 1.0),
            t=result.get("t", 0.0),
            R=result.get("R", 1.0),
            T=result.get("T", 0.0),
            n1=result.get("n1", req.n1),
            n2=result.get("n2", req.n2),
            polarization=result.get("polarization", req.polarization),
            conservation_check=result.get("conservation_check", 1.0),
            critical_angle=result.get("critical_angle"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
