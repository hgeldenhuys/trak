#!/bin/bash
# Trak Board CLI/TUI Installer
# Usage: gh api repos/hgeldenhuys/trak/contents/install.sh --jq .content | base64 -d | bash

set -e

REPO="hgeldenhuys/trak"
INSTALL_DIR="${TRAK_INSTALL_DIR:-$HOME/.trak}"
BIN_DIR="/usr/local/bin"

echo "🔧 Installing Trak Board CLI/TUI..."

# Check for required tools
if ! command -v bun &> /dev/null; then
    echo "❌ Bun is required but not installed."
    echo "   Install with: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

if ! command -v git &> /dev/null; then
    echo "❌ Git is required but not installed."
    exit 1
fi

# Clone or update repository
if [ -d "$INSTALL_DIR" ]; then
    echo "📦 Updating existing installation..."
    cd "$INSTALL_DIR"
    git pull origin main
else
    echo "📦 Cloning repository..."
    git clone "https://github.com/$REPO.git" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Install dependencies
echo "📥 Installing dependencies..."
bun install

# Build executables
echo "🔨 Building CLI..."
bun run build:cli

echo "🔨 Building TUI..."
bun run build:tui

# Create symlinks
echo "🔗 Creating symlinks..."
if [ -w "$BIN_DIR" ]; then
    ln -sf "$INSTALL_DIR/dist/board-cli" "$BIN_DIR/board"
    ln -sf "$INSTALL_DIR/dist/board-tui" "$BIN_DIR/board-tui"
else
    echo "   Requesting sudo for /usr/local/bin symlinks..."
    sudo ln -sf "$INSTALL_DIR/dist/board-cli" "$BIN_DIR/board"
    sudo ln -sf "$INSTALL_DIR/dist/board-tui" "$BIN_DIR/board-tui"
fi

# Add TUI alias suggestion
echo ""
echo "✅ Trak installed successfully!"
echo ""
echo "Commands available:"
echo "  board          - CLI for story/task management"
echo "  board-tui      - Real-time Kanban TUI"
echo ""
echo "Quick start:"
echo "  board feature create -c PROJ -n \"My Project\""
echo "  board story create -f PROJ -t \"First Story\""
echo "  board task create -s PROJ-001 -t \"First Task\""
echo "  TMPDIR=/tmp board-tui"
echo ""
echo "Optional: Add this alias to ~/.zshrc for easier TUI usage:"
echo "  alias trak='TMPDIR=/tmp board-tui'"
echo ""
echo "Data stored in: ~/.board/data.db"
