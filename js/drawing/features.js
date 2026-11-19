/**
 * Analytic recognition from tessellated B-rep faces.
 * A full Open CASCADE WASM build is about 49 MB (about 9 MB compressed),
 * which is too large to ship beside the existing reader, so each face is
 * fitted here: plane, cylinder, cone or an arc. Lengths snap to a sensible
 * millimetre when the fit is already within a small tolerance of that value.
 */

import { dot, sub, add, mul, length, norm } from './geometry.js';

export function snapLength(value) {
  if (!Number.isFinite(value)) return value;
  const integer = Math.round(value);
  if (Math.abs(value - integer) <= 0.15) return integer;
  const half = Math.round(value * 2) / 2;
  if (Math.abs(value - half) <= 0.08) return half;
  return Math.round(value * 10) / 10;
}

function mean(points) {
  const c = [0, 0, 0];
  for (const p of points) {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  }
  return mul(c, 1 / points.length);
}

function covariance(points, centre) {
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const p of points) {
    const d = sub(p, centre);
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) m[r * 3 + c] += d[r] * d[c];
    }
  }
  return m;
}

function invert3(m) {
  const a = m[0]; const b = m[1]; const c = m[2];
  const d = m[3]; const e = m[4]; const f = m[5];
  const g = m[6]; const h = m[7]; const i = m[8];
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-9) return null;
  const inv = 1 / det;
  return [
    A * inv, (c * h - b * i) * inv, (b * f - c * e) * inv,
    B * inv, (a * i - c * g) * inv, (c * d - a * f) * inv,
    C * inv, (b * g - a * h) * inv, (a * e - b * d) * inv,
  ];
}

function mul3(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

function smallestAxis(points, centre) {
  const cov = covariance(points, centre);
  const inv = invert3(cov);
  if (!inv) return norm([cov[2], cov[5], cov[8]]);
  let v = [0.3, 0.5, 0.8];
  for (let i = 0; i < 16; i += 1) v = norm(mul3(inv, v));
  return v;
}

function uniquePoints(tris, ids, limit = 800) {
  const seen = new Set();
  const points = [];
  const step = Math.max(1, Math.floor(ids.length / limit));
  for (let n = 0; n < ids.length; n += step) {
    const tri = tris[ids[n]];
    for (const p of [
      [tri.ax, tri.ay, tri.az],
      [tri.bx, tri.by, tri.bz],
      [tri.cx, tri.cy, tri.cz],
    ]) {
      const key = `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)},${Math.round(p[2] * 20)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      points.push(p);
    }
  }
  return points;
}

export function classifyFace(points, normals = []) {
  if (points.length < 6) return null;
  const centre = mean(points);
  const normal = smallestAxis(points, centre);
  let maxPlane = 0;
  let size = 0;
  for (const p of points) {
    const d = sub(p, centre);
    maxPlane = Math.max(maxPlane, Math.abs(dot(d, normal)));
    size = Math.max(size, length(d));
  }
  if (maxPlane <= Math.max(0.2, size * 0.012)) {
    return { type: 'plane', normal, origin: centre };
  }
  const axis = smallestFromVectors(normals.length >= 4 ? normals : points);
  let radialMean = 0;
  const radial = [];
  const axial = [];
  for (const p of points) {
    const d = sub(p, centre);
    const along = dot(d, axis);
    const radius = length(sub(d, mul(axis, along)));
    radial.push(radius);
    axial.push(along);
    radialMean += radius;
  }
  radialMean /= points.length;
  if (radialMean < 0.3) return null;
  let variance = 0;
  for (const radius of radial) variance += (radius - radialMean) ** 2;
  const deviation = Math.sqrt(variance / points.length);
  if (deviation <= Math.max(0.25, radialMean * 0.035)) {
    return {
      type: 'cylinder',
      axis,
      origin: centre,
      radius: snapLength(radialMean),
      rawRadius: radialMean,
    };
  }
  let sumA = 0;
  let sumR = 0;
  let sumAA = 0;
  let sumAR = 0;
  for (let i = 0; i < axial.length; i += 1) {
    sumA += axial[i];
    sumR += radial[i];
    sumAA += axial[i] * axial[i];
    sumAR += axial[i] * radial[i];
  }
  const n = axial.length;
  const denom = n * sumAA - sumA * sumA;
  if (Math.abs(denom) < 1e-6) return null;
  const slope = (n * sumAR - sumA * sumR) / denom;
  const intercept = (sumR - slope * sumA) / n;
  let residual = 0;
  for (let i = 0; i < n; i += 1) residual += (radial[i] - (intercept + slope * axial[i])) ** 2;
  residual = Math.sqrt(residual / n);
  if (residual <= Math.max(0.3, radialMean * 0.05) && Math.abs(slope) > 0.08) {
    return {
      type: 'cone',
      axis,
      origin: centre,
      radius: snapLength(radialMean),
      rawRadius: radialMean,
      slope,
    };
  }
  return null;
}

function smallestFromVectors(vectors) {
  if (vectors.length < 4) return [0, 0, 1];
  const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const n of vectors) {
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) cov[r * 3 + c] += n[r] * n[c];
    }
  }
  const inv = invert3(cov);
  if (!inv) return [0, 0, 1];
  let v = [0.2, 0.7, 0.4];
  for (let i = 0; i < 16; i += 1) v = norm(mul3(inv, v));
  return v;
}

export function recogniseFaces(model) {
  const faces = [];
  model.faces.forEach((face, index) => {
    const points = uniquePoints(model.tris, face.triIds);
    const normals = face.triIds.map((id) => {
      const tri = model.tris[id];
      return [tri.nx, tri.ny, tri.nz];
    });
    const fit = classifyFace(points, normals);
    if (!fit) return;
    faces.push({ ...fit, index, points });
  });
  return faces;
}

function sameFeature(a, b) {
  if (Math.abs(a.diameter - b.diameter) > 0.25) return false;
  if (Math.abs(Math.abs(dot(a.axis, b.axis)) - 1) > 0.06) return false;
  const offset = sub(b.center, a.center);
  const along = dot(offset, a.axis);
  const radial = length(sub(offset, mul(a.axis, along)));
  return radial < Math.max(0.7, Math.min(a.radius, b.radius) * 0.1);
}

export function collectFeatures(model) {
  const recognised = recogniseFaces(model);
  const raw = [];
  for (const circle of model.circles?.all || []) {
    const diameter = snapLength(circle.diameter);
    if (diameter < 0.8) continue;
    raw.push({
      diameter,
      radius: diameter / 2,
      center: circle.center,
      axis: circle.normal,
      hole: Boolean(circle.hole),
    });
  }
  for (const face of recognised) {
    if (face.type !== 'cylinder' && face.type !== 'cone') continue;
    const diameter = snapLength((face.rawRadius ?? face.radius) * 2);
    if (diameter < 0.8) continue;
    raw.push({
      diameter,
      radius: diameter / 2,
      center: face.origin,
      axis: face.axis,
      hole: false,
    });
  }
  const features = [];
  for (const item of raw) {
    const twin = features.find((other) => sameFeature(item, other));
    if (!twin) features.push({ ...item });
    else if (item.hole) twin.hole = true;
  }
  const diameters = [];
  const radii = [];
  for (const feature of features) {
    const fillet = !feature.hole && feature.diameter < 8;
    const bucket = fillet ? radii : diameters;
    const key = fillet ? feature.radius : feature.diameter;
    const found = bucket.find((group) => Math.abs(group.size - key) < 0.05);
    if (found) found.features.push(feature);
    else bucket.push({ size: key, features: [feature], kind: fillet ? 'radius' : 'diameter' });
  }
  return { diameters, radii, recognised };
}

/** Snap a feature centre onto a coaxial axis when it is already very close. */
export function snapCentre(centre, axisOrigin, axis) {
  const offset = sub(centre, axisOrigin);
  const along = dot(offset, axis);
  const radial = sub(offset, mul(axis, along));
  if (length(radial) <= 0.4) return add(axisOrigin, mul(axis, along));
  return centre;
}
