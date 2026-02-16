#!/bin/bash
# Post-tool hook: lint a test file after it is written or edited.
# Receives the file path as the first argument.
# Exits silently (0) if the file is not a test file.

FILE_PATH="$1"

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

BASENAME="$(basename "$FILE_PATH")"

# Check if the file matches known test file patterns
case "$BASENAME" in
  *.spec.js|*.test.js|*.spec.ts|*.test.ts)
    ;; # JS/TS test file -- proceed
  *Tests.cs)
    ;; # C# test file -- proceed
  test_*.py|*_test.py)
    ;; # Python test file -- proceed
  *_test.go)
    ;; # Go test file -- proceed
  *)
    # Not a test file, exit silently
    exit 0
    ;;
esac

# Resolve the plugin root relative to this script's location
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

LINTER="${PLUGIN_ROOT}/scripts/test-integrity-linter.js"

if [ ! -f "$LINTER" ]; then
  echo "[teamwerk] Warning: test-integrity-linter.js not found at ${LINTER}"
  exit 0
fi

node "$LINTER" --file "$FILE_PATH"
