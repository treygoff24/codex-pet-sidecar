#!/bin/bash
set -euo pipefail

# Build the pet-hatching PyInstaller bundle
# This script should be run from the repository root

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_DIR="$SCRIPT_DIR"

cd "$REPO_ROOT"

# Ensure pyinstaller is installed
if ! command -v pyinstaller &> /dev/null; then
    echo "pyinstaller not found. Install with: ./.venv/bin/python -m pip install -r tools/pet-hatching/build/requirements-build.txt"
    exit 1
fi

# Build the bundle
cd "$BUILD_DIR"
pyinstaller pyinstaller.spec

echo "Bundle built at $BUILD_DIR/dist/pet-hatching"