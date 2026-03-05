function createIteration(index) {
  return {
    index,
    satSolvingTimeRaw: null,
    satSolvingTimeUs: null,
    subcyclesFound: null,
    cycleLengthsBefore: [],
    mergeOps: [],
    mergeOpsCount: null,
    resultingCyclesCount: null,
    cycleLengthsAfter: [],
    gb: {
      subcycles: [],
      merges: [],
      resulting: [],
    },
    cutArcsByClauseLength: [],
    addedBlockClausesThis: null,
    addedBlockClausesAccum: null,
    addBlockClausesTimeRaw: null,
    addBlockClausesTimeUs: null,
    incrementTimeRaw: null,
    incrementTimeUs: null,
    terminalStatus: null,
    cyclesById: {},
  };
}

function finalizeIteration(iteration) {
  if (!iteration) {
    return null;
  }
  const cyclesById = {};
  for (const cycle of iteration.gb.subcycles) {
    cyclesById[cycle.id] = cycle;
  }
  for (const cycle of iteration.gb.resulting) {
    cyclesById[cycle.id] = cycle;
  }
  iteration.cyclesById = cyclesById;
  return iteration;
}

function parseDurationToUs(raw) {
  if (!raw) {
    return null;
  }
  const m = raw.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(ns|us|µs|μs|ms|s)$/i);
  if (!m) {
    return null;
  }
  const value = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (Number.isNaN(value)) {
    return null;
  }
  if (unit === "ns") {
    return value / 1000;
  }
  if (unit === "us" || unit === "µs" || unit === "μs") {
    return value;
  }
  if (unit === "ms") {
    return value * 1000;
  }
  if (unit === "s") {
    return value * 1000 * 1000;
  }
  return null;
}

function parseCountMap(raw) {
  const text = (raw || "").trim();
  if (!text.startsWith("{") || !text.endsWith("}")) {
    return [];
  }
  const body = text.slice(1, -1).trim();
  if (!body) {
    return [];
  }
  return body
    .split(",")
    .map((entry) => {
      const [keyRaw, valueRaw] = entry.split(":");
      if (keyRaw === undefined || valueRaw === undefined) {
        return null;
      }
      const keyText = keyRaw.trim();
      const value = Number(valueRaw.trim());
      if (!keyText || Number.isNaN(value)) {
        return null;
      }
      const keyNumber = Number(keyText);
      return {
        key: Number.isNaN(keyNumber) ? keyText : keyNumber,
        keyText,
        value,
      };
    })
    .filter(Boolean);
}

function parseVerticesInBrackets(raw) {
  const text = (raw || "").trim();
  if (!text.length) {
    return [];
  }
  return text
    .split(",")
    .map((vertex) => vertex.trim())
    .filter((vertex) => vertex.length > 0);
}

function parseSolutionTokens(rawLine) {
  return rawLine
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function parseLog(text) {
  const parsed = {
    meta: {
      solveTarget: null,
      fileInputTimeRaw: null,
      fileInputTimeUs: null,
      encodingTimeRaw: null,
      encodingTimeUs: null,
      encodingClauses: null,
    },
    iterations: [],
    solutionRawLines: [],
    solutionVertices: [],
    result: "UNKNOWN",
    overall: {
      cegarIterations: null,
      addedBlockClauses: null,
      solvingTimeRaw: null,
      solvingTimeUs: null,
      overallTimeRaw: null,
      overallTimeUs: null,
    },
    rawText: text,
  };

  const lines = text.split(/\r?\n/);
  let current = null;
  let inSolutionBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (inSolutionBlock) {
      if (line.startsWith("s ")) {
        inSolutionBlock = false;
      } else {
        if (line.length > 0) {
          parsed.solutionRawLines.push(line);
          parsed.solutionVertices.push(...parseSolutionTokens(line));
        }
        continue;
      }
    }

    if (!line) {
      continue;
    }

    let m = null;

    m = line.match(/^solve\s+(.+)$/);
    if (m) {
      parsed.meta.solveTarget = m[1];
      continue;
    }

    m = line.match(/^file input time = (.+)$/);
    if (m) {
      parsed.meta.fileInputTimeRaw = m[1];
      parsed.meta.fileInputTimeUs = parseDurationToUs(m[1]);
      continue;
    }

    m = line.match(/^encoding time = (.+)$/);
    if (m) {
      parsed.meta.encodingTimeRaw = m[1];
      parsed.meta.encodingTimeUs = parseDurationToUs(m[1]);
      continue;
    }

    m = line.match(/^encoding clauses number = (\d+)$/);
    if (m) {
      parsed.meta.encodingClauses = Number(m[1]);
      continue;
    }

    m = line.match(/^cegar iteration = (\d+)$/i);
    if (m) {
      if (current) {
        parsed.iterations.push(finalizeIteration(current));
      }
      current = createIteration(Number(m[1]));
      continue;
    }

    m = line.match(/^sat solving time = (.+)$/);
    if (m && current) {
      current.satSolvingTimeRaw = m[1];
      current.satSolvingTimeUs = parseDurationToUs(m[1]);
      continue;
    }

    m = line.match(/^number of subcycles found = (\d+)$/);
    if (m && current) {
      current.subcyclesFound = Number(m[1]);
      continue;
    }

    m = line.match(/^cycle lengths before merge \(length:number\) = (\{.*\})$/);
    if (m && current) {
      current.cycleLengthsBefore = parseCountMap(m[1]);
      continue;
    }

    m = line.match(/^merge operation: ([^ ]+) \+ ([^ ]+) = ([^ ]+)$/);
    if (m && current) {
      current.mergeOps.push({
        left: m[1],
        right: m[2],
        merged: m[3],
      });
      continue;
    }

    m = line.match(/^number of merge operations = (\d+)$/);
    if (m && current) {
      current.mergeOpsCount = Number(m[1]);
      continue;
    }

    m = line.match(/^number of resulting cycles = (\d+)$/);
    if (m && current) {
      current.resultingCyclesCount = Number(m[1]);
      continue;
    }

    m = line.match(/^cycle lengths after merge \(length:number\) = (\{.*\})$/);
    if (m && current) {
      current.cycleLengthsAfter = parseCountMap(m[1]);
      continue;
    }

    m = line.match(/^gb-trace iteration=(\d+) subcycle id=(C\d+) vertices=\[(.*)\]$/);
    if (m && current) {
      current.gb.subcycles.push({
        iteration: Number(m[1]),
        id: m[2],
        vertices: parseVerticesInBrackets(m[3]),
      });
      continue;
    }

    m = line.match(/^gb-trace iteration=(\d+) merge (C\d+) \+ (C\d+) = (C\d+)$/);
    if (m && current) {
      current.gb.merges.push({
        iteration: Number(m[1]),
        left: m[2],
        right: m[3],
        merged: m[4],
      });
      continue;
    }

    m = line.match(/^gb-trace iteration=(\d+) resulting id=(C\d+) vertices=\[(.*)\]$/);
    if (m && current) {
      current.gb.resulting.push({
        iteration: Number(m[1]),
        id: m[2],
        vertices: parseVerticesInBrackets(m[3]),
      });
      continue;
    }

    m = line.match(/^cut arcs by clause length \(length:number\) = (\{.*\})$/);
    if (m && current) {
      current.cutArcsByClauseLength = parseCountMap(m[1]);
      continue;
    }

    m = line.match(/^number of added block clauses \(this increment\) = (\d+)$/);
    if (m && current) {
      current.addedBlockClausesThis = Number(m[1]);
      continue;
    }

    m = line.match(/^number of added block clauses \(accumulated\) = (\d+)$/);
    if (m && current) {
      current.addedBlockClausesAccum = Number(m[1]);
      continue;
    }

    m = line.match(/^add block clauses time = (.+)$/);
    if (m && current) {
      current.addBlockClausesTimeRaw = m[1];
      current.addBlockClausesTimeUs = parseDurationToUs(m[1]);
      continue;
    }

    m = line.match(/^increment time = (.+)$/);
    if (m && current) {
      current.incrementTimeRaw = m[1];
      current.incrementTimeUs = parseDurationToUs(m[1]);
      continue;
    }

    if (line === "solution:") {
      inSolutionBlock = true;
      continue;
    }

    if (line === "s SATISFIABLE") {
      parsed.result = "SAT";
      if (current) {
        current.terminalStatus = "SAT";
      }
      continue;
    }

    if (line === "s UNSATISFIABLE") {
      parsed.result = "UNSAT";
      if (current) {
        current.terminalStatus = "UNSAT";
      }
      continue;
    }

    m = line.match(/^overall cegar iterations = (\d+)$/);
    if (m) {
      parsed.overall.cegarIterations = Number(m[1]);
      continue;
    }

    m = line.match(/^overall number of added block clauses = (\d+)$/);
    if (m) {
      parsed.overall.addedBlockClauses = Number(m[1]);
      continue;
    }

    m = line.match(/^solving time = (.+)$/);
    if (m) {
      parsed.overall.solvingTimeRaw = m[1];
      parsed.overall.solvingTimeUs = parseDurationToUs(m[1]);
      continue;
    }

    m = line.match(/^overall time = (.+)$/);
    if (m) {
      parsed.overall.overallTimeRaw = m[1];
      parsed.overall.overallTimeUs = parseDurationToUs(m[1]);
      continue;
    }
  }

  if (current) {
    parsed.iterations.push(finalizeIteration(current));
  }

  if (parsed.result === "UNKNOWN") {
    if (parsed.solutionVertices.length > 0) {
      parsed.result = "SAT";
    }
  }

  return parsed;
}

window.parseDurationToUs = parseDurationToUs;
window.parseLog = parseLog;
