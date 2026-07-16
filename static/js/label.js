const cfg = window.LABEL_CONFIG;
const IMAGE_ID = cfg.imageId;
const WIDTH = cfg.width;
const HEIGHT = cfg.height;
const PALETTE = cfg.palette;

const HIT_RADIUS_PX = 8;
const DRAG_THRESHOLD_PX = 3;
const MIN_SCALE = 0.05;
const MAX_SCALE = 20;

const canvas = document.getElementById("canvas");
canvas.width = WIDTH;
canvas.height = HEIGHT;
const ctx = canvas.getContext("2d");

const img = new Image();
img.onload = () => draw();
img.src = `/image/${IMAGE_ID}`;

let surfaces = [];
let activeIndex = null;
let previewCurves = null;
const view = { scale: 1, offsetX: 0, offsetY: 0 };

function hasEnoughPoints(s) {
  const xs = new Set(s.points.map((p) => p[0].toFixed(6)));
  return xs.size >= s.degree + 1;
}

function renderList() {
  const ul = document.getElementById("surface-list");
  ul.innerHTML = "";
  surfaces.forEach((s, i) => {
    const li = document.createElement("li");
    li.className =
      "surface-row" + (i === activeIndex ? " active" : "") + (s.confirmed ? " confirmed" : "");

    const colorBtn = document.createElement("button");
    colorBtn.className = "color-btn";
    colorBtn.style.background = PALETTE[i % PALETTE.length];
    colorBtn.textContent = `Surface ${i + 1}` + (s.confirmed ? " ✓" : "");
    colorBtn.onclick = () => onSurfaceButtonClick(i);
    li.appendChild(colorBtn);

    const degInput = document.createElement("input");
    degInput.type = "number";
    degInput.min = "1";
    degInput.max = "7";
    degInput.value = s.degree;
    degInput.className = "degree-input";
    degInput.oninput = () => {
      s.degree = Math.max(1, parseInt(degInput.value, 10) || 1);
      if (s.confirmed && !hasEnoughPoints(s)) {
        s.confirmed = false;
        renderList();
      }
      requestPreview();
      saveState();
    };
    li.appendChild(degInput);

    const upBtn = document.createElement("button");
    upBtn.textContent = "▲";
    upBtn.disabled = i === 0;
    upBtn.onclick = () => moveSurface(i, -1);
    li.appendChild(upBtn);

    const downBtn = document.createElement("button");
    downBtn.textContent = "▼";
    downBtn.disabled = i === surfaces.length - 1;
    downBtn.onclick = () => moveSurface(i, 1);
    li.appendChild(downBtn);

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "×";
    removeBtn.onclick = () => removeSurface(i);
    li.appendChild(removeBtn);

    ul.appendChild(li);
  });
}

function addSurface() {
  surfaces.push({ confirmed: false, degree: 3, points: [] });
  activeIndex = surfaces.length - 1;
  renderList();
  requestPreview();
  saveState();
}

function moveSurface(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= surfaces.length) return;
  [surfaces[i], surfaces[j]] = [surfaces[j], surfaces[i]];
  if (activeIndex === i) activeIndex = j;
  else if (activeIndex === j) activeIndex = i;
  renderList();
  requestPreview();
  saveState();
}

function removeSurface(i) {
  surfaces.splice(i, 1);
  if (activeIndex === i) activeIndex = null;
  else if (activeIndex !== null && activeIndex > i) activeIndex -= 1;
  renderList();
  requestPreview();
  saveState();
}

function onSurfaceButtonClick(i) {
  const s = surfaces[i];
  if (activeIndex === i) {
    if (!hasEnoughPoints(s)) {
      alert(`Need at least ${s.degree + 1} points to confirm this surface.`);
      return;
    }
    s.confirmed = true;
    activeIndex = null;
  } else if (s.confirmed) {
    s.confirmed = false;
    activeIndex = i;
  } else {
    activeIndex = i;
  }
  renderList();
  saveState();
  draw();
}

function saveState() {
  return fetch(`/api/save/${IMAGE_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ surfaces }),
  });
}

async function requestPreview() {
  const resp = await fetch(`/api/preview/${IMAGE_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      surfaces: surfaces.map((s) => ({ points: s.points, degree: s.degree })),
    }),
  });
  const data = await resp.json();
  previewCurves = data.curves;
  draw();
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);

  if (img.complete) ctx.drawImage(img, 0, 0);

  surfaces.forEach((s, i) => {
    const color = PALETTE[i % PALETTE.length];
    const curve = previewCurves && previewCurves[i];
    if (curve) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 / view.scale;
      curve.forEach((y, x) => (x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
    }
    const r = 4 / view.scale;
    s.points.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fill();
      if (i === activeIndex) {
        ctx.lineWidth = 1 / view.scale;
        ctx.strokeStyle = "#000";
        ctx.stroke();
      }
    });
  });
}

function toImage(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const cx = (clientX - rect.left) * (canvas.width / rect.width);
  const cy = (clientY - rect.top) * (canvas.height / rect.height);
  return [(cx - view.offsetX) / view.scale, (cy - view.offsetY) / view.scale];
}

function toCanvas(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return [
    (clientX - rect.left) * (canvas.width / rect.width),
    (clientY - rect.top) * (canvas.height / rect.height),
  ];
}

// --- zoom (wheel) ---
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const [cx, cy] = toCanvas(e.clientX, e.clientY);
    const ix = (cx - view.offsetX) / view.scale;
    const iy = (cy - view.offsetY) / view.scale;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newScale = Math.min(Math.max(view.scale * factor, MIN_SCALE), MAX_SCALE);
    view.offsetX = cx - ix * newScale;
    view.offsetY = cy - iy * newScale;
    view.scale = newScale;
    draw();
  },
  { passive: false }
);

// --- pan (right-click-drag) ---
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

let panState = null;
let dragState = null;

canvas.addEventListener("mousedown", (e) => {
  if (e.button === 2) {
    panState = { cx: e.clientX, cy: e.clientY, ox: view.offsetX, oy: view.offsetY };
  } else if (e.button === 0) {
    handleLeftDown(e);
  }
});

window.addEventListener("mousemove", (e) => {
  if (panState) {
    view.offsetX = panState.ox + (e.clientX - panState.cx);
    view.offsetY = panState.oy + (e.clientY - panState.cy);
    draw();
  } else if (dragState) {
    handleLeftMove(e);
  }
});

window.addEventListener("mouseup", (e) => {
  if (e.button === 2) panState = null;
  else if (e.button === 0) handleLeftUp(e);
});

function handleLeftDown(e) {
  if (activeIndex === null) return;
  const [ix, iy] = toImage(e.clientX, e.clientY);
  const s = surfaces[activeIndex];
  const hitRadiusImg = HIT_RADIUS_PX / view.scale;

  let nearest = null;
  let nearestDist = Infinity;
  s.points.forEach((p, idx) => {
    const d = Math.hypot(p[0] - ix, p[1] - iy);
    if (d <= hitRadiusImg && d < nearestDist) {
      nearest = idx;
      nearestDist = d;
    }
  });

  dragState = { index: nearest, downX: e.clientX, downY: e.clientY, moved: false };
}

function handleLeftMove(e) {
  if (!dragState) return;
  const dx = e.clientX - dragState.downX;
  const dy = e.clientY - dragState.downY;
  if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) dragState.moved = true;

  if (dragState.index !== null && dragState.moved) {
    const [ix, iy] = toImage(e.clientX, e.clientY);
    surfaces[activeIndex].points[dragState.index] = [ix, iy];
    draw();
  }
}

function handleLeftUp(e) {
  if (!dragState || activeIndex === null) {
    dragState = null;
    return;
  }
  const s = surfaces[activeIndex];

  if (dragState.index !== null) {
    if (!dragState.moved) {
      s.points.splice(dragState.index, 1); // plain click on existing point = remove
    }
    // else: move already applied live in handleLeftMove
  } else if (!dragState.moved) {
    const [ix, iy] = toImage(e.clientX, e.clientY);
    s.points.push([ix, iy]); // plain click on empty space = add
  }

  dragState = null;
  requestPreview();
  saveState();
}

// --- init ---
async function init() {
  const resp = await fetch(`/api/control_points/${IMAGE_ID}`);
  const data = await resp.json();
  surfaces = data.surfaces || [];
  renderList();
  requestPreview();

  document.getElementById("add-surface-btn").onclick = addSurface;
  document.getElementById("prev-btn").onclick = () => goTo(cfg.idx - 1);
  document.getElementById("next-btn").onclick = () => goTo(cfg.idx + 1);
}

async function goTo(idx) {
  await saveState();
  window.location.href = `/label/${idx}`;
}

init();
