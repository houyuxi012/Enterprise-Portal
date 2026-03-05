#!/usr/bin/env python3
from __future__ import annotations

import argparse
import ast
import json
from pathlib import Path
from typing import Any


def _as_jsonable(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, (list, tuple)):
        return [_as_jsonable(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _as_jsonable(v) for k, v in value.items()}
    return str(value)


def _parse(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def _iter_function_calls(module: ast.Module, fn_name: str, method_name: str) -> list[ast.Call]:
    calls: list[ast.Call] = []
    for node in module.body:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if node.name != fn_name:
            continue
        for inner in ast.walk(node):
            if not isinstance(inner, ast.Call):
                continue
            target = inner.func
            if not isinstance(target, ast.Attribute):
                continue
            if target.attr != method_name:
                continue
            calls.append(inner)
    return calls


def _name_of_call(call: ast.Call) -> str | None:
    if not call.args:
        return None
    first = call.args[0]
    if isinstance(first, ast.Call) and isinstance(first.func, ast.Name):
        return first.func.id
    return None


def _is_attr(node: ast.AST, obj: str, attr: str) -> bool:
    return isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and node.value.id == obj and node.attr == attr


def _has_dep_verify_admin_aud(call: ast.Call) -> bool:
    for kw in call.keywords:
        if kw.arg != "dependencies":
            continue
        value = kw.value
        if not isinstance(value, (ast.List, ast.Tuple)):
            continue
        for elt in value.elts:
            if not isinstance(elt, ast.Call):
                continue
            if not isinstance(elt.func, ast.Name) or elt.func.id != "Depends":
                continue
            if not elt.args:
                continue
            dep = elt.args[0]
            if isinstance(dep, ast.Name) and dep.id == "verify_admin_aud":
                return True
    return False


def run_guard(backend_root: Path) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    details: dict[str, Any] = {}

    app_dir = backend_root / "application"
    middleware_dir = backend_root / "middleware"

    router_registry = app_dir / "router_registry.py"
    iam_routes = app_dir / "iam_routes.py"
    admin_routes = app_dir / "admin_routes.py"
    license_gate = middleware_dir / "license_gate.py"

    required_files = [router_registry, iam_routes, admin_routes, license_gate]
    missing = [str(p) for p in required_files if not p.exists()]
    if missing:
        return {
            "ok": False,
            "errors": [f"Missing required file: {m}" for m in missing],
            "warnings": warnings,
            "details": details,
        }

    # 1) /api router must include build_* routers, not register_* flattening
    registry_tree = _parse(router_registry)
    include_calls = _iter_function_calls(registry_tree, "register_api_routes", "include_router")
    include_builders = sorted({name for c in include_calls if (name := _name_of_call(c))})
    details["api_include_builders"] = include_builders

    for builder in ("build_iam_router", "build_portal_router", "build_admin_router"):
        if builder not in include_builders:
            errors.append(
                f"application/router_registry.py must include {builder}() inside register_api_routes()"
            )

    if "register_iam_routes" in include_builders or "register_portal_routes" in include_builders or "register_admin_routes" in include_builders:
        errors.append(
            "application/router_registry.py is flattening routes via register_*_routes(); must include build_*_router() to preserve prefixes/dependencies"
        )

    # 2) IAM route registry must mount alias license router with admin dependency
    iam_tree = _parse(iam_routes)
    iam_include_calls = _iter_function_calls(iam_tree, "register_iam_routes", "include_router")
    alias_calls = [
        c
        for c in iam_include_calls
        if c.args and _is_attr(c.args[0], "system", "license_alias_router")
    ]
    details["iam_alias_mount_count"] = len(alias_calls)

    if not alias_calls:
        errors.append(
            "application/iam_routes.py must include system.license_alias_router in register_iam_routes()"
        )
    else:
        if not any(_has_dep_verify_admin_aud(c) for c in alias_calls):
            errors.append(
                "system.license_alias_router must be mounted with dependencies=[Depends(verify_admin_aud)]"
            )

    # 3) Admin route registry must mount canonical system.router
    admin_tree = _parse(admin_routes)
    admin_include_calls = _iter_function_calls(admin_tree, "register_admin_routes", "include_router")
    has_admin_system = any(c.args and _is_attr(c.args[0], "system", "router") for c in admin_include_calls)
    details["admin_has_system_router"] = has_admin_system
    if not has_admin_system:
        errors.append("application/admin_routes.py must include system.router in register_admin_routes()")

    # 4) License gate middleware allowlist must keep both admin and alias prefixes
    gate_text = license_gate.read_text(encoding="utf-8")
    required_prefixes = ["/api/system/license/", "/api/admin/system/license/"]
    details["gate_prefixes_present"] = {
        p: (p in gate_text) for p in required_prefixes
    }
    for prefix in required_prefixes:
        if prefix not in gate_text:
            errors.append(f"middleware/license_gate.py missing exempt prefix: {prefix}")

    return {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "details": _as_jsonable(details),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Guard license route registration and middleware exemptions.")
    parser.add_argument(
        "--backend-root",
        default="backend",
        help="Backend root path containing application/ and middleware/",
    )
    parser.add_argument(
        "--output",
        choices=("plain", "json"),
        default="plain",
        help="Output format.",
    )
    parser.add_argument(
        "--report-file",
        default="",
        help="Optional path to write JSON report.",
    )
    args = parser.parse_args()

    backend_root = Path(args.backend_root).resolve()
    report = run_guard(backend_root)

    if args.report_file:
        report_path = Path(args.report_file).resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    if args.output == "json":
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        status = "PASS" if report["ok"] else "FAIL"
        print(f"[license-route-guard] {status}")
        for msg in report["errors"]:
            print(f"[error] {msg}")
        for msg in report["warnings"]:
            print(f"[warn] {msg}")

    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
