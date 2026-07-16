# Surface Label Format

Spec for `boundaries/<id>.npy`, the on-disk ground truth read by `SurfaceDataset`
(`layer_seg/datasets/surface_dataset.py`) and produced by preprocessing
(`nnunetv2/scripts/create_masks.py` via `layer_seg/datasets/surface_utils.py`).
Any new labeling UI must write files that match this spec exactly, since the
loader does no interpolation or reinterpretation — it reads the array as-is.

## File

One file per sample: `boundaries/<id>.npy`, alongside `images/<id>.png` (same
`<id>`).

## Array format

- dtype: `float32`
- shape: `(K+1, W)`
  - `K` = number of layers in the dataset (e.g. 2 for HFUS: ST, subQ; 8 for
    OCT). Arbitrary per dataset.
  - `W` = width in pixels of the paired image; must match exactly.

## Axes

- Axis 0 (size `K+1`), index `s`: which surface, ordered top to bottom.
  `s=0` is the topmost surface, `s=K` the bottommost. Layer `i` (1-indexed)
  lies between surface `i-1` and surface `i`.
- Axis 1 (size `W`), index `x`: image column, one entry per integer pixel
  column, `x = 0 … W-1`.

## Value

`boundaries[s, x]` is a single float: the row (y) coordinate of surface `s`
at column `x`, in the same pixel coordinate frame as the image array (row 0
= top of image, matching NumPy/PIL indexing). Not normalized to `[0,1]`, not
an index into anything else.

### Pixel-center convention

- **Integer value** (`0`, `1`, `42`, ...) = the **center** of that pixel row.
  Pixel row `r` spans `[r - 0.5, r + 0.5)`.
- **Half-integer value** (`-0.5`, `41.5`, ...) = a pixel **edge**, the
  boundary line between two rows (not inside any pixel). `-0.5` is the top
  edge of the image; `41.5` is the line between row 41 and row 42.

Mask-derived surfaces always land on half-integers because a layer boundary
is physically between the last pixel of one class and the first pixel of
the next:

- Surface 0: `first_row(layer 1) - 0.5`
- Surface `i` (1..K-1): `last_row(layer i) + 0.5` (== layer `i`/`i+1` interface)
- Surface `K`: `last_row(layer K) + 0.5`

For a UI where the annotator clicks/drags directly on the true boundary
(rather than deriving it from a labeled mask), the resulting y-value is a
continuous float in this same coordinate frame — it does not need to land
on a half-integer, and doing so is actually more accurate than the
mask-derived convention.

## Required invariants

The loader assumes these; it does not enforce or repair them:

- Every column `x` has a value for every surface `s` — no `NaN`, no gaps
  (dense across the full width).
- Strictly increasing down axis 0 for every column:
  `boundaries[0,x] < boundaries[1,x] < ... < boundaries[K,x]` (surfaces
  never cross).

## Relationship to mask files

`masks/<id>.png` (uint8, mode `L`, 0=background/1..K=layers, e.g. HFUS
0=background/1=ST/2=subQ) is the alternate/fallback representation.
`SurfaceDataset._load_surfaces` prefers `boundaries/<id>.npy` when present
(sub-pixel, never smoothed) and only derives surfaces from the mask via
`extract_surfaces_from_label_mask` when the `.npy` file is missing. A new
UI can output either or both; if only a mask is produced, surfaces are
derived automatically at load time using the pixel-edge rule above.

## Practical note for a click/spline-based UI

Whatever curve-fitting (B-spline, etc.) the UI uses internally to let a user
place a few points and get a smooth curve, the saved `.npy` must be the fully
baked, dense per-column array described above — one evaluated y-value per
column, not spline control points. This guarantees the training pipeline
reads exactly what the annotator saw, with no risk of a separate
reinterpretation step producing different values later.
