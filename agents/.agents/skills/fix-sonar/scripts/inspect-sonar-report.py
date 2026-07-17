#!/usr/bin/env python3

import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path
import sys

SEVERITY_ORDER = {
    "BLOCKER": 0,
    "CRITICAL": 1,
    "MAJOR": 2,
    "MINOR": 3,
    "INFO": 4,
}
IMPACT_ORDER = {
    "BLOCKER": 0,
    "HIGH": 1,
    "MEDIUM": 2,
    "LOW": 3,
    "INFO": 4,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect a JSON report produced by fetch-sonar-issues.sh."
    )
    parser.add_argument("report", type=Path)
    parser.add_argument(
        "--issue",
        metavar="KEY",
        help="print the complete JSON for one issue, including textRange and flows",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=50,
        help="maximum issue groups to print (default: 50)",
    )
    return parser.parse_args()


def load_report(path: Path) -> dict:
    try:
        with path.open(encoding="utf-8") as handle:
            report = json.load(handle)
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"fix-sonar: cannot read report: {error}") from error

    if not isinstance(report, dict) or not isinstance(report.get("issues"), list):
        raise SystemExit("fix-sonar: unexpected report format")
    return report


def local_path(issue: dict, project_key: str) -> str:
    path = issue.get("path")
    if isinstance(path, str) and path:
        return path

    component = issue.get("component")
    prefix = f"{project_key}:"
    if isinstance(component, str) and component.startswith(prefix):
        return component[len(prefix) :]
    return str(component or "<unknown component>")


def issue_priority(issue: dict) -> tuple[int, int]:
    severity = SEVERITY_ORDER.get(str(issue.get("severity")), 99)
    impacts = issue.get("impacts") or []
    impact = min(
        (
            IMPACT_ORDER.get(str(item.get("severity")), 99)
            for item in impacts
            if isinstance(item, dict)
        ),
        default=99,
    )
    return severity, impact


def impact_labels(issues: list[dict]) -> list[str]:
    labels = {
        f"{impact.get('softwareQuality', '?')}:{impact.get('severity', '?')}"
        for issue in issues
        for impact in (issue.get("impacts") or [])
        if isinstance(impact, dict)
    }
    return sorted(
        labels,
        key=lambda label: IMPACT_ORDER.get(label.rsplit(":", 1)[-1], 99),
    )


def print_issue(report: dict, key: str) -> None:
    for issue in report["issues"]:
        if issue.get("key") == key:
            json.dump(issue, sys.stdout, ensure_ascii=False, indent=2)
            print()
            return
    raise SystemExit(f"fix-sonar: issue not found in report: {key}")


def print_summary(report: dict, limit: int) -> None:
    issues = report["issues"]
    project_key = str(report.get("projectKey") or "")

    print(f"Project: {project_key}")
    print(f"Source: {report.get('projectSource', '<unknown>')}")
    print(
        "Issues: "
        f"fetched={report.get('total', len(issues))} "
        f"reported={report.get('reportedTotal')} "
        f"truncated={str(bool(report.get('truncated'))).lower()}"
    )

    counts = Counter(str(issue.get("severity") or "UNKNOWN") for issue in issues)
    ordered_counts = sorted(
        counts.items(), key=lambda item: SEVERITY_ORDER.get(item[0], 99)
    )
    if ordered_counts:
        print("Severities: " + ", ".join(f"{name}={count}" for name, count in ordered_counts))

    groups: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
    for issue in issues:
        path = local_path(issue, project_key)
        group_key = (
            str(issue.get("rule") or "<unknown rule>"),
            path,
            str(issue.get("message") or ""),
        )
        groups[group_key].append(issue)

    ordered_groups = sorted(
        groups.items(),
        key=lambda item: (
            min(issue_priority(issue) for issue in item[1]),
            item[0][1],
            item[0][0],
        ),
    )

    print(f"Groups: {len(ordered_groups)}")
    for index, ((rule, path, message), grouped) in enumerate(
        ordered_groups[: max(limit, 0)], start=1
    ):
        severities = sorted(
            {str(issue.get("severity") or "UNKNOWN") for issue in grouped},
            key=lambda value: SEVERITY_ORDER.get(value, 99),
        )
        types = sorted({str(issue.get("type") or "UNKNOWN") for issue in grouped})
        lines = sorted(
            {
                int(issue["line"])
                for issue in grouped
                if isinstance(issue.get("line"), int)
            }
        )
        keys = [str(issue.get("key")) for issue in grouped]
        flow_count = sum(bool(issue.get("flows")) for issue in grouped)

        print()
        print(f"[{index}] {rule} — {len(grouped)} issue(s)")
        print(f"  Priority: {','.join(severities)}; type={','.join(types)}")
        impacts = impact_labels(grouped)
        if impacts:
            print(f"  Impacts: {', '.join(impacts)}")
        print(f"  File: {path}")
        print(f"  Lines: {','.join(map(str, lines)) if lines else '-'}")
        print(f"  Keys: {','.join(keys)}")
        print(f"  Message: {message}")
        if flow_count:
            print(
                f"  Flows: available for {flow_count}/{len(grouped)} issue(s); "
                "inspect each key with --issue"
            )

    omitted = len(ordered_groups) - max(limit, 0)
    if omitted > 0:
        print(f"\nOmitted groups: {omitted}; rerun with a larger --limit or inspect by key.")


def main() -> None:
    args = parse_args()
    report = load_report(args.report)
    if args.issue:
        print_issue(report, args.issue)
    else:
        print_summary(report, args.limit)


if __name__ == "__main__":
    main()
