"""Numerical computation tools for electromagnetic field analysis."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Optional, Tuple, Union, List

import numpy as np

# Try to import scipy for advanced integration
try:
    from scipy import integrate
    SCIPY_AVAILABLE = True
except ImportError:
    SCIPY_AVAILABLE = False

# Try to import sympy for symbolic computation
try:
    import sympy as sp
    from sympy import symbols, sympify, lambdify, integrate as sym_integrate
    from sympy import sin, cos, tan, exp, log, sqrt, pi, E
    from sympy import diff as sym_diff
    from sympy.vector import CoordSys3D, divergence, curl, gradient
    SYMPY_AVAILABLE = True
except ImportError:
    SYMPY_AVAILABLE = False


@dataclass
class IntegrationResult:
    """Result of numerical/symbolic integration."""
    value: Union[float, str]
    is_symbolic: bool
    error_estimate: Optional[float] = None
    method: str = "unknown"


@dataclass
class VectorFieldResult:
    """Result of vector field operations."""
    operation: str
    input_field: str
    result: Union[str, np.ndarray]
    is_symbolic: bool


# Safe functions whitelist for expression evaluation
SAFE_FUNCTIONS = {
    "sin": np.sin,
    "cos": np.cos,
    "tan": np.tan,
    "exp": np.exp,
    "log": np.log,
    "sqrt": np.sqrt,
    "abs": np.abs,
    "pi": np.pi,
    "e": np.e,
}


def _validate_expression(expr: str) -> bool:
    """Validate that expression only contains safe characters and functions."""
    # Allow: numbers, operators, parentheses, whitespace, variables (a-z), and safe functions
    safe_pattern = r'^[\d\s\+\-\*/\^\(\)\.\,a-zA-Z_]+$'
    if not re.match(safe_pattern, expr):
        return False
    
    # Check for dangerous patterns
    dangerous_patterns = [
        r'\b(import|exec|eval|compile|open|file|input|__)\b',
        r'\b(os|sys|subprocess|shutil)\b',
    ]
    for pattern in dangerous_patterns:
        if re.search(pattern, expr, re.IGNORECASE):
            return False
    
    return True


def numerical_integrate(
    func_expr: str,
    variable: str,
    lower: float,
    upper: float,
    method: str = "quad",
) -> IntegrationResult:
    """
    Perform numerical integration of a mathematical expression.

    Args:
        func_expr: Mathematical expression as string (e.g., "x**2 + sin(x)")
        variable: Integration variable name
        lower: Lower integration limit
        upper: Upper integration limit
        method: Integration method ("quad", "trapz", "simps")

    Returns:
        IntegrationResult with computed value
    """
    if not _validate_expression(func_expr):
        raise ValueError(f"Invalid or unsafe expression: {func_expr}")

    # Replace ^ with ** for Python compatibility
    func_expr = func_expr.replace("^", "**")

    if SYMPY_AVAILABLE:
        try:
            var = sp.Symbol(variable)
            expr = sympify(func_expr)
            f = lambdify(var, expr, modules=["numpy"])
        except Exception as e:
            raise ValueError(f"Failed to parse expression: {e}") from e
    else:
        # Fallback: simple eval with safe context
        def f(x):
            local_vars = {variable: x, **SAFE_FUNCTIONS}
            return eval(func_expr, {"__builtins__": {}}, local_vars)

    if method == "quad" and SCIPY_AVAILABLE:
        result, error = integrate.quad(f, lower, upper)
        return IntegrationResult(
            value=result,
            is_symbolic=False,
            error_estimate=error,
            method="scipy.quad",
        )
    else:
        # Fallback to trapezoidal rule
        x = np.linspace(lower, upper, 1000)
        y = f(x)
        result = np.trapz(y, x)
        return IntegrationResult(
            value=result,
            is_symbolic=False,
            error_estimate=None,
            method="numpy.trapz",
        )


def symbolic_integrate(
    func_expr: str,
    variable: str,
    lower: Optional[str] = None,
    upper: Optional[str] = None,
) -> IntegrationResult:
    """
    Perform symbolic integration using SymPy.

    Args:
        func_expr: Mathematical expression as string
        variable: Integration variable name
        lower: Lower limit (optional, for definite integral)
        upper: Upper limit (optional, for definite integral)

    Returns:
        IntegrationResult with symbolic or numeric result
    """
    if not SYMPY_AVAILABLE:
        raise RuntimeError("SymPy is required for symbolic integration")

    if not _validate_expression(func_expr):
        raise ValueError(f"Invalid or unsafe expression: {func_expr}")

    func_expr = func_expr.replace("^", "**")

    try:
        var = sp.Symbol(variable)
        expr = sympify(func_expr)

        if lower is not None and upper is not None:
            # Definite integral
            lower_sym = sympify(lower)
            upper_sym = sympify(upper)
            result = sym_integrate(expr, (var, lower_sym, upper_sym))
        else:
            # Indefinite integral
            result = sym_integrate(expr, var)

        # Try to evaluate to float if possible
        try:
            value = float(result.evalf())
            return IntegrationResult(
                value=value,
                is_symbolic=False,
                method="sympy.integrate",
            )
        except (TypeError, ValueError):
            return IntegrationResult(
                value=str(result),
                is_symbolic=True,
                method="sympy.integrate",
            )
    except Exception as e:
        raise ValueError(f"Integration failed: {e}") from e


def symbolic_differentiate(
    func_expr: str,
    variable: str,
    order: int = 1,
) -> str:
    """
    Perform symbolic differentiation using SymPy.

    Args:
        func_expr: Mathematical expression as string
        variable: Differentiation variable name
        order: Order of derivative (default 1)

    Returns:
        String representation of the derivative
    """
    if not SYMPY_AVAILABLE:
        raise RuntimeError("SymPy is required for symbolic differentiation")

    if not _validate_expression(func_expr):
        raise ValueError(f"Invalid or unsafe expression: {func_expr}")

    func_expr = func_expr.replace("^", "**")

    try:
        var = sp.Symbol(variable)
        expr = sympify(func_expr)
        result = sym_diff(expr, var, order)
        return str(result)
    except Exception as e:
        raise ValueError(f"Differentiation failed: {e}") from e


def evaluate_formula(
    formula: str,
    variables: dict,
) -> float:
    """
    Evaluate a mathematical formula with given variable values.

    Args:
        formula: Mathematical expression as string
        variables: Dictionary of variable names to values

    Returns:
        Evaluated result as float
    """
    if not _validate_expression(formula):
        raise ValueError(f"Invalid or unsafe expression: {formula}")

    formula = formula.replace("^", "**")

    if SYMPY_AVAILABLE:
        try:
            expr = sympify(formula)
            sym_vars = {sp.Symbol(k): v for k, v in variables.items()}
            result = expr.subs(sym_vars)
            return float(result.evalf())
        except Exception as e:
            raise ValueError(f"Evaluation failed: {e}") from e
    else:
        # Fallback to safe eval
        local_vars = {**variables, **SAFE_FUNCTIONS}
        try:
            result = eval(formula, {"__builtins__": {}}, local_vars)
            return float(result)
        except Exception as e:
            raise ValueError(f"Evaluation failed: {e}") from e


def compute_divergence(
    fx_expr: str,
    fy_expr: str,
    fz_expr: str = "0",
) -> str:
    """
    Compute the divergence of a vector field symbolically.

    ∇·F = ∂Fx/∂x + ∂Fy/∂y + ∂Fz/∂z

    Args:
        fx_expr: x-component of vector field
        fy_expr: y-component of vector field
        fz_expr: z-component of vector field

    Returns:
        String representation of divergence
    """
    if not SYMPY_AVAILABLE:
        raise RuntimeError("SymPy is required for vector operations")

    for expr in [fx_expr, fy_expr, fz_expr]:
        if not _validate_expression(expr):
            raise ValueError(f"Invalid expression: {expr}")

    try:
        x, y, z = sp.symbols("x y z")
        fx = sympify(fx_expr.replace("^", "**"))
        fy = sympify(fy_expr.replace("^", "**"))
        fz = sympify(fz_expr.replace("^", "**"))

        div = sym_diff(fx, x) + sym_diff(fy, y) + sym_diff(fz, z)
        return str(sp.simplify(div))
    except Exception as e:
        raise ValueError(f"Divergence calculation failed: {e}") from e


def compute_curl(
    fx_expr: str,
    fy_expr: str,
    fz_expr: str = "0",
) -> Tuple[str, str, str]:
    """
    Compute the curl of a vector field symbolically.

    ∇×F = (∂Fz/∂y - ∂Fy/∂z, ∂Fx/∂z - ∂Fz/∂x, ∂Fy/∂x - ∂Fx/∂y)

    Args:
        fx_expr: x-component of vector field
        fy_expr: y-component of vector field
        fz_expr: z-component of vector field

    Returns:
        Tuple of (curl_x, curl_y, curl_z) as strings
    """
    if not SYMPY_AVAILABLE:
        raise RuntimeError("SymPy is required for vector operations")

    for expr in [fx_expr, fy_expr, fz_expr]:
        if not _validate_expression(expr):
            raise ValueError(f"Invalid expression: {expr}")

    try:
        x, y, z = sp.symbols("x y z")
        fx = sympify(fx_expr.replace("^", "**"))
        fy = sympify(fy_expr.replace("^", "**"))
        fz = sympify(fz_expr.replace("^", "**"))

        curl_x = sym_diff(fz, y) - sym_diff(fy, z)
        curl_y = sym_diff(fx, z) - sym_diff(fz, x)
        curl_z = sym_diff(fy, x) - sym_diff(fx, y)

        return (
            str(sp.simplify(curl_x)),
            str(sp.simplify(curl_y)),
            str(sp.simplify(curl_z)),
        )
    except Exception as e:
        raise ValueError(f"Curl calculation failed: {e}") from e


def compute_gradient(
    scalar_expr: str,
) -> Tuple[str, str, str]:
    """
    Compute the gradient of a scalar field symbolically.

    ∇f = (∂f/∂x, ∂f/∂y, ∂f/∂z)

    Args:
        scalar_expr: Scalar field expression

    Returns:
        Tuple of (grad_x, grad_y, grad_z) as strings
    """
    if not SYMPY_AVAILABLE:
        raise RuntimeError("SymPy is required for vector operations")

    if not _validate_expression(scalar_expr):
        raise ValueError(f"Invalid expression: {scalar_expr}")

    try:
        x, y, z = sp.symbols("x y z")
        f = sympify(scalar_expr.replace("^", "**"))

        grad_x = sym_diff(f, x)
        grad_y = sym_diff(f, y)
        grad_z = sym_diff(f, z)

        return (
            str(sp.simplify(grad_x)),
            str(sp.simplify(grad_y)),
            str(sp.simplify(grad_z)),
        )
    except Exception as e:
        raise ValueError(f"Gradient calculation failed: {e}") from e


def compute_laplacian(
    scalar_expr: str,
) -> str:
    """
    Compute the Laplacian of a scalar field symbolically.

    ∇²f = ∂²f/∂x² + ∂²f/∂y² + ∂²f/∂z²

    Args:
        scalar_expr: Scalar field expression

    Returns:
        String representation of Laplacian
    """
    if not SYMPY_AVAILABLE:
        raise RuntimeError("SymPy is required for vector operations")

    if not _validate_expression(scalar_expr):
        raise ValueError(f"Invalid expression: {scalar_expr}")

    try:
        x, y, z = sp.symbols("x y z")
        f = sympify(scalar_expr.replace("^", "**"))

        laplacian = sym_diff(f, x, 2) + sym_diff(f, y, 2) + sym_diff(f, z, 2)
        return str(sp.simplify(laplacian))
    except Exception as e:
        raise ValueError(f"Laplacian calculation failed: {e}") from e
