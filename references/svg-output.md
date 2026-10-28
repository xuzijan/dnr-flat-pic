# SVG Output Workflow

Read this file only for `icon_svg`, `source_svg`, or `all` after the required artifacts and Node check are complete.

## Closed modes

The script must require an explicit mode. A missing or unknown mode is an error.

### `icon_svg`

Input: accepted `square-icon-source.png`. If the accepted FlatPic is not a qualified square, complete `square-source.md` first.

Output: `*-icon.svg`, a 1024×1024 SVG using VTracer paths and the shared continuous iOS-like rounded-square clip.

### `source_svg`

Input: accepted FlatPic PNG at its existing ratio.

Output: `*-flat.svg`, a native-ratio VTracer SVG with the original `viewBox`. It does not generate a square source, crop, stretch, or add a rounded wrapper.

## VTracer contract

Both modes must import the same `../runtime/vtracer-config.json` and the same pinned `@visioncortex/vtracer` package. The configuration is not selected by the Agent and must not be duplicated in this reference.

```text
clustering=color-cluster
hierarchical=stacked
mode=spline
layerDifference=32
filterSpeckle=10
colorPrecision=7
cornerThreshold=30
lengthThreshold=4
maxColors=24
simplify=2.5
pathPrecision=2
optimize=2
maxIterations=10
spliceThreshold=0
palette=omitted
```

Use one VTracer pass per distinct input. If `all` uses the same square PNG for the poster icon and icon SVG, trace it once and reuse the result. Do not import or call the DNR Doodicon backend.

## Input rules

- Prefer the accepted original PNG, never a screenshot or a lossy preview.
- For `icon_svg`, assert PNG dimensions are exactly 1:1 before calling VTracer. Reject non-square input instead of scaling it non-uniformly.
- For `source_svg`, preserve VTracer's original width, height, and `viewBox`.
- VTracer only converts existing pixels into paths. It cannot restore identity cues or structure removed by image generation.

## Icon wrapper

`icon_svg` wraps the raw trace in 1024×1024 coordinates using the single path from `../assets/ios-continuous-rounded-square.svg`:

```text
M208 0 C114 0 48 26 18 84 C6 108 0 140 0 208 V816 C0 884 6 916 18 940 C48 998 114 1024 208 1024 H816 C910 1024 976 998 1006 940 C1018 916 1024 884 1024 816 V208 C1024 140 1018 108 1006 84 C976 26 910 0 816 0 Z
```

Use the same path for the background boundary when a background fill is required and for the `clipPath` containing all foreground paths. Do not replace it with a plain `rx` rectangle. Do not send the wrapped SVG through DNR Doodicon sanitization.

## SVG verification

- XML is parseable;
- `icon_svg` is 1024×1024 and all four corners use the shared continuous path;
- `source_svg` retains its input aspect ratio and has no rounded wrapper;
- the deliverable contains paths, not `<image>`;
- no gradients, filters, blur, or meaningless opacity are introduced;
- render previews at 512px and 64px and perform a visual check;
- do not perform semantic or geometry repair after tracing.

## Output paths

Use task-specific, non-overwriting paths:

```text
<stem>-flat.svg
<stem>-icon.svg
```

The accepted source PNGs remain the source of truth and may be retained alongside outputs, but rejected candidates and temporary previews are not release assets.
