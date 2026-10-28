[CmdletBinding()]
param(
    [string]$OutputPath = "release/skill.zip"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$outputPathValue = if ([System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath
} else {
    Join-Path $repoRoot $OutputPath
}
$outputFile = [System.IO.Path]::GetFullPath($outputPathValue)
$stageRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("dnr-flat-pic-v2-package-" + [guid]::NewGuid().ToString("N"))

$files = @(
    "SKILL.md",
    "README.md",
    "SUPPORT.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "licenses/MPL-2.0.txt",
    "agents/openai.yaml",
    "assets/icon.svg",
    "assets/ios-continuous-rounded-square.svg",
    "assets/poster-layout.json",
    "references/generation-spec.md",
    "references/semantic-complexity.md",
    "references/aspect-ratio-adaptation.md",
    "references/examples-and-failures.md",
    "references/square-source.md",
    "references/poster-output.md",
    "references/svg-output.md",
    "scripts/check-environment.cmd",
    "scripts/check-environment.sh",
    "scripts/lib/raster.mjs",
    "scripts/render-poster.mjs",
    "scripts/trace-svg.mjs",
    "scripts/verify-outputs.mjs",
    "runtime/package.json",
    "runtime/package-lock.json",
    "runtime/vtracer-config.json",
    "runtime/node_modules/@visioncortex/vtracer/package.json",
    "runtime/node_modules/@visioncortex/vtracer/README.md",
    "runtime/node_modules/@visioncortex/vtracer/index.js",
    "runtime/node_modules/@visioncortex/vtracer/index.d.ts",
    "runtime/node_modules/@visioncortex/vtracer/pkg/vtracer_wasm.js",
    "runtime/node_modules/@visioncortex/vtracer/pkg/vtracer_wasm.d.ts",
    "runtime/node_modules/@visioncortex/vtracer/pkg/vtracer_wasm_bg.wasm",
    "runtime/node_modules/@visioncortex/vtracer/pkg/vtracer_wasm_bg.wasm.d.ts",
    "runtime/node_modules/@resvg/resvg-wasm/package.json",
    "runtime/node_modules/@resvg/resvg-wasm/README.md",
    "runtime/node_modules/@resvg/resvg-wasm/index.js",
    "runtime/node_modules/@resvg/resvg-wasm/index.mjs",
    "runtime/node_modules/@resvg/resvg-wasm/index.min.js",
    "runtime/node_modules/@resvg/resvg-wasm/index.d.ts",
    "runtime/node_modules/@resvg/resvg-wasm/index_bg.wasm",
    "runtime/node_modules/@xmldom/xmldom/package.json",
    "runtime/node_modules/@xmldom/xmldom/LICENSE",
    "runtime/node_modules/@xmldom/xmldom/lib/conventions.js",
    "runtime/node_modules/@xmldom/xmldom/lib/dom-parser.js",
    "runtime/node_modules/@xmldom/xmldom/lib/dom.js",
    "runtime/node_modules/@xmldom/xmldom/lib/entities.js",
    "runtime/node_modules/@xmldom/xmldom/lib/errors.js",
    "runtime/node_modules/@xmldom/xmldom/lib/grammar.js",
    "runtime/node_modules/@xmldom/xmldom/lib/index.js",
    "runtime/node_modules/@xmldom/xmldom/lib/sax.js",
    "runtime/node_modules/jpeg-js/package.json",
    "runtime/node_modules/jpeg-js/LICENSE",
    "runtime/node_modules/jpeg-js/index.js",
    "runtime/node_modules/jpeg-js/lib/decoder.js",
    "runtime/node_modules/jpeg-js/lib/encoder.js",
    "docs/showcase/01-waterfront-bench.jpg",
    "docs/showcase/02-sunset-bridge.jpg",
    "docs/support/tip-alipay.png",
    "docs/support/tip-wechat.png"
)

$expectedEntries = $files | ForEach-Object { $_ -replace "\\", "/" }
$forbiddenPatterns = @(
    "(^|/)(node|node.exe|nodejs)(/|$)",
    "(^|/)npm(-|/)",
    "\.node$",
    "\.dylib$",
    "\.dll$",
    "\.so$",
    "\.zip$"
)

try {
    New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

    foreach ($relativePath in $files) {
        $sourcePath = Join-Path $repoRoot $relativePath
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            throw "Required v2.0 release file is missing: $relativePath"
        }
        $destinationPath = Join-Path $stageRoot $relativePath
        New-Item -ItemType Directory -Path (Split-Path $destinationPath -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
    }

    $config = Get-Content -Raw -LiteralPath (Join-Path $stageRoot "runtime/vtracer-config.json") | ConvertFrom-Json
    if ($config.layerDifference -ne 32) {
        throw "The v2.0 release must use layerDifference=32 only."
    }

    $outputDirectory = Split-Path $outputFile -Parent
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    if (Test-Path -LiteralPath $outputFile) {
        Remove-Item -LiteralPath $outputFile -Force
    }
    Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $outputFile -CompressionLevel Optimal

    Add-Type -AssemblyName System.IO.Compression
    $archive = [System.IO.Compression.ZipFile]::OpenRead($outputFile)
    try {
        $entryNames = @($archive.Entries | Where-Object { -not $_.FullName.EndsWith("/") } | ForEach-Object { $_.FullName -replace "\\", "/" })
        $missing = @($expectedEntries | Where-Object { $_ -notin $entryNames })
        $unexpected = @($entryNames | Where-Object { $_ -notin $expectedEntries })
        if ($missing.Count -gt 0) {
            throw "Release ZIP is missing entries: $($missing -join ', ')"
        }
        if ($unexpected.Count -gt 0) {
            throw "Release ZIP contains unexpected entries: $($unexpected -join ', ')"
        }
        $forbidden = @($entryNames | Where-Object { $name = $_; $forbiddenPatterns | Where-Object { $name -match $_ } })
        if ($forbidden.Count -gt 0) {
            throw "Release ZIP contains forbidden runtime or archive entries: $($forbidden -join ', ')"
        }
        if ($archive.GetEntry("SKILL.md") -eq $null) {
            throw "SKILL.md must be at the ZIP root."
        }
        if ($archive.GetEntry("docs/showcase/01-waterfront-bench.jpg") -eq $null -or $archive.GetEntry("docs/showcase/02-sunset-bridge.jpg") -eq $null) {
            throw "The release ZIP must contain exactly the two approved showcase files."
        }
        if ($archive.GetEntry("docs/showcase/03-brick-wall-bench.jpg") -ne $null -or $archive.GetEntry("docs/showcase/04-seaside-cable-car.jpg") -ne $null) {
            throw "Unapproved showcase file found in release ZIP."
        }
    }
    finally {
        $archive.Dispose()
    }

    $size = (Get-Item -LiteralPath $outputFile).Length
    if ($size -gt 3.5MB) {
        throw "Release ZIP exceeds the 3.5 MB hard limit: $size bytes."
    }
    if ($size -gt 3.0MB) {
        Write-Warning "Release ZIP exceeds the 3.0 MB warning threshold: $size bytes."
    }
    [pscustomobject]@{
        Version = "2.0.0"
        FullName = $outputFile
        Bytes = $size
        MiB = [math]::Round($size / 1MB, 3)
        Entries = $expectedEntries.Count
    }
}
finally {
    if (Test-Path -LiteralPath $stageRoot) {
        Remove-Item -LiteralPath $stageRoot -Recurse -Force
    }
}
