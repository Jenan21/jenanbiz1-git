#!/usr/bin/env python3
"""Offline tool: derives the shipped scene crops and icon sprites of the pre-login service panels
from the approved designs in design-references/Jenan-PRO/APPROVED_HOME_REFERENCE/service-panels.

Outputs (committed, served as static files):
  public/assets/home-panels/<id>-scene.webp     the photographic scene, cropped from the design, 2x, lightly sharpened
  public/assets/home-panels/icons/<id>-<n>.webp the four tile icons as alpha sprites (n = 1..4, right to left)
  public/assets/home-panels/brand-leaf.webp     the leaf mark of the "Jenan Pro" lockup, as an alpha sprite
  public/assets/home-panels/marketing-cta-rocket.webp  the rocket glyph on the Marketing call to action, as an alpha sprite
  design-references/.../service-panels/assets.manifest.json   crop boxes, sizes and source hashes (not served)

Requires Python 3.10+, numpy, opencv-python, pillow. `--check-numbers` additionally needs easyocr and reports any
legible numerals left in a scene (demo values must not read as production data).

Usage: python scripts/design/panel-assets.py [--check-numbers]
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "design-references" / "Jenan-PRO" / "APPROVED_HOME_REFERENCE" / "service-panels"
OUT = ROOT / "public" / "assets" / "home-panels"
ICON_OUT = OUT / "icons"

SCENE_ASPECT = 566 / 240  # the scene box of the strip, in CSS px
SCALE = 2  # shipped at 2x so it stays crisp on high-density screens and when the page scales up

# Tile bands measured on the 1365x768 designs (x ranges are listed right to left, as read in Arabic).
TILES_V2 = {"y": (362, 527), "x": [(546, 700), (382, 537), (218, 373), (54, 209)]}
TILES_SOFTWARE = {"y": (375, 537), "x": [(542, 692), (379, 534), (215, 370), (51, 206)]}
TILES_MARKETING = {"y": (358, 541), "x": [(494, 635), (344, 484), (192, 333), (40, 182)], "frac": 0.43}
TILES_TOOLS = {"y": (362, 527), "x": [(566, 706), (398, 540), (230, 372), (64, 204)]}

# scene: (x0, y0, x1, y1) in design pixels, chosen by eye. blur: (x0, y0, x1, y1) patches over numerals that would
# otherwise read as real figures; they are softened until unreadable.
PANELS = [
    {"id": "projects", "src": "01-projects.png", "scene": (745, 150, 1340, 402), "tiles": TILES_V2,
     "blur": [(1168, 326, 1226, 366)]},
    {"id": "academy", "src": "02-academy.png", "scene": (812, 184, 1340, 408), "tiles": TILES_V2, "blur": []},
    {"id": "talent", "src": "03-talent.png", "scene": (745, 120, 1340, 372), "tiles": TILES_V2,
     "blur": [(1262, 300, 1322, 352)]},
    {"id": "market", "src": "04-market.png", "scene": (745, 120, 1340, 372), "tiles": TILES_V2, "blur": []},
    {"id": "software", "src": "05-software.png", "scene": (745, 110, 1340, 362), "tiles": TILES_SOFTWARE,
     "blur": [(862, 228, 985, 272)]},
    # the right-hand stat cards (1.2M / 85K / 356 %) are excluded by ending the crop before x = 1180
    {"id": "marketing", "src": "06-marketing.png", "scene": (650, 250, 1176, 473), "tiles": TILES_MARKETING, "blur": []},
    {"id": "tools", "src": "07-tools.png", "scene": (745, 130, 1340, 382), "tiles": TILES_TOOLS,
     "blur": [(794, 322, 826, 362)]},
]

# the leaf mark of the "Jenan Pro" lockup, taken from the top-left of the Projects design
BRAND = {"src": "01-projects.png", "box": (64, 80, 134, 150), "clip_right": 135, "out": "brand-leaf.webp"}

# the rocket glyph on the dark knob of the Marketing call to action
CTA_ROCKET = {"src": "06-marketing.png", "box": (82, 602, 126, 646), "out": "marketing-cta-rocket.webp"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest().upper()


def feathered_blur(img: np.ndarray, box: tuple[int, int, int, int], offset: tuple[int, int]) -> None:
    x0, y0, x1, y1 = (box[0] - offset[0], box[1] - offset[1], box[2] - offset[0], box[3] - offset[1])
    h, w = img.shape[:2]
    x0, y0, x1, y1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
    if x1 <= x0 or y1 <= y0:
        return
    region = img[y0:y1, x0:x1].copy()
    blurred = cv2.GaussianBlur(region, (0, 0), 7)
    mask = np.zeros(region.shape[:2], np.float32)
    mask[3:-3, 3:-3] = 1.0
    mask = cv2.GaussianBlur(mask, (0, 0), 3)[..., None]
    img[y0:y1, x0:x1] = (blurred * mask + region * (1 - mask)).astype(np.uint8)


def build_scene(panel: dict, image: np.ndarray) -> dict:
    x0, y0, x1, y1 = panel["scene"]
    crop = image[y0:y1, x0:x1].copy()
    for box in panel["blur"]:
        feathered_blur(crop, box, (x0, y0))
    pil = Image.fromarray(crop).resize((crop.shape[1] * SCALE, crop.shape[0] * SCALE), Image.LANCZOS)
    pil = pil.filter(ImageFilter.UnsharpMask(radius=1.4, percent=35, threshold=2))
    path = OUT / f"{panel['id']}-scene.webp"
    pil.save(path, "WEBP", quality=84, method=6)
    return {"file": path.name, "box": list(panel["scene"]), "size": list(pil.size), "bytes": path.stat().st_size}


def find_icon(image: np.ndarray, tile: tuple[int, int, int, int], frac: float = 0.52):
    x0, x1, y0, y1 = tile
    h = y1 - y0
    region = image[y0 + 10 : y0 + int(h * frac), x0 + 8 : x1 - 8].astype(np.int32)
    mx = region.max(axis=2)
    sat = mx - region.min(axis=2)
    mask = (((mx > 150) & (sat > 60)) | (mx > 215)).astype(np.uint8) * 255
    mask = cv2.dilate(mask, np.ones((9, 9), np.uint8))
    count, _labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    if count <= 1:
        return None
    boxes = [stats[i] for i in range(1, count) if stats[i][4] > 200] or [stats[1 + int(np.argmax(stats[1:, 4]))]]
    bx0 = min(b[0] for b in boxes)
    by0 = min(b[1] for b in boxes)
    bx1 = max(b[0] + b[2] for b in boxes)
    by1 = max(b[1] + b[3] for b in boxes)
    return (x0 + 8 + bx0 + 4, y0 + 10 + by0 + 4, x0 + 8 + bx1 - 4, y0 + 10 + by1 - 4)


def sprite(image: np.ndarray, box: tuple[int, int, int, int], margin: int = 14) -> np.ndarray:
    x0, y0, x1, y1 = box
    crop = image[y0 - margin : y1 + margin, x0 - margin : x1 + margin].copy()
    cf = crop.astype(np.float32)
    mx = cf.max(axis=2)
    sat = mx - cf.min(axis=2)
    mask = (((mx > 125) | (sat > 70)).astype(np.uint8)) * 255
    mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=2)
    background = cv2.GaussianBlur(cv2.inpaint(crop, mask, 5, cv2.INPAINT_TELEA).astype(np.float32), (0, 0), 3)
    residual = np.clip(cf - background, 0, 255)
    raw = residual.max(axis=2) / 255.0
    core = raw[raw > 0.35]
    # coverage is normalised so that the solid part of the glyph is fully opaque, then the glyph colour is solved
    # from observed = alpha * colour + (1 - alpha) * background, which keeps its original brightness
    gain = 1.0 / max(float(np.percentile(core, 90)) if core.size else 0.9, 0.5)
    alpha = np.clip(raw * gain, 0, 1)
    # fade the outer margin and drop faint residue, so no background speck survives at the sprite's corners
    h, w = alpha.shape
    edge = np.clip(np.minimum(np.minimum(np.arange(h), np.arange(h)[::-1])[:, None],
                              np.minimum(np.arange(w), np.arange(w)[::-1])[None, :]) / max(margin, 1), 0, 1)
    alpha = alpha * edge * edge * (3 - 2 * edge)
    alpha = np.where(alpha < 0.05, 0, alpha)[..., None]
    colour = np.where(alpha > 0.02, (cf - (1 - alpha) * background) / np.maximum(alpha, 1e-3), 0)
    return np.dstack([np.clip(colour, 0, 255), alpha[..., 0] * 255]).astype(np.uint8)


def build_icons(panel: dict, image: np.ndarray) -> list[dict]:
    y0, y1 = panel["tiles"]["y"]
    written = []
    for index, (x0, x1) in enumerate(panel["tiles"]["x"], start=1):
        box = find_icon(image, (x0, x1, y0, y1), panel["tiles"].get("frac", 0.52))
        if box is None:
            raise SystemExit(f"no icon found in tile {index} of {panel['id']}")
        rgba = sprite(image, box)
        pil = Image.fromarray(rgba, "RGBA").resize((rgba.shape[1] * SCALE, rgba.shape[0] * SCALE), Image.LANCZOS)
        path = ICON_OUT / f"{panel['id']}-{index}.webp"
        pil.save(path, "WEBP", quality=88, alpha_quality=96, method=6)
        written.append({"file": path.name, "box": [int(v) for v in box], "size": list(pil.size), "bytes": path.stat().st_size})
    return written


def build_brand(image: np.ndarray) -> dict:
    margin = 6
    rgba = sprite(image, BRAND["box"], margin=margin)
    rgba[:, BRAND["clip_right"] - (BRAND["box"][0] - margin) :, 3] = 0  # the "J" of the wordmark starts right after the leaf
    pil = Image.fromarray(rgba, "RGBA").resize((rgba.shape[1] * SCALE, rgba.shape[0] * SCALE), Image.LANCZOS)
    path = OUT / BRAND["out"]
    pil.save(path, "WEBP", quality=90, alpha_quality=96, method=6)
    return {"file": path.name, "box": list(BRAND["box"]), "size": list(pil.size), "bytes": path.stat().st_size}


def build_cta_rocket(image: np.ndarray) -> dict:
    rgba = sprite(image, CTA_ROCKET["box"], margin=3)
    pil = Image.fromarray(rgba, "RGBA").resize((rgba.shape[1] * SCALE, rgba.shape[0] * SCALE), Image.LANCZOS)
    path = OUT / CTA_ROCKET["out"]
    pil.save(path, "WEBP", quality=90, alpha_quality=96, method=6)
    return {"file": path.name, "box": list(CTA_ROCKET["box"]), "size": list(pil.size), "bytes": path.stat().st_size}


def check_numbers() -> int:
    import easyocr  # noqa: PLC0415

    reader = easyocr.Reader(["en"], gpu=False, verbose=False)
    problems = 0
    for panel in PANELS:
        scene = Image.open(OUT / f"{panel['id']}-scene.webp").convert("RGB")
        x0, y0 = panel["scene"][:2]
        for pts, text, confidence in reader.readtext(np.asarray(scene), detail=1):
            if any(ch.isdigit() for ch in text) and confidence > 0.3 and len(text.strip()) >= 2:
                problems += 1
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                patch = (x0 + int(min(xs)) // SCALE - 4, y0 + int(min(ys)) // SCALE - 4,
                         x0 + int(max(xs)) // SCALE + 4, y0 + int(max(ys)) // SCALE + 4)
                print(f"  {panel['id']}: legible numerals {text!r} (confidence {confidence:.2f}) -> blur patch {patch}")
    print("numeral check:", "clean" if not problems else f"{problems} finding(s)")
    return problems


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    ICON_OUT.mkdir(parents=True, exist_ok=True)
    manifest = {"scale": SCALE, "sceneAspect": SCENE_ASPECT, "panels": {}}
    for panel in PANELS:
        source = SRC / panel["src"]
        image = np.asarray(Image.open(source).convert("RGB"))
        manifest["panels"][panel["id"]] = {
            "source": panel["src"],
            "sourceSha256": sha256(source),
            "scene": build_scene(panel, image),
            "icons": build_icons(panel, image),
        }
        print("built", panel["id"])
    manifest["brand"] = build_brand(np.asarray(Image.open(SRC / BRAND["src"]).convert("RGB")))
    print("built brand mark")
    manifest["ctaRocket"] = build_cta_rocket(np.asarray(Image.open(SRC / CTA_ROCKET["src"]).convert("RGB")))
    print("built marketing CTA rocket")
    (SRC / "assets.manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    total = sum(p.stat().st_size for p in OUT.rglob("*.webp"))
    print(f"total {total / 1024:.0f} KB")
    if "--check-numbers" in sys.argv:
        sys.exit(1 if check_numbers() else 0)


if __name__ == "__main__":
    main()
