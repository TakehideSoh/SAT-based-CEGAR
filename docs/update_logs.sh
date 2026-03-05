#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

SRC_DIR="${1:-${ROOT_DIR}/logs/ham-examples-rust-gbtrace}"
DST_DIR="${2:-${ROOT_DIR}/docs/logs}"
GB_DIR="${3:-${ROOT_DIR}/benchmarks/ham-examples}"
COL_DIR="${4:-${ROOT_DIR}/benchmarks/ham-examples-col}"
GRAPH_JSON_DIR="${ROOT_DIR}/docs/graphs"
GRAPH_SRC_GB_DIR="${ROOT_DIR}/docs/graph-src/gb"
GRAPH_SRC_COL_DIR="${ROOT_DIR}/docs/graph-src/col"

if [ ! -d "${SRC_DIR}" ]; then
  echo "source directory not found: ${SRC_DIR}" >&2
  exit 1
fi
if [ ! -d "${GB_DIR}" ]; then
  echo "gb directory not found: ${GB_DIR}" >&2
  exit 1
fi
if [ ! -d "${COL_DIR}" ]; then
  echo "col directory not found: ${COL_DIR}" >&2
  exit 1
fi

mkdir -p "${DST_DIR}"
find "${DST_DIR}" -maxdepth 1 -type f -name '*.log' -delete
cp -f "${SRC_DIR}"/*.log "${DST_DIR}/"

manifest="${DST_DIR}/manifest.json"
{
  echo "{"
  echo '  "files": ['
  first=1
  while IFS= read -r f; do
    if [ "${first}" -eq 0 ]; then
      echo ","
    fi
    printf '    "%s"' "${f}"
    first=0
  done < <(cd "${DST_DIR}" && ls -1 *.log | sort)
  echo
  echo "  ]"
  echo "}"
} > "${manifest}"

echo "updated ${manifest}"

mkdir -p "${GRAPH_SRC_GB_DIR}" "${GRAPH_SRC_COL_DIR}"
find "${GRAPH_SRC_GB_DIR}" -maxdepth 1 -type f -name '*.gb' -delete
find "${GRAPH_SRC_COL_DIR}" -maxdepth 1 -type f -name '*.col' -delete
cp -f "${GB_DIR}"/*.gb "${GRAPH_SRC_GB_DIR}/"
cp -f "${COL_DIR}"/*.col "${GRAPH_SRC_COL_DIR}/"
echo "copied gb/col sources to docs/graph-src"

python3 "${ROOT_DIR}/parse/gb_to_graph_json.py" "${GB_DIR}" "${GRAPH_JSON_DIR}"
