import { formatBox, formatBytes, formatDuration } from './format.js';
import {
  boundingBox,
  countFaces,
  isStepFilename,
  needsLargeFileWarning,
} from './step-model.js';
import { createViewer } from './viewer.js';
import { createDrawing } from './drawing/create.js';
import { readGridVisible, writeGridVisible } from './settings.js';
import { exportDrawingPdf, exportDrawingPng } from './export-client.js';

const fileInput = document.querySelector('#file-input');
const stage = document.querySelector('#stage');
const empty = document.querySelector('#empty');
const dropHint = document.querySelector('#drop-hint');
const loading = document.querySelector('#loading');
const loadingText = document.querySelector('#loading-text');
const errorBox = document.querySelector('#error');
const bboxValue = document.querySelector('#bbox-value');
const stageTitle = document.querySelector('#stage-title');
const tree = document.querySelector('#tree');
const infoName = document.querySelector('#info-name');
const infoSize = document.querySelector('#info-size');
const infoFaces = document.querySelector('#info-faces');
const infoEdges = document.querySelector('#info-edges');
const infoTime = document.querySelector('#info-time');
const themeToggle = document.querySelector('#theme-toggle');
const largeDialog = document.querySelector('#large-file');
const largeText = document.querySelector('#large-file-text');
const viewButtons = [...document.querySelectorAll('[data-view]')];
const createButton = document.querySelector('#create-drawing');
const drawSetup = document.querySelector('#draw-setup');
const frontFace = document.querySelector('#front-face');
const rotateButton = document.querySelector('#rotate-quarter');
const rotateState = document.querySelector('#rotate-state');
const sheetPreview = document.querySelector('#sheet-preview');
const sheetStage = document.querySelector('#sheet-stage');
const sheetViewport = document.querySelector('#sheet-viewport');
const sheetNote = document.querySelector('#sheet-note');

const canvas = document.querySelector('#view');
const viewer = createViewer(canvas);
const gridToggle = document.querySelector('#grid-toggle');
let gridVisible = readGridVisible(localStorage);
viewer.setGridVisible(gridVisible);
gridToggle.setAttribute('aria-pressed', gridVisible ? 'true' : 'false');
gridToggle.addEventListener('click', () => {
  gridVisible = !gridVisible;
  writeGridVisible(gridVisible, localStorage);
  viewer.setGridVisible(gridVisible);
  gridToggle.setAttribute('aria-pressed', gridVisible ? 'true' : 'false');
});

const THEME_KEY = 'sdc-theme';
let chosenTheme = null;
const storedTheme = localStorage.getItem(THEME_KEY);
if (storedTheme === 'light' || storedTheme === 'dark') chosenTheme = storedTheme;

let worker = null;
let requestId = 0;
let dragDepth = 0;
let currentResult = null;
let currentName = '';
let quarterTurns = 0;
let currentSvg = '';
let sheetZoom = 1;
let sheetPanX = 0;
let sheetPanY = 0;

function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function effectiveTheme() {
  return chosenTheme || systemTheme();
}

function applyTheme() {
  const theme = effectiveTheme();
  document.documentElement.dataset.theme = theme;
  viewer.setTheme(theme);
  themeToggle.textContent = theme === 'dark' ? 'Light theme' : 'Dark theme';
  themeToggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#14181d' : '#1e2a36');
}

themeToggle.addEventListener('click', () => {
  chosenTheme = effectiveTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, chosenTheme);
  applyTheme();
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!chosenTheme) applyTheme();
});

applyTheme();

function setBusy(busy, message) {
  stage.setAttribute('aria-busy', busy ? 'true' : 'false');
  loading.hidden = !busy;
  if (message) loadingText.textContent = message;
  if (busy) setViewsEnabled(false);
}

function showError(message) {
  errorBox.hidden = false;
  errorBox.textContent = message;
  setBusy(false);
  if (empty.hidden) setViewsEnabled(true);
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = '';
}

function setViewsEnabled(enabled) {
  for (const button of viewButtons) button.disabled = !enabled;
}

function resetDetails() {
  tree.replaceChildren();
  const note = document.createElement('p');
  note.className = 'muted';
  note.textContent = 'No file open.';
  tree.append(note);
  infoName.textContent = '—';
  infoSize.textContent = '—';
  infoFaces.textContent = '—';
  infoEdges.textContent = '—';
  infoTime.textContent = '—';
  bboxValue.textContent = '—';
  stageTitle.hidden = true;
  stageTitle.textContent = '';
  empty.hidden = false;
  setViewsEnabled(false);
  currentResult = null;
  currentName = '';
  createButton.disabled = true;
  drawSetup.hidden = true;
}

function renderNode(node, fallback, isRoot) {
  const item = document.createElement('li');
  const label = document.createElement('span');
  const given = (node.name || '').trim();
  label.textContent = given || (isRoot ? fallback : 'Unnamed');
  item.append(label);
  const children = node.children || [];
  if (children.length) {
    const list = document.createElement('ul');
    for (const child of children) list.append(renderNode(child, 'Unnamed', false));
    item.append(list);
  }
  return item;
}

function showModel(file, result, loadMs) {
  const box = boundingBox(result);
  if (!result?.success || !(result.meshes || []).length || !box) {
    showError('This file could not be read as STEP. It may be damaged, or it may not be a STEP model.');
    return;
  }
  let built;
  try {
    built = viewer.setModel(result);
  } catch (error) {
    showError('The file was read, but the 3D view could not be built.');
    return;
  }
  const fileLabel = file.name.replace(/\.(step|stp)$/i, '');
  const list = document.createElement('ul');
  list.append(renderNode(result.root || { name: '', meshes: [], children: [] }, fileLabel, true));
  tree.replaceChildren(list);
  infoName.textContent = file.name;
  infoSize.textContent = formatBytes(file.size);
  infoFaces.textContent = countFaces(result).toLocaleString('en-GB');
  infoEdges.textContent = Math.round(built.edges).toLocaleString('en-GB');
  infoTime.textContent = formatDuration(loadMs);
  bboxValue.textContent = formatBox(box);
  stageTitle.hidden = false;
  stageTitle.textContent = file.name;
  empty.hidden = true;
  clearError();
  setViewsEnabled(true);
  setBusy(false);
  currentResult = result;
  currentName = file.name.replace(/\.(step|stp)$/i, '');
  createButton.disabled = false;
  drawSetup.hidden = false;
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./step-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (event) => {
    const data = event.data || {};
    if (data.id !== requestId) return;
    if (data.type === 'status') {
      loadingText.textContent = data.message;
      return;
    }
    if (data.type === 'error') {
      showError(data.message || 'This file could not be read.');
      return;
    }
    if (data.type === 'result') {
      const file = worker._file;
      const started = worker._started;
      if (!data.result?.success) {
        showError('This file could not be read as STEP. It may be damaged, or it may not be a STEP model.');
        return;
      }
      loadingText.textContent = 'Building the view…';
      const loadMs = performance.now() - started;
      requestAnimationFrame(() => showModel(file, data.result, loadMs));
    }
  };
  worker.onerror = () => {
    worker = null;
    showError('The STEP reader could not start. Open this page over a local web server, not as a file.');
  };
  return worker;
}

async function confirmLarge(file) {
  const message = `${file.name} is ${formatBytes(file.size)}. Files above 50 MB can be slow, and a phone may run out of memory. The file is still read only on this device.`;
  if (typeof largeDialog.showModal === 'function') {
    largeText.textContent = message;
    largeDialog.returnValue = '';
    largeDialog.showModal();
    const choice = await new Promise((resolve) => {
      largeDialog.addEventListener('close', () => resolve(largeDialog.returnValue), { once: true });
    });
    return choice === 'continue';
  }
  return window.confirm(message);
}

async function openFile(file) {
  if (!file) return;
  if (!isStepFilename(file.name)) {
    showError('Choose a .step or .stp file.');
    return;
  }
  if (file.size === 0) {
    showError('That file is empty.');
    return;
  }
  if (needsLargeFileWarning(file.size)) {
    const proceed = await confirmLarge(file);
    if (!proceed) return;
  }
  const id = ++requestId;
  const started = performance.now();
  clearError();
  setBusy(true, 'Reading the file…');
  try {
    const buffer = await file.arrayBuffer();
    if (id !== requestId) return;
    const active = getWorker();
    active._file = file;
    active._started = started;
    active.postMessage({ id, buffer }, [buffer]);
  } catch (error) {
    if (id !== requestId) return;
    showError('The file could not be read from this device.');
  }
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (file) void openFile(file);
});

function hasFiles(event) {
  return [...(event.dataTransfer?.types || [])].includes('Files');
}

window.addEventListener('dragenter', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragDepth += 1;
  dropHint.hidden = false;
  stage.classList.add('is-drag');
});

window.addEventListener('dragover', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
});

window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    dropHint.hidden = true;
    stage.classList.remove('is-drag');
  }
});

window.addEventListener('drop', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragDepth = 0;
  dropHint.hidden = true;
  stage.classList.remove('is-drag');
  const file = event.dataTransfer.files?.[0];
  if (file) void openFile(file);
});

for (const button of viewButtons) {
  button.addEventListener('click', () => {
    const name = button.dataset.view;
    if (name === 'fit') viewer.frame();
    else viewer.frame(viewer.views[name]);
  });
}

const FACE_LABELS = {
  negY: '−Y',
  posY: '+Y',
  posX: '+X',
  negX: '−X',
  posZ: '+Z',
  negZ: '−Z',
};

function updateRotateState() {
  const face = FACE_LABELS[frontFace.value] || '−Y';
  rotateState.textContent = `Rotation ${quarterTurns * 90}°. The front view looks at the ${face} face.`;
}

function realignModel() {
  if (!currentResult) return;
  viewer.setFrontFace(frontFace.value, quarterTurns);
}

rotateButton.addEventListener('click', () => {
  quarterTurns = (quarterTurns + 1) % 4;
  updateRotateState();
  realignModel();
});
frontFace.addEventListener('change', () => {
  updateRotateState();
  realignModel();
});

function applySheetTransform() {
  sheetStage.style.transform = `translate(${sheetPanX}px, ${sheetPanY}px) scale(${sheetZoom})`;
}

function showSheet(drawing) {
  currentSvg = drawing.svg;
  sheetZoom = 1;
  sheetPanX = 0;
  sheetPanY = 0;
  applySheetTransform();
  sheetStage.innerHTML = drawing.svg;
  const extra = drawing.warnings.length ? ` ${drawing.warnings[0]}` : '';
  sheetNote.textContent = `Scale ${drawing.scaleLabel}. Exports are free for now. A one-off unlock will be added later.${extra}`;
  sheetPreview.hidden = false;
}

createButton.addEventListener('click', () => {
  if (!currentResult || createButton.disabled) return;
  setBusy(true, 'Creating the drawing…');
  const result = currentResult;
  const title = currentName || 'Untitled';
  const front = frontFace.value;
  const turn = quarterTurns;
  requestAnimationFrame(() => {
    try {
      const drawing = createDrawing(result, { title, basis: viewer.getBasis() });
      showSheet(drawing);
      setBusy(false);
      setViewsEnabled(true);
    } catch (error) {
      showError('The drawing could not be created from this model.');
    }
  });
});

document.querySelector('#sheet-back').addEventListener('click', () => {
  sheetPreview.hidden = true;
});
document.querySelector('#sheet-in').addEventListener('click', () => {
  sheetZoom = Math.min(6, sheetZoom * 1.2);
  applySheetTransform();
});
document.querySelector('#sheet-out').addEventListener('click', () => {
  sheetZoom = Math.max(0.3, sheetZoom / 1.2);
  applySheetTransform();
});
document.querySelector('#sheet-fit').addEventListener('click', () => {
  sheetZoom = 1;
  sheetPanX = 0;
  sheetPanY = 0;
  applySheetTransform();
});

sheetViewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  sheetZoom = Math.min(6, Math.max(0.3, sheetZoom * (event.deltaY < 0 ? 1.1 : 0.9)));
  applySheetTransform();
}, { passive: false });

let drag = null;
const pointers = new Map();
sheetViewport.addEventListener('pointerdown', (event) => {
  sheetViewport.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  drag = { x: event.clientX, y: event.clientY, panX: sheetPanX, panY: sheetPanY };
});
sheetViewport.addEventListener('pointermove', (event) => {
  if (!pointers.has(event.pointerId)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (drag.pinch) {
      sheetZoom = Math.min(6, Math.max(0.3, drag.zoom * (dist / drag.pinch)));
      applySheetTransform();
    } else {
      drag.pinch = dist;
      drag.zoom = sheetZoom;
    }
    return;
  }
  if (!drag || pointers.size !== 1) return;
  sheetPanX = drag.panX + event.clientX - drag.x;
  sheetPanY = drag.panY + event.clientY - drag.y;
  applySheetTransform();
});
function endPointer(event) {
  pointers.delete(event.pointerId);
  if (pointers.size === 0) drag = null;
  else drag = { ...drag, pinch: null, panX: sheetPanX, panY: sheetPanY, x: event.clientX, y: event.clientY };
}
sheetViewport.addEventListener('pointerup', endPointer);
sheetViewport.addEventListener('pointercancel', endPointer);

function exportName(ext) {
  const base = (currentName || 'drawing').replace(/[^\w.-]+/g, '-');
  return `${base}-a3.${ext}`;
}

document.querySelector('#export-png').addEventListener('click', () => {
  if (!currentSvg) return;
  exportDrawingPng(currentSvg, exportName('png')).catch(() => {
    showError('The PNG export did not complete.');
  });
});
document.querySelector('#export-pdf').addEventListener('click', () => {
  if (!currentSvg) return;
  exportDrawingPdf(currentSvg, exportName('pdf')).catch(() => {
    showError('The PDF export did not complete.');
  });
});

resetDetails();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    // The app still works if the service worker cannot register.
  });
}
