const ANSI_RE = /\x1B\[[0-?]*[ -/]*[@-~]/g;

export function parseUsageOutput(raw) {
  const text = raw.replace(ANSI_RE, "");
  const sections = splitSections(text);

  const codex = parseCodex(sections.codex);
  const kiro = parseKiro(sections.kiro);
  const cursor = parseCursor(sections.cursor);

  const codexToken = formatCodex(codex);
  const kiroToken = formatKiro(kiro);
  const cursorToken = formatCursor(cursor);
  const usageToken = [codexToken, kiroToken, cursorToken]
    .filter((value) => value && value !== "—")
    .join(" · ");

  return {
    codex,
    kiro,
    cursor,
    tokens: {
      codex: codexToken,
      kiro: kiroToken,
      cursor: cursorToken,
      usage: usageToken || "—",
    },
  };
}

function splitSections(text) {
  const sections = { codex: "", kiro: "", cursor: "" };
  let current = null;

  for (const line of text.split("\n")) {
    const header = line.match(/^==\s+(.+?)\s+==$/);
    if (header) {
      const name = header[1].toLowerCase();
      if (name.includes("codex")) current = "codex";
      else if (name.includes("kiro")) current = "kiro";
      else if (name.includes("cursor")) current = "cursor";
      else current = null;
      continue;
    }

    if (current) {
      sections[current] += `${line}\n`;
    }
  }

  return sections;
}

function parseCodex(section) {
  if (!section.trim()) return { status: "missing" };
  if (/skip:/i.test(section)) {
    return { status: "skip", reason: firstLine(section) };
  }
  if (/failed/i.test(section)) {
    return { status: "error", reason: firstLine(section) };
  }

  const plan = section.match(/^Plan:\s*(.+)$/m)?.[1]?.trim();
  const metrics = [...section.matchAll(/^(\S+)\s+[█░].*?(\d+)%/gm)].map(
    (match) => ({
      name: match[1],
      percent: Number(match[2]),
    }),
  );

  return { status: "ok", plan, metrics };
}

function parseKiro(section) {
  if (!section.trim()) return { status: "missing" };
  if (/skip:/i.test(section)) {
    return { status: "skip", reason: firstLine(section) };
  }

  const plan = section.match(/^Plan:\s*(.+)$/m)?.[1]?.trim();
  const percent = section.match(/([█░].*?(\d+)%)/)?.[2];
  const credits = section.match(/^Credits\s+(.+)$/m)?.[1]?.trim();

  return {
    status: percent ? "ok" : "unknown",
    plan,
    credits,
    percent: percent ? Number(percent) : undefined,
  };
}

function parseCursor(section) {
  if (!section.trim()) return { status: "missing" };
  if (/skip:/i.test(section)) {
    return { status: "skip", reason: firstLine(section) };
  }
  if (/failed/i.test(section)) {
    return { status: "error", reason: firstLine(section) };
  }

  const plan = section.match(/^Plan:\s*(.+)$/m)?.[1]?.trim();
  const metrics = [...section.matchAll(/^(Total|Auto|API)\s+[█░].*?(\d+)%/gm)].map(
    (match) => ({
      name: match[1],
      percent: Number(match[2]),
    }),
  );

  return { status: metrics.length ? "ok" : "unknown", plan, metrics };
}

function formatCodex(data) {
  if (data.status === "skip" || data.status === "missing") return "—";
  if (data.status === "error") return "err";
  if (!data.metrics?.length) return "—";

  const byName = Object.fromEntries(
    data.metrics.map((metric) => [metric.name.toLowerCase(), metric.percent]),
  );
  const weekly = byName.weekly;
  const daily = byName.daily;
  const burst = byName.burst;

  const parts = [];
  if (weekly != null) parts.push(`W${weekly}%`);
  if (daily != null) parts.push(`D${daily}%`);
  if (burst != null) parts.push(`B${burst}%`);

  return parts.length ? `Cx ${parts.join("/")}` : "Cx —";
}

function formatKiro(data) {
  if (data.status === "skip" || data.status === "missing") return "—";
  if (data.percent == null) return "Kr —";
  return `Kr ${data.percent}%`;
}

function formatCursor(data) {
  if (data.status === "skip" || data.status === "missing") return "—";
  if (data.status === "error") return "Cu err";
  if (!data.metrics?.length) return "Cu —";

  const byName = Object.fromEntries(
    data.metrics.map((metric) => [metric.name.toLowerCase(), metric.percent]),
  );
  const total = byName.total;
  const api = byName.api;
  const auto = byName.auto;

  const parts = [];
  if (total != null) parts.push(`T${total}%`);
  if (api != null) parts.push(`A${api}%`);
  else if (auto != null) parts.push(`Au${auto}%`);

  return parts.length ? `Cu ${parts.join("/")}` : "Cu —";
}

function firstLine(section) {
  return section
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}
