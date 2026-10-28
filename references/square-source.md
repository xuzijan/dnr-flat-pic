# Square Icon-Source Workflow

Read this file only for `poster`, `icon_svg`, or `all` after an accepted FlatPic exists.

## Purpose

`square-icon-source.png` is a new 1:1 FlatPic composition when the accepted FlatPic is not already a qualified square. It is not a crop, stretch, letterbox, or post-trace repair. It is the one shared PNG source for the poster lower image and the square SVG icon.

## Reuse gate

Reuse the accepted FlatPic only when all conditions pass:

- the raster is exactly 1:1, preferably 1024×1024;
- the subject and its connected parts are not stretched or cropped;
- the composition reaches the canvas edges without a border or pre-rendered rounded mask;
- the existing FlatPic four-part visual validation passes;
- the subject, identity anchors, depth order, and key relationship remain legible at 64×64;
- no gradient, glow, blur, transparency, photographic texture, text, logo, watermark, or unrelated detail system remains.

If any condition fails, do not crop it into a square. Start the square-source generation path.

## Generation contract

Generate one 1024×1024 FlatPic square from the original photograph. Reuse the accepted FlatPic's internal semantic brief, identity anchors, layer order, and fixed HSB palette roles as constraints, but do not treat the non-square raster as a crop target.

Follow `../references/aspect-ratio-adaptation.md`: preserve the primary semantic system and connected proportions; extend or contract surrounding flat planes and negative space; reposition subordinate systems without independently scaling connected parts; delete, group, demote, or simplify low-value details; fill all edges with crisp flat shapes.

The square prompt must keep the original FlatPic rendering contract. Do not copy the full `dnr-icon-maker` prompt or replace FlatPic's palette and complexity rules with a different icon style. The original photograph is the visual identity reference; the accepted FlatPic supplies the already-decided semantic plan.

Do not add a matte, frame, letterbox, pillarbox, rounded mask, gradient, soft lighting, glow, blur, texture, text, logo, or invented object. The rounded shape is applied later by the poster or SVG wrapper.

## Review protocol

Review the candidate at native size and 64×64. Apply the complete FlatPic checklist from `../SKILL.md`:

1. recognition and source-specific composition;
2. semantic complexity budget;
3. hard flat-color compliance;
4. source cleanup.

Then apply square-specific checks:

- exactly 1:1, preferably 1024×1024;
- no non-uniform deformation;
- no critical identity anchor cropped or displaced;
- primary silhouette and connected parts remain proportionally coherent;
- foreground/midground/background ordering remains clear;
- full canvas is filled with crisp flat fields;
- no pre-rounded corners or border;
- 64×64 remains recognizable.

## Retry limit

The square-source request has its own call state:

`not_started -> generating -> artifact_received -> reviewing -> accepted | one_quality_retry -> accepted | failed`

Call the image model once by default. Make at most one follow-up only when the formal review fails. Append only the failed-item correction to the original square prompt and regenerate from the original photograph. Do not make a third call.

Missing stdout, failed display, or an unrecovered output path is not a quality failure. Recover the existing artifact first. If no artifact exists after recovery, report the technical failure and stop.

If the second candidate still fails, do not run `trace-svg.mjs --mode icon` and do not run the poster renderer. A separately valid original-ratio FlatPic may still be processed by `source_svg`.

## Artifact pairing

Retain the following pairing for downstream actions:

```text
original_photo -> accepted_flatpic -> accepted_square_source (optional)
```

If a required original photo or accepted PNG cannot be recovered from the current task, ask the user to attach it again. Never substitute a preview screenshot or a guessed path.
