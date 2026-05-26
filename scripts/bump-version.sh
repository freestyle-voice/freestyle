#!/bin/bash
set -euo pipefail

OLD_VERSION="${CRAFT_OLD_VERSION:-${1:-}}"
NEW_VERSION="${CRAFT_NEW_VERSION:-${2:-}}"

if [ -z "$NEW_VERSION" ]; then
  echo "Usage: $0 OLD_VERSION NEW_VERSION"
  exit 1
fi

echo "Bumping version from $OLD_VERSION to $NEW_VERSION"

# Bump the Electron app version
cd apps/electron
pnpm version "$NEW_VERSION" --no-git-tag-version
cd ../..

# Bump the CLI app version
cd apps/cli
pnpm version "$NEW_VERSION" --no-git-tag-version
cd ../..

echo "Version bump complete"
