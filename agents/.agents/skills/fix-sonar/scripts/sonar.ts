#!/usr/bin/env -S node --experimental-strip-types

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

type Impact = { softwareQuality?: string; severity?: string };
type Issue = {
  key?: string;
  rule?: string;
  severity?: string;
  type?: string;
  cleanCodeAttribute?: string;
  impacts?: Impact[];
  status?: string;
  message?: string;
  component?: string;
  path?: string | null;
  line?: number;
  textRange?: unknown;
  flows?: unknown[];
  creationDate?: string;
  updateDate?: string;
};

type Report = {
  serverUrl: string;
  projectKey: string;
  projectSource: string;
  total: number;
  reportedTotal: number | null;
  truncated: boolean;
  issues: Issue[];
};

const SEVERITY_ORDER: Record<string, number> = {
  BLOCKER: 0,
  CRITICAL: 1,
  MAJOR: 2,
  MINOR: 3,
  INFO: 4,
};

const IMPACT_ORDER: Record<string, number> = {
  BLOCKER: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

function fail(message: string): never {
  console.error(`fix-sonar: ${message}`);
  process.exit(1);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) fail(`${name} is not set`);
  return value;
}

function git(...args: string[]): string {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return "";
  return (result.stdout ?? "").trim();
}

async function apiGet<T>(sonarUrl: string, token: string, path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${sonarUrl}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401 || response.status === 403) {
    fail(
      `SonarQube returned ${response.status}; SONAR_TOKEN must be a user token with Browse permission`,
    );
  }
  if (!response.ok) {
    fail(`SonarQube request failed (${response.status}) for ${path}`);
  }

  return (await response.json()) as T;
}

function readPropertyFile(file: string): string {
  const text = readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (key === "sonar.projectKey") return line.slice(eq + 1).trim();
  }
  return "";
}

function findTrackedKeys(): string[] {
  const result = spawnSync(
    "git",
    [
      "grep",
      "-I",
      "-h",
      "sonar\\.projectKey",
      "--",
      "*.properties",
      "*.xml",
      "*.gradle",
      "*.gradle.kts",
      "*.yml",
      "*.yaml",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const matches = result.stdout ?? "";
  if (!matches.trim()) return [];

  const keys = new Set<string>();
  const patterns = [
    /sonar\.projectKey\s*[:=]\s*["']?([A-Za-z0-9_.:-]+)/g,
    /<sonar\.projectKey>\s*([^<\s]+)\s*<\/sonar\.projectKey>/g,
    /["']sonar\.projectKey["']\s*,\s*["']([^"']+)["']/g,
  ];

  for (const pattern of patterns) {
    for (const match of matches.matchAll(pattern)) {
      const key = match[1];
      if (key && !key.includes("${") && !key.includes("$(")) keys.add(key);
    }
  }

  return [...keys].sort();
}

function repoName(): string {
  let remote = git("remote", "get-url", "origin");
  if (!remote) fail("cannot infer repository name: git remote origin is missing; pass --project-key <key>");
  remote = remote.replace(/\/$/, "").replace(/\.git$/, "");
  const name = remote.split("/").pop();
  if (!name) fail("cannot infer repository name from git remote origin; pass --project-key <key>");
  return name;
}

async function searchProject(sonarUrl: string, token: string, name: string): Promise<string> {
  type SearchResponse = {
    components?: Array<{ key?: string; name?: string }>;
  };

  const response = await apiGet<SearchResponse>(sonarUrl, token, "/api/components/search", {
    qualifiers: "TRK",
    q: name,
    ps: "500",
  });

  const components = response.components;
  if (!Array.isArray(components)) {
    fail("SonarQube project search returned an unexpected response");
  }

  const lower = name.toLowerCase();
  const exact = components.filter(
    (c) => c.key?.toLowerCase() === lower || c.name?.toLowerCase() === lower,
  );

  if (exact.length === 1 && exact[0]?.key) return exact[0].key;
  if (exact.length === 0 && components.length === 1 && components[0]?.key) {
    return components[0].key;
  }
  if (components.length === 0) {
    fail(`no SonarQube project matched repository '${name}'; pass --project-key <key>`);
  }

  console.error(`fix-sonar: project discovery is ambiguous for repository '${name}':`);
  for (const component of components) {
    console.error(`  ${component.key ?? "?"}\t${component.name ?? ""}`);
  }
  fail("rerun with --project-key <key>");
}

async function resolveProjectKey(
  sonarUrl: string,
  token: string,
  explicitKey: string | undefined,
): Promise<{ projectKey: string; projectSource: string }> {
  if (explicitKey) {
    return { projectKey: explicitKey, projectSource: "argument" };
  }

  if (existsSync(".scannerwork/report-task.txt")) {
    const text = readFileSync(".scannerwork/report-task.txt", "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith("projectKey=")) {
        const projectKey = line.slice("projectKey=".length).trim();
        if (projectKey) {
          return { projectKey, projectSource: ".scannerwork/report-task.txt" };
        }
      }
    }
  }

  if (existsSync("sonar-project.properties")) {
    const projectKey = readPropertyFile("sonar-project.properties");
    if (projectKey) {
      return { projectKey, projectSource: "sonar-project.properties" };
    }
  }

  const trackedKeys = findTrackedKeys();
  if (trackedKeys.length === 1) {
    return {
      projectKey: trackedKeys[0]!,
      projectSource: "tracked build/CI configuration",
    };
  }
  if (trackedKeys.length > 1) {
    console.error("fix-sonar: multiple project keys found in tracked configuration:");
    for (const key of trackedKeys) console.error(`  ${key}`);
    fail("rerun with --project-key <key>");
  }

  const name = repoName();
  const projectKey = await searchProject(sonarUrl, token, name);
  return {
    projectKey,
    projectSource: `SonarQube search for git repository '${name}'`,
  };
}

function normalizeIssue(issue: Issue, projectKey: string): Issue {
  const component = issue.component;
  const prefix = `${projectKey}:`;
  const path =
    typeof component === "string" && component.startsWith(prefix)
      ? component.slice(prefix.length)
      : null;

  return {
    key: issue.key,
    rule: issue.rule,
    severity: issue.severity,
    type: issue.type,
    cleanCodeAttribute: issue.cleanCodeAttribute,
    impacts: issue.impacts,
    status: issue.status,
    message: issue.message,
    component: issue.component,
    path,
    line: issue.line,
    textRange: issue.textRange,
    flows: issue.flows,
    creationDate: issue.creationDate,
    updateDate: issue.updateDate,
  };
}

async function fetchIssues(projectKeyArg?: string): Promise<void> {
  if (spawnSync("git", ["--version"], { stdio: "ignore" }).error) {
    fail("required command not found: git");
  }

  const sonarUrl = requireEnv("FOODTECH_SONAR_URL").replace(/\/$/, "");
  const token = requireEnv("SONAR_TOKEN");
  const { projectKey, projectSource } = await resolveProjectKey(sonarUrl, token, projectKeyArg);

  type IssuesResponse = {
    issues?: Issue[];
    paging?: { total?: number };
    total?: number;
  };

  const pageSize = 500;
  const maxPages = 20;
  const allIssues: Issue[] = [];
  let reportedTotal: number | null = null;
  let truncated = false;

  for (let page = 1; page <= maxPages; page += 1) {
    const pageData = await apiGet<IssuesResponse>(sonarUrl, token, "/api/issues/search", {
      componentKeys: projectKey,
      resolved: "false",
      p: String(page),
      ps: String(pageSize),
    });

    if (!Array.isArray(pageData.issues)) {
      fail("SonarQube issue search returned an unexpected response");
    }

    allIssues.push(...pageData.issues);
    reportedTotal =
      typeof pageData.paging?.total === "number"
        ? pageData.paging.total
        : typeof pageData.total === "number"
          ? pageData.total
          : reportedTotal;

    if (pageData.issues.length === 0) break;
    if (reportedTotal !== null && allIssues.length >= reportedTotal) break;
    if (pageData.issues.length < pageSize) break;
    if (page === maxPages) {
      truncated = true;
      break;
    }
  }

  const report: Report = {
    serverUrl: sonarUrl,
    projectKey,
    projectSource,
    total: allIssues.length,
    reportedTotal,
    truncated,
    issues: allIssues.map((issue) => normalizeIssue(issue, projectKey)),
  };

  process.stdout.write(`${JSON.stringify(report)}\n`);
}

function localPath(issue: Issue, projectKey: string): string {
  if (typeof issue.path === "string" && issue.path) return issue.path;
  const component = issue.component;
  const prefix = `${projectKey}:`;
  if (typeof component === "string" && component.startsWith(prefix)) {
    return component.slice(prefix.length);
  }
  return String(component || "<unknown component>");
}

function issuePriority(issue: Issue): [number, number] {
  const severity = SEVERITY_ORDER[String(issue.severity)] ?? 99;
  const impacts = issue.impacts ?? [];
  let impact = 99;
  for (const item of impacts) {
    const rank = IMPACT_ORDER[String(item.severity)] ?? 99;
    if (rank < impact) impact = rank;
  }
  return [severity, impact];
}

function impactLabels(issues: Issue[]): string[] {
  const labels = new Set<string>();
  for (const issue of issues) {
    for (const impact of issue.impacts ?? []) {
      labels.add(`${impact.softwareQuality ?? "?"}:${impact.severity ?? "?"}`);
    }
  }
  return [...labels].sort(
    (a, b) => (IMPACT_ORDER[a.split(":").pop() ?? ""] ?? 99) - (IMPACT_ORDER[b.split(":").pop() ?? ""] ?? 99),
  );
}

function loadReport(path: string): Report {
  let report: unknown;
  try {
    report = JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (error) {
    fail(`cannot read report: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (
    !report ||
    typeof report !== "object" ||
    !Array.isArray((report as Report).issues)
  ) {
    fail("unexpected report format");
  }
  return report as Report;
}

function printIssue(report: Report, key: string): void {
  const issue = report.issues.find((item) => item.key === key);
  if (!issue) fail(`issue not found in report: ${key}`);
  process.stdout.write(`${JSON.stringify(issue, null, 2)}\n`);
}

function printSummary(report: Report, limit: number): void {
  const issues = report.issues;
  const projectKey = String(report.projectKey || "");

  console.log(`Project: ${projectKey}`);
  console.log(`Source: ${report.projectSource || "<unknown>"}`);
  console.log(
    `Issues: fetched=${report.total ?? issues.length} reported=${report.reportedTotal} truncated=${String(Boolean(report.truncated)).toLowerCase()}`,
  );

  const counts = new Map<string, number>();
  for (const issue of issues) {
    const severity = String(issue.severity || "UNKNOWN");
    counts.set(severity, (counts.get(severity) ?? 0) + 1);
  }
  const orderedCounts = [...counts.entries()].sort(
    (a, b) => (SEVERITY_ORDER[a[0]] ?? 99) - (SEVERITY_ORDER[b[0]] ?? 99),
  );
  if (orderedCounts.length > 0) {
    console.log(`Severities: ${orderedCounts.map(([name, count]) => `${name}=${count}`).join(", ")}`);
  }

  const groups = new Map<string, { rule: string; path: string; message: string; issues: Issue[] }>();
  for (const issue of issues) {
    const path = localPath(issue, projectKey);
    const rule = String(issue.rule || "<unknown rule>");
    const message = String(issue.message || "");
    const key = `${rule}\0${path}\0${message}`;
    const existing = groups.get(key);
    if (existing) existing.issues.push(issue);
    else groups.set(key, { rule, path, message, issues: [issue] });
  }

  const orderedGroups = [...groups.values()].sort((a, b) => {
    const pa = a.issues.map(issuePriority).sort((x, y) => x[0] - y[0] || x[1] - y[1])[0]!;
    const pb = b.issues.map(issuePriority).sort((x, y) => x[0] - y[0] || x[1] - y[1])[0]!;
    if (pa[0] !== pb[0]) return pa[0] - pb[0];
    if (pa[1] !== pb[1]) return pa[1] - pb[1];
    if (a.path !== b.path) return a.path.localeCompare(b.path);
    return a.rule.localeCompare(b.rule);
  });

  console.log(`Groups: ${orderedGroups.length}`);
  for (const [index, group] of orderedGroups.slice(0, Math.max(limit, 0)).entries()) {
    const severities = [
      ...new Set(group.issues.map((issue) => String(issue.severity || "UNKNOWN"))),
    ].sort((a, b) => (SEVERITY_ORDER[a] ?? 99) - (SEVERITY_ORDER[b] ?? 99));
    const types = [...new Set(group.issues.map((issue) => String(issue.type || "UNKNOWN")))].sort();
    const lines = [
      ...new Set(
        group.issues
          .map((issue) => issue.line)
          .filter((line): line is number => typeof line === "number"),
      ),
    ].sort((a, b) => a - b);
    const keys = group.issues.map((issue) => String(issue.key));
    const flowCount = group.issues.filter((issue) => Boolean(issue.flows)).length;

    console.log();
    console.log(`[${index + 1}] ${group.rule} — ${group.issues.length} issue(s)`);
    console.log(`  Priority: ${severities.join(",")}; type=${types.join(",")}`);
    const impacts = impactLabels(group.issues);
    if (impacts.length > 0) console.log(`  Impacts: ${impacts.join(", ")}`);
    console.log(`  File: ${group.path}`);
    console.log(`  Lines: ${lines.length > 0 ? lines.join(",") : "-"}`);
    console.log(`  Keys: ${keys.join(",")}`);
    console.log(`  Message: ${group.message}`);
    if (flowCount > 0) {
      console.log(
        `  Flows: available for ${flowCount}/${group.issues.length} issue(s); inspect each key with --issue`,
      );
    }
  }

  const omitted = orderedGroups.length - Math.max(limit, 0);
  if (omitted > 0) {
    console.log(`\nOmitted groups: ${omitted}; rerun with a larger --limit or inspect by key.`);
  }
}

function printUsage(): never {
  console.error(`Usage:
  node --experimental-strip-types <skill>/scripts/sonar.ts fetch [--project-key <key>]
  node --experimental-strip-types <skill>/scripts/sonar.ts inspect <report> [--issue <key>] [--limit <n>]`);
  process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) printUsage();

  const command = args[0];
  if (command === "fetch") {
    let projectKey: string | undefined;
    for (let i = 1; i < args.length; i += 1) {
      if (args[i] === "--project-key") {
        projectKey = args[++i];
        if (!projectKey) fail("--project-key requires a value");
      } else {
        fail(`unknown argument: ${args[i]}`);
      }
    }
    await fetchIssues(projectKey);
    return;
  }

  if (command === "inspect") {
    const reportPath = args[1];
    if (!reportPath) fail("inspect requires a report path");

    let issueKey: string | undefined;
    let limit = 50;
    for (let i = 2; i < args.length; i += 1) {
      if (args[i] === "--issue") {
        issueKey = args[++i];
        if (!issueKey) fail("--issue requires a value");
      } else if (args[i] === "--limit") {
        const raw = args[++i];
        if (!raw) fail("--limit requires a value");
        limit = Number(raw);
        if (!Number.isFinite(limit)) fail("--limit must be a number");
      } else {
        fail(`unknown argument: ${args[i]}`);
      }
    }

    const report = loadReport(reportPath);
    if (issueKey) printIssue(report, issueKey);
    else printSummary(report, limit);
    return;
  }

  printUsage();
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
