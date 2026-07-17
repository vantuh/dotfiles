#!/usr/bin/env bash

set -euo pipefail

fail() {
  printf 'fix-sonar: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "required command not found: $1"
}

project_key=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --project-key)
      [[ $# -ge 2 ]] || fail "--project-key requires a value"
      project_key="$2"
      shift 2
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

require_command curl
require_command git
if ! command -v jq >/dev/null 2>&1 || ! jq --version >/dev/null 2>&1; then
  for jq_path in /opt/homebrew/bin/jq /usr/local/bin/jq /usr/bin/jq; do
    if [[ -x "$jq_path" ]] && "$jq_path" --version >/dev/null 2>&1; then
      PATH="$(dirname "$jq_path"):$PATH"
      break
    fi
  done
fi
command -v jq >/dev/null 2>&1 && jq --version >/dev/null 2>&1 ||
  fail 'required command is unavailable or broken: jq'

[[ -n "${FOODTECH_SONAR_URL:-}" ]] || fail 'FOODTECH_SONAR_URL is not set'
[[ -n "${SONAR_TOKEN:-}" ]] || fail 'SONAR_TOKEN is not set'

sonar_url="${FOODTECH_SONAR_URL%/}"
project_source="argument"
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/fix-sonar.XXXXXX")"
cleanup() {
  rm -f "$tmp_dir"/*
  rmdir "$tmp_dir"
}
trap cleanup EXIT

api_get() {
  curl --silent --show-error --fail \
    -H "Authorization: Bearer ${SONAR_TOKEN}" \
    --get "$@"
}

read_property_file() {
  local file="$1"
  awk -F= '
    /^[[:space:]]*#/ { next }
    {
      key=$1
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
      if (key == "sonar.projectKey") {
        sub(/^[^=]*=/, "")
        gsub(/^[[:space:]]+|[[:space:]]+$/, "")
        print
        exit
      }
    }
  ' "$file"
}

find_tracked_keys() {
  local matches
  matches="$(git grep -I -h 'sonar\.projectKey' -- \
    '*.properties' '*.xml' '*.gradle' '*.gradle.kts' '*.yml' '*.yaml' \
    2>/dev/null || true)"

  [[ -n "$matches" ]] || return 0

  {
    printf '%s\n' "$matches" | sed -nE "s/.*sonar\.projectKey[[:space:]]*[:=][[:space:]]*[\"']?([A-Za-z0-9_.:-]+).*/\1/p"
    printf '%s\n' "$matches" | sed -nE 's|.*<sonar\.projectKey>[[:space:]]*([^<[:space:]]+).*</sonar\.projectKey>.*|\1|p'
    printf '%s\n' "$matches" | sed -nE "s/.*[\"']sonar\.projectKey[\"'][[:space:]]*,[[:space:]]*[\"']([^\"']+)[\"'].*/\1/p"
  } | grep -Ev '\$\{|\$\(|^$' | sort -u
}

repo_name() {
  local remote
  remote="$(git remote get-url origin 2>/dev/null || true)"
  [[ -n "$remote" ]] || return 1
  remote="${remote%/}"
  remote="${remote%.git}"
  printf '%s\n' "${remote##*/}"
}

search_project() {
  local name="$1"
  local response="$tmp_dir/projects.json"

  api_get "$sonar_url/api/components/search" \
    --data-urlencode 'qualifiers=TRK' \
    --data-urlencode "q=$name" \
    --data-urlencode 'ps=500' > "$response" ||
    fail "could not search SonarQube projects at $sonar_url"

  jq -e '.components | type == "array"' "$response" >/dev/null ||
    fail 'SonarQube project search returned an unexpected response'

  local exact_count total_count
  exact_count="$(jq --arg name "$name" '[.components[] | select((.key | ascii_downcase) == ($name | ascii_downcase) or (.name | ascii_downcase) == ($name | ascii_downcase))] | length' "$response")"
  total_count="$(jq '.components | length' "$response")"

  if [[ "$exact_count" -eq 1 ]]; then
    jq -r --arg name "$name" '.components[] | select((.key | ascii_downcase) == ($name | ascii_downcase) or (.name | ascii_downcase) == ($name | ascii_downcase)) | .key' "$response"
    return
  fi

  if [[ "$exact_count" -eq 0 && "$total_count" -eq 1 ]]; then
    jq -r '.components[0].key' "$response"
    return
  fi

  if [[ "$total_count" -eq 0 ]]; then
    fail "no SonarQube project matched repository '$name'; pass --project-key <key>"
  fi

  printf "fix-sonar: project discovery is ambiguous for repository '%s':\n" "$name" >&2
  jq -r '.components[] | "  \(.key)\t\(.name)"' "$response" >&2
  fail 'rerun with --project-key <key>'
}

if [[ -z "$project_key" ]]; then
  if [[ -f .scannerwork/report-task.txt ]]; then
    project_key="$(awk -F= '$1 == "projectKey" { print substr($0, index($0, "=") + 1); exit }' .scannerwork/report-task.txt)"
    [[ -n "$project_key" ]] && project_source='.scannerwork/report-task.txt'
  fi

  if [[ -z "$project_key" && -f sonar-project.properties ]]; then
    project_key="$(read_property_file sonar-project.properties)"
    [[ -n "$project_key" ]] && project_source='sonar-project.properties'
  fi

  if [[ -z "$project_key" ]]; then
    tracked_keys=()
    while IFS= read -r key; do
      tracked_keys+=("$key")
    done < <(find_tracked_keys)
    if [[ ${#tracked_keys[@]} -eq 1 ]]; then
      project_key="${tracked_keys[0]}"
      project_source='tracked build/CI configuration'
    elif [[ ${#tracked_keys[@]} -gt 1 ]]; then
      printf 'fix-sonar: multiple project keys found in tracked configuration:\n' >&2
      printf '  %s\n' "${tracked_keys[@]}" >&2
      fail 'rerun with --project-key <key>'
    fi
  fi

  if [[ -z "$project_key" ]]; then
    name="$(repo_name)" || fail 'cannot infer repository name: git remote origin is missing; pass --project-key <key>'
    project_key="$(search_project "$name")"
    project_source="SonarQube search for git repository '$name'"
  fi
fi

[[ -n "$project_key" ]] || fail 'could not determine SonarQube project key'

page=1
page_size=500
max_pages=20 # SonarQube limits issue search to the first 10,000 results.
fetched=0
reported_total=null
truncated=false
while :; do
  page_file="$tmp_dir/page-$(printf '%06d' "$page").json"
  api_get "$sonar_url/api/issues/search" \
    --data-urlencode "componentKeys=$project_key" \
    --data-urlencode 'resolved=false' \
    --data-urlencode "p=$page" \
    --data-urlencode "ps=$page_size" > "$page_file" ||
    fail "could not fetch issues for project '$project_key'"

  jq -e '.issues | type == "array"' "$page_file" >/dev/null ||
    fail 'SonarQube issue search returned an unexpected response'

  page_count="$(jq '.issues | length' "$page_file")"
  reported_total="$(jq '.paging.total // .total // null' "$page_file")"
  fetched=$((fetched + page_count))

  [[ "$page_count" -eq 0 ]] && break
  [[ "$reported_total" != null && "$fetched" -ge "$reported_total" ]] && break
  [[ "$page_count" -lt "$page_size" ]] && break
  if [[ "$page" -ge "$max_pages" ]]; then
    truncated=true
    break
  fi
  page=$((page + 1))
done

jq -s \
  --arg server_url "$sonar_url" \
  --arg project_key "$project_key" \
  --arg project_source "$project_source" \
  --argjson reported_total "$reported_total" \
  --argjson truncated "$truncated" \
  '{
    serverUrl: $server_url,
    projectKey: $project_key,
    projectSource: $project_source,
    total: ([.[].issues[]?] | length),
    reportedTotal: $reported_total,
    truncated: $truncated,
    issues: [.[].issues[]? |
      .component as $component |
      {
      key,
      rule,
      severity,
      type,
      cleanCodeAttribute,
      impacts,
      status,
      message,
      component,
      path: (if (($component | type) == "string" and ($component | startswith($project_key + ":")))
        then $component[(($project_key | length) + 1):]
        else null
      end),
      line,
      textRange,
      flows,
      creationDate,
      updateDate
    }]
  }' "$tmp_dir"/page-*.json
