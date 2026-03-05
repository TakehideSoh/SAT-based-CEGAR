#!/usr/bin/env python3
import argparse
import csv
import json
import math
import re
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
    node_ids = [str(v) for v in g.nodes()]
    if stem == "Cconcentric-36":
        pos = _concentric_four_ring_layout(node_ids)
        if pos is not None:
            return pos, "concentric-4ring-fixed"
    if stem == "Pgrid+corners8x10":
        pos = _grid_corners_layout(node_ids)
        if pos is not None:
            return pos, "grid+corners-fixed"
    if stem_lc.startswith("hhalin-pi"):
        faces = _embedding_faces(embedding)
        if faces:
            outer = max(faces, key=len)
            tutte = _tutte_with_outer_cycle(g, outer)
            return tutte, "tutte(outer=max-face)"
    if "grinberg" in stem_lc:
        faces = _embedding_faces(embedding)
        if faces:
            outer = max(faces, key=len)
            tutte = _tutte_with_outer_cycle(g, outer)
            return tutte, "tutte(outer=max-face)"
    return nx.planar_layout(embedding), "planar_layout"


def _concentric_four_ring_layout(node_ids):
    groups = {}
    for node in node_ids:
        m = re.match(r"^([a-zA-Z]+)(\d+)$", str(node))
        if not m:
            return None
        key = m.group(1)
        idx = int(m.group(2))
        groups.setdefault(key, []).append((idx, str(node)))
    if set(groups.keys()) != {"a", "b", "c", "d"}:
        return None
    counts = {k: len(v) for k, v in groups.items()}
    if len(set(counts.values())) != 1:
        return None
    n = next(iter(counts.values()))
    if n < 3:
        return None
    radii = {"a": 1.0, "b": 0.76, "c": 0.52, "d": 0.28}
    pos = {}
    for layer in ["a", "b", "c", "d"]:
        for idx, node in groups[layer]:
            theta = (-math.pi / 2.0) + (2.0 * math.pi * (idx % n) / n)
            r = radii[layer]
            pos[node] = (r * math.cos(theta), r * math.sin(theta))
    return pos


def _grid_corners_layout(node_ids):
    numeric = {}
    max_r = 0
    max_c = 0
    for node in node_ids:
        s = str(node)
        m = re.match(r"^(\d+)\.(\d+)$", s)
        if not m:
            continue
        r = int(m.group(1))
        c = int(m.group(2))
        numeric[s] = (c, r)
        max_r = max(max_r, r)
        max_c = max(max_c, c)
    if len(numeric) < 20:
        return None
    pos = dict(numeric)
    if "!" in node_ids:
        pos["!"] = (-0.9, -0.9)
    if "!!" in node_ids:
        pos["!!"] = (max_c + 0.9, max_r + 0.9)
    for node in node_ids:
        s = str(node)
        if s not in pos:
            pos[s] = (max_c + 1.5, max_r + 1.5)
    return pos


def _q5cube_projection_layout(node_ids):
    vecs = [
        (1.0, 0.0),
        (0.30901699437494745, 0.9510565162951535),
        (-0.8090169943749473, 0.5877852522924732),
        (-0.8090169943749476, -0.587785252292473),
        (0.30901699437494723, -0.9510565162951536),
    ]
    pos = {}
    for node in node_ids:
        s = str(node)
        parts = s.split(".")
        if len(parts) != 5 or any(p not in {"0", "1"} for p in parts):
            return None
        bits = [int(p) for p in parts]
        x = 0.0
        y = 0.0
        for i, bit in enumerate(bits):
            t = bit - 0.5
            x += t * vecs[i][0]
            y += t * vecs[i][1]
        # small tie-breaker to keep all vertices separated deterministically
        lex = int("".join(parts), 2)
        x += (lex % 4) * 0.012
        y += ((lex // 4) % 4) * 0.012
        pos[s] = (x, y)
    return pos


def _tripartite_xyz_layout(node_ids):
    groups = {"x": [], "y": [], "z": []}
    for node in node_ids:
        s = str(node)
        m = re.match(r"^([xyzXYZ])(\d+)$", s)
        if not m:
            return None
        key = m.group(1).lower()
        groups[key].append((int(m.group(2)), s))
    if min(len(groups["x"]), len(groups["y"]), len(groups["z"])) == 0:
        return None
    xpos = {"x": 0.0, "y": 1.4, "z": 2.8}
    pos = {}
    for key in ["x", "y", "z"]:
        arr = sorted(groups[key])
        n = len(arr)
        if n == 1:
            pos[arr[0][1]] = (xpos[key], 0.0)
            continue
        for i, (_, node) in enumerate(arr):
            y = -1.0 + 2.0 * i / (n - 1)
            pos[node] = (xpos[key], y)
    return pos


def _bbinary_spectral_layout(g, node_ids):
    if g.number_of_nodes() == 0:
        return None
    for node in node_ids:
        s = str(node)
        if len(s) != 11 or any(ch not in {".", "x"} for ch in s):
            return None
    pos = nx.spectral_layout(g, dim=2)
    out = {}
    for node, vec in pos.items():
        out[str(node)] = (float(vec[0]), float(vec[1]))
    return out


def _choose_nonplanar_layout(g, stem):
    node_ids = [str(v) for v in g.nodes()]
    if stem == "Q5cube":
        pos = _q5cube_projection_layout(node_ids)
        if pos is not None:
            return pos, "q5cube-5d-projection"
    if stem == "TtripartiteK456":
        pos = _tripartite_xyz_layout(node_ids)
        if pos is not None:
            return pos, "tripartite-3column"
    if stem == "Bbinary55":
        pos = _bbinary_spectral_layout(g, node_ids)
        if pos is not None:
            return pos, "bbinary-spectral"
    return None, None


def _us_contig_fixed_layout(stem, node_ids):
    if stem != "Ucontig-ME-to-all":
        return None
    # Hand-tuned contiguous-US style placement (rough geographic layout).
    fixed = {
        "WA": (0.8, 1.0),
        "OR": (0.8, 2.0),
        "CA": (0.9, 4.0),
        "ID": (1.8, 1.6),
        "NV": (1.8, 3.0),
        "UT": (2.5, 3.0),
        "AZ": (2.5, 4.3),
        "MT": (2.8, 1.1),
        "WY": (2.8, 2.2),
        "CO": (3.4, 3.1),
        "NM": (3.4, 4.2),
        "ND": (4.0, 1.1),
        "SD": (4.0, 2.1),
        "NE": (4.1, 3.0),
        "KS": (4.1, 3.9),
        "OK": (4.2, 4.9),
        "TX": (4.5, 6.0),
        "MN": (5.0, 1.6),
        "IA": (5.1, 2.8),
        "MO": (5.3, 3.9),
        "AR": (5.4, 4.9),
        "LA": (5.7, 6.2),
        "WI": (5.8, 2.0),
        "IL": (5.9, 3.1),
        "MS": (6.3, 5.9),
        "MI": (6.7, 1.9),
        "IN": (6.5, 3.0),
        "KY": (6.7, 3.8),
        "TN": (6.8, 4.7),
        "AL": (7.1, 5.8),
        "OH": (7.3, 3.1),
        "WV": (7.8, 3.9),
        "GA": (7.8, 5.7),
        "SC": (8.3, 5.3),
        "NC": (8.4, 4.8),
        "VA": (8.3, 4.3),
        "PA": (8.0, 3.2),
        "FL": (8.3, 6.9),
        "NY": (8.6, 2.5),
        "VT": (9.1, 2.1),
        "NH": (9.4, 2.1),
        "ME": (9.9, 1.8),
        "MA": (9.1, 2.6),
        "CT": (8.9, 2.9),
        "RI": (9.3, 2.8),
        "NJ": (8.5, 3.3),
        "DE": (8.5, 3.7),
        "MD": (8.2, 3.8),
        # Auxiliary vertices used by this GraphBase instance.
        "!": (0.2, 6.6),
        "!!": (0.9, 7.2),
    }
    ids = {str(v) for v in node_ids}
    if not ids.issubset(set(fixed.keys())):
        return None
    return {v: fixed[v] for v in ids}


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
        layouts = {}
        layout_method = "none"
        fixed_pos = _us_contig_fixed_layout(gb.stem, [n["id"] for n in nodes])
        if fixed_pos is not None:
            layouts["spring"] = _positions_to_jsonable(fixed_pos)
            layout_method = "us-contiguous-fixed"
            is_planar, _ = nx.check_planarity(g, counterexample=False)
        else:
            is_planar, embedding = nx.check_planarity(g, counterexample=False)
            if is_planar:
                planar_pos, layout_method = _choose_layout(g, embedding, gb.stem)
                layouts["planar"] = _positions_to_jsonable(planar_pos)
            else:
                special_pos, special_method = _choose_nonplanar_layout(g, gb.stem)
                if special_pos is not None:
                    layouts["spring"] = _positions_to_jsonable(special_pos)
                    layout_method = special_method
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
