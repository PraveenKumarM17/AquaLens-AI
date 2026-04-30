#!/bin/bash
# Quick start script for AquaLens ML Backend

echo "=========================================="
echo "AquaLens ML Backend - Quick Start"
echo "=========================================="

# Check if Python is installed
if ! command -v python &> /dev/null; then
    echo "❌ Python is not installed. Please install Python 3.8+"
    exit 1
fi

cd "$(dirname "$0")"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "📥 Installing dependencies..."
pip install -r requirements.txt -q

# Generate dataset and train model
echo "🤖 Training ML model (this may take 1-2 minutes)..."
python setup.py

# Start API server
echo ""
echo "=========================================="
echo "✅ Setup Complete!"
echo "=========================================="
echo ""
echo "🚀 Starting API server on http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

python -m uvicorn main:app --reload --port 8000
