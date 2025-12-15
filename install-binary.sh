#!/bin/bash
set -e

# Trak Binary Installer
# Downloads pre-built binaries from GitHub releases

REPO="hgeldenhuys/trak"
INSTALL_DIR="/usr/local/bin"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Trak Binary Installer${NC}"
echo "======================"
echo ""

# Check platform
PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Normalize architecture names
if [[ "$ARCH" == "x86_64" ]]; then
    ARCH="x64"
fi

# Validate platform
if [[ "$PLATFORM" != "darwin" && "$PLATFORM" != "linux" ]]; then
    echo -e "${RED}Error: Unsupported platform: $PLATFORM${NC}"
    echo "Supported platforms: darwin (macOS), linux"
    exit 1
fi

# Validate architecture
if [[ "$ARCH" != "arm64" && "$ARCH" != "x64" ]]; then
    echo -e "${RED}Error: Unsupported architecture: $ARCH${NC}"
    echo "Supported architectures: arm64, x64"
    exit 1
fi

echo -e "${BLUE}Platform: ${PLATFORM}-${ARCH}${NC}"

# Get latest release tag
echo -e "${BLUE}Fetching latest release...${NC}"
LATEST_TAG=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')

if [[ -z "$LATEST_TAG" ]]; then
    echo -e "${RED}Error: Could not fetch latest release.${NC}"
    echo "Falling back to main branch..."
    DOWNLOAD_BASE="https://github.com/$REPO/raw/main/dist"
else
    echo -e "${GREEN}Latest release: $LATEST_TAG${NC}"
    DOWNLOAD_BASE="https://github.com/$REPO/releases/download/$LATEST_TAG"
fi

# Create temp directory
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

# Download binaries
echo ""
echo -e "${BLUE}Downloading board-cli-${PLATFORM}-${ARCH}...${NC}"
curl -fSL "$DOWNLOAD_BASE/board-cli-${PLATFORM}-${ARCH}" -o "$TMP_DIR/board-cli" --progress-bar

echo -e "${BLUE}Downloading board-tui-${PLATFORM}-${ARCH}...${NC}"
curl -fSL "$DOWNLOAD_BASE/board-tui-${PLATFORM}-${ARCH}" -o "$TMP_DIR/board-tui" --progress-bar

# Make executable
chmod +x "$TMP_DIR/board-cli" "$TMP_DIR/board-tui"

# Install (may need sudo)
echo ""
echo -e "${BLUE}Installing to $INSTALL_DIR...${NC}"

if [[ -w "$INSTALL_DIR" ]]; then
    mv "$TMP_DIR/board-cli" "$INSTALL_DIR/board"
    mv "$TMP_DIR/board-tui" "$INSTALL_DIR/board-tui"
else
    echo "Requires sudo to install to $INSTALL_DIR"
    sudo mv "$TMP_DIR/board-cli" "$INSTALL_DIR/board"
    sudo mv "$TMP_DIR/board-tui" "$INSTALL_DIR/board-tui"
fi

# Verify installation
echo ""
if command -v board &> /dev/null; then
    VERSION=$(board --version 2>/dev/null || echo "unknown")
    echo -e "${GREEN}Successfully installed!${NC}"
    echo ""
    echo "  board     -> $INSTALL_DIR/board (v$VERSION)"
    echo "  board-tui -> $INSTALL_DIR/board-tui"
    echo ""
    echo -e "${BLUE}Usage:${NC}"
    echo "  board --help           # CLI help"
    if [[ "$PLATFORM" == "darwin" ]]; then
        echo "  TMPDIR=/tmp board-tui  # Launch TUI (macOS workaround)"
        echo ""
        echo -e "${BLUE}Recommended alias (add to ~/.zshrc):${NC}"
        echo "  alias trak='TMPDIR=/tmp board-tui'"
    else
        echo "  board-tui              # Launch TUI"
        echo ""
        echo -e "${BLUE}Recommended alias (add to ~/.bashrc):${NC}"
        echo "  alias trak='board-tui'"
    fi
else
    echo -e "${RED}Installation may have failed. Check $INSTALL_DIR${NC}"
    exit 1
fi
