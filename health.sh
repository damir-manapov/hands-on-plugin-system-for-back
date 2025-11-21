#!/bin/bash

set -e

echo "Checking for outdated dependencies..."
if pnpm outdated --format=table 2>/dev/null | grep -q "."; then
  echo "Error: Outdated dependencies found"
  pnpm outdated --format=table
  exit 1
fi

echo "Checking for vulnerabilities..."
if ! pnpm audit --audit-level=moderate >/dev/null 2>&1; then
  echo "Error: Vulnerabilities found"
  pnpm audit --audit-level=moderate
  exit 1
fi

echo "All dependencies are up to date and secure!"

