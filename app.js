const STORAGE_KEY = 'byok-packaging-designer:v2';
const LEGACY_STORAGE_KEYS = ['byok-packaging-designer:v1'];

const CURRENT_STATE_VERSION = 3;

const TEMPLATES = {
  'carton-cross': {
    id: 'carton-cross',
    label: '盒型（carton）十字展開',
    type: 'box',
    textureSize: 512,
    faces: {
      front:  { label: 'Front 正面',  w: 220, h: 320 },
      back:   { label: 'Back 背面',   w: 220, h: 320 },
      left:   { label: 'Left 左側',   w: 110, h: 320 },
      right:  { label: 'Right 右側',  w: 110, h: 320 },
      top:    { label: 'Top 上蓋',    w: 220, h: 110 },
      bottom: { label: 'Bottom 底部', w: 220, h: 110 },
    },
    faceOrder: ['front','back','left','right','top','bottom'],
    net: { originX: 330, originY: 180 },
    supportsDepth: true,
    getNetRects(){
      const { originX: ox, originY: oy } = this.net;
      const F = this.faces;
      const front = { x: ox, y: oy, w: F.front.w, h: F.front.h };
      const left  = { x: ox - F.left.w, y: oy, w: F.left.w, h: F.left.h };
      const right = { x: ox + F.front.w, y: oy, w: F.right.w, h: F.right.h };
      const back  = { x: ox + F.front.w + F.right.w, y: oy, w: F.back.w, h: F.back.h };
      const top   = { x: ox, y: oy - F.top.h, w: F.top.w, h: F.top.h };
      const bottom= { x: ox, y: oy + F.front.h, w: F.bottom.w, h: F.bottom.h };
      return { front, back, left, right, top, bottom };
    },
    getBoxDims(tState){
      const w = this.faces.front.w;
      const h = this.faces.front.h;
      const baseD = this.faces.left.w;
      const depthScale = clamp(toNumberOr(tState?.preview?.depthScale, 1), 0.4, 2);
      const d = round(baseD * depthScale);
      return { w, h, d, baseD, depthScale };
    }
  },

  'pouch-simple': {
    id: 'pouch-simple',
    label: '立體袋（pouch）簡化',
    type: 'box',
    textureSize: 512,
    faces: {
      front: { label: 'Front 正面', w: 240, h: 340 },
      back:  { label: 'Back 背面',  w: 240, h: 340 },
    },
    faceOrder: ['front','back'],
    net: { originX: 250, originY: 170, gap: 28 },
    supportsDepth: true,
    getNetRects(){
      const { originX: ox, originY: oy, gap } = this.net;
      const F = this.faces;
      const front = { x: ox, y: oy, w: F.front.w, h: F.front.h };
      const back  = { x: ox + F.front.w + (gap || 0), y: oy, w: F.back.w, h: F.back.h };
      return { front, back };
    },
    getBoxDims(tState){
      const w = this.faces.front.w;
      const h = this.faces.front.h;
      const baseD = Math.max(16, Math.round(w * 0.12));
      const depthScale = clamp(toNumberOr(tState?.preview?.depthScale, 1), 0.4, 2);
      const d = round(baseD * depthScale);
      return { w, h, d, baseD, depthScale };
    }
  },

  'cylinder-label': {
    id: 'cylinder-label',
    label: '罐身貼標（cylinder label）',
    type: 'cylinder',
    textureSize: 512,
    faces: {
      label: { label: 'Label 貼標', w: 420, h: 260 },
    },
    faceOrder: ['label'],
    net: { originX: 240, originY: 200 },
    supportsDepth: false,
    getNetRects(){
      const { originX: ox, originY: oy } = this.net;
      const F = this.faces;
      return { label: { x: ox, y: oy, w: F.label.w, h: F.label.h } };
    },
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

function round(n){
  return Math.round(n);
}

function looksLikeLegacyV2State(v){
  return isPlainObject(v) && (isPlainObject(v.faces) || typeof v.template === 'string' || isFiniteNumber(v.version));
}

function looksLikeRootState(v){
  return isPlainObject(v) && isFiniteNumber(v.version) && isPlainObject(v.templates);
}

function defaultUiState(){
  return {
    showGuides: true,
  };
}

function normalizeUiState(input){
  const base = defaultUiState();
  if (!isPlainObject(input)) return base;
  return {
    showGuides: input.showGuides === false ? false : true,
  };
}

function defaultFaceState(templateId, faceId){
  const t = TEMPLATES[templateId];
  const { w, h } = t.faces[faceId];
  return {
    imageDataUrl: null,
    x: Math.round(w/2),
    y: Math.round(h/2),
    scale: 1,
    rotDeg: 0
  };
}

function normalizeFaceState(templateId, faceId, input){
  const base = defaultFaceState(templateId, faceId);
  if (!isPlainObject(input)) return base;

  const t = TEMPLATES[templateId];
  const { w, h } = t.faces[faceId];
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

function defaultTemplateState(templateId){
  const t = TEMPLATES[templateId];
  const faces = {};
  for (const faceId of t.faceOrder){
    faces[faceId] = defaultFaceState(templateId, faceId);
  }
  return {
    selectedFace: t.faceOrder[0],
    preview: t.supportsDepth ? { depthScale: 1 } : {},
    faces
  };
}

function normalizeTemplateState(templateId, input){
  const base = defaultTemplateState(templateId);
  if (!isPlainObject(input)) return base;

  const t = TEMPLATES[templateId];
  const out = {
    selectedFace: t.faceOrder.includes(input.selectedFace) ? input.selectedFace : base.selectedFace,
    preview: { ...base.preview },
    faces: {}
  };

  if (t.supportsDepth){
    out.preview.depthScale = clamp(toNumberOr(input.preview?.depthScale, base.preview.depthScale), 0.4, 2);
  }

  for (const faceId of t.faceOrder){
    out.faces[faceId] = normalizeFaceState(templateId, faceId, input.faces?.[faceId]);
  }

  return out;
}

function defaultRootState(){
  return {
    version: CURRENT_STATE_VERSION,
    activeTemplate: 'carton-cross',
    ui: defaultUiState(),
    templates: {
      'carton-cross': defaultTemplateState('carton-cross')
    }
  };
}

function normalizeState(input){
  if (looksLikeRootState(input) && input.version >= 3){
    const base = defaultRootState();
    const activeTemplate = typeof input.activeTemplate === 'string' && TEMPLATES[input.activeTemplate]
      ? input.activeTemplate
      : base.activeTemplate;

    const out = {
      version: CURRENT_STATE_VERSION,
      activeTemplate,
      ui: normalizeUiState(input.ui),
      templates: {}
    };

    for (const tid of Object.keys(TEMPLATES)){
      const raw = input.templates?.[tid];
      if (raw) out.templates[tid] = normalizeTemplateState(tid, raw);
    }

    if (!out.templates[activeTemplate]) out.templates[activeTemplate] = defaultTemplateState(activeTemplate);
    return out;
  }

  // Legacy v2
  if (looksLikeLegacyV2State(input)){
    const base = defaultRootState();
    const legacyTemplate = input.template === 'carton-cross' ? 'carton-cross' : base.activeTemplate;

    const migrated = {
      version: CURRENT_STATE_VERSION,
      activeTemplate: legacyTemplate,
      ui: normalizeUiState(input.ui),
      templates: {}
    };

    // Preserve legacy depthScale (was stored in ui)
    const legacyT = defaultTemplateState(legacyTemplate);
    if (TEMPLATES[legacyTemplate].supportsDepth){
      legacyT.preview.depthScale = clamp(toNumberOr(input.ui?.depthScale, legacyT.preview.depthScale), 0.4, 2);
    }

    legacyT.selectedFace = TEMPLATES[legacyTemplate].faceOrder.includes(input.selectedFace)
      ? input.selectedFace
      : legacyT.selectedFace;

    for (const faceId of TEMPLATES[legacyTemplate].faceOrder){
      legacyT.faces[faceId] = normalizeFaceState(legacyTemplate, faceId, input.faces?.[faceId]);
    }

    migrated.templates[legacyTemplate] = legacyT;
    return migrated;
  }

  return null;
}

function isQuotaExceededError(e){
  return e?.name === 'QuotaExceededError' || e?.code === 22 || e?.number === -2147024882;
}

let state = loadState() || defaultRootState();

// DOM
const templateSelect = document.getElementById('templateSelect');
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
const previewTools = document.getElementById('previewTools');
const previewObjectEl = document.getElementById('previewObject');
const depthRange = document.getElementById('depthRange');
const depthValue = document.getElementById('depthValue');
const netCanvas = document.getElementById('netCanvas');
const nctx = netCanvas.getContext('2d');

let chkGuides = null;

function getActiveTemplate(){
  return TEMPLATES[state.activeTemplate] || TEMPLATES['carton-cross'];
}

function ensureTemplateState(templateId){
  if (!state.templates) state.templates = {};
  if (!state.templates[templateId]) state.templates[templateId] = defaultTemplateState(templateId);
  return state.templates[templateId];
}

function getActiveTemplateState(){
  const t = getActiveTemplate();
  return ensureTemplateState(t.id);
}

function setStorageNotice(message){
  if (!setStorageNotice._el){
    const el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.style.cssText = [
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
    topbar?.insertAdjacentElement('afterend', el);
    setStorageNotice._el = el;
  }

  const el = setStorageNotice._el;
  if (!message){
    el.style.display = 'none';
    el.textContent = '';
    return;
  }

  el.textContent = message;
  el.style.display = 'block';
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

// --- Template/Face selectors ---
function renderTemplateOptions(){
  templateSelect.innerHTML = '';
  for (const tid of Object.keys(TEMPLATES)){
    const opt = document.createElement('option');
    opt.value = tid;
    opt.textContent = TEMPLATES[tid].label;
    templateSelect.appendChild(opt);
  }
  templateSelect.value = getActiveTemplate().id;
}

function renderFaceOptions(){
  const t = getActiveTemplate();
  const tState = getActiveTemplateState();

  faceSelect.innerHTML = '';
  for (const faceId of t.faceOrder){
    const opt = document.createElement('option');
    opt.value = faceId;
    opt.textContent = t.faces[faceId].label;
    faceSelect.appendChild(opt);
  }

  if (!t.faceOrder.includes(tState.selectedFace)) tState.selectedFace = t.faceOrder[0];
  faceSelect.value = tState.selectedFace;
}

function setActiveTemplate(templateId){
  if (!TEMPLATES[templateId]) return;
  if (state.activeTemplate === templateId) return;

  state.activeTemplate = templateId;
  ensureTemplateState(templateId);

  renderTemplateOptions();
  renderFaceOptions();
  rebuildPreview();
  syncControlsFromState();
  syncUiControlsFromState();
  renderAll();
  saveStateDebounced();
}

function setSelectedFace(faceId){
  const t = getActiveTemplate();
  const tState = getActiveTemplateState();
  if (!t.faceOrder.includes(faceId)) return;
  tState.selectedFace = faceId;
  faceSelect.value = faceId;
  syncControlsFromState();
  renderAll();
  saveStateDebounced();
}

// --- Preview (3D) ---
let orbiting = false;
let orbit = { x: -14, y: 24 };
let orbitStart = null;

function applyOrbit(){
  previewObjectEl.style.transform = `translate(-50%,-50%) rotateX(${orbit.x}deg) rotateY(${orbit.y}deg)`;
}

function buildBoxFaces(){
  previewObjectEl.innerHTML = '';
  previewObjectEl.className = 'box';

  const faces = [
    ['front', 'face-front'],
    ['back', 'face-back'],
    ['left', 'face-left'],
    ['right', 'face-right'],
    ['top', 'face-top'],
    ['bottom', 'face-bottom'],
  ];

  for (const [id, cls] of faces){
    const el = document.createElement('div');
    el.className = `face ${cls}`;
    el.setAttribute('data-face', id);
    previewObjectEl.appendChild(el);
  }
}

function buildCylinder(){
  previewObjectEl.innerHTML = '';
  previewObjectEl.className = 'cylinder';

  const segCount = 28;
  const r = 120;
  const h = 320;
  const segW = Math.max(10, Math.round((2 * Math.PI * r) / segCount));

  previewObjectEl.style.setProperty('--seg', String(segCount));
  previewObjectEl.style.setProperty('--r', `${r}px`);
  previewObjectEl.style.setProperty('--h', `${h}px`);
  previewObjectEl.style.setProperty('--segW', `${segW}px`);

  // Caps
  const top = document.createElement('div');
  top.className = 'cyl-cap top';
  const bottom = document.createElement('div');
  bottom.className = 'cyl-cap bottom';
  previewObjectEl.appendChild(top);
  previewObjectEl.appendChild(bottom);

  for (let i = 0; i < segCount; i++){
    const seg = document.createElement('div');
    seg.className = 'cyl-seg';
    seg.dataset.i = String(i);
    seg.dataset.n = String(segCount);

    const rot = (i / segCount) * 360;
    seg.style.transform = `translate(-50%,-50%) rotateY(${rot}deg) translateZ(${r}px)`;
    previewObjectEl.appendChild(seg);
  }
}

function rebuildPreview(){
  const t = getActiveTemplate();
  if (t.type === 'cylinder') buildCylinder();
  else buildBoxFaces();

  syncUiControlsFromState();
  applyOrbit();
}

function syncUiControlsFromState(){
  if (chkGuides) chkGuides.checked = state.ui?.showGuides !== false;

  const t = getActiveTemplate();
  const tState = getActiveTemplateState();

  if (previewTools) previewTools.style.display = t.supportsDepth ? '' : 'none';

  if (t.supportsDepth && depthRange){
    const { d, depthScale } = t.getBoxDims(tState);
    depthRange.value = String(depthScale);
    if (depthValue) depthValue.textContent = `${d}px`;
  }
}

if (depthRange){
  depthRange.addEventListener('input', () => {
    const t = getActiveTemplate();
    if (!t.supportsDepth) return;

    const tState = getActiveTemplateState();
    tState.preview.depthScale = clamp(Number(depthRange.value), 0.4, 2);
    syncUiControlsFromState();
    apply3DBoxDims();
    saveStateDebounced();
  });
}

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

function apply3DBoxDims(){
  const t = getActiveTemplate();
  if (!t.supportsDepth) return;

  const tState = getActiveTemplateState();
  const { w, h, d } = t.getBoxDims(tState);

  previewObjectEl.style.setProperty('--w', `${w}px`);
  previewObjectEl.style.setProperty('--h', `${h}px`);
  previewObjectEl.style.setProperty('--d', `${d}px`);
}

// --- Per-face render canvases for textures ---
const canvasStore = new Map(); // key => { canvas, ctx }

function canvasKey(templateId, faceId){
  return `${templateId}:${faceId}`;
}

function getFaceCanvas(templateId, faceId){
  const key = canvasKey(templateId, faceId);
  if (canvasStore.has(key)) return canvasStore.get(key);

  const t = TEMPLATES[templateId];
  const c = document.createElement('canvas');
  c.width = t.textureSize;
  c.height = t.textureSize;
  const ctx = c.getContext('2d');

  const v = { canvas: c, ctx };
  canvasStore.set(key, v);
  return v;
}

const imageCache = new Map(); // dataUrl -> HTMLImageElement

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

async function renderFaceTexture(templateId, faceId){
  const t = TEMPLATES[templateId];
  const tState = ensureTemplateState(templateId);

  const { canvas, ctx } = getFaceCanvas(templateId, faceId);
  const size = t.textureSize;
  ctx.clearRect(0,0,size,size);

  // Background
  ctx.fillStyle = 'rgba(18,26,51,0.9)';
  ctx.fillRect(0,0,size,size);

  // Compute face aspect inside square texture
  const { w, h } = t.faces[faceId];
  const padding = templateId === 'cylinder-label' ? 18 : 26;
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
  const fs = tState.faces[faceId];
  const img = await loadImage(fs.imageDataUrl);
  if (img){
    const cx = ox + fs.x * scale;
    const cy = oy + fs.y * scale;

    ctx.translate(cx, cy);
    ctx.rotate((fs.rotDeg * Math.PI) / 180);
    const s = fs.scale * scale;
    ctx.scale(s, s);
    ctx.drawImage(img, -img.width/2, -img.height/2);
    ctx.setTransform(1,0,0,1,0,0);
  }

  ctx.restore();

  // Subtle border
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.20)';
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, drawW, drawH);
  ctx.restore();

  return canvas;
}

async function renderAllTexturesForActive(){
  const t = getActiveTemplate();
  const tid = t.id;

  for (const faceId of t.faceOrder){
    await renderFaceTexture(tid, faceId);
  }
}

function applyTexturesTo3D(){
  const t = getActiveTemplate();
  const tid = t.id;

  if (t.type === 'cylinder'){
    const { canvas } = getFaceCanvas(tid, 'label');
    const url = canvas.toDataURL('image/png');

    const segs = previewObjectEl.querySelectorAll('.cyl-seg');
    segs.forEach(seg => {
      const i = Number(seg.dataset.i || 0);
      const n = Number(seg.dataset.n || 1);
      const pct = n <= 1 ? 0 : (i / (n - 1)) * 100;
      seg.style.backgroundImage = `url(${url})`;
      seg.style.backgroundPosition = `${pct}% 50%`;
    });

    return;
  }

  // Box-ish (carton/pouch)
  previewObjectEl.querySelectorAll('.face').forEach(el => {
    const faceId = el.getAttribute('data-face');
    if (t.faces[faceId]){
      const { canvas } = getFaceCanvas(tid, faceId);
      const url = canvas.toDataURL('image/png');
      el.style.backgroundImage = `url(${url})`;
      return;
    }

    // Non-editable faces (e.g. pouch sides) get a neutral material
    el.style.backgroundImage = 'linear-gradient(135deg, rgba(255,255,255,0.10), rgba(0,0,0,0.25))';
  });
}

let renderToken = 0;
async function renderAll(){
  const token = ++renderToken;

  const t = getActiveTemplate();
  if (t.supportsDepth) apply3DBoxDims();

  await renderAllTexturesForActive();
  if (token !== renderToken) return;

  applyTexturesTo3D();
  drawNet();
}

// --- 2D net layout + interaction ---
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

function drawSelectedImageBounds(ctx, templateId, faceId, x, y, w, h, netScale){
  const tState = ensureTemplateState(templateId);
  const fs = tState.faces[faceId];
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

  ctx.restore();
}

function drawNet(){
  const t = getActiveTemplate();
  const tid = t.id;
  const tState = getActiveTemplateState();

  const dpr = window.devicePixelRatio || 1;
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

  const rects = t.getNetRects();
  const all = Object.values(rects);
  const margin = 26;
  const minX = Math.min(...all.map(r => r.x));
  const minY = Math.min(...all.map(r => r.y));
  const maxX = Math.max(...all.map(r => r.x + r.w));
  const maxY = Math.max(...all.map(r => r.y + r.h));
  const netW = maxX - minX;
  const netH = maxY - minY;

  const scale = Math.min(
    (cssW - margin*2) / netW,
    (cssH - margin*2) / netH
  );

  const tx = margin + (cssW - margin*2 - netW*scale)/2 - minX*scale;
  const ty = margin + (cssH - margin*2 - netH*scale)/2 - minY*scale;

  // Store transform for hit test
  drawNet._hit = { rects, scale, tx, ty, faceOrder: [...t.faceOrder], templateId: tid };

  // Draw faces
  for (const faceId of t.faceOrder){
    const r = rects[faceId];
    const x = tx + r.x * scale;
    const y = ty + r.y * scale;
    const w = r.w * scale;
    const h = r.h * scale;

    const selected = (faceId === tState.selectedFace);

    // Base
    nctx.fillStyle = selected ? 'rgba(122,162,255,0.10)' : 'rgba(255,255,255,0.05)';
    nctx.fillRect(x, y, w, h);

    // Image (if loaded)
    const fs = tState.faces[faceId];
    const img = imageCache.get(fs.imageDataUrl);
    if (img){
      nctx.save();
      nctx.beginPath();
      nctx.rect(x, y, w, h);
      nctx.clip();

      const cx = x + fs.x * scale;
      const cy = y + fs.y * scale;
      nctx.translate(cx, cy);
      nctx.rotate((fs.rotDeg * Math.PI) / 180);
      nctx.scale(fs.scale * scale, fs.scale * scale);
      nctx.drawImage(img, -img.width/2, -img.height/2);
      nctx.setTransform(dpr,0,0,dpr,0,0);

      nctx.restore();
    }

    if (state.ui?.showGuides !== false) drawFaceGuides(nctx, x, y, w, h);
    if (selected) drawSelectedImageBounds(nctx, tid, faceId, x, y, w, h, scale);

    // Border
    nctx.lineWidth = selected ? 3 : 2;
    nctx.strokeStyle = selected ? 'rgba(122,162,255,0.95)' : 'rgba(255,255,255,0.22)';
    nctx.strokeRect(x, y, w, h);

    // Label
    nctx.font = '12px ui-sans-serif, system-ui';
    nctx.fillStyle = 'rgba(0,0,0,0.55)';
    nctx.fillRect(x+6, y+6, Math.min(170, w-12), 18);
    nctx.fillStyle = 'rgba(255,255,255,0.9)';
    nctx.fillText(t.faces[faceId].label.split(' ')[0], x+10, y+19);
  }

  nctx.restore();
}

function hitTestFace(px, py){
  const h = drawNet._hit;
  if (!h) return null;
  for (const faceId of h.faceOrder){
    const r = h.rects[faceId];
    const x = h.tx + r.x * h.scale;
    const y = h.ty + r.y * h.scale;
    const w = r.w * h.scale;
    const hh = r.h * h.scale;
    if (px >= x && px <= x+w && py >= y && py <= y+hh) return faceId;
  }
  return null;
}

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

  const tState = getActiveTemplateState();
  dragStart = { x, y, face: tState.selectedFace, orig: { ...tState.faces[tState.selectedFace] } };
});

netCanvas.addEventListener('pointermove', (e) => {
  if (!dragging || !dragStart) return;
  const rect = netCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const h = drawNet._hit;
  if (!h) return;

  const dxPx = x - dragStart.x;
  const dyPx = y - dragStart.y;
  const faceUnitPerPx = 1 / h.scale;

  const tState = getActiveTemplateState();
  const faceId = tState.selectedFace;
  const fs = tState.faces[faceId];

  fs.x = Math.round(dragStart.orig.x + dxPx * faceUnitPerPx);
  fs.y = Math.round(dragStart.orig.y + dyPx * faceUnitPerPx);

  syncControlsFromState();
  renderAll();
  saveStateDebounced();
});

netCanvas.addEventListener('pointerup', () => {
  dragging = false;
  dragStart = null;
});

netCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const tState = getActiveTemplateState();
  const fs = tState.faces[tState.selectedFace];

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

  const tState = getActiveTemplateState();
  const fs = tState.faces[tState.selectedFace];

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

// --- Panel controls ---
function syncControlsFromState(){
  const tState = getActiveTemplateState();
  const fs = tState.faces[tState.selectedFace];
  inpX.value = fs.x;
  inpY.value = fs.y;
  inpScale.value = fs.scale;
  inpRot.value = fs.rotDeg;
}

function syncStateFromControls(){
  const tState = getActiveTemplateState();
  const fs = tState.faces[tState.selectedFace];
  fs.x = Number(inpX.value);
  fs.y = Number(inpY.value);
  fs.scale = Math.max(0.01, Number(inpScale.value));
  fs.rotDeg = Number(inpRot.value);
  renderAll();
  saveStateDebounced();
}

templateSelect.addEventListener('change', () => setActiveTemplate(templateSelect.value));
faceSelect.addEventListener('change', () => setSelectedFace(faceSelect.value));
[inpX, inpY, inpScale, inpRot].forEach(el => el.addEventListener('input', syncStateFromControls));

btnCenter.addEventListener('click', () => {
  const t = getActiveTemplate();
  const tState = getActiveTemplateState();
  const faceId = tState.selectedFace;
  const { w, h } = t.faces[faceId];
  const fs = tState.faces[faceId];
  fs.x = Math.round(w/2);
  fs.y = Math.round(h/2);
  syncControlsFromState();
  renderAll();
  saveStateDebounced();
});

btnRemoveImage.addEventListener('click', () => {
  const tState = getActiveTemplateState();
  tState.faces[tState.selectedFace].imageDataUrl = null;
  renderAll();
  saveStateDebounced();
});

fileImage.addEventListener('change', async () => {
  const f = fileImage.files?.[0];
  if (!f) return;
  const dataUrl = await fileToDataUrl(f);
  const tState = getActiveTemplateState();
  tState.faces[tState.selectedFace].imageDataUrl = dataUrl;
  await renderAll();
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
    ensureTemplateState(state.activeTemplate);
    renderTemplateOptions();
    renderFaceOptions();
    rebuildPreview();
    syncUiControlsFromState();
    syncControlsFromState();
    await renderAll();
    saveStateDebounced();
  } catch (e){
    alert('匯入失敗：' + (e?.message || e));
  } finally {
    fileImport.value = '';
  }
});

btnClear.addEventListener('click', async () => {
  if (!confirm('確定要清除目前設計？')) return;
  state = defaultRootState();
  renderTemplateOptions();
  renderFaceOptions();
  rebuildPreview();
  syncUiControlsFromState();
  syncControlsFromState();
  await renderAll();
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

// Initial boot
renderTemplateOptions();
renderFaceOptions();
ensureCanvasTools();
rebuildPreview();
applyOrbit();
syncControlsFromState();
syncUiControlsFromState();

renderAll();
if (loadState._migrated) saveStateDebounced();

window.addEventListener('resize', () => drawNet());
