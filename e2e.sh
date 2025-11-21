#!/bin/bash

set -e

echo "E2E Tests"
echo "=========="
echo ""

COMPOSE_FILE="compose/docker-compose.yml"

# Check if Docker services are running
echo "Checking Docker services..."
if ! docker compose -f "$COMPOSE_FILE" ps 2>/dev/null | grep -q "Up"; then
  echo "Docker services are not running."
  echo "Starting services..."
  if ! pnpm run compose:up; then
    echo "Error: Failed to start Docker services."
    exit 1
  fi
  
  echo ""
  echo "Waiting for all services to be ready..."
  # Wait for starter service to complete (which waits for all services)
  if ! docker compose -f "$COMPOSE_FILE" up starter; then
    echo "Error: Services failed to start or become ready."
    echo "Check service status with: docker compose -f $COMPOSE_FILE ps"
    echo "Check service logs with: docker compose -f $COMPOSE_FILE logs"
    exit 1
  fi
  
  # Check again
  if ! docker compose -f "$COMPOSE_FILE" ps 2>/dev/null | grep -q "Up"; then
    echo "Error: Services failed to start properly."
    echo "Check service status with: docker compose -f $COMPOSE_FILE ps"
    exit 1
  fi
fi

# Check service health (optional, using basic check)
echo "Verifying services are running..."
running_count=$(docker compose -f "$COMPOSE_FILE" ps --format json 2>/dev/null | grep -c '"State":"running"' || echo "0")
if [ "$running_count" -eq "0" ]; then
  echo "Error: No services are running."
  exit 1
fi

echo "Found $running_count service(s) running."

echo ""
echo "Running e2e tests..."
echo ""

# Run e2e tests
pnpm test:e2e

echo ""
echo "E2E tests completed successfully!"

