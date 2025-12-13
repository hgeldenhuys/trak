#!/bin/bash
# =============================================================================
# Install ADO Hooks
# =============================================================================
# Helper script to install ADO integration hooks into the trak hook directory.
#
# Usage:
#   ./install-hooks.sh              # Install to default location (~/.trak/hooks)
#   ./install-hooks.sh /custom/path # Install to custom location
#   ./install-hooks.sh --uninstall  # Remove installed hooks
#   ./install-hooks.sh --list       # List currently installed hooks
#
# The script:
#   1. Creates the hook directory if it doesn't exist
#   2. Copies hook scripts from this directory
#   3. Makes them executable
#   4. Verifies the installation
#
# =============================================================================

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_HOOK_DIR="${HOME}/.trak/hooks"

# Hook files to install
HOOKS=(
  "story-status-changed.sh"
  "story-created.sh"
  "task-status-changed.sh"
)

# =============================================================================
# Functions
# =============================================================================

print_usage() {
  echo "Usage: $0 [OPTIONS] [HOOK_DIR]"
  echo ""
  echo "Install ADO integration hooks for trak."
  echo ""
  echo "Arguments:"
  echo "  HOOK_DIR          Target directory for hooks (default: ~/.trak/hooks)"
  echo ""
  echo "Options:"
  echo "  -h, --help        Show this help message"
  echo "  -u, --uninstall   Remove installed hooks"
  echo "  -l, --list        List currently installed hooks"
  echo "  -f, --force       Overwrite existing hooks without prompting"
  echo "  -v, --verbose     Enable verbose output"
  echo ""
  echo "Examples:"
  echo "  $0                          # Install to ~/.trak/hooks"
  echo "  $0 /path/to/hooks           # Install to custom directory"
  echo "  $0 --uninstall              # Remove hooks from ~/.trak/hooks"
  echo "  $0 --list                   # Show installed hooks"
}

log_info() {
  echo "[install] $1"
}

log_error() {
  echo "[install] ERROR: $1" >&2
}

log_verbose() {
  if [ "$VERBOSE" = "1" ]; then
    echo "[install] $1"
  fi
}

# Install hooks to target directory
install_hooks() {
  local target_dir="$1"
  local force="$2"

  log_info "Installing ADO hooks to: $target_dir"

  # Create target directory if needed
  if [ ! -d "$target_dir" ]; then
    log_verbose "Creating directory: $target_dir"
    mkdir -p "$target_dir"
  fi

  local installed=0
  local skipped=0

  for hook in "${HOOKS[@]}"; do
    local source="${SCRIPT_DIR}/${hook}"
    local target="${target_dir}/${hook}"

    # Check if source exists
    if [ ! -f "$source" ]; then
      log_error "Source hook not found: $source"
      continue
    fi

    # Check if target exists
    if [ -f "$target" ] && [ "$force" != "1" ]; then
      # Compare files
      if cmp -s "$source" "$target"; then
        log_verbose "Hook already installed (identical): $hook"
        ((skipped++))
        continue
      else
        echo -n "Hook '$hook' exists and differs. Overwrite? [y/N] "
        read -r response
        if [[ ! "$response" =~ ^[Yy] ]]; then
          log_verbose "Skipping: $hook"
          ((skipped++))
          continue
        fi
      fi
    fi

    # Copy and make executable
    log_verbose "Installing: $hook"
    cp "$source" "$target"
    chmod +x "$target"
    ((installed++))
  done

  echo ""
  log_info "Installation complete:"
  log_info "  Installed: $installed hooks"
  log_info "  Skipped:   $skipped hooks"
  echo ""

  # Show next steps
  if [ "$installed" -gt 0 ]; then
    echo "Next steps:"
    echo "  1. Start the ADO daemon:"
    echo "     echo \$ADO_PAT | trak-ado --pat-stdin --org <org> --project <project>"
    echo ""
    echo "  2. Configure trak to use hooks (add to ~/.trak/config.yaml):"
    echo "     hooks:"
    echo "       directory: $target_dir"
    echo "       enabled: true"
    echo ""
    echo "  3. Link stories to ADO work items:"
    echo "     board story update STORY-001 --extension adoWorkItemId=12345"
    echo ""
  fi
}

# Uninstall hooks from target directory
uninstall_hooks() {
  local target_dir="$1"

  log_info "Removing ADO hooks from: $target_dir"

  if [ ! -d "$target_dir" ]; then
    log_error "Hook directory does not exist: $target_dir"
    exit 1
  fi

  local removed=0

  for hook in "${HOOKS[@]}"; do
    local target="${target_dir}/${hook}"

    if [ -f "$target" ]; then
      log_verbose "Removing: $hook"
      rm "$target"
      ((removed++))
    fi
  done

  log_info "Removed $removed hooks"
}

# List installed hooks
list_hooks() {
  local target_dir="$1"

  echo "Hook directory: $target_dir"
  echo ""

  if [ ! -d "$target_dir" ]; then
    echo "Directory does not exist"
    return
  fi

  echo "Installed ADO hooks:"
  for hook in "${HOOKS[@]}"; do
    local target="${target_dir}/${hook}"
    if [ -f "$target" ]; then
      local size=$(wc -c < "$target" | tr -d ' ')
      local modified=$(stat -f "%Sm" -t "%Y-%m-%d %H:%M" "$target" 2>/dev/null || stat -c "%y" "$target" 2>/dev/null | cut -d' ' -f1-2)
      printf "  [x] %-30s %6s bytes  %s\n" "$hook" "$size" "$modified"
    else
      printf "  [ ] %-30s (not installed)\n" "$hook"
    fi
  done

  echo ""
  echo "Other hooks in directory:"
  local other_hooks=$(ls "$target_dir"/*.sh 2>/dev/null | while read -r f; do
    basename "$f"
  done | grep -v -F "$(printf '%s\n' "${HOOKS[@]}")" || true)

  if [ -n "$other_hooks" ]; then
    echo "$other_hooks" | while read -r hook; do
      echo "  - $hook"
    done
  else
    echo "  (none)"
  fi
}

# Verify installation
verify_installation() {
  local target_dir="$1"
  local errors=0

  echo "Verifying installation..."
  echo ""

  for hook in "${HOOKS[@]}"; do
    local target="${target_dir}/${hook}"

    printf "  %-30s " "$hook"

    if [ ! -f "$target" ]; then
      echo "MISSING"
      ((errors++))
      continue
    fi

    if [ ! -x "$target" ]; then
      echo "NOT EXECUTABLE"
      ((errors++))
      continue
    fi

    # Check for required commands (jq, curl)
    if ! head -50 "$target" | grep -q "jq"; then
      echo "OK"
    else
      echo "OK (requires jq)"
    fi
  done

  echo ""

  # Check for jq
  if ! command -v jq &>/dev/null; then
    log_error "jq is required but not installed"
    echo "  Install with: brew install jq (macOS) or apt install jq (Linux)"
    ((errors++))
  fi

  # Check for curl
  if ! command -v curl &>/dev/null; then
    log_error "curl is required but not installed"
    ((errors++))
  fi

  if [ "$errors" -gt 0 ]; then
    echo ""
    log_error "Verification found $errors issue(s)"
    return 1
  fi

  echo "All checks passed"
  return 0
}

# =============================================================================
# Main Script
# =============================================================================

# Parse arguments
HOOK_DIR="$DEFAULT_HOOK_DIR"
ACTION="install"
FORCE="0"
VERBOSE="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      print_usage
      exit 0
      ;;
    -u|--uninstall)
      ACTION="uninstall"
      shift
      ;;
    -l|--list)
      ACTION="list"
      shift
      ;;
    -f|--force)
      FORCE="1"
      shift
      ;;
    -v|--verbose)
      VERBOSE="1"
      shift
      ;;
    -*)
      log_error "Unknown option: $1"
      print_usage
      exit 1
      ;;
    *)
      HOOK_DIR="$1"
      shift
      ;;
  esac
done

# Execute action
case "$ACTION" in
  install)
    install_hooks "$HOOK_DIR" "$FORCE"
    verify_installation "$HOOK_DIR"
    ;;
  uninstall)
    uninstall_hooks "$HOOK_DIR"
    ;;
  list)
    list_hooks "$HOOK_DIR"
    ;;
esac
