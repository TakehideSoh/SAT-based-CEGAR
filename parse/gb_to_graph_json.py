#!/usr/bin/env python3
import argparse
import csv
import json
import math
from pathlib import Path

import networkx as nx


def _parse_ref(token: str, prefix: str):
    token = token.strip()
    if token == "0":
        return None
    if token.startswith(prefix):
        return int(token[1:])
    raise ValueError(f"invalid token '{token}', expected {prefix}<num> or 0")


def _csv_fields(line: str):
    return next(csv.reader([line], delimiter=",", quotechar='"'))


def _join_continued_lines(lines):
    out = []
    buf = ""
    for line in lines:
        if buf:
            buf += line
        else:
            buf = line
        if buf.endswith("\\"):
            buf = buf[:-1]
            continue
        out.append(buf)
        buf = ""
    if buf:
        out.append(buf)
    return out


def parse_graphbase_named(path: Path):
    raw = [ln.strip() for ln in path.read_text(encoding="utf-8").splitlines()]
    raw_lines = _join_continued_lines(raw)
    lines = [ln for ln in raw_lines if ln]

    if len(lines) < 3:
        raise ValueError("file is too short")

    try:
        vertices_idx = lines.index("* Vertices")
        arcs_idx = lines.index("* Arcs")
    except ValueError as exc:
        raise ValueError("missing '* Vertices' or '* Arcs' section") from exc

    graph_info = None
    header_blob = "".join(lines[1:vertices_idx]).strip()
    if header_blob:
        fields = _csv_fields(header_blob)
        if len(fields) >= 3:
            try:
                int(fields[1].strip())
                int(fields[2].strip())
                graph_info = fields
            except ValueError:
                graph_info = None

    if graph_info is None:
        for ln in lines[1:vertices_idx]:
            if ln.startswith("*"):
                continue
            fields = _csv_fields(ln)
            if len(fields) >= 3:
                try:
                    int(fields[1].strip())
                    int(fields[2].strip())
                    graph_info = fields
                    break
                except ValueError:
                    continue

    if graph_info is None:
        raise ValueError("invalid graph info line")

    n = int(graph_info[1].strip())
    m = int(graph_info[2].strip())
    graph_name = graph_info[0].strip()

    vertex_lines = [
        ln for ln in lines[vertices_idx + 1 : arcs_idx] if not ln.startswith("*")
    ]
    arc_lines = [ln for ln in lines[arcs_idx + 1 :] if not ln.startswith("*")]

    if len(vertex_lines) < n:
        raise ValueError(f"vertex lines too short: got {len(vertex_lines)}, need {n}")
    if len(arc_lines) < m:
        raise ValueError(f"arc lines too short: got {len(arc_lines)}, need {m}")

    vertex_lines = vertex_lines[:n]
    arc_lines = arc_lines[:m]

    names = []
    first_arcs = []
    for line in vertex_lines:
        fields = _csv_fields(line)
        if len(fields) < 2:
            raise ValueError(f"invalid vertex line: {line}")
        names.append(fields[0])
        first_arcs.append(_parse_ref(fields[1], "A"))

    arcs = []
    for line in arc_lines:
        fields = _csv_fields(line)
        if len(fields) < 2:
            raise ValueError(f"invalid arc line: {line}")
        tip = _parse_ref(fields[0], "V")
        nxt = _parse_ref(fields[1], "A")
        if tip is None:
            raise ValueError(f"invalid arc tip in line: {line}")
        arcs.append((tip, nxt))

    edges_idx = set()
    for src, start in enumerate(first_arcs):
        arc_idx = start
        seen = set()
        while arc_idx is not None:
            if arc_idx < 0 or arc_idx >= m:
                raise ValueError(f"arc index out of range: {arc_idx}")
            if arc_idx in seen:
                break
            seen.add(arc_idx)
            dst, nxt = arcs[arc_idx]
            if dst < 0 or dst >= n:
                raise ValueError(f"vertex index out of range: {dst}")
            if src != dst:
                u = min(src, dst)
                v = max(src, dst)
                edges_idx.add((u, v))
            arc_idx = nxt

    nodes = [{"id": names[i], "index": i + 1} for i in range(n)]
    edges = [[names[u], names[v]] for (u, v) in sorted(edges_idx)]
    return graph_name, nodes, edges


def _positions_to_jsonable(pos):
    out = {}
    for node, vec in pos.items():
        out[str(node)] = [float(vec[0]), float(vec[1])]
    return out


def _canonical_cycle(nodes):
    seq = [str(x) for x in nodes]
    if len(seq) > 1 and seq[0] == seq[-1]:
        seq = seq[:-1]
    if len(seq) < 3:
        return None
    n = len(seq)
    rots = [tuple(seq[i:] + seq[:i]) for i in range(n)]
    rev = list(reversed(seq))
    rev_rots = [tuple(rev[i:] + rev[:i]) for i in range(n)]
    return min(min(rots), min(rev_rots))


def _embedding_faces(embedding):
    faces = []
    seen = set()
    for u in embedding:
        for v in embedding.neighbors_cw_order(u):
            face = embedding.traverse_face(u, v)
            canon = _canonical_cycle(face)
            if canon is None or canon in seen:
                continue
            seen.add(canon)
            faces.append(list(canon))
    return faces


def _tutte_with_outer_cycle(g, outer_cycle, max_iter=5000, tol=1e-9):
    boundary = list(dict.fromkeys(str(v) for v in outer_cycle))
    if len(boundary) < 3:
        raise ValueError("outer cycle must contain at least 3 distinct vertices")
    if len(boundary) >= g.number_of_nodes():
        return {str(v): [math.cos(2.0 * math.pi * i / len(boundary)), math.sin(2.0 * math.pi * i / len(boundary))] for i, v in enumerate(boundary)}

    pos = {}
    n = len(boundary)
    for i, node in enumerate(boundary):
        th = 2.0 * math.pi * i / n
        pos[node] = (math.cos(th), math.sin(th))

    interior = [str(v) for v in g.nodes() if str(v) not in pos]
    for node in interior:
        pos[node] = (0.0, 0.0)

    for _ in range(max_iter):
        max_delta = 0.0
        for node in interior:
            nbrs = [str(v) for v in g.neighbors(node)]
            if not nbrs:
                continue
            x = sum(pos[v][0] for v in nbrs) / len(nbrs)
            y = sum(pos[v][1] for v in nbrs) / len(nbrs)
            old = pos[node]
            pos[node] = (x, y)
            max_delta = max(max_delta, abs(old[0] - x), abs(old[1] - y))
        if max_delta < tol:
            break
    return pos


def _choose_layout(g, embedding, stem):
    stem_lc = stem.lower()
    if "grinberg" in stem_lc:
        faces = _embedding_faces(embedding)
        if faces:
            outer = max(faces, key=len)
            tutte = _tutte_with_outer_cycle(g, outer)
            return tutte, "tutte(outer=max-face)"
    return nx.planar_layout(embedding), "planar_layout"


def convert_dir(src_dir: Path, dst_dir: Path):
    dst_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(src_dir.glob("*.gb"))
    manifest = {"files": []}
    for gb in files:
        graph_name, nodes, edges = parse_graphbase_named(gb)
        g = nx.Graph()
        for node in nodes:
            g.add_node(node["id"])
        for u, v in edges:
            g.add_edge(u, v)
        is_planar, embedding = nx.check_planarity(g, counterexample=False)

        layouts = {}
        layout_method = "none"
        if is_planar:
            planar_pos, layout_method = _choose_layout(g, embedding, gb.stem)
            layouts["planar"] = _positions_to_jsonable(planar_pos)
        else:
            spring_pos = nx.spring_layout(g, seed=42)
            layouts["spring"] = _positions_to_jsonable(spring_pos)
            layout_method = "spring_layout(seed=42)"

        out = dst_dir / f"{gb.stem}.json"
        payload = {
            "name": graph_name,
            "source_file": gb.name,
            "vertex_count": len(nodes),
            "edge_count": len(edges),
            "is_planar": bool(is_planar),
            "layout_method": layout_method,
            "layouts": layouts,
            "nodes": nodes,
            "edges": edges,
        }
        out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        manifest["files"].append(out.name)
        print(
            f"{gb.name} -> {out.name}  (|V|={len(nodes)}, |E|={len(edges)}, planar={is_planar})"
        )

    manifest["files"].sort()
    (dst_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"generated {len(files)} graph json files")


def main():
    parser = argparse.ArgumentParser(
        description="Convert Stanford GraphBase .gb files to graph JSON for visualizer"
    )
    parser.add_argument("input", type=Path, help="input directory containing .gb files")
    parser.add_argument("output", type=Path, help="output directory for .json files")
    args = parser.parse_args()

    if not args.input.is_dir():
        raise SystemExit(f"input is not a directory: {args.input}")
    convert_dir(args.input, args.output)


if __name__ == "__main__":
    main()
