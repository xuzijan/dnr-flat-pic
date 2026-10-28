#!/usr/bin/env python3
"""Pre-screen reference images for DnR FlatPic object-layer experiments.

The module combines cheap local checks with a Qwen vision-language judgment.
It never generates an illustration; it only returns a decision, an estimated
semantic-layer count, and an explanation for each candidate.
"""

from __future__ import annotations

import argparse
import base64
import csv
import json
import os
import random
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from PIL import Image


ENDPOINT = "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation"
MODEL = "qwen3-vl-plus"

SCREENING_PROMPT = """You are screening a reference photograph for a dataset that will be converted into a simple flat illustration and then separated into semantic object layers.

Judge the image itself, not the quality of a possible illustration. Count semantic entities at the intended annotation granularity, not every pixel or internal detail. A complete object with internal color patches, clothing, facial features, or mechanical parts counts as ONE entity. Repeated distant people or vehicles may count as one grouped system only when they clearly read as a group.

Target criteria:
- Prefer 3 to 6 semantic entities total, including one background/environment region.
- Require at least TWO independently meaningful foreground/midground objects in addition to the background. A single flower, person, vehicle, or product plus its background is too sparse.
- Require at least one relation between different objects: support, holding, stacking, or occlusion. Petals overlapping other petals, parts attached to one machine, shadows, reflections, and color regions inside one object do NOT count as object relations.
- Require at least one complete primary object or figure. Reject a close-up head, cropped torso, handlebar/bell/engine fragment, or any scene where the focal subject is cut by the frame and cannot be separated as a whole entity.
- Keep background clutter low. A dense market stall, shelf wall, crowd, or unreadable pile cannot be accepted merely by naming it "background". Accept only clutter levels 1-2; send level 3 to review and reject levels 4-5.
- Prefer one focal subject plus a few supporting objects and moderate depth.
- Reject scenes with fewer than 3 meaningful entities or with crowds, busy streets, dense architecture, many independent machines, or dozens of small objects that would need many masks.
- A simple object with no relation is reject even if it is visually clean.
- A medium-complex still life or small scene with controlled lighting is usually acceptable.

Return ONLY one JSON object with this exact shape:
{"decision":"accept|review|reject","estimated_layers":0,"independent_foreground_entities":0,"subject_completeness":0.0,"cropped_subject":false,"background_clutter":0,"focal_subject":"...","entities":["..."],"relations":["..."],"complexity":0,"reason":"...","simplification":"..."}

Use estimated_layers for the expected final layer count after reasonable grouping, including background. independent_foreground_entities counts only separately meaningful whole objects or coherent repeated groups, excluding the background. subject_completeness is 1.0 when the primary object/figure is whole and separable, and 0.0 when it is a fragment or close-up part. cropped_subject is true when the main object is cut by the image frame. background_clutter is 1 (empty/simple) to 5 (dense/unreadable). Use complexity from 1 (very simple) to 10 (extremely dense). Choose accept only when the expected layer count is 3-6, there are at least two independent foreground entities, the primary subject is complete (subject_completeness >= 0.8 and cropped_subject=false), background_clutter <= 2, and there is at least one useful relation between different objects. Choose review when background_clutter is 3 or a crop/grouping may make the scene suitable. Reject background_clutter >= 4."""


def request_json(payload: dict[str, Any], api_key: str) -> dict[str, Any]:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        ENDPOINT,
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc


def extract_text(result: dict[str, Any]) -> str:
    choices = result.get("output", {}).get("choices", [])
    if not choices:
        raise RuntimeError(f"No choices in response: {result}")
    content = choices[0].get("message", {}).get("content", [])
    texts = [item.get("text", "") for item in content if isinstance(item, dict)]
    text = "\n".join(texts).strip()
    if not text:
        raise RuntimeError(f"No text in response: {result}")
    return text


def parse_assessment(text: str) -> dict[str, Any]:
    match = re.search(r"\{.*\}", text, re.S)
    if not match:
        raise ValueError(f"Model did not return JSON: {text}")
    data = json.loads(match.group(0))
    decision = data.get("decision")
    if decision not in {"accept", "review", "reject"}:
        raise ValueError(f"Invalid decision: {data}")
    data["estimated_layers"] = int(data.get("estimated_layers", 0))
    data["independent_foreground_entities"] = int(data.get("independent_foreground_entities", 0))
    data["subject_completeness"] = float(data.get("subject_completeness", 0))
    data["cropped_subject"] = bool(data.get("cropped_subject", False))
    data["background_clutter"] = int(data.get("background_clutter", 5))
    data["complexity"] = int(data.get("complexity", 0))
    return data


def assess_image(path: Path, api_key: str) -> dict[str, Any]:
    image = Image.open(path)
    with path.open("rb") as handle:
        encoded = base64.b64encode(handle.read()).decode("ascii")
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    payload = {
        "model": MODEL,
        "input": {"messages": [{
            "role": "user",
            "content": [{"image": f"data:{mime};base64,{encoded}"}, {"text": SCREENING_PROMPT}],
        }]},
        "parameters": {"temperature": 0.1},
    }
    result = parse_assessment(extract_text(request_json(payload, api_key)))
    if result["independent_foreground_entities"] < 2 and result["decision"] == "accept":
        result["decision"] = "reject"
        result["reason"] = (result.get("reason", "").rstrip() +
                            " Hard screening rule: fewer than two independent foreground/midground entities.").strip()
    if not 3 <= result["estimated_layers"] <= 6 and result["decision"] == "accept":
        result["decision"] = "reject"
        result["reason"] = (result.get("reason", "").rstrip() +
                            " Hard screening rule: estimated layer count is outside 3-6.").strip()
    if (result["subject_completeness"] < 0.8 or result["cropped_subject"]) and result["decision"] == "accept":
        result["decision"] = "reject"
        result["reason"] = (result.get("reason", "").rstrip() +
                            " Hard screening rule: the primary subject is incomplete or cropped.").strip()
    if result["background_clutter"] >= 4 and result["decision"] == "accept":
        result["decision"] = "reject"
        result["reason"] = (result.get("reason", "").rstrip() +
                            " Hard screening rule: background clutter is too high.").strip()
    elif result["background_clutter"] == 3 and result["decision"] == "accept":
        result["decision"] = "review"
        result["reason"] = (result.get("reason", "").rstrip() +
                            " Hard screening rule: background clutter requires manual crop/grouping review.").strip()
    result["file"] = path.name
    result["width"], result["height"] = image.size
    result["local_checks"] = {"readable": True, "supported_format": path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}}
    return result


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="筛选适合 DnR FlatPic 分层实验的输入图片")
    parser.add_argument("--input-dir", required=True)
    parser.add_argument("--manifest")
    parser.add_argument("--sample-size", type=int, default=12)
    parser.add_argument("--seed", type=int, default=20261027)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    api_key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not api_key:
        raise SystemExit("DASHSCOPE_API_KEY is not set")

    input_dir = Path(args.input_dir)
    candidates = sorted(p for p in input_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"})
    random.Random(args.seed).shuffle(candidates)
    candidates = candidates[: max(1, args.sample_size)]
    manifest = {}
    if args.manifest:
        with Path(args.manifest).open(encoding="utf-8", newline="") as handle:
            for row in csv.DictReader(handle):
                manifest[row["File"]] = row

    assessments = []
    for index, path in enumerate(candidates, 1):
        print(f"[{index}/{len(candidates)}] {path.name}", flush=True)
        try:
            item = assess_image(path, api_key)
        except Exception as exc:
            item = {"file": path.name, "decision": "review", "error": str(exc)}
        item["source"] = manifest.get(path.name, {})
        assessments.append(item)
        print(json.dumps(item, ensure_ascii=False), flush=True)

    output = {"model": MODEL, "seed": args.seed, "criteria": "3-6 semantic entities plus at least one relation", "items": assessments}
    Path(args.output).write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
