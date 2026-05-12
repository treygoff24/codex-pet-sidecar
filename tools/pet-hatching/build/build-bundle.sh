#!/bin/bash
set -euo pipefail

# Build the pet-hatching PyInstaller bundle
# This script must be run from the repository root

# Use the virtual environment's pyinstaller
PYINSTALLER="./.venv/bin/pyinstaller"

# Ensure pyinstaller is available
if [ ! -f "$PYINSTALLER" ]; then
    echo "pyinstaller not found in .venv. Install with: ./.venv/bin/python -m pip install -r tools/pet-hatching/build/requirements-build.txt"
    exit 1
fi

# Build the bundle
if [ -n "${PYINSTALLER_TARGET_ARCH:-}" ]; then
    echo "Building pet-hatching for macOS architecture: ${PYINSTALLER_TARGET_ARCH}"
fi
"$PYINSTALLER" "tools/pet-hatching/build/pyinstaller.spec"

echo "Bundle built at dist/pet-hatching"
