/**
 * Shared STEP result helpers. Used by the viewer and by the Node tests.
 * Coordinates are millimetres (occt-import-js linearUnit: millimeter).
 */

export const STEP_IMPORT_PARAMS = Object.freeze({
  linearUnit: 'millimeter',
  linearDeflectionType: 'bounding_box_ratio',
  linearDeflection: 0.001,
  angularDeflection: 0.5,
});

/** Warn once a file is about 50 MB or larger. It is still read on the device. */
export const LARGE_FILE_BYTES = 50 * 1024 * 1024;

export function needsLargeFileWarning(bytes) {
  return Number.isFinite(bytes) && bytes >= LARGE_FILE_BYTES;
}

export function isStepFilename(name) {
  return typeof name === 'string' && /\.(step|stp)$/i.test(name);
}

/**
 * Axis-aligned bounds of every vertex. Returns null when there is no
 * finite geometry.
 */
export function boundingBox(result) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let count = 0;
  const meshes = result?.meshes || [];
  for (const mesh of meshes) {
    const arr = mesh.attributes?.position?.array || mesh.position;
    if (!arr) continue;
    for (let i = 0; i + 2 < arr.length; i += 3) {
      const x = arr[i];
      const y = arr[i + 1];
      const z = arr[i + 2];
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return null;
      }
      if (x < min[0]) min[0] = x;
      if (y < min[1]) min[1] = y;
      if (z < min[2]) min[2] = z;
      if (x > max[0]) max[0] = x;
      if (y > max[1]) max[1] = y;
      if (z > max[2]) max[2] = z;
      count += 1;
    }
  }
  if (count === 0) return null;
  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}

/**
 * A box is sensible when every side is finite and non-negative, the part
 * is not a single point, and it is not so large that the units have
 * clearly blown up (10 km).
 */
export function isSensibleBoundingBox(box) {
  if (!box || !Array.isArray(box.size) || box.size.length !== 3) return false;
  let largest = 0;
  for (const size of box.size) {
    if (!Number.isFinite(size) || size < -1e-6) return false;
    if (size > largest) largest = size;
  }
  for (const value of [...box.min, ...box.max]) {
    if (!Number.isFinite(value)) return false;
  }
  return largest > 0.01 && largest < 1e7;
}

export function countFaces(result) {
  let faces = 0;
  for (const mesh of result?.meshes || []) {
    faces += mesh.brep_faces?.length || 0;
  }
  return faces;
}

export function countTriangles(result) {
  let triangles = 0;
  for (const mesh of result?.meshes || []) {
    const index = mesh.index?.array || mesh.index;
    if (index?.length) triangles += index.length / 3;
  }
  return triangles;
}
