#!/usr/bin/env bash
# Links ~/.local/bin/agentroles to this checkout after a frozen dependency
# install, and records the deployed SHA. Called by AgentStart's
# install-agent-clis; safe to rerun. --uninstall removes only a link that
# points into this checkout.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
SOURCE="$ROOT/src/main.ts"
BIN_DIR="${AGENTROLES_INSTALL_BIN_DIR:-$HOME/.local/bin}"
STATE_DIR="${AGENTROLES_INSTALL_STATE_DIR:-$HOME/.local/state/agentroles}"
TARGET="$BIN_DIR/agentroles"

die() { printf 'agentroles installer: %s\n' "$*" >&2; exit 1; }

case "${1:---install}" in
  --install)
    command -v bun >/dev/null || die "bun is required"
    [ -f "$SOURCE" ] || die "missing $SOURCE"
    (cd "$ROOT" && bun install --frozen-lockfile >/dev/null) || die "bun install --frozen-lockfile failed"
    mkdir -p "$BIN_DIR" "$STATE_DIR"
    if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
      [ -L "$TARGET" ] || die "refusing to replace a non-link at $TARGET"
      case "$(readlink "$TARGET")" in
        "$ROOT"/*) ;;
        *) die "refusing to replace a link owned by another checkout: $TARGET -> $(readlink "$TARGET")" ;;
      esac
    fi
    ln -sfn "$SOURCE" "$TARGET"
    chmod +x "$SOURCE"
    git -C "$ROOT" rev-parse HEAD > "$STATE_DIR/deployed-sha"
    printf 'Installed %s -> %s\n' "$TARGET" "$SOURCE"
    ;;
  --uninstall)
    if [ -L "$TARGET" ]; then
      case "$(readlink "$TARGET")" in
        "$ROOT"/*) rm -f "$TARGET"; rm -f "$STATE_DIR/deployed-sha"; printf 'Removed %s\n' "$TARGET" ;;
        *) die "not removing a link owned by another checkout: $TARGET" ;;
      esac
    else
      printf 'Nothing installed at %s\n' "$TARGET"
    fi
    ;;
  --help|-h)
    printf 'Usage: scripts/install.sh [--install|--uninstall]\n'
    ;;
  *) die "unknown option $1" ;;
esac
