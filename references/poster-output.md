# Poster Output Workflow

Read this file only for `poster` or `all` after the required artifacts and Node check are complete.

## Fixed output

The canonical output is a `900×1200` PNG. The layout comes from the Figwright-selected `xhs-mockup` component (`Page 1`, node `496:624`) and is stored in `../assets/poster-layout.json`.

```text
canvas: 900×1200
photo:  x=0,   y=0,   w=900, h=600, xMidYMid slice
lower:  x=0,   y=600, w=900, h=600, fill=#F5F2EB
icon:   x=290, y=740, w=320, h=320, source=square-icon-source.png
```

There is no title, caption, logo, watermark, shadow, stroke, or extra decoration.

## Required source behavior

- The upper image is the original user photograph, not the FlatPic.
- The lower image is the accepted `square-icon-source.png`, not an SVG and not a crop of a non-square FlatPic.
- Both images are embedded into a self-contained SVG as Base64 data URIs.
- Preserve the source MIME type where possible: JPG remains `image/jpeg`; PNG remains `image/png`.
- Use `xMidYMid slice` for the upper photo. Never stretch it.
- Apply the one continuous iOS-like path from `../assets/ios-continuous-rounded-square.svg` as the lower icon clip. The PNG itself remains square and unrounded.

## Rendering

Run:

```text
node scripts/render-poster.mjs --photo <original-photo> --square-source-png <square-icon-source.png> --output <poster.png>
```

The script must construct the SVG deterministically, then rasterize it with `@resvg/resvg-wasm`. Do not use Figma, browser screenshots, HTML/CSS layout, `sharp`, or a model-generated poster.

The renderer must initialize resvg-wasm exactly once per process:

1. read `runtime/node_modules/@resvg/resvg-wasm/index_bg.wasm`;
2. call `initWasm(...)` through one shared Promise;
3. await that Promise;
4. construct `Resvg` and render;
5. free the rendered resource when the API exposes `free()`.

Do not call `initWasm` once per image or once per mode. The `all` path must reuse the same Promise.

## Failure handling

- Check Node and bundled files before any square-source generation or rendering.
- If Node is missing or too old, stop and show the standard Node.js LTS installation prompt.
- If a source path is missing, ask for the original photo or accepted PNG again.
- If rendering fails, do not regenerate the image model output; report the renderer error.
- Keep the accepted square PNG even when the poster render fails, so the user can retry the derived action.

## Verification

The final PNG must be exactly `900×1200`. Verify:

- top/bottom boundary at `y=600`;
- lower fill `#F5F2EB`;
- icon bounds exactly `(290,740,320,320)`;
- the top image is centered `cover`;
- EXIF-oriented phone JPEGs render upright; if the renderer does not honor EXIF, add a tested pre-normalization step rather than silently accepting a rotated result;
- all four icon corners remain curved and no foreground pixels flatten them.
