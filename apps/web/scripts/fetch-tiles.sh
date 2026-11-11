#!/usr/bin/env bash
# Cuts the tiles' bounds out of a pinned Protomaps daily build of OpenStreetMap, zooms 0-15 (about 9.7 MB), into
# public/tiles/inner-west.pmtiles (git-ignored). Needs the pmtiles CLI: https://github.com/protomaps/go-pmtiles
set -euo pipefail
cd "$(dirname "$0")/.."

BUILD=https://build.protomaps.com/20261108.pmtiles
BBOX=$(node -p "require('@iwb/shared/data/council.json').tileBounds.join(',')")

if ! curl --silent --fail --head "$BUILD" >/dev/null; then
  echo "$BUILD is no longer available: bump the pinned build to a recent date listed at https://maps.protomaps.com/builds/" >&2
  exit 1
fi
mkdir -p public/tiles
pmtiles extract "$BUILD" public/tiles/inner-west.pmtiles --bbox="$BBOX" --maxzoom=15 --quiet
