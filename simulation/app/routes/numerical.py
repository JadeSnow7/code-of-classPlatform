"""API routes for numerical computation tools."""

from __future__ import annotations

from typing import Dict, Literal, Optional, Union

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.solvers.numerical import (
    numerical_integrate,
    symbolic_integrate,
    symbolic_differentiate,
    evaluate_formula,
    compute_divergence,
    compute_curl,
    compute_gradient,
    compute_laplacian,
    SYMPY_AVAILABLE,
)

router = APIRouter(prefix="/v1/calc", tags=["numerical"])


class IntegrateRequest(BaseModel):
    """Request for integration."""
    expression: str = Field(
        description="Mathematical expression (e.g., 'x**2 + sin(x)')",
        min_length=1,
        max_length=500,
    )
    variable: str = Field(default="x", min_length=1, max_length=10)
    lower: Optional[float] = Field(default=None, description="Lower limit for definite integral")
    upper: Optional[float] = Field(default=None, description="Upper limit for definite integral")
    method: Literal["numerical", "symbolic"] = "numerical"


class IntegrateResponse(BaseModel):
    """Response with integration result."""
    result: str
    is_symbolic: bool
    method: str
    error_estimate: Optional[float] = None


class DifferentiateRequest(BaseModel):
    """Request for differentiation."""
    expression: str = Field(min_length=1, max_length=500)
    variable: str = Field(default="x", min_length=1, max_length=10)
    order: int = Field(default=1, ge=1, le=5)


class DifferentiateResponse(BaseModel):
    """Response with derivative."""
    result: str
    order: int


class EvaluateRequest(BaseModel):
    """Request for formula evaluation."""
    formula: str = Field(min_length=1, max_length=500)
    variables: Dict[str, float] = Field(description="Variable values, e.g., {'x': 1.0, 'y': 2.0}")


class EvaluateResponse(BaseModel):
    """Response with evaluated result."""
    result: float
    formula: str


class VectorOpRequest(BaseModel):
    """Request for vector field operation."""
    operation: Literal["divergence", "curl", "gradient", "laplacian"]
    # For vector fields (divergence, curl)
    fx: Optional[str] = Field(default=None, description="x-component")
    fy: Optional[str] = Field(default=None, description="y-component")
    fz: Optional[str] = Field(default="0", description="z-component")
    # For scalar fields (gradient, laplacian)
    scalar: Optional[str] = Field(default=None, description="Scalar field expression")


class VectorOpResponse(BaseModel):
    """Response with vector operation result."""
    operation: str
    result: Union[str, Dict[str, str]]


@router.post("/integrate", response_model=IntegrateResponse)
def integrate(req: IntegrateRequest) -> IntegrateResponse:
    """
    Perform numerical or symbolic integration.

    Examples:
    - Numerical: integrate x² from 0 to 1
    - Symbolic: indefinite integral of sin(x)
    """
    try:
        if req.method == "symbolic":
            if not SYMPY_AVAILABLE:
                raise HTTPException(
                    status_code=501,
                    detail="Symbolic integration requires SymPy (not installed)",
                )
            result = symbolic_integrate(
                func_expr=req.expression,
                variable=req.variable,
                lower=str(req.lower) if req.lower is not None else None,
                upper=str(req.upper) if req.upper is not None else None,
            )
        else:
            if req.lower is None or req.upper is None:
                raise HTTPException(
                    status_code=400,
                    detail="Numerical integration requires lower and upper limits",
                )
            result = numerical_integrate(
                func_expr=req.expression,
                variable=req.variable,
                lower=req.lower,
                upper=req.upper,
            )

        return IntegrateResponse(
            result=str(result.value),
            is_symbolic=result.is_symbolic,
            method=result.method,
            error_estimate=result.error_estimate,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/differentiate", response_model=DifferentiateResponse)
def differentiate(req: DifferentiateRequest) -> DifferentiateResponse:
    """
    Perform symbolic differentiation.

    Example: d/dx(x³ + sin(x)) = 3x² + cos(x)
    """
    if not SYMPY_AVAILABLE:
        raise HTTPException(
            status_code=501,
            detail="Symbolic differentiation requires SymPy (not installed)",
        )

    try:
        result = symbolic_differentiate(
            func_expr=req.expression,
            variable=req.variable,
            order=req.order,
        )
        return DifferentiateResponse(result=result, order=req.order)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/evaluate", response_model=EvaluateResponse)
def evaluate(req: EvaluateRequest) -> EvaluateResponse:
    """
    Evaluate a mathematical formula with given variable values.

    Example: evaluate "E = k*q/r**2" with {k: 9e9, q: 1e-9, r: 0.1}
    """
    try:
        result = evaluate_formula(
            formula=req.formula,
            variables=req.variables,
        )
        return EvaluateResponse(result=result, formula=req.formula)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/vector_op", response_model=VectorOpResponse)
def vector_operation(req: VectorOpRequest) -> VectorOpResponse:
    """
    Perform vector calculus operations symbolically.

    Operations:
    - divergence: ∇·F (requires fx, fy, fz)
    - curl: ∇×F (requires fx, fy, fz)
    - gradient: ∇f (requires scalar)
    - laplacian: ∇²f (requires scalar)
    """
    if not SYMPY_AVAILABLE:
        raise HTTPException(
            status_code=501,
            detail="Vector operations require SymPy (not installed)",
        )

    try:
        if req.operation == "divergence":
            if not req.fx or not req.fy:
                raise HTTPException(
                    status_code=400,
                    detail="Divergence requires fx and fy components",
                )
            result = compute_divergence(req.fx, req.fy, req.fz or "0")
            return VectorOpResponse(operation="divergence", result=result)

        elif req.operation == "curl":
            if not req.fx or not req.fy:
                raise HTTPException(
                    status_code=400,
                    detail="Curl requires fx and fy components",
                )
            curl_x, curl_y, curl_z = compute_curl(req.fx, req.fy, req.fz or "0")
            return VectorOpResponse(
                operation="curl",
                result={"x": curl_x, "y": curl_y, "z": curl_z},
            )

        elif req.operation == "gradient":
            if not req.scalar:
                raise HTTPException(
                    status_code=400,
                    detail="Gradient requires scalar field expression",
                )
            grad_x, grad_y, grad_z = compute_gradient(req.scalar)
            return VectorOpResponse(
                operation="gradient",
                result={"x": grad_x, "y": grad_y, "z": grad_z},
            )

        elif req.operation == "laplacian":
            if not req.scalar:
                raise HTTPException(
                    status_code=400,
                    detail="Laplacian requires scalar field expression",
                )
            result = compute_laplacian(req.scalar)
            return VectorOpResponse(operation="laplacian", result=result)

        else:
            raise HTTPException(status_code=400, detail=f"Unknown operation: {req.operation}")

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
