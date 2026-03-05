const state = {
  files: [],
  statusByFile: new Map(),
  problemMetaByFile: new Map(),
  parsedByFile: new Map(),
  graphByStem: new Map(),
  layoutByStem: new Map(),
  activeFile: null,
  activeStem: null,
  activeParsed: null,
  activeGraph: null,
  activeGraphSource: null,
  activeLayoutType: "force",
  replayFrames: [],
  selectedCycle: null,
  playTimer: null,
  isPlaying: false,
  cycleViewMode: "merge",
  layoutMode: "graph",
  playSpeedMs: 260,
  graphFocusMode: false,
};

const palette = [
  "#f2a65a",
  "#57c4ad",
  "#f2646d",
  "#8ddf70",
  "#74c7ec",
  "#ffd166",
  "#ef476f",
  "#06d6a0",
  "#118ab2",
  "#ff9f1c",
  "#b388eb",
  "#ff7f51",
];

const els = {
  mainTitle: document.getElementById("main-title"),
  summary: document.getElementById("summary"),
  iterations: document.getElementById("iterations"),
  logsCurrentAction: document.getElementById("logs-current-action"),
  cycleDetail: document.getElementById("cycle-detail"),
  problemList: document.getElementById("problem-list"),
  searchInput: document.getElementById("search-input"),
  cycleViewGroup: document.getElementById("cycle-view-group"),
  stepSlider: document.getElementById("step-slider"),
  stepLabel: document.getElementById("step-label"),
  stepReset: document.getElementById("step-reset"),
  stepPrev: document.getElementById("step-prev"),
  stepNext: document.getElementById("step-next"),
  playToggle: document.getElementById("play-toggle"),
  playSpeedGroup: document.getElementById("play-speed-group"),
  layoutModeGroup: document.getElementById("layout-mode-group"),
  graphCanvas: document.getElementById("graph-canvas"),
  graphLegend: document.getElementById("graph-legend"),
  graphFocusEnter: document.getElementById("graph-focus-enter"),
  graphFocusExit: document.getElementById("graph-focus-exit"),
};

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mapToText(entries) {
  if (!entries || entries.length === 0) {
    return "{}";
  }
  return `{${entries.map((e) => `${e.keyText}: ${e.value}`).join(", ")}}`;
}

function sumMap(entries) {
  return (entries || []).reduce((sum, e) => sum + Number(e.value || 0), 0);
}

function formatInt(value) {
  if (value === null || value === undefined) {
    return "-";
  }
  return Number(value).toLocaleString();
}

function formatDurationCompact0(raw, usValue) {
  let us = usValue;
  if ((us === null || us === undefined) && typeof parseDurationToUs === "function") {
    us = parseDurationToUs(raw || "");
  }
  if (us === null || us === undefined || Number.isNaN(us)) {
    return raw || "-";
  }
  if (us >= 1000 * 1000) {
    return `${Math.round(us / (1000 * 1000)).toLocaleString()} s`;
  }
  if (us >= 1000) {
    return `${Math.round(us / 1000).toLocaleString()} ms`;
  }
  return `${Math.round(us).toLocaleString()} us`;
}

function statusClass(status) {
  if (status === "SAT") {
    return "sat";
  }
  if (status === "UNSAT") {
    return "unsat";
  }
  return "unknown";
}

function getStem(fileName) {
  if (!fileName) {
    return "";
  }
  return fileName.endsWith(".log") ? fileName.slice(0, -4) : fileName;
}

function colorAt(index) {
  return palette[index % palette.length];
}

function edgeKey(a, b) {
  const x = String(a);
  const y = String(b);
  return x < y ? `${x}|${y}` : `${y}|${x}`;
}

function edgeLabel(edge) {
  if (!Array.isArray(edge) || edge.length < 2) {
    return "?-?";
  }
  return `${String(edge[0])}-${String(edge[1])}`;
}

function edgeListLabel(edges) {
  if (!Array.isArray(edges) || edges.length === 0) {
    return "";
  }
  return edges.map((edge) => edgeLabel(edge)).join(", ");
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function setCycleDetailPlaceholder() {
  els.cycleDetail.innerHTML =
    "<p>Click a cycle chip (<code>C1</code>, <code>C2</code>, ...) or legend to inspect vertices.</p>";
}

function setCycleDetail(title, cycleId, vertices, iterIndex) {
  state.selectedCycle = {
    cycleId,
    iterIndex,
  };
  els.cycleDetail.innerHTML = `
    <h3 class="detail-title">${escapeHtml(title)}</h3>
    <div class="kv-box">id = ${escapeHtml(cycleId)}</div>
    <div class="kv-box">size = ${formatInt(vertices.length)}</div>
    <div class="vertices">${escapeHtml(vertices.join(", "))}</div>
  `;
  renderGraphReplay();
}

function setActiveByData(groupEl, dataName, value) {
  if (!groupEl) {
    return;
  }
  const buttons = groupEl.querySelectorAll("button");
  for (let i = 0; i < buttons.length; i += 1) {
    const btn = buttons[i];
    btn.classList.toggle("active", btn.dataset[dataName] === value);
  }
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  if (target.getAttribute("contenteditable") === "true") {
    return true;
  }
  return target.closest("[contenteditable='true']") !== null;
}

function applyControlButtonState() {
  setActiveByData(els.cycleViewGroup, "cycleView", state.cycleViewMode);
  setActiveByData(els.layoutModeGroup, "layoutMode", state.layoutMode);
  setActiveByData(els.playSpeedGroup, "playSpeed", String(state.playSpeedMs));
}

function updatePlayButton() {
  if (!els.playToggle) {
    return;
  }
  els.playToggle.textContent = state.isPlaying ? "⏸" : "▶";
  els.playToggle.setAttribute("aria-label", state.isPlaying ? "Pause" : "Play");
  if (state.isPlaying) {
    els.playToggle.classList.add("active");
  } else {
    els.playToggle.classList.remove("active");
  }
}

function applyGraphFocusMode() {
  document.body.classList.toggle("graph-focus-mode", state.graphFocusMode);
  if (els.graphFocusEnter) {
    els.graphFocusEnter.hidden = state.graphFocusMode;
  }
  if (els.graphFocusExit) {
    els.graphFocusExit.hidden = !state.graphFocusMode;
  }
  renderGraphReplay();
}

function toggleGraphFocusMode(on) {
  const next = Boolean(on);
  if (state.graphFocusMode === next) {
    return;
  }
  state.graphFocusMode = next;
  applyGraphFocusMode();
}

function stopPlayback() {
  if (state.playTimer !== null) {
    window.clearInterval(state.playTimer);
    state.playTimer = null;
  }
  state.isPlaying = false;
  updatePlayButton();
}

function advanceStep(delta, scrollLogs) {
  if (!state.replayFrames.length) {
    return;
  }
  const current = Number(els.stepSlider.value);
  const max = state.replayFrames.length - 1;
  let next = current + delta;
  if (next < 0) {
    next = 0;
  }
  if (next > max) {
    next = max;
  }
  els.stepSlider.value = String(next);
  updateStepLabel(state.replayFrames[next], Boolean(scrollLogs));
  state.selectedCycle = null;
  renderGraphReplay();
}

function startPlayback() {
  if (state.playTimer !== null || state.replayFrames.length <= 1) {
    return;
  }
  const interval = Math.max(80, Number(state.playSpeedMs) || 260);
  state.isPlaying = true;
  updatePlayButton();
  state.playTimer = window.setInterval(() => {
    if (!state.replayFrames.length) {
      stopPlayback();
      return;
    }
    const idx = Number(els.stepSlider.value);
    if (idx >= state.replayFrames.length - 1) {
      stopPlayback();
      return;
    }
    advanceStep(1, true);
  }, interval);
}

function togglePlayback() {
  if (state.isPlaying) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

function togglePlaybackFromKeyboard() {
  if (state.isPlaying) {
    stopPlayback();
    return;
  }
  if (!state.replayFrames.length) {
    return;
  }
  const idx = Number(els.stepSlider.value);
  if (idx >= state.replayFrames.length - 1) {
    els.stepSlider.value = "0";
    updateStepLabel(state.replayFrames[0], true);
    state.selectedCycle = null;
    renderGraphReplay();
  }
  startPlayback();
}

function stepIndexForIterationStart(iterIndex) {
  for (let i = 0; i < state.replayFrames.length; i += 1) {
    const frame = state.replayFrames[i];
    if (
      frame &&
      frame.iterIndex === iterIndex &&
      frame.kind === "iteration" &&
      frame.stage === "subcycles"
    ) {
      return i;
    }
  }
  for (let i = 0; i < state.replayFrames.length; i += 1) {
    const frame = state.replayFrames[i];
    if (frame && frame.iterIndex === iterIndex) {
      return i;
    }
  }
  return -1;
}

function jumpToIterationStart(iterIndex, scrollLogs) {
  if (!state.replayFrames.length) {
    return;
  }
  const idx = stepIndexForIterationStart(iterIndex);
  const next = idx >= 0 ? idx : 0;
  els.stepSlider.value = String(next);
  updateStepLabel(state.replayFrames[next], Boolean(scrollLogs));
  state.selectedCycle = null;
  renderGraphReplay();
}

function getFilteredFiles() {
  const query = els.searchInput.value.trim().toLowerCase();
  return state.files.filter((file) => file.toLowerCase().includes(query));
}

function renderProblemList() {
  const files = getFilteredFiles();

  if (files.length === 0) {
    els.problemList.innerHTML = '<p class="empty-note">No matching log files.</p>';
    return;
  }

  els.problemList.innerHTML = files
    .map((file) => {
      const active = state.activeFile === file ? "active" : "";
      const status = state.statusByFile.get(file) || "UNKNOWN";
      const meta = state.problemMetaByFile.get(file);
      const vText = meta && meta.v ? `|V|=${formatInt(meta.v)}` : "|V|=?";
      return `
        <button class="problem-item ${active}" data-file="${escapeHtml(file)}">
          <span class="problem-main">
            <span class="problem-name">${escapeHtml(file)}</span>
            <span class="problem-meta">${escapeHtml(vText)}</span>
          </span>
          <span class="badge ${statusClass(status)}">${escapeHtml(status)}</span>
        </button>
      `;
    })
    .join("");
}

function sortFilesByVertexThenName() {
  state.files.sort((a, b) => {
    const ma = state.problemMetaByFile.get(a);
    const mb = state.problemMetaByFile.get(b);
    const va = ma && ma.v !== undefined ? Number(ma.v) : Number.MAX_SAFE_INTEGER;
    const vb = mb && mb.v !== undefined ? Number(mb.v) : Number.MAX_SAFE_INTEGER;
    if (va !== vb) {
      return va - vb;
    }
    return a.localeCompare(b);
  });
}

function pickDefaultProblemFile(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return null;
  }
  const exact = files.find((f) => getStem(f) === "Wgrinberg,1,2");
  if (exact) {
    return exact;
  }
  const grinberg = files.find((f) => /grinberg/i.test(getStem(f)));
  if (grinberg) {
    return grinberg;
  }
  return files[0];
}

async function selectAdjacentProblem(delta) {
  const files = getFilteredFiles();
  if (!files.length) {
    return;
  }
  const current = state.activeFile;
  let idx = files.indexOf(current);
  if (idx < 0) {
    idx = 0;
  }
  let next = idx + delta;
  if (next < 0) {
    next = 0;
  }
  if (next >= files.length) {
    next = files.length - 1;
  }
  const file = files[next];
  if (!file || file === current) {
    return;
  }
  try {
    await selectFile(file);
  } catch (err) {
    els.mainTitle.textContent = file;
    els.summary.innerHTML = "";
    els.iterations.innerHTML = `<p class="empty-note">${escapeHtml(
      err && err.message ? err.message : String(err),
    )}</p>`;
    refreshReplayFrames(false);
  }
}

function renderSummary(parsed) {
  const totalSubcycles = parsed.iterations.reduce(
    (sum, iter) => sum + (iter.subcyclesFound || 0),
    0,
  );
  const totalMergeOps = parsed.iterations.reduce(
    (sum, iter) =>
      sum + (iter.mergeOpsCount === null || iter.mergeOpsCount === undefined
        ? iter.mergeOps.length
        : iter.mergeOpsCount),
    0,
  );
  const totalAddedThis = parsed.iterations.reduce(
    (sum, iter) => sum + (iter.addedBlockClausesThis || 0),
    0,
  );
  const totalCutClauses = parsed.iterations.reduce(
    (sum, iter) => sum + sumMap(iter.cutArcsByClauseLength),
    0,
  );

  const iterCount =
    parsed.overall.cegarIterations === null || parsed.overall.cegarIterations === undefined
      ? parsed.iterations.length - 1
      : parsed.overall.cegarIterations;
  const addedClauses =
    parsed.overall.addedBlockClauses === null || parsed.overall.addedBlockClauses === undefined
      ? totalAddedThis
      : parsed.overall.addedBlockClauses;

  const cards = [
    { k: "Result", v: parsed.result },
    { k: "Iterations", v: formatInt(iterCount) },
    { k: "Clauses (enc/add)", v: `${formatInt(parsed.meta.encodingClauses)} / ${formatInt(addedClauses)}` },
    { k: "Subcycles", v: formatInt(totalSubcycles) },
    { k: "Merges", v: formatInt(totalMergeOps) },
    { k: "Cut Clauses", v: formatInt(totalCutClauses) },
    {
      k: "Time (solve/all)",
      v: `${formatDurationCompact0(parsed.overall.solvingTimeRaw, parsed.overall.solvingTimeUs)} / ${formatDurationCompact0(parsed.overall.overallTimeRaw, parsed.overall.overallTimeUs)}`,
    },
  ];

  els.summary.innerHTML = cards
    .map(
      (card) => `
      <div class="metric">
        <div class="k">${escapeHtml(card.k)}</div>
        <div class="v">${escapeHtml(card.v)}</div>
      </div>
    `,
    )
    .join("");
}

function findCycle(iter, cycleId) {
  if (!iter) {
    return null;
  }
  return iter.cyclesById[cycleId] || null;
}

function renderCycleDetail(iterIndex, cycleId) {
  const iter = state.activeParsed
    ? state.activeParsed.iterations.find((x) => x.index === iterIndex)
    : null;
  const cycle = findCycle(iter, cycleId);

  if (!iter || !cycle) {
    els.cycleDetail.innerHTML = `
      <h3 class="detail-title">Iteration ${formatInt(iterIndex)} / ${escapeHtml(cycleId)}</h3>
      <p>Vertices for this cycle ID were not recorded in this iteration.</p>
    `;
    return;
  }

  setCycleDetail(`Iteration ${iterIndex}`, cycleId, cycle.vertices, iterIndex);
}

function renderIterationCard(iter) {
  const subcycleChips = iter.gb.subcycles
    .map(
      (cycle) => `
      <button class="chip" data-iter="${iter.index}" data-cycle-id="${cycle.id}" title="subcycle">
        ${escapeHtml(cycle.id)}
      </button>
    `,
    )
    .join("");

  const resultingChips = iter.gb.resulting
    .map(
      (cycle) => `
      <button class="chip chip-resulting" data-iter="${iter.index}" data-cycle-id="${cycle.id}" title="resulting">
        ${escapeHtml(cycle.id)}
      </button>
    `,
    )
    .join("");

  const mergeLines = iter.gb.merges
    .map(
      (m, idx) =>
        `<div class="merge-line" data-merge-index="${idx}">${escapeHtml(
          `${m.left} + ${m.right} = ${m.merged}`,
        )}</div>`,
    )
    .join("");

  const statusLine = iter.terminalStatus
    ? `<span class="badge ${statusClass(iter.terminalStatus)}">${iter.terminalStatus}</span>`
    : "";

  return `
    <article class="iter-card" data-iter-index="${iter.index}">
      <div class="iter-head">
        <h3>Iteration ${formatInt(iter.index)} ${statusLine}</h3>
        <span class="time">${escapeHtml(iter.satSolvingTimeRaw || "-")}</span>
      </div>
      <div class="kv-grid">
        <div class="kv-box">subcycles = ${formatInt(iter.subcyclesFound)}</div>
        <div class="kv-box">merge operations = ${formatInt(
          iter.mergeOpsCount === null || iter.mergeOpsCount === undefined
            ? iter.mergeOps.length
            : iter.mergeOpsCount,
        )}</div>
        <div class="kv-box">resulting cycles = ${formatInt(iter.resultingCyclesCount)}</div>
        <div class="kv-box">added clauses (this) = ${formatInt(iter.addedBlockClausesThis)}</div>
        <div class="kv-box">added clauses (accum) = ${formatInt(iter.addedBlockClausesAccum)}</div>
        <div class="kv-box">increment time = ${escapeHtml(iter.incrementTimeRaw || "-")}</div>
      </div>
      <div class="map-line">cycle lengths before merge = ${escapeHtml(mapToText(iter.cycleLengthsBefore))}</div>
      <div class="map-line">cycle lengths after merge = ${escapeHtml(mapToText(iter.cycleLengthsAfter))}</div>
      <div class="map-line">cut arcs by clause length = ${escapeHtml(mapToText(iter.cutArcsByClauseLength))}</div>
      <div class="map-line">subcycles</div>
      <div class="chips">${subcycleChips || '<span class="muted">none</span>'}</div>
      <div class="map-line">merges</div>
      <div class="merge-list">${mergeLines || '<span class="muted">none</span>'}</div>
      <div class="map-line">resulting cycles</div>
      <div class="chips">${resultingChips || '<span class="muted">none</span>'}</div>
    </article>
  `;
}

function renderIterations(parsed) {
  if (!parsed.iterations.length) {
    els.iterations.innerHTML = '<p class="empty-note">No CEGAR iteration lines were parsed.</p>';
    return;
  }
  els.iterations.innerHTML = parsed.iterations.map((iter) => renderIterationCard(iter)).join("");
}

function renderSolution(parsed) {
  if (parsed.result !== "SAT" || parsed.solutionVertices.length === 0) {
    return;
  }

  const solutionHtml = `
    <article class="iter-card">
      <div class="iter-head">
        <h3>Hamiltonian Cycle (solution)</h3>
      </div>
      <div class="kv-box">vertices in solution = ${formatInt(parsed.solutionVertices.length)}</div>
      <div class="vertices">${escapeHtml(parsed.solutionVertices.join(", "))}</div>
    </article>
  `;
  els.iterations.insertAdjacentHTML("afterbegin", solutionHtml);
}

function normalizePositionMap(rawMap, nodeIds) {
  if (!rawMap || typeof rawMap !== "object") {
    return null;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const pos = {};
  let count = 0;

  for (let i = 0; i < nodeIds.length; i += 1) {
    const id = nodeIds[i];
    const v = rawMap[id];
    if (!Array.isArray(v) || v.length < 2) {
      continue;
    }
    const x = Number(v[0]);
    const y = Number(v[1]);
    if (Number.isNaN(x) || Number.isNaN(y)) {
      continue;
    }
    pos[id] = { x, y };
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    count += 1;
  }

  if (count < Math.max(3, Math.floor(nodeIds.length * 0.7))) {
    return null;
  }

  const spanX = Math.max(0.000001, maxX - minX);
  const spanY = Math.max(0.000001, maxY - minY);
  for (let i = 0; i < nodeIds.length; i += 1) {
    const id = nodeIds[i];
    if (!pos[id]) {
      continue;
    }
    pos[id] = {
      x: 0.06 + ((pos[id].x - minX) / spanX) * 0.88,
      y: 0.06 + ((pos[id].y - minY) / spanY) * 0.88,
    };
  }
  return pos;
}

function normalizeGraph(raw, fallbackName) {
  const inputNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const inputEdges = Array.isArray(raw.edges) ? raw.edges : [];
  const nodeIds = [];
  const idToIndex = new Map();

  for (let i = 0; i < inputNodes.length; i += 1) {
    const node = inputNodes[i];
    const id = node && node.id !== undefined ? String(node.id) : "";
    if (!id || idToIndex.has(id)) {
      continue;
    }
    idToIndex.set(id, nodeIds.length);
    nodeIds.push(id);
  }

  const dedup = new Set();
  const edges = [];
  const edgePairs = [];
  const edgeKeySet = new Set();
  const adjacency = new Map();
  for (let i = 0; i < inputEdges.length; i += 1) {
    const pair = inputEdges[i];
    if (!Array.isArray(pair) || pair.length < 2) {
      continue;
    }
    const a = String(pair[0]);
    const b = String(pair[1]);
    if (!idToIndex.has(a) || !idToIndex.has(b) || a === b) {
      continue;
    }
    const u = idToIndex.get(a);
    const v = idToIndex.get(b);
    const x = Math.min(u, v);
    const y = Math.max(u, v);
    const key = `${x}|${y}`;
    if (dedup.has(key)) {
      continue;
    }
    dedup.add(key);
    edges.push([a, b]);
    edgePairs.push([u, v]);
    edgeKeySet.add(edgeKey(a, b));
    if (!adjacency.has(a)) {
      adjacency.set(a, new Set());
    }
    if (!adjacency.has(b)) {
      adjacency.set(b, new Set());
    }
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
  }

  const rawLayouts = raw && raw.layouts && typeof raw.layouts === "object" ? raw.layouts : {};
  const layouts = {
    planar: normalizePositionMap(rawLayouts.planar, nodeIds),
    spring: normalizePositionMap(rawLayouts.spring, nodeIds),
  };

  return {
    name: raw.name || fallbackName,
    isPlanar: Boolean(raw && raw.is_planar),
    layouts,
    nodes: nodeIds.map((id, idx) => ({ id, index: idx + 1 })),
    edges,
    nodeIds,
    idToIndex,
    edgePairs,
    edgeKeySet,
    adjacency,
  };
}

function cycleToEdgePairs(vertices) {
  const pairs = [];
  if (!vertices || vertices.length < 2) {
    return pairs;
  }
  for (let i = 0; i < vertices.length; i += 1) {
    const a = String(vertices[i]);
    const b = String(vertices[(i + 1) % vertices.length]);
    pairs.push([a, b]);
  }
  return pairs;
}

function buildFallbackGraph(parsed, name) {
  const nodeSet = new Set();
  const edgeSet = new Set();
  const edges = [];

  function pushCycle(cycleVertices) {
    for (let i = 0; i < cycleVertices.length; i += 1) {
      nodeSet.add(String(cycleVertices[i]));
    }
    const pairs = cycleToEdgePairs(cycleVertices);
    for (let i = 0; i < pairs.length; i += 1) {
      const a = pairs[i][0];
      const b = pairs[i][1];
      if (a === b) {
        continue;
      }
      const x = a < b ? a : b;
      const y = a < b ? b : a;
      const key = `${x}|${y}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push([x, y]);
      }
    }
  }

  for (let i = 0; i < parsed.iterations.length; i += 1) {
    const iter = parsed.iterations[i];
    for (let j = 0; j < iter.gb.subcycles.length; j += 1) {
      pushCycle(iter.gb.subcycles[j].vertices);
    }
    for (let j = 0; j < iter.gb.resulting.length; j += 1) {
      pushCycle(iter.gb.resulting[j].vertices);
    }
  }
  if (parsed.solutionVertices.length > 1) {
    pushCycle(parsed.solutionVertices);
  }

  const nodes = Array.from(nodeSet).sort().map((id) => ({ id }));
  return normalizeGraph(
    {
      name,
      nodes,
      edges,
    },
    name,
  );
}

function computeLayout(stem, graph) {
  const layoutType = graph.isPlanar && graph.layouts && graph.layouts.planar ? "planar" : "force";
  state.activeLayoutType = layoutType;
  const cacheKey = `${stem}::${layoutType}`;

  if (state.layoutByStem.has(cacheKey)) {
    return state.layoutByStem.get(cacheKey);
  }

  if (layoutType === "planar") {
    state.layoutByStem.set(cacheKey, graph.layouts.planar);
    return graph.layouts.planar;
  }

  if (graph.layouts && graph.layouts.spring) {
    state.layoutByStem.set(cacheKey, graph.layouts.spring);
    return graph.layouts.spring;
  }

  const n = graph.nodeIds.length;
  const xs = new Array(n);
  const ys = new Array(n);
  const vx = new Array(n);
  const vy = new Array(n);
  const centerX = 0.5;
  const centerY = 0.5;

  for (let i = 0; i < n; i += 1) {
    const id = graph.nodeIds[i];
    const angle = (2 * Math.PI * i) / Math.max(1, n);
    const jitter = ((hashString(id) % 1000) / 1000 - 0.5) * 0.04;
    xs[i] = centerX + (0.39 + jitter) * Math.cos(angle);
    ys[i] = centerY + (0.39 + jitter) * Math.sin(angle);
    vx[i] = 0;
    vy[i] = 0;
  }

  const iterations = Math.min(200, 70 + Math.floor(Math.sqrt(n) * 14));
  const repulsion = 0.00045 + Math.min(0.0008, 0.0000025 * n);
  const spring = 0.05;
  const damping = 0.82;
  const centering = 0.015;
  const target = Math.max(0.03, 0.30 / Math.sqrt(Math.max(1, n)));
  const fx = new Array(n);
  const fy = new Array(n);

  for (let t = 0; t < iterations; t += 1) {
    for (let i = 0; i < n; i += 1) {
      fx[i] = 0;
      fy[i] = 0;
    }

    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        let dx = xs[j] - xs[i];
        let dy = ys[j] - ys[i];
        let d2 = dx * dx + dy * dy + 0.00002;
        let force = repulsion / d2;
        let invLen = 1 / Math.sqrt(d2);
        dx *= invLen;
        dy *= invLen;
        fx[i] -= dx * force;
        fy[i] -= dy * force;
        fx[j] += dx * force;
        fy[j] += dy * force;
      }
    }

    for (let e = 0; e < graph.edgePairs.length; e += 1) {
      const u = graph.edgePairs[e][0];
      const v = graph.edgePairs[e][1];
      let dx = xs[v] - xs[u];
      let dy = ys[v] - ys[u];
      let d2 = dx * dx + dy * dy + 0.00002;
      let dist = Math.sqrt(d2);
      let force = (dist - target) * spring;
      if (dist > 0) {
        dx /= dist;
        dy /= dist;
      }
      fx[u] += dx * force;
      fy[u] += dy * force;
      fx[v] -= dx * force;
      fy[v] -= dy * force;
    }

    for (let i = 0; i < n; i += 1) {
      fx[i] += (centerX - xs[i]) * centering;
      fy[i] += (centerY - ys[i]) * centering;
      vx[i] = (vx[i] + fx[i]) * damping;
      vy[i] = (vy[i] + fy[i]) * damping;
      xs[i] += vx[i];
      ys[i] += vy[i];
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i += 1) {
    minX = Math.min(minX, xs[i]);
    maxX = Math.max(maxX, xs[i]);
    minY = Math.min(minY, ys[i]);
    maxY = Math.max(maxY, ys[i]);
  }
  const spanX = Math.max(0.001, maxX - minX);
  const spanY = Math.max(0.001, maxY - minY);

  const posById = {};
  for (let i = 0; i < n; i += 1) {
    const x = 0.06 + ((xs[i] - minX) / spanX) * 0.88;
    const y = 0.06 + ((ys[i] - minY) / spanY) * 0.88;
    posById[graph.nodeIds[i]] = { x, y };
  }

  state.layoutByStem.set(cacheKey, posById);
  return posById;
}

function getCyclesForIteration(iter, mode) {
  const preferred = mode === "resulting" ? iter.gb.resulting : iter.gb.subcycles;
  const fallback = mode === "resulting" ? iter.gb.subcycles : iter.gb.resulting;
  const source = preferred.length ? preferred : fallback;
  return source.map((cycle) => ({
    id: cycle.id,
    vertices: cycle.vertices.slice(),
    synthetic: false,
    inferredFromMerge: false,
    graphConsistent: true,
  }));
}

function mergeCycleVertices(leftVertices, rightVertices) {
  const seen = new Set();
  const merged = [];
  const all = [leftVertices || [], rightVertices || []];
  for (let i = 0; i < all.length; i += 1) {
    const arr = all[i];
    for (let j = 0; j < arr.length; j += 1) {
      const v = String(arr[j]);
      if (seen.has(v)) {
        continue;
      }
      seen.add(v);
      merged.push(v);
    }
  }
  return merged;
}

function pathExcludingDirectedEdge(cycle, fromIdx, toIdx) {
  const n = cycle.length;
  if (n === 0) {
    return [];
  }
  const out = [cycle[fromIdx]];
  let idx = fromIdx;
  let guard = 0;
  while (guard < n + 2) {
    idx = (idx - 1 + n) % n;
    out.push(cycle[idx]);
    if (idx === toIdx) {
      break;
    }
    guard += 1;
  }
  return out;
}

function canUseCrossEdges(edgeKeys, a, b, c, d, pattern) {
  if (!edgeKeys) {
    return false;
  }
  if (pattern === 1) {
    return edgeKeys.has(edgeKey(a, c)) && edgeKeys.has(edgeKey(b, d));
  }
  return edgeKeys.has(edgeKey(a, d)) && edgeKeys.has(edgeKey(b, c));
}

function inferMergedCycleOrder(leftCycle, rightCycle, graph) {
  if (!leftCycle || !rightCycle || !Array.isArray(leftCycle.vertices) || !Array.isArray(rightCycle.vertices)) {
    return null;
  }
  const L = leftCycle.vertices.map((v) => String(v));
  const R = rightCycle.vertices.map((v) => String(v));
  if (L.length < 3 || R.length < 3 || !graph || !graph.edgeKeySet) {
    return null;
  }
  const edgeKeys = graph.edgeKeySet;

  for (let i = 0; i < L.length; i += 1) {
    const j = (i + 1) % L.length;
    const a = L[i];
    const b = L[j];
    for (let k = 0; k < R.length; k += 1) {
      const t = (k + 1) % R.length;
      const c = R[k];
      const d = R[t];

      if (canUseCrossEdges(edgeKeys, a, b, c, d, 1)) {
        const leftPath = pathExcludingDirectedEdge(L, i, j);
        const rightPath = pathExcludingDirectedEdge(R, t, k);
        const merged = leftPath.concat(rightPath);
        if (merged.length === L.length + R.length) {
          return {
            order: merged,
            usedEdges: [
              [a, c],
              [b, d],
            ],
            cutEdges: [
              [a, b],
              [c, d],
            ],
            pattern: 1,
          };
        }
      }

      if (canUseCrossEdges(edgeKeys, a, b, c, d, 2)) {
        const leftPath = pathExcludingDirectedEdge(L, i, j);
        const rightPath = pathExcludingDirectedEdge(R, k, t);
        const merged = leftPath.concat(rightPath);
        if (merged.length === L.length + R.length) {
          return {
            order: merged,
            usedEdges: [
              [a, d],
              [b, c],
            ],
            cutEdges: [
              [a, b],
              [c, d],
            ],
            pattern: 2,
          };
        }
      }
    }
  }
  return null;
}

function compareCycleId(a, b) {
  const ma = String(a || "").match(/^C(\d+)$/);
  const mb = String(b || "").match(/^C(\d+)$/);
  if (ma && mb) {
    return Number(ma[1]) - Number(mb[1]);
  }
  return String(a || "").localeCompare(String(b || ""));
}

function snapshotCycleMap(cycleMap) {
  const cycles = Array.from(cycleMap.values()).map((c) => ({
    id: c.id,
    vertices: c.vertices.slice(),
    synthetic: Boolean(c.synthetic),
    inferredFromMerge: Boolean(c.inferredFromMerge),
    graphConsistent: c.graphConsistent !== false,
  }));
  cycles.sort((a, b) => compareCycleId(a.id, b.id));
  return cycles;
}

function buildReplayFrames(parsed, mode, graph) {
  const frames = [];
  for (let i = 0; i < parsed.iterations.length; i += 1) {
    const iter = parsed.iterations[i];
    if (mode !== "merge") {
      frames.push({
        kind: "iteration",
        stage: "subcycles",
        label: `iter ${iter.index}`,
        iterIndex: iter.index,
        cycles: getCyclesForIteration(iter, "subcycles"),
      });
      continue;
    }

    const hasGbTrace = iter.gb && iter.gb.subcycles && iter.gb.subcycles.length > 0;
    if (!hasGbTrace) {
      frames.push({
        kind: "iteration",
        stage: "subcycles",
        label: `iter ${iter.index}`,
        iterIndex: iter.index,
        cycles: getCyclesForIteration(iter, "subcycles"),
      });
      continue;
    }

    const cycleMap = new Map();
    for (let j = 0; j < iter.gb.subcycles.length; j += 1) {
      const c = iter.gb.subcycles[j];
      cycleMap.set(c.id, {
        id: c.id,
        vertices: c.vertices.slice(),
        synthetic: false,
        inferredFromMerge: false,
        graphConsistent: true,
      });
    }

    frames.push({
      kind: "iteration",
      stage: "subcycles",
      label: `iter ${iter.index} subcycles`,
      iterIndex: iter.index,
      cycles: snapshotCycleMap(cycleMap),
    });

    for (let j = 0; j < iter.gb.merges.length; j += 1) {
      const op = iter.gb.merges[j];
      const left = cycleMap.get(op.left);
      const right = cycleMap.get(op.right);
      const inferred = inferMergedCycleOrder(left, right, graph);
      const inferredOrder = inferred && Array.isArray(inferred.order) ? inferred.order : null;
      const mergedVertices =
        inferredOrder ||
        mergeCycleVertices(left ? left.vertices : [], right ? right.vertices : []);
      cycleMap.delete(op.left);
      cycleMap.delete(op.right);
      cycleMap.set(op.merged, {
        id: op.merged,
        vertices: mergedVertices,
        synthetic: true,
        inferredFromMerge: true,
        graphConsistent: Boolean(inferredOrder),
      });
      frames.push({
        kind: "merge",
        stage: "merge",
        label: `iter ${iter.index} merge ${j + 1}`,
        iterIndex: iter.index,
        mergeIndex: j,
        merge: {
          left: op.left,
          right: op.right,
          merged: op.merged,
          usedEdges: inferred && Array.isArray(inferred.usedEdges) ? inferred.usedEdges.slice() : [],
          cutEdges: inferred && Array.isArray(inferred.cutEdges) ? inferred.cutEdges.slice() : [],
          inferred: Boolean(inferredOrder),
        },
        cycles: snapshotCycleMap(cycleMap),
      });
    }

  }
  if (parsed.result === "SAT" && parsed.solutionVertices.length > 1) {
    frames.push({
      kind: "solution",
      stage: "solution",
      label: "solution",
      iterIndex: null,
      cycles: [{ id: "HC", vertices: parsed.solutionVertices.slice(), synthetic: false }],
    });
  }
  return frames;
}

function fitCanvasToDisplaySize(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(120, Math.floor(rect.width));
  const height = Math.max(120, Math.floor(rect.height));
  const needResize =
    canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr);
  if (needResize) {
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function getCurrentFrame() {
  if (!state.replayFrames.length) {
    return null;
  }
  let idx = Number(els.stepSlider.value);
  if (Number.isNaN(idx)) {
    idx = 0;
  }
  idx = Math.max(0, Math.min(state.replayFrames.length - 1, idx));
  return state.replayFrames[idx];
}

function renderLegend(frame, cycleInfos) {
  const graph = state.activeGraph;
  const stem = state.activeStem;

  if (!frame || !graph) {
    els.graphLegend.innerHTML = '<span class="muted">No graph data.</span>';
    return;
  }

  const sourceLinks = stem
    ? `<span class="muted">source: <a href="./graph-src/gb/${encodeURIComponent(
        stem,
      )}.gb" target="_blank" rel="noreferrer">gb</a> / <a href="./graph-src/col/${encodeURIComponent(
        stem,
      )}.col" target="_blank" rel="noreferrer">col</a> (${escapeHtml(
        state.activeGraphSource || "unknown",
      )})</span>`
    : `<span class="muted">source: ${escapeHtml(state.activeGraphSource || "unknown")}</span>`;

  const summary = `
    <span class="legend-item">
      |V|=${formatInt(graph.nodes.length)}, |E|=${formatInt(graph.edges.length)}
    </span>
    <span class="legend-item">frame: ${escapeHtml(frame.label)}</span>
    <span class="legend-item">view: ${escapeHtml(state.layoutMode)}</span>
    <span class="legend-item">layout: ${escapeHtml(state.activeLayoutType)}</span>
    <span class="legend-item">planar: ${graph.isPlanar ? "yes" : "no"}</span>
    ${sourceLinks}
  `;

  const mergeInfo =
    frame && frame.merge
      ? `<span class="legend-item">merge: ${escapeHtml(
          `${frame.merge.left} + ${frame.merge.right} -> ${frame.merge.merged}`,
        )}</span>${
          frame.merge.usedEdges && frame.merge.usedEdges.length
            ? `<span class="legend-item">used edges: ${escapeHtml(
                edgeListLabel(frame.merge.usedEdges),
              )}</span>`
            : ""
        }${
          frame.merge.cutEdges && frame.merge.cutEdges.length
            ? `<span class="legend-item">removed edges: ${escapeHtml(
                edgeListLabel(frame.merge.cutEdges),
              )}</span>`
            : ""
        }`
      : "";

  const cycles = cycleInfos
    .map((item) => {
      const selected =
        state.selectedCycle &&
        state.selectedCycle.cycleId === item.id &&
        state.selectedCycle.iterIndex === frame.iterIndex;
      const suffix = item.synthetic ? (item.graphConsistent ? "~" : "~*") : "";
      return `
        <button class="legend-item ${selected ? "active" : ""}" data-legend-cycle="${escapeHtml(
          item.id,
        )}" data-legend-iter="${frame.iterIndex === null ? "" : frame.iterIndex}">
          <span class="legend-dot" style="background:${item.color}"></span>
          ${escapeHtml(item.id)}${suffix} (${formatInt(item.size)})
        </button>
      `;
    })
    .join("");

  els.graphLegend.innerHTML = summary + mergeInfo + cycles;
}

function renderGraphReplay() {
  const { ctx, width, height } = fitCanvasToDisplaySize(els.graphCanvas);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f9f2df";
  ctx.fillRect(0, 0, width, height);

  const graph = state.activeGraph;
  const frame = getCurrentFrame();
  if (!graph || !frame) {
    renderLegend(frame, []);
    return;
  }
  const cycleInfos = frame.cycles.map((cycle, i) => ({
    id: cycle.id,
    size: cycle.vertices.length,
    color: colorAt(i),
    vertices: cycle.vertices,
    synthetic: Boolean(cycle.synthetic),
    graphConsistent: cycle.graphConsistent !== false,
  }));

  const mode = state.layoutMode === "decomposed" ? "decomposed" : "graph";
  if (mode === "decomposed") {
    drawDecomposedModeFrame(ctx, width, height, frame, cycleInfos);
  } else {
    drawGraphModeFrame(ctx, width, height, graph, frame, cycleInfos);
  }
  drawActionOverlay(ctx, width, frame);
  renderLegend(frame, cycleInfos);
}

function drawGraphModeFrame(ctx, width, height, graph, frame, cycleInfos) {
  const topInset = 96;
  const margin = 20;
  const stemKey = state.activeStem || "__fallback__";
  const posById = computeLayout(stemKey, graph);
  function toPx(pos) {
    return {
      x: margin + pos.x * (width - margin * 2),
      y: topInset + pos.y * (height - topInset - margin),
    };
  }

  ctx.strokeStyle = "rgba(101, 123, 131, 0.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i < graph.edges.length; i += 1) {
    const e = graph.edges[i];
    const p1 = posById[e[0]];
    const p2 = posById[e[1]];
    if (!p1 || !p2) {
      continue;
    }
    const a = toPx(p1);
    const b = toPx(p2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  const nodeColor = new Map();
  const selectedNodes = new Set();
  const mergeFocusId = frame && frame.merge ? frame.merge.merged : null;
  for (let i = 0; i < cycleInfos.length; i += 1) {
    const cycle = cycleInfos[i];
    const isSelected =
      state.selectedCycle &&
      state.selectedCycle.cycleId === cycle.id &&
      state.selectedCycle.iterIndex === frame.iterIndex;
    const isMergeTarget = mergeFocusId && cycle.id === mergeFocusId;
    if (isSelected || isMergeTarget) {
      for (let k = 0; k < cycle.vertices.length; k += 1) {
        selectedNodes.add(String(cycle.vertices[k]));
      }
    }

    for (let k = 0; k < cycle.vertices.length; k += 1) {
      const v = String(cycle.vertices[k]);
      if (!nodeColor.has(v)) {
        nodeColor.set(v, cycle.color);
      }
    }

    const cycleEdges = cycleToEdgePairs(cycle.vertices);
    ctx.save();
    if (cycle.synthetic && cycle.graphConsistent === false) {
      ctx.setLineDash([7, 5]);
      ctx.globalAlpha = 0.75;
    } else {
      ctx.setLineDash([]);
      ctx.globalAlpha = 1.0;
    }
    ctx.strokeStyle = cycle.color;
    ctx.lineWidth = isSelected || isMergeTarget ? 4.2 : cycle.synthetic ? 2.9 : 2.4;
    for (let k = 0; k < cycleEdges.length; k += 1) {
      const aId = String(cycleEdges[k][0]);
      const bId = String(cycleEdges[k][1]);
      const p1 = posById[aId];
      const p2 = posById[bId];
      if (!p1 || !p2) {
        continue;
      }
      const a = toPx(p1);
      const b = toPx(p2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (frame && frame.kind === "merge" && frame.merge) {
    const cut = Array.isArray(frame.merge.cutEdges) ? frame.merge.cutEdges : [];
    if (cut.length > 0) {
      ctx.save();
      ctx.setLineDash([5, 8]);
      ctx.strokeStyle = "#d17b79";
      ctx.lineWidth = 2.6;
      ctx.globalAlpha = 0.58;
      for (let i = 0; i < cut.length; i += 1) {
        const e = cut[i];
        const aId = String(e[0]);
        const bId = String(e[1]);
        const p1 = posById[aId];
        const p2 = posById[bId];
        if (!p1 || !p2) {
          continue;
        }
        const a = toPx(p1);
        const b = toPx(p2);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    const used = Array.isArray(frame.merge.usedEdges) ? frame.merge.usedEdges : [];
    if (used.length > 0) {
      ctx.save();
      ctx.setLineDash([11, 6]);
      ctx.strokeStyle = "#cb4b16";
      ctx.lineWidth = 4.2;
      ctx.globalAlpha = 0.82;
      for (let i = 0; i < used.length; i += 1) {
        const e = used[i];
        const aId = String(e[0]);
        const bId = String(e[1]);
        const p1 = posById[aId];
        const p2 = posById[bId];
        if (!p1 || !p2) {
          continue;
        }
        const a = toPx(p1);
        const b = toPx(p2);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  const showAllLabels = graph.nodes.length <= 34;
  const showHighlightedLabels = graph.nodes.length <= 120;
  const vertexLabelScale = state.graphFocusMode ? 2 : 1;
  for (let i = 0; i < graph.nodes.length; i += 1) {
    const node = graph.nodes[i];
    const pos = posById[node.id];
    if (!pos) {
      continue;
    }
    const p = toPx(pos);
    const highlight = nodeColor.get(node.id);
    const isSelectedNode = selectedNodes.has(node.id);
    const r = graph.nodes.length <= 90 ? 3.4 : 2.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, isSelectedNode ? r + 1.8 : r, 0, Math.PI * 2);
    ctx.fillStyle = highlight || "rgba(101, 123, 131, 0.65)";
    ctx.fill();
    if (highlight) {
      ctx.strokeStyle = "rgba(253, 246, 227, 0.95)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (showAllLabels || (showHighlightedLabels && highlight)) {
      ctx.fillStyle = "#586e75";
      ctx.font = `${11 * vertexLabelScale}px 'Courier New', monospace`;
      ctx.fillText(node.id, p.x + 4 * vertexLabelScale, p.y - 4 * vertexLabelScale);
    }
  }
}

function drawDecomposedModeFrame(ctx, width, height, frame, cycleInfos) {
  const topInset = 96;
  const areaX = 18;
  const areaY = topInset;
  const areaW = width - 36;
  const areaH = height - topInset - 18;
  if (areaW < 20 || areaH < 20) {
    return;
  }
  const n = Math.max(1, cycleInfos.length);
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cellW = areaW / cols;
  const cellH = areaH / rows;
  const mergeFocusId = frame && frame.merge ? frame.merge.merged : null;
  const vertexLabelScale = state.graphFocusMode ? 2 : 1;
  const sizeValues = cycleInfos.map((c) => Math.max(1, Number(c.size) || 1));
  const minSize = sizeValues.length ? Math.min(...sizeValues) : 1;
  const maxSize = sizeValues.length ? Math.max(...sizeValues) : 1;
  const minSqrt = Math.sqrt(minSize);
  const maxSqrt = Math.sqrt(maxSize);

  ctx.save();
  ctx.strokeStyle = "rgba(101, 123, 131, 0.14)";
  ctx.setLineDash([4, 4]);
  for (let i = 1; i < cols; i += 1) {
    const x = areaX + i * cellW;
    ctx.beginPath();
    ctx.moveTo(x, areaY);
    ctx.lineTo(x, areaY + areaH);
    ctx.stroke();
  }
  for (let j = 1; j < rows; j += 1) {
    const y = areaY + j * cellH;
    ctx.beginPath();
    ctx.moveTo(areaX, y);
    ctx.lineTo(areaX + areaW, y);
    ctx.stroke();
  }
  ctx.restore();

  for (let i = 0; i < cycleInfos.length; i += 1) {
    const cycle = cycleInfos[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = areaX + col * cellW;
    const top = areaY + row * cellH;
    const cx = left + cellW * 0.5;
    const cy = top + cellH * 0.56;
    const m = Math.min(cellW, cellH);
    const rMin = Math.max(10, m * 0.12);
    const rMax = Math.max(rMin + 2, m * 0.39);
    const s = Math.sqrt(Math.max(1, Number(cycle.size) || 1));
    const t = maxSqrt > minSqrt ? (s - minSqrt) / (maxSqrt - minSqrt) : 0.5;
    const radius = rMin + t * (rMax - rMin);
    const isSelected =
      state.selectedCycle &&
      state.selectedCycle.cycleId === cycle.id &&
      state.selectedCycle.iterIndex === frame.iterIndex;
    const isMergeTarget = mergeFocusId && cycle.id === mergeFocusId;

    const pts = [];
    const vertices = cycle.vertices || [];
    for (let k = 0; k < vertices.length; k += 1) {
      const a = (-Math.PI / 2) + (2 * Math.PI * k) / Math.max(1, vertices.length);
      pts.push({
        id: String(vertices[k]),
        x: cx + radius * Math.cos(a),
        y: cy + radius * Math.sin(a),
      });
    }

    ctx.save();
    if (cycle.synthetic && cycle.graphConsistent === false) {
      ctx.setLineDash([7, 5]);
      ctx.globalAlpha = 0.75;
    } else {
      ctx.setLineDash([]);
      ctx.globalAlpha = 1.0;
    }
    ctx.strokeStyle = cycle.color;
    ctx.lineWidth = isSelected || isMergeTarget ? 4.2 : cycle.synthetic ? 2.9 : 2.4;
    for (let k = 0; k < pts.length; k += 1) {
      const p = pts[k];
      const q = pts[(k + 1) % pts.length];
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    ctx.restore();

    for (let k = 0; k < pts.length; k += 1) {
      const p = pts[k];
      ctx.beginPath();
      ctx.arc(p.x, p.y, isSelected || isMergeTarget ? 4.0 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = cycle.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(253, 246, 227, 0.95)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const suffix = cycle.synthetic ? (cycle.graphConsistent ? "~" : "~*") : "";
    ctx.fillStyle = "#586e75";
    ctx.font = "bold 12px 'Courier New', monospace";
    ctx.fillText(`${cycle.id}${suffix} (${cycle.size})`, left + 8, top + 16);

    if (vertices.length <= 14) {
      ctx.fillStyle = "#657b83";
      ctx.font = `${10 * vertexLabelScale}px 'Courier New', monospace`;
      for (let k = 0; k < pts.length; k += 1) {
        ctx.fillText(pts[k].id, pts[k].x + 3 * vertexLabelScale, pts[k].y - 3 * vertexLabelScale);
      }
    }
  }
}

function drawActionOverlay(ctx, width, frame) {
  if (!frame) {
    return;
  }
  let title = "";
  let sub = "";
  if (frame.kind === "merge" && frame.merge) {
    title = `Merge`;
    const usedText =
      frame.merge.usedEdges && frame.merge.usedEdges.length
        ? ` | use ${edgeListLabel(frame.merge.usedEdges)}`
        : "";
    const cutText =
      frame.merge.cutEdges && frame.merge.cutEdges.length
        ? ` | cut ${edgeListLabel(frame.merge.cutEdges)}`
        : "";
    sub = `iter ${frame.iterIndex}: ${frame.merge.left} + ${frame.merge.right} -> ${frame.merge.merged}${usedText}${cutText}`;
  } else if (frame.kind === "iteration" && frame.stage === "subcycles") {
    title = `Iteration ${frame.iterIndex}`;
    sub = "subcycles";
  } else if (frame.kind === "solution") {
    title = "Hamiltonian Cycle";
    sub = "final SAT solution";
  } else if (frame.iterIndex !== null && frame.iterIndex !== undefined) {
    title = `Iteration ${frame.iterIndex}`;
    sub = "";
  } else {
    title = frame.label;
    sub = "";
  }

  const x = 18;
  const y = 18;
  const h = sub ? 62 : 44;
  const w = Math.max(200, Math.min((width - 36) * 0.5, 320));
  const r = 10;
  ctx.save();
  ctx.fillStyle = "rgba(253, 246, 227, 0.92)";
  ctx.strokeStyle = "rgba(101, 123, 131, 0.32)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#586e75";
  ctx.font = "bold 22px 'Avenir Next', 'Trebuchet MS', sans-serif";
  ctx.fillText(title, x + 12, y + 28);
  if (sub) {
    ctx.font = "13px 'Courier New', monospace";
    ctx.fillStyle = "#657b83";
    ctx.fillText(sub, x + 12, y + 48);
  }

  const hintGap = 12;
  const rightAvail = width - (x + w + hintGap) - 18;
  const placeRight = rightAvail >= 340;
  let hintW = placeRight ? Math.min(640, rightAvail) : Math.min(640, width - 36);
  hintW = Math.max(300, hintW);
  let hintX = placeRight ? x + w + hintGap : x;
  let hintY = placeRight ? y : y + h + 8;
  const hintH = 82;
  ctx.fillStyle = "rgba(253, 246, 227, 0.82)";
  ctx.strokeStyle = "rgba(101, 123, 131, 0.22)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hintX + r, hintY);
  ctx.lineTo(hintX + hintW - r, hintY);
  ctx.quadraticCurveTo(hintX + hintW, hintY, hintX + hintW, hintY + r);
  ctx.lineTo(hintX + hintW, hintY + hintH - r);
  ctx.quadraticCurveTo(hintX + hintW, hintY + hintH, hintX + hintW - r, hintY + hintH);
  ctx.lineTo(hintX + r, hintY + hintH);
  ctx.quadraticCurveTo(hintX, hintY + hintH, hintX, hintY + hintH - r);
  ctx.lineTo(hintX, hintY + r);
  ctx.quadraticCurveTo(hintX, hintY, hintX + r, hintY);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#586e75";
  ctx.font = "bold 16px 'Avenir Next', 'Trebuchet MS', sans-serif";
  ctx.fillText("Keyboard", hintX + 10, hintY + 18);
  ctx.fillStyle = "#657b83";
  ctx.font = "14px 'Courier New', monospace";
  ctx.fillText("← Prev   → Next   ↑/↓ Problems", hintX + 10, hintY + 46);
  ctx.fillText("Home reset   Space Replay/Pause   Esc toggle focus", hintX + 10, hintY + 66);
  ctx.restore();
}

function buildFrameActionText(frame) {
  if (!frame) {
    return "Frame: -";
  }
  if (frame.kind === "merge" && frame.merge) {
    const usedText =
      frame.merge.usedEdges && frame.merge.usedEdges.length
        ? ` [use ${edgeListLabel(frame.merge.usedEdges)}]`
        : "";
    const cutText =
      frame.merge.cutEdges && frame.merge.cutEdges.length
        ? ` [cut ${edgeListLabel(frame.merge.cutEdges)}]`
        : "";
    return `Frame: Merge (iter ${frame.iterIndex}) ${frame.merge.left} + ${frame.merge.right} -> ${frame.merge.merged}${usedText}${cutText}`;
  }
  if (frame.kind === "iteration" && frame.iterIndex !== null && frame.iterIndex !== undefined) {
    return `Frame: Iteration ${frame.iterIndex}`;
  }
  if (frame.kind === "solution") {
    return "Frame: Hamiltonian Cycle";
  }
  return `Frame: ${frame.label || "-"}`;
}

function syncLogsWithFrame(scrollIntoView) {
  const frame = getCurrentFrame();
  if (els.logsCurrentAction) {
    els.logsCurrentAction.textContent = buildFrameActionText(frame);
  }

  const cards = els.iterations.querySelectorAll(".iter-card");
  for (let i = 0; i < cards.length; i += 1) {
    cards[i].classList.remove("iter-card-active");
  }
  const mergeLines = els.iterations.querySelectorAll(".merge-line");
  for (let i = 0; i < mergeLines.length; i += 1) {
    mergeLines[i].classList.remove("merge-line-active");
  }

  if (!frame || frame.iterIndex === null || frame.iterIndex === undefined) {
    return;
  }

  const card = els.iterations.querySelector(`.iter-card[data-iter-index="${frame.iterIndex}"]`);
  if (!card) {
    return;
  }
  card.classList.add("iter-card-active");

  if (frame.kind === "merge" && frame.mergeIndex !== undefined && frame.mergeIndex !== null) {
    const line = card.querySelector(`.merge-line[data-merge-index="${frame.mergeIndex}"]`);
    if (line) {
      line.classList.add("merge-line-active");
      if (scrollIntoView) {
        const container = els.iterations;
        const top = line.offsetTop - 14;
        const bottom = top + line.offsetHeight + 18;
        const viewTop = container.scrollTop;
        const viewBottom = viewTop + container.clientHeight;
        if (top < viewTop || bottom > viewBottom) {
          container.scrollTo({
            top: Math.max(0, top - 8),
            behavior: state.isPlaying ? "auto" : "smooth",
          });
        }
      }
    }
  }

  if (scrollIntoView) {
    const container = els.iterations;
    const top = card.offsetTop - 12;
    const bottom = top + card.offsetHeight + 24;
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    if (top < viewTop || bottom > viewBottom) {
      container.scrollTo({
        top: Math.max(0, top - 10),
        behavior: state.isPlaying ? "auto" : "smooth",
      });
    }
  }
}

function updateStepLabel(frame, scrollLogs) {
  if (!frame) {
    els.stepLabel.textContent = "-";
    syncLogsWithFrame(Boolean(scrollLogs));
    return;
  }
  const idx = Number(els.stepSlider.value) + 1;
  els.stepLabel.textContent = `${frame.label} (${idx}/${state.replayFrames.length})`;
  syncLogsWithFrame(Boolean(scrollLogs));
}

function refreshReplayFrames(keepCurrent) {
  stopPlayback();
  if (!state.activeParsed) {
    state.replayFrames = [];
    els.stepSlider.min = "0";
    els.stepSlider.max = "0";
    els.stepSlider.value = "0";
    updateStepLabel(null, false);
    renderGraphReplay();
    return;
  }
  const previous = keepCurrent ? Number(els.stepSlider.value) : 0;
  const mode = state.cycleViewMode === "subcycles" ? "subcycles" : "merge";
  state.replayFrames = buildReplayFrames(state.activeParsed, mode, state.activeGraph);
  if (!state.replayFrames.length) {
    els.stepSlider.min = "0";
    els.stepSlider.max = "0";
    els.stepSlider.value = "0";
    updateStepLabel(null, false);
    renderGraphReplay();
    return;
  }
  els.stepSlider.min = "0";
  els.stepSlider.max = String(state.replayFrames.length - 1);
  const next = Math.max(0, Math.min(state.replayFrames.length - 1, previous));
  els.stepSlider.value = String(next);
  updateStepLabel(state.replayFrames[next], false);
  renderGraphReplay();
}

function stepIndexForIteration(iterIndex) {
  for (let i = 0; i < state.replayFrames.length; i += 1) {
    const frame = state.replayFrames[i];
    if (frame.iterIndex === iterIndex) {
      return i;
    }
  }
  return -1;
}

async function loadAndParseFile(file) {
  if (state.parsedByFile.has(file)) {
    return state.parsedByFile.get(file);
  }
  const res = await fetch(`./logs/${encodeURIComponent(file)}`);
  if (!res.ok) {
    throw new Error(`failed to load ${file}`);
  }
  const text = await res.text();
  const parsed = parseLog(text);
  state.parsedByFile.set(file, parsed);
  state.statusByFile.set(file, parsed.result);
  return parsed;
}

async function loadGraphByStem(stem) {
  if (!stem) {
    return null;
  }
  if (state.graphByStem.has(stem)) {
    return state.graphByStem.get(stem);
  }
  if (window.location && window.location.protocol === "file:") {
    state.graphByStem.set(stem, null);
    return null;
  }
  try {
    const res = await fetch(`./graphs/${encodeURIComponent(stem)}.json`);
    if (!res.ok) {
      state.graphByStem.set(stem, null);
      return null;
    }
    const raw = await res.json();
    const graph = normalizeGraph(raw, stem);
    state.graphByStem.set(stem, graph);
    return graph;
  } catch (_err) {
    state.graphByStem.set(stem, null);
    return null;
  }
}

async function attachGraph(parsed, stem) {
  const graphFromJson = await loadGraphByStem(stem);
  if (graphFromJson) {
    state.activeGraph = graphFromJson;
    state.activeGraphSource = "docs/graphs json";
    return;
  }
  state.activeGraph = buildFallbackGraph(parsed, stem || "local");
  state.activeGraphSource = "fallback (cycles only)";
}

async function selectFile(file) {
  const parsed = await loadAndParseFile(file);
  state.activeFile = file;
  state.activeStem = getStem(file);
  state.activeParsed = parsed;
  state.selectedCycle = null;

  await attachGraph(parsed, state.activeStem);
  els.mainTitle.textContent = file;
  renderSummary(parsed);
  renderIterations(parsed);
  renderSolution(parsed);
  setCycleDetailPlaceholder();
  refreshReplayFrames(false);
  renderProblemList();
}

async function warmStatus(files) {
  await Promise.all(
    files.map(async (file) => {
      try {
        await loadAndParseFile(file);
      } catch (_err) {
        state.statusByFile.set(file, "UNKNOWN");
      }
    }),
  );
  renderProblemList();
}

async function warmProblemMeta(files) {
  await Promise.all(
    files.map(async (file) => {
      const stem = getStem(file);
      try {
        const graph = await loadGraphByStem(stem);
        if (graph) {
          state.problemMetaByFile.set(file, {
            v: graph.nodes.length,
            e: graph.edges.length,
          });
        }
      } catch (_err) {
        // no-op
      }
    }),
  );
}

async function loadManifest() {
  try {
    const res = await fetch("./logs/manifest.json");
    if (!res.ok) {
      throw new Error("manifest not found");
    }
    const data = await res.json();
    state.files = Array.isArray(data.files) ? data.files.slice() : [];
    await warmProblemMeta(state.files);
    sortFilesByVertexThenName();
    renderProblemList();

    if (state.files.length > 0) {
      const initialFile = pickDefaultProblemFile(state.files);
      await selectFile(initialFile || state.files[0]);
      warmStatus(state.files);
    } else {
      els.problemList.innerHTML = '<p class="empty-note">No log files found in manifest.</p>';
    }
  } catch (err) {
    const isFileProtocol = window.location && window.location.protocol === "file:";
    els.mainTitle.textContent = isFileProtocol
      ? "Local file mode (manifest unavailable)"
      : "Failed to load manifest.json";
    els.summary.innerHTML = "";
    if (isFileProtocol) {
      els.iterations.innerHTML =
        '<p class="empty-note">file:// 直開きではログ一覧の自動読み込みは無効です。python3 -m http.server -d docs 8000 で配信し、http://localhost:8000 を開いてください。</p>';
    } else {
      els.iterations.innerHTML = `<p class="empty-note">${escapeHtml(err.message)}</p>`;
    }
    refreshReplayFrames(false);
  }
}

function attachListeners() {
  els.searchInput.addEventListener("input", () => {
    renderProblemList();
  });

  els.problemList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest("button.problem-item");
    if (!button) {
      return;
    }
    const file = button.getAttribute("data-file");
    if (!file) {
      return;
    }
    try {
      await selectFile(file);
    } catch (err) {
      els.mainTitle.textContent = file;
      els.summary.innerHTML = "";
      els.iterations.innerHTML = `<p class="empty-note">${escapeHtml(
        err && err.message ? err.message : String(err),
      )}</p>`;
      refreshReplayFrames(false);
    }
  });

  els.iterations.addEventListener("click", (event) => {
    stopPlayback();
    const target = event.target;
    if (!(target instanceof Element) || !state.activeParsed) {
      return;
    }
    const button = target.closest("button.chip");
    if (!button) {
      return;
    }
    const iter = Number(button.getAttribute("data-iter"));
    const cycleId = button.getAttribute("data-cycle-id");
    if (Number.isNaN(iter) || !cycleId) {
      return;
    }
    renderCycleDetail(iter, cycleId);
    const step = stepIndexForIteration(iter);
    if (step >= 0) {
      els.stepSlider.value = String(step);
      updateStepLabel(state.replayFrames[step], true);
    }
    renderGraphReplay();
  });

  els.cycleViewGroup.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest("button[data-cycle-view]");
    if (!button) {
      return;
    }
    const mode = button.dataset.cycleView === "subcycles" ? "subcycles" : "merge";
    if (mode === state.cycleViewMode) {
      return;
    }
    state.cycleViewMode = mode;
    applyControlButtonState();
    state.selectedCycle = null;
    setCycleDetailPlaceholder();
    refreshReplayFrames(true);
  });

  els.stepSlider.addEventListener("input", () => {
    stopPlayback();
    const frame = getCurrentFrame();
    updateStepLabel(frame, true);
    renderGraphReplay();
  });

  els.stepReset.addEventListener("click", () => {
    stopPlayback();
    jumpToIterationStart(0, true);
  });

  els.stepPrev.addEventListener("click", () => {
    stopPlayback();
    advanceStep(-1, true);
  });

  els.stepNext.addEventListener("click", () => {
    stopPlayback();
    advanceStep(1, true);
  });

  els.playToggle.addEventListener("click", () => {
    togglePlayback();
  });

  els.playSpeedGroup.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest("button[data-play-speed]");
    if (!button) {
      return;
    }
    const speed = Number(button.dataset.playSpeed);
    if (Number.isNaN(speed) || speed <= 0) {
      return;
    }
    state.playSpeedMs = speed;
    applyControlButtonState();
    if (state.isPlaying) {
      stopPlayback();
      startPlayback();
    }
  });

  els.layoutModeGroup.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest("button[data-layout-mode]");
    if (!button) {
      return;
    }
    const mode = button.dataset.layoutMode === "decomposed" ? "decomposed" : "graph";
    if (mode === state.layoutMode) {
      return;
    }
    state.layoutMode = mode;
    applyControlButtonState();
    stopPlayback();
    renderGraphReplay();
  });

  els.graphLegend.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest("[data-legend-cycle]");
    if (!button) {
      return;
    }
    const cycleId = button.getAttribute("data-legend-cycle");
    const iterText = button.getAttribute("data-legend-iter");
    const frame = getCurrentFrame();
    if (!cycleId || !frame) {
      return;
    }
    const cycle = frame.cycles.find((c) => c.id === cycleId);
    if (!cycle) {
      return;
    }
    const iterIndex = iterText === "" ? null : Number(iterText);
    const title = iterIndex === null ? "Solution" : `Iteration ${iterIndex}`;
    setCycleDetail(title, cycleId, cycle.vertices, iterIndex);
  });

  if (els.graphFocusEnter) {
    els.graphFocusEnter.addEventListener("click", () => {
      toggleGraphFocusMode(true);
    });
  }

  if (els.graphFocusExit) {
    els.graphFocusExit.addEventListener("click", () => {
      toggleGraphFocusMode(false);
    });
  }

  window.addEventListener("resize", () => {
    renderGraphReplay();
  });

  window.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) {
      return;
    }
    if (isEditableTarget(event.target)) {
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      stopPlayback();
      void selectAdjacentProblem(-1);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      stopPlayback();
      void selectAdjacentProblem(1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      toggleGraphFocusMode(!state.graphFocusMode);
      return;
    }
    if (!state.replayFrames.length) {
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      stopPlayback();
      advanceStep(-1, true);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      stopPlayback();
      advanceStep(1, true);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      stopPlayback();
      jumpToIterationStart(0, true);
      return;
    }
    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      togglePlaybackFromKeyboard();
    }
  });
}

function init() {
  attachListeners();
  applyControlButtonState();
  updatePlayButton();
  applyGraphFocusMode();
  setCycleDetailPlaceholder();
  refreshReplayFrames(false);
  loadManifest();
}

init();
