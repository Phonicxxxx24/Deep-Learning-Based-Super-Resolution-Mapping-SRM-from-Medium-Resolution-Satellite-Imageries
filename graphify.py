"""
Graphify Engine for SRM (Sentinel-2 Super-Resolution Mapping).
Parses the entire codebase (Python AST, TypeScript/TSX AST/regex, Configs, APIs, DB Schema)
and generates:
  1. graph.json       - Complete queryable knowledge graph (nodes, edges, symbols, dependencies)
  2. GRAPH_REPORT.md  - Deep architectural report mapping modules, data flows, symbols & dependencies
  3. graph.html       - Interactive standalone visual knowledge graph explorer (vis-network)
"""
from __future__ import annotations

import ast
import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Set

ROOT_DIR = Path(__file__).resolve().parent

IGNORE_DIRS = {
    ".git", ".venv", "node_modules", ".next", "__pycache__",
    ".pytest_cache", ".gemini", "dist", "build", ".system_generated"
}


class CodebaseGraphifier:
    def __init__(self, root: Path):
        self.root = root
        self.nodes: Dict[str, Dict[str, Any]] = {}
        self.edges: List[Dict[str, Any]] = []
        self.modules: Dict[str, Dict[str, Any]] = {}

    def add_node(self, node_id: str, node_type: str, label: str, file_path: str, **kwargs: Any) -> None:
        if node_id not in self.nodes:
            self.nodes[node_id] = {
                "id": node_id,
                "type": node_type,
                "label": label,
                "file": file_path,
                **kwargs,
            }

    def add_edge(self, source: str, target: str, relationship: str, **kwargs: Any) -> None:
        self.edges.append({
            "source": source,
            "target": target,
            "relationship": relationship,
            **kwargs,
        })

    def parse_python_file(self, file_path: Path) -> None:
        rel_path = file_path.relative_to(self.root).as_posix()
        file_node_id = f"file:{rel_path}"
        self.add_node(file_node_id, "file_python", file_path.name, rel_path, category=self._categorize(rel_path))

        try:
            content = file_path.read_text(encoding="utf-8")
            tree = ast.parse(content, filename=str(file_path))
        except Exception as e:
            return

        for node in ast.walk(tree):
            # Imports
            if isinstance(node, ast.Import):
                for alias in node.names:
                    target_id = f"import:{alias.name}"
                    self.add_node(target_id, "package", alias.name, "")
                    self.add_edge(file_node_id, target_id, "imports")
            elif isinstance(node, ast.ImportFrom):
                mod_name = node.module or ""
                target_id = f"import:{mod_name}"
                self.add_node(target_id, "package", mod_name, "")
                self.add_edge(file_node_id, target_id, "imports")
                for alias in node.names:
                    sym_id = f"symbol:{mod_name}.{alias.name}"
                    self.add_node(sym_id, "imported_symbol", alias.name, "")
                    self.add_edge(file_node_id, sym_id, "imports_symbol")

            # Classes
            elif isinstance(node, ast.ClassDef):
                class_id = f"class:{rel_path}:{node.name}"
                bases = [ast.unparse(b) for b in node.bases]
                doc = ast.get_docstring(node) or ""
                self.add_node(class_id, "class", node.name, rel_path, bases=bases, doc=doc.strip().split("\n")[0])
                self.add_edge(file_node_id, class_id, "defines_class")
                for b in bases:
                    self.add_edge(class_id, f"class:{b}", "inherits_from")

            # Functions
            elif isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
                # Top-level or method
                func_id = f"func:{rel_path}:{node.name}"
                doc = ast.get_docstring(node) or ""
                args = [a.arg for a in node.args.args]
                is_async = isinstance(node, ast.AsyncFunctionDef)
                self.add_node(func_id, "function", node.name, rel_path, args=args, is_async=is_async, doc=doc.strip().split("\n")[0])
                self.add_edge(file_node_id, func_id, "defines_function")

    def parse_ts_file(self, file_path: Path) -> None:
        rel_path = file_path.relative_to(self.root).as_posix()
        file_node_id = f"file:{rel_path}"
        self.add_node(file_node_id, "file_frontend", file_path.name, rel_path, category="frontend")

        try:
            content = file_path.read_text(encoding="utf-8")
        except Exception:
            return

        # Regex for imports: import ... from '...'
        import_matches = re.findall(r"import\s+(?:\{([^}]+)\}|\*\s+as\s+(\w+)|(\w+))\s+from\s+['\"]([^'\"]+)['\"]", content)
        for named, star, def_import, source in import_matches:
            target_id = f"import:{source}"
            self.add_node(target_id, "package" if not source.startswith(".") and not source.startswith("@/") else "module", source, "")
            self.add_edge(file_node_id, target_id, "imports")
            symbols = []
            if named:
                symbols.extend([s.strip().split(" as ")[0] for s in named.split(",") if s.strip()])
            if def_import:
                symbols.append(def_import)
            if star:
                symbols.append(star)
            for s in symbols:
                sym_id = f"symbol:{source}.{s}"
                self.add_node(sym_id, "ts_symbol", s, "")
                self.add_edge(file_node_id, sym_id, "imports_symbol")

        # Interfaces & Types
        for iface in re.findall(r"export\s+interface\s+(\w+)", content):
            iface_id = f"type:{rel_path}:{iface}"
            self.add_node(iface_id, "interface", iface, rel_path)
            self.add_edge(file_node_id, iface_id, "defines_interface")

        for t in re.findall(r"export\s+type\s+(\w+)", content):
            type_id = f"type:{rel_path}:{t}"
            self.add_node(type_id, "type", t, rel_path)
            self.add_edge(file_node_id, type_id, "defines_type")

        # Components / Functions
        for comp in re.findall(r"export\s+(?:default\s+)?function\s+(\w+)", content):
            comp_id = f"component:{rel_path}:{comp}"
            self.add_node(comp_id, "component", comp, rel_path)
            self.add_edge(file_node_id, comp_id, "defines_component")

        # Constants
        for const in re.findall(r"export\s+const\s+(\w+)", content):
            const_id = f"const:{rel_path}:{const}"
            self.add_node(const_id, "constant", const, rel_path)
            self.add_edge(file_node_id, const_id, "defines_constant")

    def _categorize(self, rel_path: str) -> str:
        if rel_path.startswith("srm_api"):
            return "api_backend"
        elif rel_path.startswith("srm"):
            return "model_pipeline"
        elif rel_path.startswith("frontend"):
            return "web_frontend"
        elif rel_path.startswith("tests"):
            return "tests"
        elif rel_path.startswith("dashboard"):
            return "dashboard"
        return "root"

    def scan(self) -> None:
        for root, dirs, files in os.walk(self.root):
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
            for file in files:
                p = Path(root) / file
                ext = p.suffix.lower()
                if ext == ".py":
                    self.parse_python_file(p)
                elif ext in {".ts", ".tsx"}:
                    self.parse_ts_file(p)

    def generate_outputs(self) -> None:
        # 1. graph.json
        graph_data = {
            "version": "1.0.0",
            "project": "Sentinel-2 Dual-Path Super-Resolution Mapping (SRM)",
            "summary": {
                "total_nodes": len(self.nodes),
                "total_edges": len(self.edges),
                "node_types": {},
            },
            "nodes": list(self.nodes.values()),
            "edges": self.edges,
        }
        for n in self.nodes.values():
            t = n["type"]
            graph_data["summary"]["node_types"][t] = graph_data["summary"]["node_types"].get(t, 0) + 1

        (self.root / "graph.json").write_text(json.dumps(graph_data, indent=2), encoding="utf-8")

        # 2. GRAPH_REPORT.md
        self._generate_markdown_report(graph_data)

        # 3. graph.html (Interactive visualization)
        self._generate_html_visualization(graph_data)

    def _generate_markdown_report(self, data: Dict[str, Any]) -> None:
        py_files = [n for n in self.nodes.values() if n["type"] == "file_python"]
        ts_files = [n for n in self.nodes.values() if n["type"] == "file_frontend"]
        classes = [n for n in self.nodes.values() if n["type"] == "class"]
        funcs = [n for n in self.nodes.values() if n["type"] == "function"]
        components = [n for n in self.nodes.values() if n["type"] == "component"]
        interfaces = [n for n in self.nodes.values() if n["type"] in {"interface", "type"}]

        nl = "\n"
        classes_rows = nl.join([f"| **Class** | `{c['label']}` | [{c['file']}](file:///{self.root.as_posix()}/{c['file']}) | {c.get('doc', 'Core neural / pipeline class')} |" for c in classes[:15]])
        components_rows = nl.join([f"| **Component** | `{cp['label']}` | [{cp['file']}](file:///{self.root.as_posix()}/{cp['file']}) | React UI Component |" for cp in components[:12]])
        interfaces_rows = nl.join([f"| **Type** | `{t['label']}` | [{t['file']}](file:///{self.root.as_posix()}/{t['file']}) | TypeScript Contract |" for t in interfaces[:12]])

        md = f"""# Codebase Architecture & Dependency Graph (Graphify)

> **Repository:** Deep-Learning-Based-Super-Resolution-Mapping-SRM-from-Medium-Resolution-Satellite-Imageries  
> **Total Indexed Nodes:** {len(self.nodes)}  
> **Total Directed Edges:** {len(self.edges)}  
> **Interactive Graph:** [graph.html](file:///{self.root.as_posix()}/graph.html)  
> **Raw Graph Dataset:** [graph.json](file:///{self.root.as_posix()}/graph.json)

---

## 1. System Architecture Overview

```mermaid
graph TD
    User([Analyst Browser]) <-->|Next.js 16 UI :3000| Frontend[Frontend Web App]
    Frontend <-->|REST /api/sr, /api/scans| FastAPI[FastAPI Service :8000]
    FastAPI <-->|SQLite Persistent Storage| SQLite[(data/srm_scans.db)]
    FastAPI <-->|asyncio.Queue Serializer| Worker[GPU Worker Process]
    Worker <-->|PyTorch RTX 3050| Pipeline[DualPathSRPipeline]
    Pipeline <-->|STAC Planetary Computer| S2Fetch[Cubo Sentinel-2 L2A]
    Pipeline -->|LDSR-S2 Diffusion 4x| SRModel[DualPathSR Model]
    Pipeline -->|Fourier HardConstraint| RadCons[Radiometric Consistency]
    Pipeline -->|GeoTIFF + Indices| Outputs[outputs/ Deliverables]
```

---

## 2. Core Functional Subsystems

### A. Deep Learning Super-Resolution (`srm/`)
- **[srm/model.py](file:///{self.root.as_posix()}/srm/model.py)**: Defines `DualPathSR` (SEN2SRLite SWIR + LDSR-S2 VNIR diffusion with Fourier HardConstraint).
- **[srm/pipeline.py](file:///{self.root.as_posix()}/srm/pipeline.py)**: High-level inference coordinator `DualPathSRPipeline`.
- **[srm/flexible_input.py](file:///{self.root.as_posix()}/srm/flexible_input.py)**: On-demand coordinates fetcher via planetary STAC, 10-band spectral preservation, uncertainty estimation, and CRS GeoTIFF writer.
- **[srm/uncertainty.py](file:///{self.root.as_posix()}/srm/uncertainty.py)**: Monte Carlo epistemic uncertainty variance calculator across diffusion steps.
- **[srm/explainability.py](file:///{self.root.as_posix()}/srm/explainability.py)**: Local Attribution Map (LAM) receptive field generator.

### B. REST API & Persistence (`srm_api/`)
- **[srm_api/main.py](file:///{self.root.as_posix()}/srm_api/main.py)**: FastAPI router, GPU serialization worker, endpoints:
  - `POST /api/sr/submit` — Enqueue SR task
  - `GET /api/sr/status/:jobId` — Queue and execution status
  - `GET /api/sr/result/:jobId` — Full analysis payload
  - `GET /api/scans` — SQLite history query (filter, search)
  - `GET /api/scans/:jobId` — Single scan record
  - `GET /api/health` — Cluster health & queue depth
- **[srm_api/db.py](file:///{self.root.as_posix()}/srm_api/db.py)**: SQLite interface managing `data/srm_scans.db`, automatic backfilling, and reverse geocoding to human-readable area names.
- **[srm_api/schemas.py](file:///{self.root.as_posix()}/srm_api/schemas.py)**: Pydantic v2 data transfer models.

### C. Planetary Command Center Frontend (`frontend/`)
- **[frontend/src/app/page.tsx](file:///{self.root.as_posix()}/frontend/src/app/page.tsx)**: Command Center cockpit with planetary map, floating 3D command deck, quality selector, and mission presets.
- **[frontend/src/components/MapPicker.tsx](file:///{self.root.as_posix()}/frontend/src/components/MapPicker.tsx)**: Leaflet map with ESRI High-Resolution satellite imagery, boundaries/places reference layer, and targeting footprint.
- **[frontend/src/components/ScansArchiveDrawer.tsx](file:///{self.root.as_posix()}/frontend/src/components/ScansArchiveDrawer.tsx)**: High-z-index slide-out drawer displaying past scans from SQLite with area names, thumbnails, and 1-click inspection.
- **[frontend/src/components/ResultsPanel.tsx](file:///{self.root.as_posix()}/frontend/src/components/ResultsPanel.tsx)**: 3D Triad comparison (10m vs 2.5m vs Uncertainty), 10-band spectral preservation plot, indices viewer, and GeoTIFF downloads.
- **[frontend/src/components/CommandHeader.tsx](file:///{self.root.as_posix()}/frontend/src/components/CommandHeader.tsx)**: Live UTC telemetry bar, search jump, and archive count badge.
- **[frontend/src/components/LiquidBackdrop.tsx](file:///{self.root.as_posix()}/frontend/src/components/LiquidBackdrop.tsx)**: GPU-friendly ambient radial gradients.
- **[frontend/src/components/GlobalIcons.tsx](file:///{self.root.as_posix()}/frontend/src/components/GlobalIcons.tsx)**: Hand-crafted SVG vector suite.

---

## 3. Key Symbols & Class Directory

| Category | Identifier | File | Purpose |
|---|---|---|---|
{classes_rows}
{components_rows}
{interfaces_rows}

---

## 4. Querying & Navigating with Graphify

In any upcoming query or modification:
1. **Targeting Modules**: Check dependencies in `graph.json` before refactoring.
2. **Contract Consistency**: Cross-verify Pydantic models in `srm_api/schemas.py` with TypeScript interfaces in `frontend/src/types/index.ts`.
3. **Pipeline Invariance**: Core inference logic in `srm/` communicates with `srm_api/` via `run_sr_from_latlon` returning `FlexResult`.
"""
        (self.root / "GRAPH_REPORT.md").write_text(md, encoding="utf-8")

    def _generate_html_visualization(self, data: Dict[str, Any]) -> None:
        # Prepare vis.js nodes and edges
        vis_nodes = []
        for n in data["nodes"]:
            group = n["type"]
            color = "#0066cc"
            if "python" in group or group == "class":
                color = "#3b82f6"
            elif "frontend" in group or group == "component":
                color = "#10b981"
            elif group in {"interface", "type"}:
                color = "#8b5cf6"
            elif group == "function":
                color = "#f59e0b"
            elif group == "package":
                color = "#64748b"

            vis_nodes.append({
                "id": n["id"],
                "label": n["label"],
                "group": group,
                "color": color,
                "title": f"<b>{n['label']}</b><br/>Type: {n['type']}<br/>File: {n.get('file', '')}",
            })

        vis_edges = []
        for e in data["edges"]:
            vis_edges.append({
                "from": e["source"],
                "to": e["target"],
                "label": e.get("relationship", ""),
                "arrows": "to",
                "font": {"size": 8, "color": "#94a3b8"},
                "color": {"color": "#cbd5e1", "highlight": "#0066cc"},
            })

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>SRM Codebase Knowledge Graph (Graphify)</title>
  <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }}
    body {{ background: #0e131d; color: #e2e8f0; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }}
    header {{ background: #131b2a; border-bottom: 1px solid #1e293b; padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; }}
    h1 {{ font-size: 16px; font-weight: 700; color: #38bdf8; display: flex; align-items: center; gap: 8px; }}
    .stats {{ font-size: 12px; color: #94a3b8; }}
    #network {{ flex: 1; width: 100%; height: 100%; background: #0a0e14; }}
    .legend {{ position: absolute; bottom: 20px; left: 20px; background: rgba(19, 27, 42, 0.85); backdrop-filter: blur(10px); padding: 12px; border-radius: 12px; border: 1px solid #1e293b; font-size: 11px; z-index: 100; }}
    .legend-item {{ display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }}
    .legend-color {{ width: 10px; height: 10px; border-radius: 50%; }}
  </style>
</head>
<body>
  <header>
    <h1>SRM Planetary Engine · Codebase Knowledge Graph (Graphify)</h1>
    <div class="stats">Indexed Nodes: {len(vis_nodes)} | Edges: {len(vis_edges)} | Interactive AST & Dependency Map</div>
  </header>
  <div id="network"></div>
  <div class="legend">
    <div style="font-weight: bold; margin-bottom: 6px;">Graph Categories</div>
    <div class="legend-item"><div class="legend-color" style="background:#3b82f6;"></div>Python / DL Classes</div>
    <div class="legend-item"><div class="legend-color" style="background:#10b981;"></div>React Components</div>
    <div class="legend-item"><div class="legend-color" style="background:#8b5cf6;"></div>TypeScript Types / Interfaces</div>
    <div class="legend-item"><div class="legend-color" style="background:#f59e0b;"></div>Functions / API Handlers</div>
    <div class="legend-item"><div class="legend-color" style="background:#64748b;"></div>External Packages</div>
  </div>
  <script>
    const nodes = new vis.DataSet({json.dumps(vis_nodes)});
    const edges = new vis.DataSet({json.dumps(vis_edges)});
    const container = document.getElementById('network');
    const data = {{ nodes: nodes, edges: edges }};
    const options = {{
      nodes: {{ shape: 'dot', size: 14, font: {{ size: 11, color: '#e2e8f0' }} }},
      edges: {{ smooth: {{ type: 'continuous' }} }},
      physics: {{
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {{ gravitationalConstant: -35, centralGravity: 0.005, springLength: 80, springConstant: 0.18 }},
        stabilization: {{ iterations: 120 }}
      }}
    }};
    const network = new vis.Network(container, data, options);
  </script>
</body>
</html>"""
        (self.root / "graph.html").write_text(html, encoding="utf-8")


if __name__ == "__main__":
    print("Graphifying SRM codebase...")
    graphifier = CodebaseGraphifier(ROOT_DIR)
    graphifier.scan()
    graphifier.generate_outputs()
    print(f"Graphify complete! Generated graph.json, GRAPH_REPORT.md, and graph.html with {len(graphifier.nodes)} nodes and {len(graphifier.edges)} edges.")
