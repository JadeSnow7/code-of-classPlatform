from __future__ import annotations

import ast
from pathlib import Path


_LEGACY_IMPL_PATH = Path(__file__).resolve().parent.parent / "app" / "legacy_impl.py"


def _module_ast() -> ast.Module:
    return ast.parse(_LEGACY_IMPL_PATH.read_text(encoding="utf-8"))


def test_legacy_impl_does_not_import_tools_or_guided_services() -> None:
    tree = _module_ast()
    forbidden_modules = {
        "app.services.tools_service",
        "app.services.guided_service",
    }
    forbidden_from_imports = {
        ("app.services", "tools_service"),
        ("app.services", "guided_service"),
    }

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                assert alias.name not in forbidden_modules
        if isinstance(node, ast.ImportFrom):
            for alias in node.names:
                assert (node.module or "", alias.name) not in forbidden_from_imports


def test_compatibility_aliases_point_to_legacy_runtime() -> None:
    tree = _module_ast()
    expected_sources = {
        "_build_tool_prompt": "tools_fallback",
        "_parse_learning_path": "guided_fallback",
        "_call_llm_with_tools": "guided_fallback",
    }
    found: dict[str, str] = {}

    for node in tree.body:
        if not isinstance(node, ast.Assign) or len(node.targets) != 1:
            continue
        target = node.targets[0]
        if not isinstance(target, ast.Name):
            continue
        if target.id not in expected_sources:
            continue
        value = node.value
        if isinstance(value, ast.Attribute) and isinstance(value.value, ast.Name):
            found[target.id] = value.value.id

    for name, expected_module in expected_sources.items():
        assert found.get(name) == expected_module


def test_legacy_impl_routes_call_legacy_runtime_modules() -> None:
    source = _LEGACY_IMPL_PATH.read_text(encoding="utf-8")
    assert "return await tools_fallback.chat_with_tools(" in source
    assert "return await tools_fallback.add_to_index(" in source
    assert "return await tools_fallback.delete_from_index(" in source
    assert "return await guided_fallback.chat_guided(" in source

