#!/bin/bash
# NeuroVis - One-click launcher for Mac
# Just run: ./start-neurovis.sh
# Or double-click in Finder (after chmod +x)

cd "$(dirname "$0")"

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║       NeuroVis EEG                   ║"
echo "  ║       Starting...                    ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "Python 3 not found. Install from python.org"
    exit 1
fi

# Install dependencies if needed
python3 -c "import fastapi, uvicorn, pythonosc, numpy, scipy" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "Installing dependencies..."
    pip3 install fastapi uvicorn python-osc numpy scipy brainflow --quiet
fi

# Launch
echo "Starting server... (Ctrl+C to quit)"
python3 neurovis-server.py
