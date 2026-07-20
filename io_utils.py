import json
import re
from pathlib import Path

from PIL import Image

PALETTE = [
    "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
    "#46f0f0", "#f032e6", "#bcf60c", "#fabebe", "#008080",
]


SOURCE_EXTENSIONS = (".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".gif", ".webp")


def natural_sort_key(name):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", name)]


def ensure_png_images(images_dir: Path):
    """Convert any non-PNG source images to grayscale PNG, in place, skipping ones already converted."""
    for src in images_dir.iterdir():
        if src.suffix.lower() in SOURCE_EXTENSIONS:
            png_path = src.with_suffix(".png")
            if not png_path.exists():
                with Image.open(src) as im:
                    im.convert("L").save(png_path)


def list_image_ids(images_dir: Path):
    ensure_png_images(images_dir)
    return sorted((p.stem for p in images_dir.glob("*.png")), key=natural_sort_key)


def ensure_dirs(root: Path):
    (root / "control_points").mkdir(exist_ok=True)


def image_path(root: Path, image_id: str) -> Path:
    return root / "images" / f"{image_id}.png"


def get_image_size(path: Path):
    with Image.open(path) as im:
        return im.size  # (width, height)


def control_points_path(root: Path, image_id: str) -> Path:
    return root / "control_points" / f"{image_id}.json"


def boundaries_path(root: Path, image_id: str) -> Path:
    return root / "boundaries" / f"{image_id}.npy"


def load_control_points(root: Path, image_id: str) -> dict:
    path = control_points_path(root, image_id)
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {"surfaces": []}


def save_control_points(root: Path, image_id: str, data: dict):
    path = control_points_path(root, image_id)
    with open(path, "w") as f:
        json.dump(data, f)


def is_fully_confirmed(root: Path, image_id: str) -> bool:
    data = load_control_points(root, image_id)
    surfaces = data["surfaces"]
    return bool(surfaces) and all(s["confirmed"] for s in surfaces)


def resume_index(root: Path, image_ids: list) -> int:
    for i, image_id in enumerate(image_ids):
        if not is_fully_confirmed(root, image_id):
            return i
    return 0
