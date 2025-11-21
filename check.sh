#!/bin/bash

set -e

echo "Running formatting..."
pnpm format

echo "Running lint..."
pnpm lint

echo "Running typecheck..."
pnpm typecheck

echo "Running gitleaks..."
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --source . --verbose
else
  echo "Warning: gitleaks not found, skipping..."
fi

echo "Running tests..."
pnpm test --run

echo "All checks passed!"

