"""Produce boundaries/<id>.npy from control_points/<id>.json files.

Run this once labeling is done (or periodically) to bake the dense
per-column boundary arrays consumed by the training pipeline. See
docs/surface_label_format.md for the array format.

Usage:
    python build_boundaries.py /path/to/data/root
"""

import argparse
from pathlib import Path

import numpy as np

import io_utils
import spline_utils


def build(root: Path):
    boundaries_dir = root / "boundaries"
    boundaries_dir.mkdir(exist_ok=True)

    image_ids = io_utils.list_image_ids(root / "images")

    written, skipped = 0, 0
    for image_id in image_ids:
        surfaces = io_utils.load_control_points(root, image_id)["surfaces"]
        if not surfaces:
            skipped += 1
            continue

        width, _ = io_utils.get_image_size(io_utils.image_path(root, image_id))
        rows = [spline_utils.fit_and_eval(s["points"], s["degree"], width) for s in surfaces]

        if any(row is None for row in rows):
            print(f"{image_id}: skipped, a surface has too few distinct points for its degree")
            skipped += 1
            continue

        arr = np.stack(rows).astype(np.float32)
        np.save(io_utils.boundaries_path(root, image_id), arr)
        written += 1

    print(f"wrote {written} boundaries, skipped {skipped} unlabeled/incomplete images")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, help="Dataset root containing images/ and control_points/")
    args = parser.parse_args()
    build(args.root.expanduser().resolve())
