#!/bin/bash

set -e

echo "Running all checks..."
echo ""

./check.sh
echo ""
./e2e.sh

echo ""
./health.sh

echo ""
echo "All checks completed successfully!"

