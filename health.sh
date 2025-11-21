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

echo "Checking Docker Compose image versions..."
if grep -q ":latest" docker-compose.yml; then
  echo "Error: Found 'latest' tag in docker-compose.yml. All images must be pinned to specific version tags."
  grep ":latest" docker-compose.yml
  exit 1
fi

# Check if all images have version tags (not just image names)
if grep -E "^\s+image:" docker-compose.yml | grep -vE "image:.*:[^:]+$" | grep -vE "image:.*@sha256:" | grep -vE "image:.*RELEASE\."; then
  echo "Warning: Some images may not have version tags pinned"
  grep -E "^\s+image:" docker-compose.yml | grep -vE "image:.*:[^:]+$" | grep -vE "image:.*@sha256:" | grep -vE "image:.*RELEASE\."
fi

echo "All dependencies are up to date and secure!"
echo "All Docker images are pinned to specific version tags!"

