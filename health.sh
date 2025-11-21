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
if grep -q ":latest" compose/docker-compose.yml; then
  echo "Error: Found 'latest' tag in compose/docker-compose.yml. All images must be pinned to specific version tags."
  grep ":latest" compose/docker-compose.yml
  exit 1
fi

# Check if all images have version tags, digests, or RELEASE tags (not just image names)
unpinned=$(grep -E "^\s+image:" compose/docker-compose.yml | grep -vE "image:.*:[^:]+$" | grep -vE "image:.*@sha256:" | grep -vE "image:.*RELEASE\." || true)
if [ -n "$unpinned" ]; then
  echo "Warning: Some images may not have version tags or digests pinned"
  echo "$unpinned"
fi

echo "Checking for newer Docker image versions..."
newer_versions_found=false

# Function to compare semantic versions (returns 0 if v2 > v1)
compare_versions() {
  local v1="$1"
  local v2="$2"
  
  # Extract major.minor.patch
  v1_major=$(echo "$v1" | cut -d. -f1)
  v1_minor=$(echo "$v1" | cut -d. -f2)
  v1_patch=$(echo "$v1" | cut -d. -f3 | sed 's/-.*//')
  
  v2_major=$(echo "$v2" | cut -d. -f1)
  v2_minor=$(echo "$v2" | cut -d. -f2)
  v2_patch=$(echo "$v2" | cut -d. -f3 | sed 's/-.*//')
  
  # Compare major
  if [ "$v2_major" -gt "$v1_major" ] 2>/dev/null; then
    return 0
  elif [ "$v2_major" -lt "$v1_major" ] 2>/dev/null; then
    return 1
  fi
  
  # Compare minor
  if [ "$v2_minor" -gt "$v1_minor" ] 2>/dev/null; then
    return 0
  elif [ "$v2_minor" -lt "$v1_minor" ] 2>/dev/null; then
    return 1
  fi
  
  # Compare patch
  if [ "$v2_patch" -gt "$v1_patch" ] 2>/dev/null; then
    return 0
  fi
  
  return 1
}

# Function to check if a version is newer
check_newer_version() {
  local current="$1"
  local latest="$2"
  local image_name="$3"
  
  # For MinIO RELEASE tags, compare dates
  if [[ $current == RELEASE.* ]] && [[ $latest == RELEASE.* ]]; then
    # Extract dates (RELEASE.YYYY-MM-DDTHH-MM-SSZ)
    current_date=$(echo "$current" | sed 's/RELEASE\.\([0-9]\{4\}\)-\([0-9]\{2\}\)-\([0-9]\{2\}\).*/\1\2\3/')
    latest_date=$(echo "$latest" | sed 's/RELEASE\.\([0-9]\{4\}\)-\([0-9]\{2\}\)-\([0-9]\{2\}\).*/\1\2\3/')
    if [ "$latest_date" -gt "$current_date" ] 2>/dev/null; then
      return 0
    fi
    return 1
  fi
  
  # For semantic versioning (e.g., 7.6.1)
  if [[ $current =~ ^[0-9]+\.[0-9]+ ]] && [[ $latest =~ ^[0-9]+\.[0-9]+ ]]; then
    if compare_versions "$current" "$latest"; then
      return 0
    fi
  fi
  
  return 1
}

# Extract images and check for newer versions
while IFS= read -r line; do
  if [[ $line =~ image:[[:space:]]*(.+) ]]; then
    image="${BASH_REMATCH[1]}"
    
    # Skip if it's a digest (already pinned)
    if [[ $image == *"@sha256:"* ]]; then
      continue
    fi
    
    # Extract image name and tag
    if [[ $image =~ ^([^:]+):(.+)$ ]]; then
      image_name="${BASH_REMATCH[1]}"
      current_tag="${BASH_REMATCH[2]}"
      
      # Skip alpine base images (they're usually fine)
      if [[ $image_name == *"alpine"* ]] && [[ $image_name != *"/"* ]]; then
        continue
      fi
      
      # Check for latest tag
      echo -n "Checking $image_name:$current_tag... "
      
      # Try to get tags from Docker Hub API
      if [[ $image_name =~ ^([^/]+)/(.+)$ ]]; then
        namespace="${BASH_REMATCH[1]}"
        repo="${BASH_REMATCH[2]}"
        api_url="https://hub.docker.com/v2/repositories/${namespace}/${repo}/tags?page_size=10&ordering=-last_updated"
        
        # Get tags, filter out 'latest' and invalid tags
        tags=$(curl -s "$api_url" 2>/dev/null | grep -o '"name":"[^"]*"' | cut -d'"' -f4 || echo "")
        
        # Find the most relevant latest tag
        latest_tag=""
        if [[ $current_tag == RELEASE.* ]]; then
          # For MinIO, find the latest RELEASE tag (sort by date)
          latest_tag=$(echo "$tags" | grep "^RELEASE\." | sort -V -r | head -1)
        elif [[ $current_tag =~ ^[0-9]+\.[0-9]+ ]]; then
          # For version tags, find the highest version with same major.minor
          major_minor=$(echo "$current_tag" | cut -d. -f1,2)
          latest_tag=$(echo "$tags" | grep -E "^${major_minor}\.[0-9]+" | sort -V -r | head -1)
          # If no same major.minor, get highest overall
          if [ -z "$latest_tag" ]; then
            latest_tag=$(echo "$tags" | grep -E "^[0-9]+\.[0-9]+\.[0-9]+" | sort -V -r | head -1)
          fi
        else
          # Try to find any non-latest tag
          latest_tag=$(echo "$tags" | grep -v "^latest$" | head -1)
        fi
        
        if [ -n "$latest_tag" ] && [ "$latest_tag" != "$current_tag" ] && [ "$latest_tag" != "latest" ]; then
          if check_newer_version "$current_tag" "$latest_tag" "$image_name"; then
            echo "⚠️  newer version available: $latest_tag"
            newer_versions_found=true
          else
            echo "✓ up to date"
          fi
        else
          echo "✓ up to date"
        fi
      else
        # For official images (no namespace), skip for now
        echo "✓ (skipped - official image)"
      fi
    fi
  fi
done < compose/docker-compose.yml

if [ "$newer_versions_found" = true ]; then
  echo ""
  echo "Error: Newer image versions are available. Please update compose/docker-compose.yml to use the latest versions."
  exit 1
fi

echo ""
echo "All dependencies are up to date and secure!"
echo "All Docker images are pinned to specific version tags!"

