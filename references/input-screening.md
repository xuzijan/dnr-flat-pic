# Input Image Screening

Use this gate before creating FlatPic images for an object-level layer dataset. It is a dataset-selection rule, not part of the visual rendering style.

## Acceptance target

- Estimate 3–6 semantic entities total, including one coherent background/environment region.
- Require at least two independently meaningful foreground or midground objects in addition to the background.
- Require at least one clear relation between different objects: support, holding, stacking, or occlusion.
- Prefer a strong focal subject, a small number of supporting objects, moderate depth, and enough negative space to distinguish silhouettes.
- Prefer moderate lighting complexity: a few gradients or shadows in the source are useful; many reflective surfaces and tiny highlights are not.
- Require a complete primary object or figure. Close-up heads, cropped torsos, isolated bicycle bells, handlebars, engine fragments, and other partial objects are rejected even when their internal parts can be named.
- Keep accepted background clutter at level 1–2 on a 1–5 scale. Level 3 requires manual review; levels 4–5 are rejected. A busy shop, market stall, shelf wall, or crowd cannot be treated as a single harmless background layer without a deliberate crop or grouping plan.

## Counting rules

- Count complete physical objects or coherent repeated groups, not their internal parts.
- A bicycle is one entity; its frame, wheels, spokes, handlebars, cables, and reflections stay inside it.
- A flower is one entity; petals, leaves attached to the same plant, and the flower center are internal structure unless the task explicitly labels plant parts separately.
- Adjacent bread slices may be grouped as one serving when they form a single stack or arrangement. A separate plate, jam bowl, knife, or cutting board may be its own entity when its silhouette and relation are clear.
- Background regions count as one layer when they form a coherent field. Do not count shadows, reflections, texture, or color patches as objects.
- Overlap between parts of one object is not an object-level relation.

## Decisions

- `accept`: all target criteria pass without major cropping or semantic restructuring.
- `review`: the source may pass after a crop or a deliberate grouping choice; inspect it manually.
- `reject`: fewer than two independent foreground/midground objects, more than six likely layers after reasonable grouping, no useful object relation, a crowd, or a visually dense scene.
- `reject`: the primary subject is incomplete or cut by the frame, or the background is too cluttered to support stable masks.

The vision model supplies an initial estimate. For borderline cases, prefer `review` and record the grouping decision before generation so later layer labels remain consistent.
