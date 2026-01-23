"""
AI Tool Calling Support

Defines tools that AI can invoke to perform calculations and simulations.
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from pydantic import BaseModel


# Simulation service URL (internal call)
SIM_SERVICE_URL = os.getenv("SIM_SERVICE_URL", "http://localhost:8002")


# ============================================================================
# Tool Definitions (OpenAI Function Calling Format)
# ============================================================================

AVAILABLE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "calculate_integral",
            "description": "计算定积分或不定积分。支持常见数学函数如 sin, cos, exp, log, sqrt 等。",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "被积表达式，使用 Python 数学语法，如 'x**2 * sin(x)' 或 'exp(-x**2)'"
                    },
                    "variable": {
                        "type": "string",
                        "description": "积分变量，如 'x' 或 't'"
                    },
                    "lower_bound": {
                        "type": "number",
                        "description": "定积分下限（可选，不填则计算不定积分）"
                    },
                    "upper_bound": {
                        "type": "number",
                        "description": "定积分上限（可选，不填则计算不定积分）"
                    }
                },
                "required": ["expression", "variable"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_derivative",
            "description": "计算导数或高阶导数。",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "需要求导的表达式，如 'x**3 + sin(x)'"
                    },
                    "variable": {
                        "type": "string",
                        "description": "对哪个变量求导，如 'x'"
                    },
                    "order": {
                        "type": "integer",
                        "description": "导数阶数，默认1（一阶导数）"
                    }
                },
                "required": ["expression", "variable"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "evaluate_expression",
            "description": "计算数学表达式的数值结果。",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "需要计算的表达式，如 'E = k*q/r**2'"
                    },
                    "variables": {
                        "type": "object",
                        "description": "变量名到数值的映射，如 {\"k\": 8.99e9, \"q\": 1e-9, \"r\": 0.1}"
                    }
                },
                "required": ["expression"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "vector_operation",
            "description": "执行矢量场运算：梯度、散度、旋度、拉普拉斯算子。",
            "parameters": {
                "type": "object", 
                "properties": {
                    "operation": {
                        "type": "string",
                        "enum": ["gradient", "divergence", "curl", "laplacian"],
                        "description": "运算类型"
                    },
                    "scalar": {
                        "type": "string",
                        "description": "标量场表达式（用于 gradient 和 laplacian）"
                    },
                    "fx": {
                        "type": "string",
                        "description": "矢量场 x 分量（用于 divergence 和 curl）"
                    },
                    "fy": {
                        "type": "string",
                        "description": "矢量场 y 分量（用于 divergence 和 curl）"
                    },
                    "fz": {
                        "type": "string",
                        "description": "矢量场 z 分量（默认为 0）"
                    }
                },
                "required": ["operation"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "run_simulation",
            "description": "运行电磁场仿真计算并获取结果。",
            "parameters": {
                "type": "object",
                "properties": {
                    "sim_type": {
                        "type": "string",
                        "enum": ["laplace2d", "point_charges", "wire_field", "wave_1d"],
                        "description": "仿真类型"
                    },
                    "params": {
                        "type": "object",
                        "description": "仿真参数，根据仿真类型不同而不同"
                    }
                },
                "required": ["sim_type"]
            }
        }
    }
]


# ============================================================================
# Tool Execution
# ============================================================================

class ToolResult(BaseModel):
    """Result of tool execution."""
    success: bool
    result: Any | None = None
    error: str | None = None


async def execute_tool(name: str, arguments: dict) -> ToolResult:
    """
    Execute a tool and return the result.
    
    Args:
        name: Tool name
        arguments: Tool arguments
        
    Returns:
        ToolResult with success status and result/error
    """
    try:
        if name == "calculate_integral":
            return await _call_integrate(arguments)
        elif name == "calculate_derivative":
            return await _call_differentiate(arguments)
        elif name == "evaluate_expression":
            return await _call_evaluate(arguments)
        elif name == "vector_operation":
            return await _call_vector_op(arguments)
        elif name == "run_simulation":
            return await _call_simulation(arguments)
        else:
            return ToolResult(success=False, error=f"Unknown tool: {name}")
    except Exception as e:
        return ToolResult(success=False, error=str(e))


async def _call_integrate(args: dict) -> ToolResult:
    """Call integration API."""
    payload = {
        "expression": args.get("expression"),
        "variable": args.get("variable", "x"),
        "method": "symbolic" if args.get("lower_bound") is None else "numerical",
    }
    if args.get("lower_bound") is not None:
        payload["lower"] = args["lower_bound"]
    if args.get("upper_bound") is not None:
        payload["upper"] = args["upper_bound"]
    
    async with httpx.AsyncClient(timeout=30.0, proxy=None) as client:
        resp = await client.post(f"{SIM_SERVICE_URL}/v1/calc/integrate", json=payload)
        if resp.status_code == 200:
            data = resp.json()
            return ToolResult(success=True, result=data)
        else:
            return ToolResult(success=False, error=resp.text)


async def _call_differentiate(args: dict) -> ToolResult:
    """Call differentiation API."""
    payload = {
        "expression": args.get("expression"),
        "variable": args.get("variable", "x"),
        "order": args.get("order", 1),
    }
    
    async with httpx.AsyncClient(timeout=30.0, proxy=None) as client:
        resp = await client.post(f"{SIM_SERVICE_URL}/v1/calc/differentiate", json=payload)
        if resp.status_code == 200:
            data = resp.json()
            return ToolResult(success=True, result=data)
        else:
            return ToolResult(success=False, error=resp.text)


async def _call_evaluate(args: dict) -> ToolResult:
    """Call expression evaluation API."""
    payload = {
        "formula": args.get("expression"),
        "variables": args.get("variables", {}),
    }
    
    async with httpx.AsyncClient(timeout=30.0, proxy=None) as client:
        resp = await client.post(f"{SIM_SERVICE_URL}/v1/calc/evaluate", json=payload)
        if resp.status_code == 200:
            data = resp.json()
            return ToolResult(success=True, result=data)
        else:
            return ToolResult(success=False, error=resp.text)


async def _call_vector_op(args: dict) -> ToolResult:
    """Call vector operation API."""
    payload = {
        "operation": args.get("operation"),
        "scalar": args.get("scalar"),
        "fx": args.get("fx"),
        "fy": args.get("fy"),
        "fz": args.get("fz", "0"),
    }
    
    async with httpx.AsyncClient(timeout=30.0, proxy=None) as client:
        resp = await client.post(f"{SIM_SERVICE_URL}/v1/calc/vector_op", json=payload)
        if resp.status_code == 200:
            data = resp.json()
            return ToolResult(success=True, result=data)
        else:
            return ToolResult(success=False, error=resp.text)


async def _call_simulation(args: dict) -> ToolResult:
    """Call simulation API."""
    sim_type = args.get("sim_type")
    params = args.get("params", {})
    
    # Map sim_type to endpoint
    endpoint_map = {
        "laplace2d": "/v1/sim/laplace2d",
        "point_charges": "/v1/sim/point_charges",
        "wire_field": "/v1/sim/wire_field",
        "wave_1d": "/v1/sim/wave_1d",
    }
    
    endpoint = endpoint_map.get(sim_type)
    if not endpoint:
        return ToolResult(success=False, error=f"Unknown simulation type: {sim_type}")
    
    async with httpx.AsyncClient(timeout=60.0, proxy=None) as client:
        resp = await client.post(f"{SIM_SERVICE_URL}{endpoint}", json=params)
        if resp.status_code == 200:
            data = resp.json()
            # Remove base64 image data to reduce response size
            if "png_base64" in data:
                data["has_image"] = True
                del data["png_base64"]
            return ToolResult(success=True, result=data)
        else:
            return ToolResult(success=False, error=resp.text)


def get_tool_result_message(name: str, result: ToolResult) -> str:
    """
    Format tool result as a message for the AI to process.
    """
    if result.success:
        return f"工具 `{name}` 执行成功，结果：\n```json\n{result.result}\n```"
    else:
        return f"工具 `{name}` 执行失败：{result.error}"
