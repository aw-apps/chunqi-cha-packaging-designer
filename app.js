const STORAGE_KEY = 'byok-packaging-designer:v2';
const LEGACY_STORAGE_KEYS = ['byok-packaging-designer:v1'];

const CURRENT_STATE_VERSION = 2;

const FACE_ORDER = ['front','back','left','right','top','bottom'];
const FACE_LABEL = {front:'Front',back:'Back',left:'Left',right:'Right',top:'Top',bottom:'Bottom'};

// Simple carton-ish dimensions for mapping; texture canvas is square, but we keep a per-face crop rect.
const TEMPLATE = {
  textureSize: 512,
  faces: {
    front:  { w: 220, h: 320 },
    back:   { w: 220, h: 320 },
    left:   { w: 110, h: 320 },
    right:  { w: 110, h: 320 },
    top:    { w: 220, h: 110 },
    bottom: { w: 220, h: 110 },
  },
  // Net layout positions in 2D canvas units
  net: {
    // Cross layout:
    //        [top]
    // [left][front][right][back]
    //      [bottom]
    originX: 330,
    originY: 180,
    scale: 1.0
  }
};

function isPlainObject(v){
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isFiniteNumber(v){
  return typeof v === 'number' && Number.isFinite(v);
}

function toNumberOr(v, fallback){
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return isFiniteNumber(n) ? n : fallback;
}

function clamp(n, min, max){
  return Math.max(min, Math.min(max, n));
}

function looksLikeState(v){
  return isPlainObject(v) && (
    isPlainObject(v.faces) || typeof v.template === 'string' || isFiniteNumber(v.version)
  );
}

function normalizeFaceState(face, input){
  const base = defaultFaceState(face);
  if (!isPlainObject(input)) return base;

  const { w, h } = TEMPLATE.faces[face];
  const x = toNumberOr(input.x, base.x);
  const y = toNumberOr(input.y, base.y);

  const scale = clamp(toNumberOr(input.scale, base.scale), 0.01, 20);
  const rotDeg = toNumberOr(input.rotDeg, base.rotDeg);

  let imageDataUrl = typeof input.imageDataUrl === 'string' ? input.imageDataUrl : null;
  if (imageDataUrl === '') imageDataUrl = null;
  if (imageDataUrl && !imageDataUrl.startsWith('data:')) imageDataUrl = null;

  return {
    imageDataUrl,
    x: clamp(Math.round(x), -w * 3, w * 4),
    y: clamp(Math.round(y), -h * 3, h * 4),
    scale,
    rotDeg
  };
}

function normalizeState(input){
  const base = defaultState();
  if (!looksLikeState(input)) return null;

  const out = {
    version: CURRENT_STATE_VERSION,
    template: input.template === 'carton-cross' ? 'carton-cross' : base.template,
    selectedFace: FACE_ORDER.includes(input.selectedFace) ? input.selectedFace : base.selectedFace,
    ui: normalizeUiState(input.ui),
    faces: {}
  };

  for (const face of FACE_ORDER){
    out.faces[face] = normalizeFaceState(face, input.faces?.[face]);
  }

  return out;
}

function isQuotaExceededError(e){
  return e?.name === 'QuotaExceededError' || e?.code === 22 || e?.number === -2147024882;
}

function defaultFaceState(face){
  const { w, h } = TEMPLATE.faces[face];
  return {
    imageDataUrl: null,
    x: Math.round(w/2),
    y: Math.round(h/2),
    scale: 1,
    rotDeg: 0
  };
}

function defaultUiState(){
  return {
    showGuides: true
  };
}

function normalizeUiState(input){
  const base = defaultUiState();
  if (!isPlainObject(input)) return base;
  return {
    showGuides: input.showGuides === false ? false : true
  };
}

function defaultState(){
  const faces = {};
  for (const f of FACE_ORDER) faces[f] = defaultFaceState(f);
  return {
    version: CURRENT_STATE_VERSION,
    template: 'carton-cross',
    selectedFace: 'front',
    ui: defaultUiState(),
    faces
  };
}

let state = loadState() || defaultState();

// DOM
const netCanvas = document.getElementById('netCanvas');
const nctx = netCanvas.getContext('2d');
const faceSelect = document.getElementById('faceSelect');
const fileImage = document.getElementById('fileImage');
const inpX = document.getElementById('inpX');
const inpY = document.getElementById('inpY');
const inpScale = document.getElementById('inpScale');
const inpRot = document.getElementById('inpRot');
const btnCenter = document.getElementById('btnCenter');
const btnRemoveImage = document.getElementById('btnRemoveImage');
const btnExport = document.getElementById('btnExport');
const fileImport = document.getElementById('fileImport');
const btnClear = document.getElementById('btnClear');

const viewport = document.getElementById('viewport');
const boxEl = document.getElementById('box');

let chkGuides = null;

function syncUiControlsFromState(){
  if (chkGuides) chkGuides.checked = state.ui?.showGuides !== false;
}

function ensureCanvasTools(){
  const stageEl = document.querySelector('.stage');
  if (!stageEl) return;
  if (stageEl.querySelector('.canvasTools')) return;

  const toolsEl = document.createElement('div');
  toolsEl.className = 'canvasTools';
  toolsEl.innerHTML = `
    <label class="toggle" title="Guides (G)">
      <input type="checkbox" />
      Guides
    </label>
  `;
  stageEl.appendChild(toolsEl);

  chkGuides = toolsEl.querySelector('input[type=checkbox]');
  syncUiControlsFromState();

  chkGuides.addEventListener('change', () => {
    state.ui.showGuides = chkGuides.checked;
    drawNet();
    saveStateDebounced();
  });
}

// Pre-create per-face render canvases for textures
const faceCanvases = {};
const faceCtx = {};
for (const f of FACE_ORDER){
  const c = document.createElement('canvas');
  c.width = TEMPLATE.textureSize;
  c.height = TEMPLATE.textureSize;
  faceCanvases[f] = c;
  faceCtx[f] = c.getContext('2d');
}

const imageCache = new Map(); // dataUrl -> HTMLImageElement

let storageNoticeEl = null;
function setStorageNotice(message){
  if (!storageNoticeEl){
    storageNoticeEl = document.createElement('div');
    storageNoticeEl.setAttribute('role', 'status');
    storageNoticeEl.style.cssText = [
      'display:none',
      'margin:10px 16px 0',
      'padding:10px 12px',
      'border-radius:10px',
      'background:#3a1414',
      'border:1px solid rgba(255,80,80,0.55)',
      'color:rgba(255,255,255,0.92)',
      'font: 13px/1.4 ui-sans-serif, system-ui'
    ].join(';');

    const topbar = document.querySelector('.topbar');
    topbar?.insertAdjacentElement('afterend', storageNoticeEl);
  }

  if (!message){
    storageNoticeEl.style.display = 'none';
    storageNoticeEl.textContent = '';
    return;
  }

  storageNoticeEl.textContent = message;
  storageNoticeEl.style.display = 'block';
}

function loadImage(dataUrl){
  if (!dataUrl) return Promise.resolve(null);
  if (imageCache.has(dataUrl)) return Promise.resolve(imageCache.get(dataUrl));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => { imageCache.set(dataUrl, img); resolve(img); };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function saveStateDebounced(){
  clearTimeout(saveStateDebounced._t);
  saveStateDebounced._t = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      for (const k of LEGACY_STORAGE_KEYS) localStorage.removeItem(k);
      setStorageNotice(null);
    } catch (e) {
      console.warn('localStorage save failed', e);
      setStorageNotice(
        isQuotaExceededError(e)
          ? '自動儲存失敗：瀏覽器儲存空間（localStorage）可能已滿。請先按右上「匯出 JSON」備份，或清理網站資料後再繼續編輯。'
          : '自動儲存失敗：無法寫入瀏覽器儲存空間。建議先「匯出 JSON」備份。'
      );
    }
  }, 150);
}

function loadState(){
  try {
    for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]){
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }

      const normalized = normalizeState(parsed);
      if (!normalized) continue;

      if (key !== STORAGE_KEY || parsed?.version !== CURRENT_STATE_VERSION) loadState._migrated = true;
      return normalized;
    }

    return null;
  } catch {
    return null;
  }
}

function setSelectedFace(face){
  state.selectedFace = face;
  faceSelect.value = face;
  syncControlsFromState();
  syncUiControlsFromState();
  renderAll();
  saveStateDebounced();
}

function syncControlsFromState(){
  const fs = state.faces[state.selectedFace];
  inpX.value = fs.x;
  inpY.value = fs.y;
  inpScale.value = fs.scale;
  inpRot.value = fs.rotDeg;
}

function syncStateFromControls(){
  const fs = state.faces[state.selectedFace];
  fs.x = Number(inpX.value);
  fs.y = Number(inpY.value);
  fs.scale = Math.max(0.01, Number(inpScale.value));
  fs.rotDeg = Number(inpRot.value);
  renderAll();
  saveStateDebounced();
}

faceSelect.addEventListener('change', () => setSelectedFace(faceSelect.value));
[inpX, inpY, inpScale, inpRot].forEach(el => el.addEventListener('input', syncStateFromControls));

btnCenter.addEventListener('click', () => {
  const face = state.selectedFace;
  const { w, h } = TEMPLATE.faces[face];
  const fs = state.faces[face];
  fs.x = Math.round(w/2);
  fs.y = Math.round(h/2);
  syncControlsFromState();
  renderAll();
  saveStateDebounced();
});

btnRemoveImage.addEventListener('click', () => {
  state.faces[state.selectedFace].imageDataUrl = null;
  renderAll();
  saveStateDebounced();
});

fileImage.addEventListener('change', async () => {
  const f = fileImage.files?.[0];
  if (!f) return;
  const dataUrl = await fileToDataUrl(f);
  state.faces[state.selectedFace].imageDataUrl = dataUrl;
  renderAll();
  saveStateDebounced();
  fileImage.value = '';
});

btnExport.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `packaging-design-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

fileImport.addEventListener('change', async () => {
  const f = fileImport.files?.[0];
  if (!f) return;
  try {
    const txt = await f.text();
    const imported = JSON.parse(txt);
    const normalized = normalizeState(imported);
    if (!normalized) throw new Error('JSON 格式不符合（缺少必要欄位）');

    state = normalized;
    syncUiControlsFromState();
    setSelectedFace(state.selectedFace || 'front');
  } catch (e){
    alert('匯入失敗：' + (e?.message || e));
  } finally {
    fileImport.value = '';
  }
});

btnClear.addEventListener('click', () => {
  if (!confirm('確定要清除目前設計？')) return;
  state = defaultState();
  syncUiControlsFromState();
  setSelectedFace('front');
  renderAll();
  saveStateDebounced();
});

function fileToDataUrl(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// --- 2D net layout ---
function getNetRects(){
  const { originX: ox, originY: oy } = TEMPLATE.net;
  const F = TEMPLATE.faces;
  const front = { x: ox, y: oy, w: F.front.w, h: F.front.h };
  const left  = { x: ox - F.left.w, y: oy, w: F.left.w, h: F.left.h };
  const right = { x: ox + F.front.w, y: oy, w: F.right.w, h: F.right.h };
  const back  = { x: ox + F.front.w + F.right.w, y: oy, w: F.back.w, h: F.back.h };
  const top   = { x: ox, y: oy - F.top.h, w: F.top.w, h: F.top.h };
  const bottom= { x: ox, y: oy + F.front.h, w: F.bottom.w, h: F.bottom.h };
  return { front, back, left, right, top, bottom };
}

function drawFaceGuides(ctx, x, y, w, h){
  const base = Math.max(6, Math.min(w, h));
  const safe = Math.round(base * 0.08);
  const bleed = Math.round(base * 0.04);

  ctx.save();
  ctx.lineWidth = 1.5;

  // Bleed (outside)
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = 'rgba(255,92,122,0.85)';
  ctx.strokeRect(x - bleed, y - bleed, w + bleed * 2, h + bleed * 2);

  // Safe (inside)
  ctx.strokeStyle = 'rgba(80,220,160,0.85)';
  ctx.strokeRect(x + safe, y + safe, w - safe * 2, h - safe * 2);

  // Cut
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  ctx.restore();
}

function drawSelectedImageBounds(ctx, face, x, y, w, h, netScale){
  const fs = state.faces[face];
  if (!fs?.imageDataUrl) return;
  const img = imageCache.get(fs.imageDataUrl);
  if (!img) return;

  const cx = x + fs.x * netScale;
  const cy = y + fs.y * netScale;
  const hw = (img.width * fs.scale * netScale) / 2;
  const hh = (img.height * fs.scale * netScale) / 2;

  const rad = (fs.rotDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const pts = [
    [-hw, -hh],
    [ hw, -hh],
    [ hw,  hh],
    [-hw,  hh]
  ].map((p) => {
    const px = p[0] * cos - p[1] * sin;
    const py = p[0] * sin + p[1] * cos;
    return [cx + px, cy + py];
  });

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = 'rgba(255,230,120,0.95)';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  ctx.stroke();

  // Handles (visual only)
  ctx.setLineDash([]);
  const hs = 6;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  for (const [px, py] of pts){
    ctx.beginPath();
    ctx.rect(px - hs/2, py - hs/2, hs, hs);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawNet(){
  const dpr = window.devicePixelRatio || 1;
  // Keep canvas internal size consistent with CSS size for crispness
  const cssW = netCanvas.clientWidth;
  const cssH = Math.round(cssW * (600/900));
  if (cssW > 0 && (netCanvas.width !== Math.round(cssW*dpr) || netCanvas.height !== Math.round(cssH*dpr))){
    netCanvas.width = Math.round(cssW*dpr);
    netCanvas.height = Math.round(cssH*dpr);
  }
  nctx.setTransform(dpr,0,0,dpr,0,0);

  nctx.clearRect(0,0,netCanvas.width, netCanvas.height);
  nctx.save();

  // background grid
  nctx.globalAlpha = 0.25;
  nctx.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let x=0; x<cssW; x+=25){
    nctx.beginPath(); nctx.moveTo(x,0); nctx.lineTo(x,cssH); nctx.stroke();
  }
  for (let y=0; y<cssH; y+=25){
    nctx.beginPath(); nctx.moveTo(0,y); nctx.lineTo(cssW,y); nctx.stroke();
  }
  nctx.globalAlpha = 1;

  const rects = getNetRects();
  // Fit rects into canvas with a margin
  const margin = 26;
  const all = Object.values(rects);
  const minX = Math.min(...all.map(r=>r.x));
  const minY = Math.min(...all.map(r=>r.y));
  const maxX = Math.max(...all.map(r=>r.x+r.w));
  const maxY = Math.max(...all.map(r=>r.y+r.h));
  const contentW = maxX - minX;
  const contentH = maxY - minY;
  const scale = Math.min((cssW - margin*2) / contentW, (cssH - margin*2) / contentH);
  const tx = margin + (cssW - margin*2 - contentW*scale)/2 - minX*scale;
  const ty = margin + (cssH - margin*2 - contentH*scale)/2 - minY*scale;

  // Draw each face rect and its texture preview
  for (const face of FACE_ORDER){
    const r = rects[face];
    const x = tx + r.x * scale;
    const y = ty + r.y * scale;
    const w = r.w * scale;
    const h = r.h * scale;

    // Texture
    const fc = faceCanvases[face];
    nctx.drawImage(fc, x, y, w, h);

    if (state.ui?.showGuides !== false){
      drawFaceGuides(nctx, x, y, w, h);
    }

    const selected = face === state.selectedFace;
    if (selected){
      drawSelectedImageBounds(nctx, face, x, y, w, h, scale);
    }

    // Border
    nctx.lineWidth = selected ? 3 : 2;
    nctx.strokeStyle = selected ? 'rgba(122,162,255,0.95)' : 'rgba(255,255,255,0.22)';
    nctx.strokeRect(x, y, w, h);

    // Label
    nctx.font = '12px ui-sans-serif, system-ui';
    nctx.fillStyle = 'rgba(0,0,0,0.55)';
    nctx.fillRect(x+6, y+6, 70, 18);
    nctx.fillStyle = 'rgba(255,255,255,0.9)';
    nctx.fillText(FACE_LABEL[face], x+10, y+19);
  }

  // Store transform for hit test
  drawNet._hit = { rects, scale, tx, ty };

  nctx.restore();
}

function hitTestFace(px, py){
  const h = drawNet._hit;
  if (!h) return null;
  for (const face of FACE_ORDER){
    const r = h.rects[face];
    const x = h.tx + r.x * h.scale;
    const y = h.ty + r.y * h.scale;
    const w = r.w * h.scale;
    const hh = r.h * h.scale;
    if (px >= x && px <= x+w && py >= y && py <= y+hh) return face;
  }
  return null;
}

// --- Per-face texture rendering ---
async function renderFaceTexture(face){
  const ctx = faceCtx[face];
  const size = TEMPLATE.textureSize;
  ctx.clearRect(0,0,size,size);

  // Background
  ctx.fillStyle = 'rgba(18,26,51,0.9)';
  ctx.fillRect(0,0,size,size);

  // Compute face aspect inside square texture
  const { w, h } = TEMPLATE.faces[face];
  const padding = 26;
  const scale = Math.min((size - padding*2)/w, (size - padding*2)/h);
  const drawW = w * scale;
  const drawH = h * scale;
  const ox = (size - drawW)/2;
  const oy = (size - drawH)/2;

  // Clip to face rect
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, drawW, drawH);
  ctx.clip();

  // Optional checker
  ctx.globalAlpha = 0.18;
  for (let y=0; y<drawH; y+=24){
    for (let x=0; x<drawW; x+=24){
      ctx.fillStyle = ((x/24 + y/24) % 2 === 0) ? '#ffffff' : '#000000';
      ctx.fillRect(ox+x, oy+y, 24, 24);
    }
  }
  ctx.globalAlpha = 1;

  // Image
  const fs = state.faces[face];
  const img = await loadImage(fs.imageDataUrl);
  if (img){
    // Map fs.x/fs.y which are in face units into texture space
    const cx = ox + fs.x * scale;
    const cy = oy + fs.y * scale;

    ctx.translate(cx, cy);
    ctx.rotate((fs.rotDeg * Math.PI) / 180);
    const s = fs.scale * scale;
    ctx.scale(s, s);
    ctx.drawImage(img, -img.width/2, -img.height/2);
    ctx.setTransform(1,0,0,1,0,0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, drawW, drawH);
    ctx.clip();
    ctx.restore();
  }

  ctx.restore();

  // Face border in texture
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, drawW, drawH);
}

async function renderAllTextures(){
  for (const f of FACE_ORDER){
    await renderFaceTexture(f);
  }
}

function applyTexturesTo3D(){
  document.querySelectorAll('.face').forEach(el => {
    const face = el.getAttribute('data-face');
    const url = faceCanvases[face].toDataURL('image/png');
    el.style.backgroundImage = `url(${url})`;
  });
}

async function renderAll(){
  await renderAllTextures();
  applyTexturesTo3D();
  drawNet();
}

// --- Keyboard shortcuts (ignored while typing) ---
function isTypingTarget(el){
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (isTypingTarget(e.target)) return;

  const fs = state.faces[state.selectedFace];

  if (e.key === 'g' || e.key === 'G'){
    state.ui.showGuides = !(state.ui?.showGuides !== false);
    syncUiControlsFromState();
    drawNet();
    saveStateDebounced();
    e.preventDefault();
    return;
  }

  if (e.key === 'r' || e.key === 'R'){
    fs.rotDeg += e.shiftKey ? -15 : 15;
    syncControlsFromState();
    renderAll();
    saveStateDebounced();
    e.preventDefault();
    return;
  }

  if (e.key === '0'){
    fs.scale = 1;
    syncControlsFromState();
    renderAll();
    saveStateDebounced();
    e.preventDefault();
    return;
  }

  if (e.key === 'Delete' || e.key === 'Backspace'){
    fs.imageDataUrl = null;
    renderAll();
    saveStateDebounced();
    e.preventDefault();
    return;
  }
}, { capture: true });

// --- Interaction: 2D drag / wheel ---
let dragging = false;
let dragStart = null;

netCanvas.addEventListener('pointerdown', (e) => {
  const rect = netCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const face = hitTestFace(x, y);
  if (face) setSelectedFace(face);

  dragging = true;
  netCanvas.setPointerCapture(e.pointerId);
  dragStart = { x, y, face: state.selectedFace, orig: { ...state.faces[state.selectedFace] } };
});

netCanvas.addEventListener('pointermove', (e) => {
  if (!dragging || !dragStart) return;
  const rect = netCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // Convert screen delta to face-unit delta using current net hit scale
  const h = drawNet._hit;
  if (!h) return;

  const dxPx = x - dragStart.x;
  const dyPx = y - dragStart.y;

  const face = state.selectedFace;
  const r = h.rects[face];
  const faceUnitPerPx = 1 / h.scale;
  const fs = state.faces[face];
  fs.x = Math.round(dragStart.orig.x + dxPx * faceUnitPerPx);
  fs.y = Math.round(dragStart.orig.y + dyPx * faceUnitPerPx);

  syncControlsFromState();
  renderAll();
  saveStateDebounced();
});

netCanvas.addEventListener('pointerup', (e) => {
  dragging = false;
  dragStart = null;
});

netCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const fs = state.faces[state.selectedFace];
  if (e.shiftKey){
    fs.rotDeg += Math.sign(e.deltaY) * 3;
  } else {
    const factor = Math.sign(e.deltaY) > 0 ? 0.95 : 1.05;
    fs.scale = Math.max(0.01, Math.min(20, fs.scale * factor));
  }
  syncControlsFromState();
  renderAll();
  saveStateDebounced();
}, { passive: false });

// --- 3D orbit interaction ---
let orbiting = false;
let orbit = { x: -14, y: 24 };
let orbitStart = null;

function applyOrbit(){
  boxEl.style.transform = `translate(-50%,-50%) rotateX(${orbit.x}deg) rotateY(${orbit.y}deg)`;
}
applyOrbit();

viewport.addEventListener('pointerdown', (e) => {
  orbiting = true;
  viewport.setPointerCapture(e.pointerId);
  orbitStart = {
    x: e.clientX,
    y: e.clientY,
    ox: orbit.x,
    oy: orbit.y
  };
});

viewport.addEventListener('pointermove', (e) => {
  if (!orbiting || !orbitStart) return;
  const dx = e.clientX - orbitStart.x;
  const dy = e.clientY - orbitStart.y;
  orbit.y = orbitStart.oy + dx * 0.25;
  orbit.x = orbitStart.ox - dy * 0.25;
  orbit.x = Math.max(-80, Math.min(80, orbit.x));
  applyOrbit();
});

viewport.addEventListener('pointerup', () => {
  orbiting = false;
  orbitStart = null;
});

// Initial UI sync
faceSelect.value = state.selectedFace;
ensureCanvasTools();
syncControlsFromState();
syncUiControlsFromState();

// Render
renderAll();
if (loadState._migrated) saveStateDebounced();

// Keep 2D net crisp on resize
window.addEventListener('resize', () => drawNet());
