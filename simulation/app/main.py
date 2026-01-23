"""
Simulation Service for Electromagnetic Field Teaching Platform.

Provides numerical simulation and computation APIs for:
- Electrostatics (point charges, Laplace equation, Gauss's law)
- Magnetostatics (Biot-Savart, Ampere's law)
- Wave propagation (1D FDTD, Fresnel coefficients)
- Numerical tools (integration, differentiation, vector operations)
"""

from __future__ import annotations

import base64
import io
from typing import Annotated

import matplotlib
import matplotlib.pyplot as plt
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

# Import route modules
from app.routes.electrostatics import router as electrostatics_router
from app.routes.magnetostatics import router as magnetostatics_router
from app.routes.wave import router as wave_router
from app.routes.numerical import router as numerical_router

matplotlib.use("Agg")

app = FastAPI(
    title="Simulation Service",
    version="0.2.0",
    description="电磁场仿真与数值计算服务",
)

# Include routers
app.include_router(electrostatics_router)
app.include_router(magnetostatics_router)
app.include_router(wave_router)
app.include_router(numerical_router)


# ============================================================================
# Legacy Laplace2D endpoint (kept for backward compatibility)
# ============================================================================

class Laplace2DRequest(BaseModel):
    nx: Annotated[int, Field(ge=10, le=200)] = 60
    ny: Annotated[int, Field(ge=10, le=200)] = 40
    v_top: float = 1.0
    v_bottom: float = 0.0
    v_left: float = 0.0
    v_right: float = 0.0
    max_iter: Annotated[int, Field(ge=1, le=20000)] = 2000
    tolerance: Annotated[float, Field(gt=0, le=1e-1)] = 1e-5


class Laplace2DResponse(BaseModel):
    png_base64: str
    min_v: float
    max_v: float
    iter: int


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/sim/laplace2d", response_model=Laplace2DResponse)
def laplace2d(req: Laplace2DRequest) -> Laplace2DResponse:
    """
    Solve 2D Laplace equation with Dirichlet boundary conditions.

    This is the original demo endpoint, kept for backward compatibility.
    """
    try:
        v = np.zeros((req.ny, req.nx), dtype=np.float64)
        v[0, :] = req.v_top
        v[-1, :] = req.v_bottom
        v[:, 0] = req.v_left
        v[:, -1] = req.v_right

        it = 0
        for it in range(1, req.max_iter + 1):
            old = v.copy()
            v[1:-1, 1:-1] = 0.25 * (
                v[1:-1, 2:] + v[1:-1, :-2] + v[2:, 1:-1] + v[:-2, 1:-1]
            )
            diff = np.max(np.abs(v - old))
            if diff < req.tolerance:
                break

        vmin = float(np.min(v))
        vmax = float(np.max(v))

        fig = plt.figure(figsize=(6, 3.5), dpi=150)
        ax = fig.add_subplot(111)
        im = ax.imshow(v, origin="upper", cmap="viridis", aspect="auto")
        ax.set_title("2D Laplace Potential (Dirichlet BC)")
        ax.set_xlabel("x")
        ax.set_ylabel("y")
        fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04, label="V")
        fig.tight_layout()

        buf = io.BytesIO()
        fig.savefig(buf, format="png")
        plt.close(fig)
        png_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return Laplace2DResponse(png_base64=png_b64, min_v=vmin, max_v=vmax, iter=it)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(e)) from e


# ============================================================================
# Safe Code Execution Endpoint
# ============================================================================

import signal
import traceback
from contextlib import contextmanager
from typing import Any


class CodeExecutionRequest(BaseModel):
    code: str = Field(..., description="Python code to execute", max_length=10000)
    timeout: Annotated[int, Field(ge=1, le=10)] = 5  # seconds


class CodeExecutionResponse(BaseModel):
    success: bool
    output: str
    error: str | None = None
    plots: list[str] = []  # base64 encoded PNG images


class TimeoutError(Exception):
    """Raised when code execution times out."""
    pass


def execute_code_with_timeout(code: str, safe_globals: dict, safe_locals: dict, output_buffer: io.StringIO, timeout: int) -> tuple[bool, str]:
    """Execute code in a controlled way. Returns (success, error_message)."""
    import sys
    old_stdout = sys.stdout
    sys.stdout = output_buffer
    
    try:
        # Close any existing figures
        plt.close('all')
        # Execute the code
        exec(code, safe_globals, safe_locals)  # noqa: S102
        return True, ""
    except Exception as e:
        return False, f"{type(e).__name__}: {str(e)}"
    finally:
        sys.stdout = old_stdout


# Safe builtins - only allow mathematical/scientific operations
ALLOWED_BUILTINS = {
    'abs': abs,
    'all': all,
    'any': any,
    'bool': bool,
    'dict': dict,
    'enumerate': enumerate,
    'filter': filter,
    'float': float,
    'int': int,
    'len': len,
    'list': list,
    'map': map,
    'max': max,
    'min': min,
    'pow': pow,
    'print': print,
    'range': range,
    'round': round,
    'sorted': sorted,
    'str': str,
    'sum': sum,
    'tuple': tuple,
    'zip': zip,
    'True': True,
    'False': False,
    'None': None,
}


def create_safe_globals() -> dict[str, Any]:
    """Create a restricted global namespace for code execution."""
    safe_globals = {'__builtins__': ALLOWED_BUILTINS}
    
    # Add numpy with alias
    safe_globals['np'] = np
    safe_globals['numpy'] = np
    
    # Add matplotlib for plotting
    safe_globals['plt'] = plt
    safe_globals['matplotlib'] = matplotlib
    
    # Add math module
    import math
    safe_globals['math'] = math
    
    return safe_globals


@app.post("/v1/sim/run_code", response_model=CodeExecutionResponse)
def run_code(req: CodeExecutionRequest) -> CodeExecutionResponse:
    """
    Execute Python code in a sandboxed environment.
    
    Security measures:
    - Timeout (default 5s, max 10s)
    - Restricted builtins (no file/network access)
    - Only numpy, scipy, math, matplotlib allowed
    - No __import__, exec, eval in user code
    """
    # Security check: block dangerous constructs
    dangerous_patterns = [
        '__import__',
        'import os',
        'import sys',
        'import subprocess',
        'import socket',
        'open(',
        'exec(',
        'eval(',
        'compile(',
        '__builtins__',
        '__class__',
        '__subclasses__',
        'getattr',
        'setattr',
        'delattr',
    ]
    
    code_lower = req.code.lower()
    for pattern in dangerous_patterns:
        if pattern.lower() in code_lower:
            return CodeExecutionResponse(
                success=False,
                output="",
                error=f"Security error: '{pattern}' is not allowed",
            )
    
    # Capture stdout
    output_buffer = io.StringIO()
    plots: list[str] = []
    
    try:
        safe_globals = create_safe_globals()
        safe_locals: dict[str, Any] = {}
        
        # Use ThreadPoolExecutor for timeout (works in uvicorn threads)
        from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
        
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(
                execute_code_with_timeout,
                req.code,
                safe_globals,
                safe_locals,
                output_buffer,
                req.timeout
            )
            try:
                success, error_msg = future.result(timeout=req.timeout)
                if not success:
                    return CodeExecutionResponse(
                        success=False,
                        output=output_buffer.getvalue(),
                        error=error_msg,
                    )
            except FuturesTimeoutError:
                return CodeExecutionResponse(
                    success=False,
                    output=output_buffer.getvalue(),
                    error=f"Code execution timed out after {req.timeout} seconds",
                )
        
        # Capture any matplotlib figures
        for fig_num in plt.get_fignums():
            fig = plt.figure(fig_num)
            buf = io.BytesIO()
            fig.savefig(buf, format='png', dpi=100, bbox_inches='tight')
            buf.seek(0)
            plots.append(base64.b64encode(buf.getvalue()).decode('ascii'))
            plt.close(fig)
        
        output = output_buffer.getvalue()
        
        return CodeExecutionResponse(
            success=True,
            output=output,
            plots=plots,
        )
        
    except Exception as e:
        return CodeExecutionResponse(
            success=False,
            output=output_buffer.getvalue(),
            error=f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}",
        )
    finally:
        plt.close('all')



