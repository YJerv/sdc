import { formatBox, formatBytes, formatDuration } from './format.js';
import {
  boundingBox,
  countFaces,
  isStepFilename,
  needsLargeFileWarning,
} from './step-model.js';
import { createViewer } from './viewer.js';
import { createDrawing } from './drawing/create.js';
import { SHEET_SCALES } from './drawing/sheet.js';
import { readGridVisible, writeGridVisible } from './settings.js';
import { exportDrawingPdf, exportDrawingPng } from './export-client.js';
import { panBy, zoomAbout, zoomBy, hitSlopMm } from './sheet-gestures.js';
import { createSheetEditor, dimensionForOne, dimensionForPair, pickDimension, pickEntity } from './drawing/edit.js';

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
let currentDrawing = null;
let drawingScale = null;
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
  const setTop = document.querySelector('#set-top');
  if (setTop) setTop.disabled = !enabled;
  const align = document.querySelector('#align-axis');
  if (align) align.disabled = !enabled;
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
  viewer.cancelTop();
  showTopArm(false);
  viewer.cancelAlign();
  showAlign(false);
  currentResult = null;
  currentName = '';
  drawingScale = null;
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

const setTopButton = document.querySelector('#set-top');
const setTopHint = document.querySelector('#set-top-hint');

function showTopArm(armed) {
  setTopButton.setAttribute('aria-pressed', armed ? 'true' : 'false');
  setTopHint.hidden = !armed;
}

const alignButton = document.querySelector('#align-axis');
const alignHint = document.querySelector('#align-hint');

function showAlign(armed) {
  alignButton.setAttribute('aria-pressed', armed ? 'true' : 'false');
  alignHint.hidden = !armed;
}

setTopButton.addEventListener('click', () => {
  if (setTopButton.disabled) return;
  viewer.cancelAlign();
  showAlign(false);
  viewer.armTop();
  showTopArm(true);
});
document.querySelector('#set-top-cancel').addEventListener('click', () => {
  viewer.cancelTop();
  showTopArm(false);
});
viewer.onTopChosen(() => showTopArm(false));
alignButton.addEventListener('click', () => {
  if (alignButton.disabled) return;
  viewer.cancelTop();
  showTopArm(false);
  viewer.armAlign();
  showAlign(true);
});
document.querySelector('#align-cancel').addEventListener('click', () => {
  viewer.cancelAlign();
  showAlign(false);
});
viewer.onAlignChosen(() => showAlign(false));

for (const button of viewButtons) {
  button.addEventListener('click', () => {
    const name = button.dataset.view;
    if (!name) return;
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

function scaleIndex(label) {
  const index = SHEET_SCALES.findIndex((scale) => scale.label === label);
  return index < 0 ? 3 : index;
}

function showScale(label) {
  const index = scaleIndex(label);
  for (const id of ['sheet-scale', 'edit-scale']) {
    const input = document.querySelector(`#${id}`);
    if (input) input.value = String(index);
  }
  for (const id of ['sheet-scale-label', 'edit-scale-label']) {
    const node = document.querySelector(`#${id}`);
    if (node) node.textContent = label;
  }
}

function redrawAtScale(index) {
  if (!currentResult) return;
  const scale = SHEET_SCALES[Math.max(0, Math.min(SHEET_SCALES.length - 1, index))];
  drawingScale = scale.label;
  setBusy(true, 'Updating the scale…');
  const result = currentResult;
  const title = currentName || 'Untitled';
  const editing = !sheetEdit.hidden;
  requestAnimationFrame(() => {
    try {
      const drawing = createDrawing(result, {
        title,
        basis: viewer.getBasis(),
        scale: drawingScale,
      });
      showSheet(drawing);
      if (editing) openEdit();
      setBusy(false);
      setViewsEnabled(true);
    } catch (error) {
      showError('The drawing could not be scaled.');
    }
  });
}

function stepScale(delta) {
  const label = currentDrawing?.scaleLabel || '1:1';
  redrawAtScale(scaleIndex(drawingScale || label) + delta);
}

function showSheet(drawing) {
  currentDrawing = drawing;
  currentSvg = drawing.svg;
  showScale(drawing.scaleLabel);
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
      const drawing = createDrawing(result, { title, basis: viewer.getBasis(), scale: drawingScale });
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

const sheetEdit = document.querySelector('#sheet-edit');
const editStage = document.querySelector('#edit-stage');
const editViewport = document.querySelector('#edit-viewport');
const editState = { zoom: 1, panX: 0, panY: 0 };
let sheetEditor = null;
let deleteArmed = false;
let pendingDelete = null;
let featureMode = null;
let selectedFeatures = [];
const editOne = document.querySelector('#edit-one');
const editTwo = document.querySelector('#edit-two');
const editUpdate = document.querySelector('#edit-update');
const editDelete = document.querySelector('#edit-delete');
const editConfirm = document.querySelector('#edit-confirm');

function refreshEditSheet() {
  editStage.innerHTML = sheetEditor ? sheetEditor.svg() : currentSvg;
  currentSvg = editStage.innerHTML;
  if (pendingDelete) {
    const node = editStage.querySelector(`[data-dim-id="${pendingDelete}"]`);
    if (node) node.setAttribute('data-selected', 'true');
  }
  markPicks();
}

function markPicks() {
  const svg = editStage.querySelector('svg');
  if (!svg) return;
  svg.querySelector('#picks')?.remove();
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('id', 'picks');
  for (const id of selectedFeatures) {
    const entity = (currentDrawing?.entities || []).find((item) => item.id === id);
    if (!entity) continue;
    if (entity.type === 'circle') {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(entity.cx));
      circle.setAttribute('cy', String(entity.cy));
      circle.setAttribute('r', String(Math.max(entity.r, 2.2)));
      circle.setAttribute('fill', 'none');
      circle.setAttribute('stroke', '#1f4d6e');
      circle.setAttribute('stroke-width', '0.8');
      group.appendChild(circle);
    } else {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(entity.x1));
      line.setAttribute('y1', String(entity.y1));
      line.setAttribute('x2', String(entity.x2));
      line.setAttribute('y2', String(entity.y2));
      line.setAttribute('stroke', '#1f4d6e');
      line.setAttribute('stroke-width', '1.2');
      group.appendChild(line);
    }
  }
  svg.appendChild(group);
}

function setDeleteArmed(armed) {
  deleteArmed = armed;
  editDelete.setAttribute('aria-pressed', armed ? 'true' : 'false');
  if (armed) {
    featureMode = null;
    selectedFeatures = [];
    editOne.setAttribute('aria-pressed', 'false');
    editTwo.setAttribute('aria-pressed', 'false');
    editUpdate.disabled = true;
  }
  editNote(armed ? 'Tap a dimension to delete it.' : 'Pinch or scroll to zoom, and drag to pan. Zoom in to pick a small dimension.');
  if (!armed) {
    pendingDelete = null;
    editConfirm.hidden = true;
    refreshEditSheet();
  }
}

function setFeatureMode(mode) {
  featureMode = featureMode === mode ? null : mode;
  selectedFeatures = [];
  editUpdate.disabled = true;
  if (featureMode) {
    deleteArmed = false;
    pendingDelete = null;
    editConfirm.hidden = true;
    editDelete.setAttribute('aria-pressed', 'false');
  }
  editOne.setAttribute('aria-pressed', featureMode === 'one' ? 'true' : 'false');
  editTwo.setAttribute('aria-pressed', featureMode === 'two' ? 'true' : 'false');
  if (featureMode === 'one') editNote('Tap a hole, arc or straight edge.');
  else if (featureMode === 'two') editNote('Tap two features in the same view.');
  else editNote('Pinch or scroll to zoom, and drag to pan. Zoom in to pick a small dimension.');
  markPicks();
}

function editNote(text) {
  document.querySelector('#edit-note').textContent = text;
}

function sheetPoint(event) {
  const svg = editStage.querySelector('svg');
  if (!svg) return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  return point.matrixTransform(matrix.inverse());
}

function applyEditTransform() {
  editStage.style.transform = `translate(${editState.panX}px, ${editState.panY}px) scale(${editState.zoom})`;
}

function openEdit() {
  if (!currentDrawing) return;
  sheetEditor = createSheetEditor(currentDrawing);
  currentSvg = sheetEditor.svg();
  pendingDelete = null;
  featureMode = null;
  selectedFeatures = [];
  editOne.setAttribute('aria-pressed', 'false');
  editTwo.setAttribute('aria-pressed', 'false');
  editUpdate.disabled = true;
  setDeleteArmed(false);
  editState.zoom = 1;
  editState.panX = 0;
  editState.panY = 0;
  applyEditTransform();
  editStage.innerHTML = currentSvg;
  sheetPreview.hidden = true;
  sheetEdit.hidden = false;
}

document.querySelector('#edit-drawing').addEventListener('click', openEdit);
for (const [down, up, input] of [
  ['#sheet-scale-down', '#sheet-scale-up', '#sheet-scale'],
  ['#edit-scale-down', '#edit-scale-up', '#edit-scale'],
]) {
  document.querySelector(down).addEventListener('click', () => stepScale(-1));
  document.querySelector(up).addEventListener('click', () => stepScale(1));
  document.querySelector(input).addEventListener('input', (event) => {
    redrawAtScale(Number(event.target.value));
  });
}
document.querySelector('#edit-back').addEventListener('click', () => {
  sheetEdit.hidden = true;
  sheetPreview.hidden = false;
});
document.querySelector('#edit-in').addEventListener('click', () => {
  editState.zoom = zoomBy(editState.zoom, 1.25);
  applyEditTransform();
});
document.querySelector('#edit-out').addEventListener('click', () => {
  editState.zoom = zoomBy(editState.zoom, 0.8);
  applyEditTransform();
});
document.querySelector('#edit-fit').addEventListener('click', () => {
  editState.zoom = 1;
  editState.panX = 0;
  editState.panY = 0;
  applyEditTransform();
});
function anchorIn(viewport, clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function zoomEditAt(factor, anchorX, anchorY) {
  const next = zoomAbout(editState, zoomBy(editState.zoom, factor), anchorX, anchorY);
  editState.zoom = next.zoom;
  editState.panX = next.panX;
  editState.panY = next.panY;
  applyEditTransform();
}

editViewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  const anchor = anchorIn(editViewport, event.clientX, event.clientY);
  zoomEditAt(event.deltaY < 0 ? 1.1 : 0.9, anchor.x, anchor.y);
}, { passive: false });
const editPointers = new Map();
let editDrag = null;
editViewport.addEventListener('pointerdown', (event) => {
  editViewport.setPointerCapture(event.pointerId);
  editPointers.set(event.pointerId, { x: event.clientX, y: event.clientY, ox: event.clientX, oy: event.clientY });
  editDrag = { x: event.clientX, y: event.clientY, panX: editState.panX, panY: editState.panY };
});
editViewport.addEventListener('pointermove', (event) => {
  if (!editPointers.has(event.pointerId)) return;
  const prev = editPointers.get(event.pointerId);
  editPointers.set(event.pointerId, { ...prev, x: event.clientX, y: event.clientY });
  if (editPointers.size === 2) {
    const [a, b] = [...editPointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (editDrag.pinch) {
      const mid = anchorIn(editViewport, (a.x + b.x) / 2, (a.y + b.y) / 2);
      const next = zoomAbout(editDrag, zoomBy(editDrag.zoom, dist / editDrag.pinch), mid.x, mid.y);
      editState.zoom = next.zoom;
      editState.panX = next.panX;
      editState.panY = next.panY;
    } else {
      editDrag.pinch = dist;
      editDrag.zoom = editState.zoom;
      editDrag.panX = editState.panX;
      editDrag.panY = editState.panY;
    }
    applyEditTransform();
    return;
  }
  if (!editDrag || editPointers.size !== 1) return;
  const next = panBy({ x: editDrag.panX, y: editDrag.panY }, event.clientX - editDrag.x, event.clientY - editDrag.y);
  editState.panX = next.x;
  editState.panY = next.y;
  applyEditTransform();
});
function endEditPointer(event) {
  const start = editPointers.get(event.pointerId);
  const moved = start ? Math.hypot(event.clientX - start.ox, event.clientY - start.oy) : 99;
  editPointers.delete(event.pointerId);
  if (editPointers.size === 0) editDrag = null;
  else editDrag = { ...editDrag, pinch: null, panX: editState.panX, panY: editState.panY, x: event.clientX, y: event.clientY, zoom: editState.zoom };
  if (deleteArmed && moved < 8 && editPointers.size === 0) {
    const point = sheetPoint(event);
    if (!point || !sheetEditor) return;
    const dim = pickDimension(sheetEditor.dimensions(), point.x, point.y, hitSlopMm(editState.zoom));
    if (!dim) return;
    pendingDelete = dim.id;
    editConfirm.hidden = false;
    editNote('Delete this dimension?');
    refreshEditSheet();
    return;
  }
  if (featureMode && moved < 8 && editPointers.size === 0) {
    const point = sheetPoint(event);
    if (!point || !currentDrawing) return;
    const entity = pickEntity(currentDrawing.entities || [], point.x, point.y, hitSlopMm(editState.zoom));
    if (!entity) return;
    if (featureMode === 'one') selectedFeatures = [entity.id];
    else if (!selectedFeatures.length || selectedFeatures[0] === entity.id) selectedFeatures = [entity.id];
    else {
      const first = currentDrawing.entities.find((item) => item.id === selectedFeatures[0]);
      if (first && first.view !== entity.view) {
        editNote('Choose two features in the same view.');
        return;
      }
      selectedFeatures = [selectedFeatures[0], entity.id];
    }
    editUpdate.disabled = featureMode === 'one' ? selectedFeatures.length !== 1 : selectedFeatures.length !== 2;
    markPicks();
  }
}
editDelete.addEventListener('click', () => {
  setDeleteArmed(!deleteArmed);
});
document.querySelector('#edit-confirm-yes').addEventListener('click', () => {
  if (!sheetEditor || !pendingDelete) return;
  sheetEditor.remove(pendingDelete);
  pendingDelete = null;
  editConfirm.hidden = true;
  setDeleteArmed(false);
  refreshEditSheet();
});
document.querySelector('#edit-confirm-no').addEventListener('click', () => {
  pendingDelete = null;
  editConfirm.hidden = true;
  setDeleteArmed(false);
});
editOne.addEventListener('click', () => setFeatureMode('one'));
editTwo.addEventListener('click', () => setFeatureMode('two'));
document.querySelector('#edit-undo').addEventListener('click', () => {
  if (!sheetEditor || !sheetEditor.undo()) {
    editNote('Nothing to undo.');
    return;
  }
  selectedFeatures = [];
  pendingDelete = null;
  editConfirm.hidden = true;
  editUpdate.disabled = true;
  refreshEditSheet();
  editNote('Undone. Export uses this sheet.');
});
editUpdate.addEventListener('click', () => {
  if (!sheetEditor || !currentDrawing) return;
  const chosen = selectedFeatures.map((id) => currentDrawing.entities.find((item) => item.id === id));
  const dim = featureMode === 'two'
    ? dimensionForPair(chosen[0], chosen[1], sheetEditor.dimensions())
    : dimensionForOne(chosen[0], sheetEditor.dimensions());
  if (!dim) {
    editNote('Those features do not make a dimension.');
    return;
  }
  sheetEditor.add(dim);
  selectedFeatures = [];
  editUpdate.disabled = true;
  refreshEditSheet();
  editNote('Dimension added. Export uses this sheet.');
});
editViewport.addEventListener('pointerup', endEditPointer);
editViewport.addEventListener('pointercancel', endEditPointer);
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

function zoomSheetAt(factor, anchorX, anchorY) {
  const next = zoomAbout(
    { panX: sheetPanX, panY: sheetPanY, zoom: sheetZoom },
    zoomBy(sheetZoom, factor),
    anchorX,
    anchorY,
  );
  sheetZoom = next.zoom;
  sheetPanX = next.panX;
  sheetPanY = next.panY;
  applySheetTransform();
}

sheetViewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  const anchor = anchorIn(sheetViewport, event.clientX, event.clientY);
  zoomSheetAt(event.deltaY < 0 ? 1.1 : 0.9, anchor.x, anchor.y);
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
      const mid = anchorIn(sheetViewport, (a.x + b.x) / 2, (a.y + b.y) / 2);
      const next = zoomAbout(drag, zoomBy(drag.zoom, dist / drag.pinch), mid.x, mid.y);
      sheetZoom = next.zoom;
      sheetPanX = next.panX;
      sheetPanY = next.panY;
      applySheetTransform();
    } else {
      drag.pinch = dist;
      drag.zoom = sheetZoom;
      drag.panX = sheetPanX;
      drag.panY = sheetPanY;
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
