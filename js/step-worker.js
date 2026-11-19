import occtimportjs from '../vendor/occt-import-js/occt-import-js.js';
import { STEP_IMPORT_PARAMS } from './step-model.js';

const wasmUrl = new URL('../vendor/occt-import-js/occt-import-js.wasm', import.meta.url);

let occtPromise = null;

function loadOcct() {
  if (!occtPromise) {
    occtPromise = (async () => {
      const response = await fetch(wasmUrl);
      if (!response.ok) {
        throw new Error(`STEP reader failed to load (${response.status}).`);
      }
      const wasmBinary = await response.arrayBuffer();
      return occtimportjs({
        wasmBinary,
        locateFile: (path) => (path.endsWith('.wasm') ? wasmUrl.href : path),
      });
    })();
  }
  return occtPromise;
}

function copyNumbers(value) {
  if (!value) return null;
  return Array.from(value);
}

function plainNode(node) {
  if (!node) return { name: '', meshes: [], children: [] };
  return {
    name: node.name || '',
    meshes: Array.from(node.meshes || []),
    children: (node.children || []).map(plainNode),
  };
}

function plainMesh(mesh) {
  return {
    name: mesh.name || '',
    color: mesh.color ? [mesh.color[0], mesh.color[1], mesh.color[2]] : null,
    brep_faces: (mesh.brep_faces || []).map((face) => ({
      first: face.first,
      last: face.last,
      color: face.color ? [face.color[0], face.color[1], face.color[2]] : null,
    })),
    position: copyNumbers(mesh.attributes?.position?.array),
    normal: copyNumbers(mesh.attributes?.normal?.array),
    index: copyNumbers(mesh.index?.array),
  };
}

self.onmessage = async (event) => {
  const { id, buffer } = event.data;
  const firstLoad = !occtPromise;
  try {
    if (firstLoad) {
      self.postMessage({ id, type: 'status', message: 'Preparing the STEP reader…' });
    }
    const occt = await loadOcct();
    self.postMessage({ id, type: 'status', message: 'Reading the STEP file on this device…' });
    const started = performance.now();
    const raw = occt.ReadStepFile(new Uint8Array(buffer), STEP_IMPORT_PARAMS);
    const parseMs = performance.now() - started;
    const result = raw?.success
      ? { success: true, root: plainNode(raw.root), meshes: (raw.meshes || []).map(plainMesh) }
      : { success: false };
    self.postMessage({ id, type: 'result', parseMs, result });
  } catch (error) {
    occtPromise = null;
    self.postMessage({
      id,
      type: 'error',
      message: 'Something went wrong while reading this file. It may be too complex for this device, or it may not be valid STEP.',
    });
  }
};
