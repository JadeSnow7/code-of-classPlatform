#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT_DIR/src"
PAGES_DIR="$SRC_DIR/pages"

# Allowlist paths that can keep mock/debug examples.
ALLOWLIST_REGEX='(\.stories\.tsx$|/__tests__/|/LocalAIDebugPage\.tsx$)'

scan() {
  local pattern="$1"
  local target_dir="$2"

  if command -v rg >/dev/null 2>&1; then
    rg -n --glob '*.ts' --glob '*.tsx' "$pattern" "$target_dir" | grep -Ev "$ALLOWLIST_REGEX" || true
  else
    grep -R -nE "$pattern" "$target_dir" --include='*.ts' --include='*.tsx' | grep -Ev "$ALLOWLIST_REGEX" || true
  fi
}

scan_fixed() {
  local pattern="$1"
  local target_dir="$2"

  if command -v rg >/dev/null 2>&1; then
    rg -n -F --glob '*.ts' --glob '*.tsx' "$pattern" "$target_dir" | grep -Ev "$ALLOWLIST_REGEX" || true
  else
    grep -R -nF "$pattern" "$target_dir" --include='*.ts' --include='*.tsx' | grep -Ev "$ALLOWLIST_REGEX" || true
  fi
}

violations=""

append_violations() {
  local title="$1"
  local output="$2"
  if [[ -n "$output" ]]; then
    violations+=$'\n'
    violations+="[${title}]"
    violations+=$'\n'
    violations+="$output"
    violations+=$'\n'
  fi
}

append_violations "Mock markers in pages" "$(scan 'Mock Mode|mockMode' "$PAGES_DIR")"
append_violations "Random business rendering in pages" "$(scan 'Math\\.random[(]' "$PAGES_DIR")"
append_violations "Mock async simulation patterns" "$(scan 'Promise\\.resolve|new Promise[(]' "$PAGES_DIR")"
append_violations "Hardcoded dashboard/workspace mock arrays" "$(printf '%s\n%s\n%s\n%s\n%s' \
  "$(scan_fixed 'const heatmapData = [' "$PAGES_DIR")" \
  "$(scan_fixed 'const folders = [' "$PAGES_DIR")" \
  "$(scan_fixed 'const assignments = [' "$PAGES_DIR")" \
  "$(scan_fixed 'const radarAxes = [' "$PAGES_DIR")" \
  "$(scan_fixed 'const CODE_LINES = [' "$PAGES_DIR")" | sed '/^$/d')"
append_violations "Mock signatures in business code" "$(scan 'dummy-model-path|TODO:|FIXME:' "$SRC_DIR")"

if [[ -n "$violations" ]]; then
  echo "API realism audit failed. Found violations:"
  echo "$violations"
  exit 1
fi

echo "API realism audit passed."
