import argparse
from pathlib import Path

import numpy as np
from flask import Flask, jsonify, redirect, render_template, request, send_from_directory, url_for

import io_utils
import spline_utils
from state import CONFIG

app = Flask(__name__)


def require_config():
    if CONFIG["root"] is None:
        return redirect(url_for("home"))
    return None


@app.route("/")
def home():
    return render_template("home.html", error=request.args.get("error"))


@app.route("/start", methods=["POST"])
def start():
    root = Path(request.form["root"]).expanduser().resolve()
    images_dir = root / "images"
    if not images_dir.is_dir():
        return render_template("home.html", error=f"No images/ folder found under {root}")

    image_ids = io_utils.list_image_ids(images_dir)
    if not image_ids:
        return render_template("home.html", error=f"No .png images found in {images_dir}")

    io_utils.ensure_dirs(root)
    CONFIG["root"] = root
    CONFIG["image_ids"] = image_ids

    idx = io_utils.resume_index(root, image_ids)
    return redirect(url_for("label", idx=idx))


@app.route("/label/<int:idx>")
def label(idx):
    resp = require_config()
    if resp:
        return resp

    image_ids = CONFIG["image_ids"]
    if not (0 <= idx < len(image_ids)):
        idx = 0
    image_id = image_ids[idx]
    width, height = io_utils.get_image_size(io_utils.image_path(CONFIG["root"], image_id))

    return render_template(
        "label.html",
        image_id=image_id,
        idx=idx,
        total=len(image_ids),
        width=width,
        height=height,
        palette=io_utils.PALETTE,
    )


@app.route("/image/<image_id>")
def serve_image(image_id):
    resp = require_config()
    if resp:
        return resp
    return send_from_directory(CONFIG["root"] / "images", f"{image_id}.png")


@app.route("/api/control_points/<image_id>")
def get_control_points(image_id):
    resp = require_config()
    if resp:
        return resp
    return jsonify(io_utils.load_control_points(CONFIG["root"], image_id))


@app.route("/api/save/<image_id>", methods=["POST"])
def save(image_id):
    resp = require_config()
    if resp:
        return resp

    root = CONFIG["root"]
    body = request.get_json()
    surfaces = body["surfaces"]

    for surface in surfaces:
        if surface["confirmed"]:
            distinct_x = {round(p[0], 6) for p in surface["points"]}
            if len(distinct_x) < surface["degree"] + 1:
                return jsonify({"error": "surface confirmed with too few distinct points"}), 400

    io_utils.save_control_points(root, image_id, {"surfaces": surfaces})

    b_path = io_utils.boundaries_path(root, image_id)
    if surfaces and all(s["confirmed"] for s in surfaces):
        width, _ = io_utils.get_image_size(io_utils.image_path(root, image_id))
        rows = [spline_utils.fit_and_eval(s["points"], s["degree"], width) for s in surfaces]
        arr = np.stack(rows).astype(np.float32)
        np.save(b_path, arr)
        written = True
    else:
        if b_path.exists():
            b_path.unlink()
        written = False

    return jsonify({"boundaries_written": written})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=5050)
    args = parser.parse_args()
    app.run(debug=True, port=args.port)
