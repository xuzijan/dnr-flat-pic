@echo off
setlocal

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not installed or is not available on PATH. Install the current Node.js LTS from https://nodejs.org/en/download. 1>&2
  exit /b 10
)

set "NODE_VERSION="
for /f "delims=" %%V in ('node --version 2^>nul') do set "NODE_VERSION=%%V"
if not defined NODE_VERSION (
  echo Node.js was found, but its version could not be read. 1>&2
  exit /b 11
)

set "NODE_MAJOR=%NODE_VERSION:v=%"
for /f "tokens=1 delims=." %%M in ("%NODE_MAJOR%") do set "NODE_MAJOR=%%M"
set /a NODE_MAJOR_NUMBER=%NODE_MAJOR% >nul 2>&1
if errorlevel 1 (
  echo Unrecognized Node.js version: %NODE_VERSION% 1>&2
  exit /b 11
)

if %NODE_MAJOR_NUMBER% LSS 16 (
  echo Node.js 16 or newer is required; found %NODE_VERSION%. Install the current Node.js LTS from https://nodejs.org/en/download. 1>&2
  exit /b 12
)

if not exist "%~dp0..\runtime\vtracer-config.json" (
  echo DnR FlatPic v2.0 runtime configuration is missing. Reinstall or update the Skill. 1>&2
  exit /b 13
)
if not exist "%~dp0..\runtime\node_modules\@visioncortex\vtracer\index.js" (
  echo Bundled VTracer module is missing. Reinstall or update the Skill. 1>&2
  exit /b 13
)
if not exist "%~dp0..\runtime\node_modules\@resvg\resvg-wasm\index.mjs" (
  echo Bundled resvg-wasm module is missing. Reinstall or update the Skill. 1>&2
  exit /b 13
)
if not exist "%~dp0..\runtime\node_modules\@resvg\resvg-wasm\index_bg.wasm" (
  echo Bundled resvg-wasm binary is missing. Reinstall or update the Skill. 1>&2
  exit /b 13
)

echo DnR FlatPic v2.0 environment ready: %NODE_VERSION%
exit /b 0
