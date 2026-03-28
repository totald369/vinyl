#!/usr/bin/env bash
# Cursor/IDE 터미널에 PATH가 비어 npm/node를 못 찾을 때 사용:
#   bash scripts/npm.sh install
#   bash scripts/npm.sh run dev
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.volta/bin:${PATH:-}"
if [[ -s "${HOME}/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "${HOME}/.nvm/nvm.sh"
fi
cd "$ROOT"
if [[ -f ".nvmrc" ]] && [[ "$(type -t nvm 2>/dev/null || true)" == function ]]; then
  nvm use --silent 2>/dev/null || true
fi
if ! command -v npm &>/dev/null; then
  echo "npm 을 찾을 수 없습니다. 다음 중 하나를 설치하세요:"
  echo "  - https://nodejs.org/ LTS 설치"
  echo "  - brew install node"
  echo "  - https://github.com/nvm-sh/nvm#installing-and-updating"
  exit 127
fi
exec npm "$@"
