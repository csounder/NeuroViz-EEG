#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────
#  NeuroVis EEG — Python OSC Server Setup
#  Creates a virtual environment and installs dependencies.
#  Avoids PEP 668 "externally-managed-environment" errors.
# ─────────────────────────────────────────────────────────
set -euo pipefail

VENV_DIR=".venv"
DEPS="fastapi uvicorn python-osc numpy scipy brainflow"

echo ""
echo "  ⚡ NeuroVis — Python OSC Server Setup"
echo "  ─────────────────────────────────────"
echo ""

# ── Check for Python 3 ──
if ! command -v python3 &>/dev/null; then
    echo "  ✗ python3 not found."
    echo ""
    echo "  Install Python 3.9+ for your platform:"
    echo "    macOS:   brew install python3"
    echo "    Ubuntu:  sudo apt install python3 python3-venv"
    echo "    Fedora:  sudo dnf install python3"
    echo "    Windows: https://python.org/downloads"
    echo ""
    exit 1
fi

PY_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "  ✓ Found Python $PY_VERSION"

# ── Check for venv module (missing on some minimal distros) ──
if ! python3 -c "import venv" 2>/dev/null; then
    echo "  ✗ python3-venv module not found."
    echo ""
    echo "  Install it:"
    echo "    Ubuntu/Debian:  sudo apt install python3-venv"
    echo "    Fedora:         sudo dnf install python3-libs"
    echo "    Arch:           (included with python)"
    echo ""
    exit 1
fi

# ── Create venv if it doesn't exist ──
if [ ! -d "$VENV_DIR" ]; then
    echo "  → Creating virtual environment in $VENV_DIR/ ..."
    python3 -m venv "$VENV_DIR"
    echo "  ✓ Virtual environment created"
else
    echo "  ✓ Virtual environment already exists"
fi

# ── Activate and install ──
echo "  → Installing dependencies: $DEPS ..."
# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

pip install --upgrade pip --quiet 2>/dev/null
pip install $DEPS --quiet

echo "  ✓ All dependencies installed"
echo ""
echo "  ─────────────────────────────────────"
echo "  Ready! Start the server with:"
echo ""
echo "    source $VENV_DIR/bin/activate"
echo "    python neurovis-server.py"
echo ""
echo "  Or in one line:"
echo "    $VENV_DIR/bin/python neurovis-server.py"
echo ""
echo "  Then open neurovis.html in a browser."
echo "  The dashboard will auto-detect the server."
echo "  ─────────────────────────────────────"
echo ""
