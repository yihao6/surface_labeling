# Surface Labeling

A local web tool for hand-labeling layer surfaces (boundaries between tissue
layers, etc.) on grayscale images, by placing a few control points per
surface and letting a spline fill in the rest.

## Setup

```
pip install -r requirements.txt
```

## Running

```
python app.py [--port 5050]
```

Then open `http://localhost:5050` in your browser.

## Preparing your data

Point the tool at a **root folder** containing an `images/` subfolder:

```
ROOT/
  images/
    0001.png
    0002.png
    ...
```

- Images should be grayscale.
- Non-PNG images (`.jpg`, `.jpeg`, `.bmp`, `.tif`, `.tiff`, `.gif`, `.webp`)
  placed in `images/` are automatically converted to grayscale `.png` the
  first time the tool starts, so you can drop in a raw folder of scans
  as-is.
- Images are labeled in natural sort order (`2.png` before `10.png`).

Enter the path to `ROOT` on the home page and click Confirm.

## Labeling an image

- **Add a surface**: click "+ Add Surface" for each boundary line you need
  to trace (e.g. top of tissue, layer 1/2 interface, ...). Surfaces are
  drawn top-to-bottom in the order they appear in the list — use the ▲/▼
  buttons to reorder them if a surface needs to move above/below another.
- **Activate a surface**: click its color button in the panel so it's
  highlighted; only the active surface responds to canvas clicks. Click the
  color button again to deactivate.
- **Place points**: with a surface active, click anywhere on the image to
  drop a control point.
- **Move a point**: click and drag an existing point.
- **Remove a point**: click directly on it (without dragging).
- **Remove a whole surface**: click the × button next to it.
- **Curve fit degree**: the number box next to each surface controls the
  spline degree used to fit a smooth curve through its points (1 = straight
  segments, higher = smoother/more flexible curve). You need at least
  `degree + 1` distinct points for the curve to render.
- **Navigate**: use Prev/Next at the top to move between images. Your work
  is saved automatically whenever you add, move, or remove a point, change
  a degree, or navigate away — there's no separate save button.
- Reopening the tool resumes at the first image that hasn't been labeled
  yet (i.e. has no saved control points).

## Exporting for training

Labeling saves only the control points you clicked (`control_points/*.json`),
not the final dense boundary arrays a model consumes. Once you're done
labeling (or periodically), run:

```
python build_boundaries.py /path/to/ROOT
```

This fits each surface's curve and writes one `boundaries/<id>.npy` per
labeled image, skipping any image that isn't labeled yet or doesn't have
enough points for its chosen degree. See `docs/surface_label_format.md` for
the exact array format these files follow.
