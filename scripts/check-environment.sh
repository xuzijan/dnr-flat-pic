#!/usr/bin/env sh

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed or is not available on PATH. Install the current Node.js LTS from https://nodejs.org/en/download." >&2
  exit 10
fi

version_text=$(node --version 2>/dev/null)
if [ -z "$version_text" ]; then
  echo "Node.js was found, but its version could not be read." >&2
  exit 11
fi

major_version=${version_text#v}
major_version=${major_version%%.*}
case "$major_version" in
  ''|*[!0-9]*)
    echo "Unrecognized Node.js version: $version_text" >&2
    exit 11
    ;;
esac

if [ "$major_version" -lt 16 ]; then
  echo "Node.js 16 or newer is required; found $version_text. Install the current Node.js LTS from https://nodejs.org/en/download." >&2
  exit 12
fi

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
runtime_dir="$script_dir/../runtime"

if [ ! -f "$runtime_dir/vtracer-config.json" ] || \
   [ ! -f "$runtime_dir/node_modules/@visioncortex/vtracer/index.js" ] || \
   [ ! -f "$runtime_dir/node_modules/@resvg/resvg-wasm/index.mjs" ] || \
   [ ! -f "$runtime_dir/node_modules/@resvg/resvg-wasm/index_bg.wasm" ]; then
  echo "DnR FlatPic v2.0 runtime files are missing. Reinstall or update the Skill." >&2
  exit 13
fi

echo "DnR FlatPic v2.0 environment ready: $version_text"
exit 0
