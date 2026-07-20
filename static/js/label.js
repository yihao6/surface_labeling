const cfg = window.LABEL_CONFIG;
const IMAGE_ID = cfg.imageId;
const WIDTH = cfg.width;
const HEIGHT = cfg.height;
const PALETTE = cfg.palette;

const HIT_RADIUS_PX = 8;
const DRAG_THRESHOLD_PX = 3;

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

function renderList() {
  const ul = document.getElementById("surface-list");
  ul.innerHTML = "";
  surfaces.forEach((s, i) => {
    const li = document.createElement("li");
    li.className = "surface-row" + (i === activeIndex ? " active" : "");

    const colorBtn = document.createElement("button");
    colorBtn.className = "color-btn";
    colorBtn.style.background = PALETTE[i % PALETTE.length];
    colorBtn.textContent = `Surface ${i + 1}`;
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
      updatePreview();
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
  surfaces.push({ degree: 3, points: [] });
  activeIndex = surfaces.length - 1;
  renderList();
  updatePreview();
  saveState();
}

function moveSurface(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= surfaces.length) return;
  [surfaces[i], surfaces[j]] = [surfaces[j], surfaces[i]];
  if (activeIndex === i) activeIndex = j;
  else if (activeIndex === j) activeIndex = i;
  renderList();
  updatePreview();
  saveState();
}

function removeSurface(i) {
  surfaces.splice(i, 1);
  if (activeIndex === i) activeIndex = null;
  else if (activeIndex !== null && activeIndex > i) activeIndex -= 1;
  renderList();
  updatePreview();
  saveState();
}

function onSurfaceButtonClick(i) {
  activeIndex = activeIndex === i ? null : i;
  renderList();
  draw();
}

function saveState() {
  return fetch(`/api/save/${IMAGE_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ surfaces }),
  });
}

function updatePreview() {
  previewCurves = surfaces.map((s) => fitAndEvalClient(s.points, s.degree, WIDTH));
  draw();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (img.complete) ctx.drawImage(img, 0, 0);

  surfaces.forEach((s, i) => {
    const color = PALETTE[i % PALETTE.length];
    const curve = previewCurves && previewCurves[i];
    if (curve) {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      curve.forEach((y, x) => (x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
    }
    s.points.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
      if (i === activeIndex) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#000";
        ctx.stroke();
      }
    });
  });
}

function toImage(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return [
    (clientX - rect.left) * (canvas.width / rect.width),
    (clientY - rect.top) * (canvas.height / rect.height),
  ];
}

let dragState = null;

canvas.addEventListener("mousedown", (e) => {
  if (e.button === 0) handleLeftDown(e);
});

window.addEventListener("mousemove", (e) => {
  if (dragState) handleLeftMove(e);
});

window.addEventListener("mouseup", (e) => {
  if (e.button === 0) handleLeftUp(e);
});

function handleLeftDown(e) {
  if (activeIndex === null) return;
  const [ix, iy] = toImage(e.clientX, e.clientY);
  const s = surfaces[activeIndex];

  let nearest = null;
  let nearestDist = Infinity;
  s.points.forEach((p, idx) => {
    const d = Math.hypot(p[0] - ix, p[1] - iy);
    if (d <= HIT_RADIUS_PX && d < nearestDist) {
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
    updatePreview();
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
  updatePreview();
  saveState();
}

// --- init ---
async function init() {
  const resp = await fetch(`/api/control_points/${IMAGE_ID}`);
  const data = await resp.json();
  surfaces = data.surfaces || [];
  renderList();
  updatePreview();

  document.getElementById("add-surface-btn").onclick = addSurface;
  document.getElementById("prev-btn").onclick = () => goTo(cfg.idx - 1);
  document.getElementById("next-btn").onclick = () => goTo(cfg.idx + 1);
}

async function goTo(idx) {
  await saveState();
  window.location.href = `/label/${idx}`;
}

init();
