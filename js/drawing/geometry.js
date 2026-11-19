/**
 * Project a tessellated STEP model into third-angle views.
 * occt-import-js does not return analytic edges, so linework is taken from
 * B-rep face boundaries of the mesh, plus silhouette edges of curved faces.
 * Hidden lines are those boundaries occluded by a nearer triangle.
 */

const SCALES = [
  { value: 5, label: '5:1' },
  { value: 2, label: '2:1' },
  { value: 1, label: '1:1' },
  { value: 0.5, label: '1:2' },
  { value: 0.2, label: '1:5' },
  { value: 0.1, label: '1:10' },
];

export const STANDARD_SCALES = SCALES;

export function formatDim(value) {
  if (!Number.isFinite(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  if (Math.abs(rounded) < 0.05) return '0';
  if (Math.abs(rounded - Math.round(rounded)) < 1e-6) return String(Math.round(rounded));
  return rounded.toFixed(1);
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function mul(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function length(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

function norm(a) {
  const l = length(a);
  if (l < 1e-12) return [0, 0, 1];
  return [a[0] / l, a[1] / l, a[2] / l];
}

function meshBuffers(mesh) {
  return {
    position: mesh.attributes?.position?.array || mesh.position,
    index: mesh.index?.array || mesh.index,
    faces: mesh.brep_faces || [],
  };
}

function vertex(position, index) {
  const o = index * 3;
  return [position[o], position[o + 1], position[o + 2]];
}

export function viewFrames(frontId = 'negY', quarterTurns = 0, basis = null) {
  if (basis?.x && basis?.y && basis?.z) {
    const eye = [-basis.y[0], -basis.y[1], -basis.y[2]];
    const up = basis.z.slice();
    const right = basis.x.slice();
    return framesFromAxes(eye, up, right);
  }
  const eyes = {
    negY: [0, -1, 0],
    posY: [0, 1, 0],
    posX: [1, 0, 0],
    negX: [-1, 0, 0],
    posZ: [0, 0, 1],
    negZ: [0, 0, -1],
  };
  let eye = eyes[frontId] || eyes.negY;
  let up = frontId === 'posZ' || frontId === 'negZ' ? [0, 1, 0] : [0, 0, 1];
  if (Math.abs(dot(up, eye)) > 0.9) up = [1, 0, 0];
  up = norm(sub(up, mul(eye, dot(up, eye))));
  const turns = ((quarterTurns % 4) + 4) % 4;
  for (let i = 0; i < turns; i += 1) up = norm(cross(eye, up));
  const right = norm(cross(up, eye));
  up = norm(cross(eye, right));
  return framesFromAxes(eye, up, right);
}

function framesFromAxes(eye, up, right) {
  const front = { id: 'front', eye, up, right, hidden: true };
  const top = { id: 'top', eye: up.slice(), right: right.slice(), up: mul(eye, -1), hidden: true };
  const side = { id: 'right', eye: right.slice(), up: up.slice(), right: mul(eye, -1), hidden: true };
  const isoEye = norm(add(add(right, up), eye));
  let isoUp = norm(sub(up, mul(isoEye, dot(up, isoEye))));
  if (length(isoUp) < 0.2) isoUp = [0, 0, 1];
  const isoRight = norm(cross(isoUp, isoEye));
  isoUp = norm(cross(isoEye, isoRight));
  const iso = { id: 'iso', eye: isoEye, up: isoUp, right: isoRight, hidden: false };
  return { front, top, right: side, iso };
}

export function prepareModel(result) {
  const tris = [];
  const faces = [];
  const points = [];
  const warnings = [];
  let meshCount = 0;
  for (const mesh of result?.meshes || []) {
    const { position, index, faces: brep } = meshBuffers(mesh);
    if (!position?.length || !index?.length) continue;
    meshCount += 1;
    const groups = brep.length
      ? brep
      : [{ first: 0, last: index.length / 3 - 1 }];
    for (const group of groups) {
      const triIds = [];
      const first = Math.max(0, group.first | 0);
      const last = Math.min((index.length / 3) - 1, group.last | 0);
      for (let t = first; t <= last; t += 1) {
        const i0 = index[t * 3];
        const i1 = index[t * 3 + 1];
        const i2 = index[t * 3 + 2];
        const a = vertex(position, i0);
        const b = vertex(position, i1);
        const c = vertex(position, i2);
        const n = norm(cross(sub(b, a), sub(c, a)));
        if (!Number.isFinite(n[0])) continue;
        const id = tris.length;
        tris.push({
          ax: a[0], ay: a[1], az: a[2],
          bx: b[0], by: b[1], bz: b[2],
          cx: c[0], cy: c[1], cz: c[2],
          nx: n[0], ny: n[1], nz: n[2],
          i0, i1, i2,
          position,
        });
        triIds.push(id);
        points.push(a, b, c);
      }
      if (triIds.length) faces.push({ triIds });
    }
  }
  if (meshCount > 1) {
    warnings.push('Assembly: the solids are drawn together. Fits between parts are not dimensioned.');
  }
  const circles = findCircles(faces, tris);
  if (!circles.holes.length) {
    warnings.push('Hole diameters are taken from closed circular edge loops in the mesh. Very small holes, or holes without a clean tessellated loop, are not called out.');
  }
  return { tris, faces, points, circles, warnings, meshCount };
}

function edgeKey(i, j) {
  return i < j ? `${i}:${j}` : `${j}:${i}`;
}

function analyticGenerators(model, frame) {
  const segments = [];
  for (const face of model.faces) {
    const fit = face.fit;
    if (!fit || (fit.type !== 'cylinder' && fit.type !== 'cone') || !fit.points?.length) continue;
    const radius = fit.rawRadius ?? fit.radius;
    if (radius < 0.2) continue;
    let minAlong = Infinity;
    let maxAlong = -Infinity;
    for (const point of fit.points) {
      const along = dot(sub(point, fit.origin), fit.axis);
      if (along < minAlong) minAlong = along;
      if (along > maxAlong) maxAlong = along;
    }
    const side = cross(fit.axis, frame.eye);
    if (length(side) < 0.2) continue;
    const unit = norm(side);
    for (const sign of [1, -1]) {
      const offset = mul(unit, radius * sign);
      segments.push({
        a: add(add(fit.origin, mul(fit.axis, minAlong)), offset),
        b: add(add(fit.origin, mul(fit.axis, maxAlong)), offset),
        tris: [],
        kind: 'silhouette',
      });
    }
  }
  return segments;
}

function boundaryAndSilhouette(model, eye) {
  const merged = new Map();
  function addSegment(a, b, triIds, kind) {
    const qa = quantKey(a);
    const qb = quantKey(b);
    const key = qa < qb ? `${qa}|${qb}` : `${qb}|${qa}`;
    const found = merged.get(key);
    if (found) {
      for (const id of triIds) if (!found.tris.includes(id)) found.tris.push(id);
      if (kind === 'silhouette') found.kind = 'silhouette';
      return;
    }
    merged.set(key, { a, b, tris: triIds.slice(), kind });
  }

  for (const face of model.faces) {
    const map = new Map();
    for (const triId of face.triIds) {
      const tri = model.tris[triId];
      const facing = tri.nx * eye[0] + tri.ny * eye[1] + tri.nz * eye[2];
      const ids = [tri.i0, tri.i1, tri.i2];
      for (let e = 0; e < 3; e += 1) {
        const i = ids[e];
        const j = ids[(e + 1) % 3];
        const key = edgeKey(i, j);
        const entry = map.get(key);
        if (entry) {
          entry.tris.push(triId);
          entry.facing.push(facing);
        } else {
          map.set(key, { i, j, tris: [triId], facing: [facing], position: tri.position });
        }
      }
    }
    for (const entry of map.values()) {
      const boundary = entry.tris.length === 1;
      const silhouette = entry.tris.length >= 2 && entry.facing[0] * entry.facing[1] < 0;
      const analytic = face.fit && (face.fit.type === 'cylinder' || face.fit.type === 'cone');
      if (analytic && !boundary) continue;
      if (!boundary && !silhouette) continue;
      const a = vertex(entry.position, entry.i);
      const b = vertex(entry.position, entry.j);
      addSegment(a, b, entry.tris, silhouette && !boundary ? 'silhouette' : 'edge');
    }
  }
  return [...merged.values()];
}

function quantKey(p) {
  return `${Math.round(p[0] * 40)},${Math.round(p[1] * 40)},${Math.round(p[2] * 40)}`;
}

function subdivide(segment, maxLen) {
  const dx = segment.b[0] - segment.a[0];
  const dy = segment.b[1] - segment.a[1];
  const dz = segment.b[2] - segment.a[2];
  const len = Math.hypot(dx, dy, dz);
  const n = Math.max(1, Math.ceil(len / maxLen));
  const pieces = [];
  for (let i = 0; i < n; i += 1) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    pieces.push({
      a: [
        segment.a[0] + dx * t0,
        segment.a[1] + dy * t0,
        segment.a[2] + dz * t0,
      ],
      b: [
        segment.a[0] + dx * t1,
        segment.a[1] + dy * t1,
        segment.a[2] + dz * t1,
      ],
      tris: segment.tris,
      kind: segment.kind,
    });
  }
  return pieces;
}

function projectFrame(model, frame) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minD = Infinity;
  let maxD = -Infinity;
  for (const p of model.points) {
    const x = dot(p, frame.right);
    const y = dot(p, frame.up);
    const d = dot(p, frame.eye);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (d < minD) minD = d;
    if (d > maxD) maxD = d;
  }
  const extent = {
    minX, maxX, minY, maxY, minD, maxD,
    w: maxX - minX,
    h: maxY - minY,
    midX: (minX + maxX) / 2,
    midY: (minY + maxY) / 2,
  };
  const span = Math.max(extent.w, extent.h, 1);
  const cell = Math.max(4, span / 28);
  const tol = Math.max(0.2, span * 0.004);
  const projected = model.tris.map((tri) => {
    const ax = tri.ax * frame.right[0] + tri.ay * frame.right[1] + tri.az * frame.right[2];
    const ay = tri.ax * frame.up[0] + tri.ay * frame.up[1] + tri.az * frame.up[2];
    const ad = tri.ax * frame.eye[0] + tri.ay * frame.eye[1] + tri.az * frame.eye[2];
    const bx = tri.bx * frame.right[0] + tri.by * frame.right[1] + tri.bz * frame.right[2];
    const by = tri.bx * frame.up[0] + tri.by * frame.up[1] + tri.bz * frame.up[2];
    const bd = tri.bx * frame.eye[0] + tri.by * frame.eye[1] + tri.bz * frame.eye[2];
    const cx = tri.cx * frame.right[0] + tri.cy * frame.right[1] + tri.cz * frame.right[2];
    const cy = tri.cx * frame.up[0] + tri.cy * frame.up[1] + tri.cz * frame.up[2];
    const cd = tri.cx * frame.eye[0] + tri.cy * frame.eye[1] + tri.cz * frame.eye[2];
    return { ax, ay, ad, bx, by, bd, cx, cy, cd };
  });
  const grid = new Map();
  function bucket(ix, iy) {
    const key = `${ix}:${iy}`;
    let list = grid.get(key);
    if (!list) grid.set(key, list = []);
    return list;
  }
  for (let i = 0; i < projected.length; i += 1) {
    const t = projected[i];
    const minCX = Math.floor(Math.min(t.ax, t.bx, t.cx) / cell);
    const maxCX = Math.floor(Math.max(t.ax, t.bx, t.cx) / cell);
    const minCY = Math.floor(Math.min(t.ay, t.by, t.cy) / cell);
    const maxCY = Math.floor(Math.max(t.ay, t.by, t.cy) / cell);
    for (let x = minCX; x <= maxCX; x += 1) {
      for (let y = minCY; y <= maxCY; y += 1) bucket(x, y).push(i);
    }
  }

  function hiddenAt(point, ignore) {
    const x = dot(point, frame.right);
    const y = dot(point, frame.up);
    const depth = dot(point, frame.eye);
    const list = grid.get(`${Math.floor(x / cell)}:${Math.floor(y / cell)}`);
    if (!list) return false;
    for (const id of list) {
      if (ignore.includes(id)) continue;
      const t = projected[id];
      const bary = pointInTri(x, y, t.ax, t.ay, t.bx, t.by, t.cx, t.cy);
      if (!bary) continue;
      const triDepth = bary.w * t.ad + bary.v * t.bd + bary.u * t.cd;
      if (triDepth > depth + tol) return true;
    }
    return false;
  }

  const raw = boundaryAndSilhouette(model, frame.eye);
  for (const segment of analyticGenerators(model, frame)) raw.push(segment);
  const pieces = [];
  const maxLen = Math.max(1.5, span / 45);
  for (const segment of raw) {
    for (const piece of subdivide(segment, maxLen)) {
      const mid = [
        (piece.a[0] + piece.b[0]) / 2,
        (piece.a[1] + piece.b[1]) / 2,
        (piece.a[2] + piece.b[2]) / 2,
      ];
      const hidden = frame.hidden ? hiddenAt(mid, piece.tris) : false;
      if (!frame.hidden && hidden) continue;
      const ax = dot(piece.a, frame.right) - extent.midX;
      const ay = dot(piece.a, frame.up) - extent.midY;
      const bx = dot(piece.b, frame.right) - extent.midX;
      const by = dot(piece.b, frame.up) - extent.midY;
      if (Math.hypot(bx - ax, by - ay) < 0.04) continue;
      pieces.push({ a: [ax, ay], b: [bx, by], hidden, kind: piece.kind });
    }
  }
  const paths = chainPaths(pieces).filter((path) => pathLength(path) >= 0.9);
  return { extent, paths, span };
}

function pathLength(path) {
  let total = 0;
  for (let i = 1; i < path.points.length; i += 1) {
    total += Math.hypot(
      path.points[i][0] - path.points[i - 1][0],
      path.points[i][1] - path.points[i - 1][1],
    );
  }
  return total;
}

function pointInTri(px, py, ax, ay, bx, by, cx, cy) {
  const v0x = cx - ax;
  const v0y = cy - ay;
  const v1x = bx - ax;
  const v1y = by - ay;
  const v2x = px - ax;
  const v2y = py - ay;
  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;
  const den = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(den) < 1e-14) return null;
  const u = (dot11 * dot02 - dot01 * dot12) / den;
  const v = (dot00 * dot12 - dot01 * dot02) / den;
  if (u < -1e-3 || v < -1e-3 || u + v > 1 + 1e-3) return null;
  return { u, v, w: 1 - u - v };
}

function chainPaths(pieces) {
  const paths = [];
  for (const hidden of [false, true]) {
    const subset = pieces.filter((piece) => piece.hidden === hidden);
    for (const points of walkChains(subset)) {
      if (points.length > 1) paths.push({ points, hidden });
    }
  }
  return paths;
}

function walkChains(pieces) {
  const quant = 0.08;
  const keyOf = (p) => `${Math.round(p[0] / quant)},${Math.round(p[1] / quant)}`;
  const nodes = new Map();
  function node(p) {
    const key = keyOf(p);
    let found = nodes.get(key);
    if (!found) {
      found = { p, edges: [] };
      nodes.set(key, found);
    }
    return found;
  }
  const edges = [];
  for (const piece of pieces) {
    const a = node(piece.a);
    const b = node(piece.b);
    if (a === b) continue;
    const edge = { a, b, used: false };
    a.edges.push(edge);
    b.edges.push(edge);
    edges.push(edge);
  }
  const paths = [];
  for (const edge of edges) {
    if (edge.used) continue;
    edge.used = true;
    const back = extend(edge.a, edge);
    const forward = extend(edge.b, edge);
    paths.push([...back.reverse(), edge.a.p, edge.b.p, ...forward]);
  }
  return paths;

  function extend(startNode, cameFrom) {
    const points = [];
    let current = startNode;
    let previous = cameFrom;
    while (current.edges.length === 2) {
      const next = current.edges.find((item) => item !== previous && !item.used);
      if (!next) break;
      next.used = true;
      const other = next.a === current ? next.b : next.a;
      points.push(other.p);
      previous = next;
      current = other;
    }
    return points;
  }
}

function findCircles(faces, tris) {
  const found = [];
  for (const face of faces) {
    const map = new Map();
    for (const triId of face.triIds) {
      const tri = tris[triId];
      const ids = [tri.i0, tri.i1, tri.i2];
      for (let e = 0; e < 3; e += 1) {
        const i = ids[e];
        const j = ids[(e + 1) % 3];
        const key = edgeKey(i, j);
        const entry = map.get(key);
        if (entry) entry.count += 1;
        else map.set(key, { i, j, count: 1, position: tri.position });
      }
    }
    const segments = [];
    for (const entry of map.values()) {
      if (entry.count !== 1) continue;
      segments.push({
        a: vertex(entry.position, entry.i),
        b: vertex(entry.position, entry.j),
      });
    }
    const loops = chain3(segments).map((points) => ({
      points,
      area: loopArea(points),
      circle: fitCircle(points),
    }));
    let maxArea = 0;
    let outer = null;
    for (const loop of loops) {
      if (loop.area > maxArea) {
        maxArea = loop.area;
        outer = loop;
      }
    }
    const outerNormal = outer?.circle?.normal || (outer ? planeNormal(outer.points) : null);
    const outerPoint = outer?.points?.[0] || null;
    for (const loop of loops) {
      if (!loop.circle) continue;
      const circle = loop.circle;
      const inner = outer && loop !== outer && outerNormal && outerPoint
        && loop.area < maxArea * 0.92
        && Math.abs(dot(sub(circle.center, outerPoint), outerNormal)) < Math.max(0.4, circle.radius * 0.05);
      found.push({ ...circle, hole: Boolean(inner) });
    }
  }
  const unique = [];
  for (const circle of found) {
    const twin = unique.find((other) => sameCircle(circle, other));
    if (!twin) unique.push(circle);
    else {
      twin.hole = twin.hole || circle.hole;
      if (circle.radius > twin.radius) {
        twin.center = circle.center;
        twin.normal = circle.normal;
        twin.radius = circle.radius;
        twin.diameter = circle.diameter;
      }
    }
  }
  unique.sort((a, b) => b.radius - a.radius);
  return { all: unique, holes: unique.filter((circle) => circle.hole) };
}

function newellRaw(points) {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [nx, ny, nz];
}

function planeNormal(points) {
  return norm(newellRaw(points));
}

function loopArea(points) {
  return length(newellRaw(points)) / 2;
}

function sameCircle(a, b) {
  return Math.abs(a.radius - b.radius) < 0.35
    && length(sub(a.center, b.center)) < 0.6
    && Math.abs(dot(a.normal, b.normal)) > 0.96;
}

function chain3(segments) {
  const quant = 0.05;
  const keyOf = (p) => `${Math.round(p[0] / quant)},${Math.round(p[1] / quant)},${Math.round(p[2] / quant)}`;
  const nodes = new Map();
  function node(p) {
    const key = keyOf(p);
    let found = nodes.get(key);
    if (!found) {
      found = { p, next: [] };
      nodes.set(key, found);
    }
    return found;
  }
  const edges = [];
  for (const segment of segments) {
    const a = node(segment.a);
    const b = node(segment.b);
    if (a === b) continue;
    const edge = { a, b, used: false };
    a.next.push(edge);
    b.next.push(edge);
    edges.push(edge);
  }
  const loops = [];
  for (const edge of edges) {
    if (edge.used || edge.a.next.length > 2) continue;
    const points = [edge.a.p];
    edge.used = true;
    let current = edge.b;
    let walked = edge;
    let closed = false;
    for (let guard = 0; guard < edges.length + 2; guard += 1) {
      points.push(current.p);
      if (current === edge.a) {
        closed = true;
        break;
      }
      const next = current.next.find((item) => item !== walked && !item.used);
      if (!next) break;
      next.used = true;
      walked = next;
      current = next.a === current ? next.b : next.a;
    }
    if (closed && points.length >= 10) loops.push(points);
  }
  return loops;
}

function fitCircle(points) {
  const n = points.length;
  if (n < 12) return null;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const normal = norm([nx, ny, nz]);
  const center = [0, 0, 0];
  for (const p of points) {
    center[0] += p[0];
    center[1] += p[1];
    center[2] += p[2];
  }
  center[0] /= n;
  center[1] /= n;
  center[2] /= n;
  let radius = 0;
  let maxPlane = 0;
  for (const p of points) {
    const d = sub(p, center);
    maxPlane = Math.max(maxPlane, Math.abs(dot(d, normal)));
    radius += length(cross(d, normal));
  }
  radius /= n;
  if (radius < 0.4) return null;
  const planeTol = Math.max(0.25, radius * 0.04);
  if (maxPlane > planeTol) return null;
  let maxDev = 0;
  for (const p of points) {
    const radial = length(cross(sub(p, center), normal));
    maxDev = Math.max(maxDev, Math.abs(radial - radius));
  }
  if (maxDev > Math.max(0.35, radius * 0.045)) return null;
  return { center, normal, radius, diameter: radius * 2 };
}

export function projectViews(model, frames) {
  return {
    front: { ...projectFrame(model, frames.front), frame: frames.front },
    top: { ...projectFrame(model, frames.top), frame: frames.top },
    right: { ...projectFrame(model, frames.right), frame: frames.right },
    iso: { ...projectFrame(model, frames.iso), frame: frames.iso },
  };
}

export { dot, sub, add, mul, length, norm };
