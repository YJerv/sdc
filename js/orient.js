/**
 * Orientation of a part on the Z-up grid.
 * A clicked face normal becomes +Z (the top). The part is then yawed so its
 * principal axes lie along X and Y, and seated so its lowest point is on z = 0.
 */

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function mul(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function norm(a) {
  const l = Math.hypot(a[0], a[1], a[2]);
  if (l < 1e-12) return [0, 0, 1];
  return [a[0] / l, a[1] / l, a[2] / l];
}

/** Unit quaternion [x, y, z, w] rotating `from` onto `to`. */
export function quaternionFromTo(from, to) {
  const a = norm(from);
  const b = norm(to);
  const d = dot(a, b);
  if (d > 0.999999) return [0, 0, 0, 1];
  if (d < -0.999999) {
    const axis = Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]);
    return [...norm(axis), 0];
  }
  const c = cross(a, b);
  const w = 1 + d;
  const l = Math.hypot(c[0], c[1], c[2], w);
  return [c[0] / l, c[1] / l, c[2] / l, w / l];
}

export function applyQuaternion(q, p) {
  const [x, y, z, w] = q;
  const ix = w * p[0] + y * p[2] - z * p[1];
  const iy = w * p[1] + z * p[0] - x * p[2];
  const iz = w * p[2] + x * p[1] - y * p[0];
  const iw = -x * p[0] - y * p[1] - z * p[2];
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}

function rotateAroundZ(point, turns) {
  const t = ((turns % 4) + 4) % 4;
  const [x, y, z] = point;
  if (t === 1) return [-y, x, z];
  if (t === 2) return [-x, -y, z];
  if (t === 3) return [y, -x, z];
  return [x, y, z];
}

/**
 * Basis whose Z axis is `up`. X is the in-plane principal axis of `points`
 * when they are supplied; otherwise a stable perpendicular.
 */
export function basisFromUp(up, points = [], quarterTurns = 0) {
  const z = norm(up);
  let x = Math.abs(z[0]) < 0.9 ? cross([1, 0, 0], z) : cross([0, 1, 0], z);
  x = norm(x);
  if (points.length >= 3) {
    const centred = points.map((p) => {
      const along = dot(p, z);
      return sub(p, mul(z, along));
    });
    let c = [0, 0, 0];
    for (const p of centred) c = add(c, p);
    c = mul(c, 1 / centred.length);
    let xx = 0;
    let xy = 0;
    let yy = 0;
    const y0 = norm(cross(z, x));
    for (const p of centred) {
      const d = sub(p, c);
      const px = dot(d, x);
      const py = dot(d, y0);
      xx += px * px;
      xy += px * py;
      yy += py * py;
    }
    const diff = xx - yy;
    const spread = Math.hypot(diff, 2 * xy);
    if (spread > (xx + yy) * 0.02) {
      const angle = 0.5 * Math.atan2(2 * xy, diff);
      x = norm(add(mul(x, Math.cos(angle)), mul(y0, Math.sin(angle))));
    }
  }
  let y = norm(cross(z, x));
  x = norm(cross(y, z));
  x = rotateAroundZOnBasis(x, y, z, quarterTurns);
  y = norm(cross(z, x));
  x = norm(cross(y, z));
  return { x, y, z };
}

function rotateAroundZOnBasis(x, y, z, turns) {
  const t = ((turns % 4) + 4) % 4;
  if (t === 1) return y.slice();
  if (t === 2) return mul(x, -1);
  if (t === 3) return mul(y, -1);
  return x.slice();
}

/**
 * World-space basis for a named front face.
 * The chosen face's outward normal becomes the −Y side (the front view).
 * Top stays +Z unless that face is already a Z face. Any small twist is
 * removed so the part's edges sit square on the grid without swapping the front.
 */
export function basisForFront(frontId, points = [], quarterTurns = 0) {
  const fronts = {
    negY: [0, -1, 0],
    posY: [0, 1, 0],
    posX: [1, 0, 0],
    negX: [-1, 0, 0],
    posZ: [0, 0, 1],
    negZ: [0, 0, -1],
  };
  const front = fronts[frontId] || fronts.negY;
  const up = Math.abs(front[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1];
  const z = norm(up);
  const y = norm(mul(front, -1));
  let x = norm(cross(y, z));
  if (Math.hypot(x[0], x[1], x[2]) < 0.5) x = [1, 0, 0];
  x = rotateAroundZOnBasis(x, norm(cross(z, x)), z, quarterTurns);
  y = norm(cross(z, x));
  x = norm(cross(y, z));
  if (points.length < 3) return { x, y, z };
  const angle = principalAngle(points, x, y, z);
  const wobble = angle - Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
  const c = Math.cos(-wobble);
  const s = Math.sin(-wobble);
  const x2 = norm(add(mul(x, c), mul(y, s)));
  const y2 = norm(cross(z, x2));
  return { x: norm(cross(y2, z)), y: y2, z };
}

function principalAngle(points, x, y, z) {
  let c = [0, 0, 0];
  const flat = points.map((p) => {
    const d = sub(p, mul(z, dot(p, z)));
    c = add(c, d);
    return d;
  });
  c = mul(c, 1 / flat.length);
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const p of flat) {
    const d = sub(p, c);
    const px = dot(d, x);
    const py = dot(d, y);
    xx += px * px;
    xy += px * py;
    yy += py * py;
  }
  return 0.5 * Math.atan2(2 * xy, xx - yy);
}

/**
 * Move points into the basis so the part is centred on X and Y and sits on z = 0.
 * Returns the world-space translation to apply after the rotation.
 */
export function seatOnGrid(points, basis) {
  if (!points.length) return [0, 0, 0];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  for (const p of points) {
    const x = dot(p, basis.x);
    const y = dot(p, basis.y);
    const z = dot(p, basis.z);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return sub([0, 0, 0], add(add(mul(basis.x, cx), mul(basis.y, cy)), mul(basis.z, minZ)));
}

export function worldPoints(result) {
  const points = [];
  for (const mesh of result?.meshes || []) {
    const position = mesh.attributes?.position?.array || mesh.position;
    if (!position) continue;
    for (let i = 0; i + 2 < position.length; i += 3) {
      points.push([position[i], position[i + 1], position[i + 2]]);
    }
  }
  return points;
}

/** Map a point from world coordinates into the aligned frame (X right, Y depth, Z up, seated). */
export function toAligned(point, basis, translation) {
  const p = add(point, translation);
  return [dot(p, basis.x), dot(p, basis.y), dot(p, basis.z)];
}
