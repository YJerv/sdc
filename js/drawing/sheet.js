/**
 * A3 landscape sheet: third-angle layout, scale, dimensions and SVG.
 * Coordinates on the sheet are millimetres, origin top-left, Y down.
 */

import { formatDim } from './geometry.js';
import { collectFeatures, snapCentre, snapLength } from './features.js';
import { JET_LOGO } from './jet-logo.js';

export const SHEET = { width: 420, height: 297 };
const MARGIN = 10;
const TITLE = { w: 186, h: 52 };
const GAP_X = 16;
const GAP_Y = 18;
const DIM_LANE = 11;

const TITLE_X = SHEET.width - MARGIN - TITLE.w;
const TITLE_Y = SHEET.height - MARGIN - TITLE.h;

function textWidth(text, size = 3.3) {
  return Math.max(size * 1.4, String(text).length * size * 0.58);
}

function makeBox(text, cx, cy, size = 3.3) {
  const w = textWidth(text, size);
  const h = size * 1.25;
  return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy, text, size };
}

function overlaps(a, b, gap = 0.6) {
  return a.x < b.x + b.w + gap
    && a.x + a.w + gap > b.x
    && a.y < b.y + b.h + gap
    && a.y + a.h + gap > b.y;
}

function hitsAny(box, boxes) {
  return boxes.some((other) => overlaps(box, other));
}

function hitsRect(box, rect) {
  return box.x < rect.right && box.x + box.w > rect.left && box.y < rect.bottom && box.y + box.h > rect.top;
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const SHEET_SCALES = [
  { value: 0.1, label: '1:10' },
  { value: 0.2, label: '1:5' },
  { value: 0.5, label: '1:2' },
  { value: 1, label: '1:1' },
  { value: 2, label: '2:1' },
  { value: 5, label: '5:1' },
];

function fittingScales(modelViews) {
  const fitting = SHEET_SCALES.filter((scale) => layoutFor(modelViews, scale.value).fits);
  return fitting.length ? fitting : [SHEET_SCALES[0]];
}

function chooseScale(modelViews, forced) {
  const fitting = fittingScales(modelViews);
  const requested = SHEET_SCALES.find((scale) => scale.label === forced || scale.value === forced);
  if (requested) {
    const capped = [...fitting].reverse().find((scale) => scale.value <= requested.value) || fitting[0];
    return { ...capped, tight: !layoutFor(modelViews, capped.value).fits, fitting };
  }
  return { ...fitting[fitting.length - 1], fitting };
}

function layoutFor(views, scale) {
  const fw = views.front.extent.w * scale;
  const fh = views.front.extent.h * scale;
  const tw = views.top.extent.w * scale;
  const th = views.top.extent.h * scale;
  const rw = views.right.extent.w * scale;
  const rh = views.right.extent.h * scale;
  const iw = views.iso.extent.w * scale;
  const ih = views.iso.extent.h * scale;
  const leftW = Math.max(fw, tw, 8);
  const rightW = Math.max(rw, iw, 8);
  const topH = Math.max(th, ih, 8);
  const botH = Math.max(fh, rh, 8);
  const left = MARGIN + DIM_LANE * 2 + 2;
  const frontCx = left + leftW / 2;
  const rightCx = frontCx + leftW / 2 + GAP_X + rightW / 2;
  const rowSplit = MARGIN + DIM_LANE + 2 + topH;
  const topCy = rowSplit - th / 2;
  const frontCy = rowSplit + GAP_Y + fh / 2;
  const rightCy = rowSplit + GAP_Y + rh / 2;
  const isoCy = rowSplit - ih / 2;
  const place = {
    front: { cx: frontCx, cy: frontCy, w: fw, h: fh },
    top: { cx: frontCx, cy: topCy, w: tw, h: th },
    right: { cx: rightCx, cy: rightCy, w: rw, h: rh },
    iso: { cx: rightCx, cy: isoCy, w: iw, h: ih },
  };
  const bounds = {
    left: frontCx - leftW / 2 - DIM_LANE * 2,
    right: rightCx + rightW / 2 + DIM_LANE + 4,
    top: Math.min(topCy - th / 2, isoCy - ih / 2) - DIM_LANE,
    bottom: Math.max(frontCy + fh / 2, rightCy + rh / 2) + DIM_LANE + 6,
  };
  const inside = bounds.left >= MARGIN - 1
    && bounds.top >= MARGIN - 1
    && bounds.right <= SHEET.width - MARGIN
    && bounds.bottom <= SHEET.height - MARGIN;
  const title = { x: TITLE_X, y: TITLE_Y, w: TITLE.w, h: TITLE.h };
  const overlapsTitle = bounds.right > title.x - 3 && bounds.bottom > title.y - 3;
  if (inside && !overlapsTitle) centreInSheet(place, bounds);
  return { place, bounds, scale, fits: inside && !overlapsTitle, title };
}

function centreInSheet(place, bounds) {
  const freeLeft = MARGIN + 2;
  const freeRight = SHEET.width - MARGIN - 2;
  const freeTop = MARGIN + 2;
  const freeBottom = TITLE_Y - 3;
  let dx = (freeLeft + freeRight) / 2 - (bounds.left + bounds.right) / 2;
  let dy = (freeTop + freeBottom) / 2 - (bounds.top + bounds.bottom) / 2;
  if (bounds.left + dx < freeLeft) dx = freeLeft - bounds.left;
  if (bounds.right + dx > freeRight) dx = freeRight - bounds.right;
  if (bounds.top + dy < freeTop) dy = freeTop - bounds.top;
  if (bounds.bottom + dy > freeBottom) dy = freeBottom - bounds.bottom;
  if (bounds.right + dx > TITLE_X - 3 && bounds.bottom + dy > TITLE_Y - 3) {
    dy = Math.min(dy, TITLE_Y - 3 - bounds.bottom);
  }
  for (const view of Object.values(place)) {
    view.cx += dx;
    view.cy += dy;
  }
  bounds.left += dx;
  bounds.right += dx;
  bounds.top += dy;
  bounds.bottom += dy;
}

function toSheet(vx, vy, place, scale) {
  return [place.cx + vx * scale, place.cy - vy * scale];
}

function viewRect(place) {
  return {
    left: place.cx - place.w / 2,
    right: place.cx + place.w / 2,
    top: place.cy - place.h / 2,
    bottom: place.cy + place.h / 2,
  };
}

function diameterText(size, axis, circles) {
  const match = circles.find((circle) => Math.abs(circle.diameter - size) < Math.max(0.3, size * 0.02)
    && Math.abs(axis[0] * circle.normal[0] + axis[1] * circle.normal[1] + axis[2] * circle.normal[2]) < 0.4);
  return match ? `Ø${formatDim(size)}` : formatDim(size);
}

export function buildEntities(model, views, layout) {
  const { place, scale } = layout;
  const features = collectFeatures(model);
  const entities = [];
  let count = 0;
  const groups = [
    ...features.diameters.map((group) => ({ ...group, measure: 'diameter' })),
    ...features.radii.map((group) => ({ ...group, measure: 'radius' })),
  ];
  for (const group of groups) {
    for (const feature of group.features) {
      const view = viewForCircle({ normal: feature.axis, center: feature.center }, views);
      if (!view) continue;
      const circle = sheetCircle(feature, view, place, scale);
      if (!circle) continue;
      const size = group.measure === 'radius' ? feature.radius : feature.diameter;
      const twin = entities.find((other) => other.type === 'circle'
        && other.view === view.frame.id
        && Math.abs(other.size - size) < 0.2
        && Math.hypot(other.cx - circle.x, other.cy - circle.y) < 1.5);
      if (twin) continue;
      entities.push({
        id: `ent-${count += 1}`,
        type: 'circle',
        measure: group.measure,
        size,
        view: view.frame.id,
        cx: circle.x,
        cy: circle.y,
        r: circle.r,
        scale,
      });
    }
  }
  for (const id of ['front', 'top', 'right']) {
    const view = views[id];
    const found = [];
    for (const path of view.paths || []) {
      const edge = edgeFromPath(path, id, place[id], scale);
      if (edge) found.push(edge);
    }
    found.sort((a, b) => b.size - a.size);
    for (const edge of found) {
      const twin = entities.find((other) => other.type === 'edge'
        && other.view === id
        && other.orient === edge.orient
        && Math.abs(other.size - edge.size) < 0.8
        && Math.hypot(other.cx - edge.cx, other.cy - edge.cy) < 2);
      if (twin) continue;
      if (entities.filter((other) => other.type === 'edge' && other.view === id).length >= 16) break;
      entities.push({ ...edge, id: `ent-${count += 1}` });
    }
  }
  return entities;
}

function edgeFromPath(path, viewId, place, scale) {
  if (!path || path.hidden || !path.points || path.points.length < 2) return null;
  const start = path.points[0];
  const end = path.points[path.points.length - 1];
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const len = Math.hypot(dx, dy);
  if (len < 6) return null;
  let off = 0;
  for (const point of path.points) {
    const t = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (len * len);
    const px = start[0] + dx * t;
    const py = start[1] + dy * t;
    off = Math.max(off, Math.hypot(point[0] - px, point[1] - py));
  }
  if (off > 0.7) return null;
  const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI) % 180;
  const horiz = angle < 12 || angle > 168;
  const vert = Math.abs(angle - 90) < 12;
  if (!horiz && !vert) return null;
  const [x1, y1] = toSheet(start[0], start[1], place, scale);
  const [x2, y2] = toSheet(end[0], end[1], place, scale);
  return {
    type: 'edge',
    measure: 'length',
    size: len,
    view: viewId,
    orient: horiz ? 'h' : 'v',
    x1,
    y1,
    x2,
    y2,
    cx: (x1 + x2) / 2,
    cy: (y1 + y2) / 2,
    scale,
  };
}

function titleBoxes(layout) {
  const names = { front: 'FRONT', top: 'TOP', right: 'RIGHT SIDE', iso: 'ISOMETRIC' };
  return Object.entries(names).map(([id, name]) => {
    const rect = viewRect(layout.place[id]);
    const size = 2.6;
    const w = textWidth(name, size);
    const h = size * 1.35;
    return { x: rect.left - 0.4, y: rect.top - 1.6 - h, w: w + 0.8, h, text: name };
  });
}

function sheetCircle(feature, view, place, scale) {
  if (!feature || !view) return null;
  const align = Math.abs(dot3(feature.axis, view.frame.eye));
  if (align < 0.75) return null;
  const [x, y] = toSheet(
    dot3(feature.center, view.frame.right) - view.extent.midX,
    dot3(feature.center, view.frame.up) - view.extent.midY,
    place[view.frame.id],
    scale,
  );
  return { x, y, r: Math.max(feature.radius * scale, 0.8) };
}

function placeRadialCallout({ text, centre, radius, view, place, scale, boxes, leaders, rings, centreLines = [] }) {
  const hostPlace = place[view.frame.id];
  const [sx, sy] = toSheet(
    dot3(centre, view.frame.right) - view.extent.midX,
    dot3(centre, view.frame.up) - view.extent.midY,
    hostPlace,
    scale,
  );
  const sheetR = Math.max(radius * scale, 0.8);
  const otherViews = ['front', 'top', 'right', 'iso']
    .filter((id) => id !== view.frame.id)
    .map((id) => viewRect(place[id]));
  let best = null;
  for (let i = 0; i < 24; i += 1) {
    const angle = Math.PI / 4 + (i * Math.PI) / 12;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const tip = { x: sx + ux * sheetR, y: sy + uy * sheetR };
    const half = Math.hypot(textWidth(text), 4.2) / 2;
    for (let step = 0; step < 8; step += 1) {
      const dist = sheetR + 3.4 + half + step * 4.2;
      const box = makeBox(text, sx + ux * dist, sy + uy * dist);
      if (!radialFits(box, tip, sx, sy, sheetR, boxes, leaders, rings, otherViews, centreLines)) continue;
      const from = rayBoxBoundary(box, { x: sx, y: sy });
      const length = Math.hypot(tip.x - from.x, tip.y - from.y);
      const outside = hitsRect(box, viewRect(hostPlace)) ? 2 : 0;
      const score = length + outside + step;
      if (!best || score < best.score) {
        best = {
          box,
          tip,
          score,
          leaderLine: { x1: from.x, y1: from.y, x2: tip.x, y2: tip.y },
          feature: { x: sx, y: sy, r: sheetR, view: view.frame.id },
        };
      }
      break;
    }
  }
  return best;
}

function radialFits(box, tip, sx, sy, sheetR, boxes, leaders, rings, otherViews, centreLines) {
  if (!insideFrame(box)) return false;
  if (hitsAny(box, boxes)) return false;
  if (!boxOutsideCircle(box, sx, sy, sheetR, 0.8)) return false;
  if (rings.some((ring) => circleCutsBox(box, ring.x, ring.y, ring.r))) return false;
  if (centreLines.some((line) => segmentHitsBox(line, box, 0.7))) return false;
  if (otherViews.some((rect) => hitsRect(box, rect))) return false;
  const from = rayBoxBoundary(box, { x: sx, y: sy });
  const line = { x1: from.x, y1: from.y, x2: tip.x, y2: tip.y };
  if (boxes.some((other) => segmentHitsBox(line, other))) return false;
  if (leaders.some((other) => segmentsCross(line, other))) return false;
  return true;
}

function boxOutsideCircle(box, cx, cy, radius, gap = 0.8) {
  const nearestX = Math.max(box.x, Math.min(cx, box.x + box.w));
  const nearestY = Math.max(box.y, Math.min(cy, box.y + box.h));
  return Math.hypot(nearestX - cx, nearestY - cy) >= radius + gap;
}

function insideFrame(box) {
  const left = 14;
  const top = 14;
  const right = SHEET.width - 14;
  const bottom = TITLE_Y - 2;
  if (box.x < left || box.y < top) return false;
  if (box.x + box.w > right || box.y + box.h > bottom) return false;
  if (box.x + box.w > TITLE_X - 1 && box.y + box.h > TITLE_Y - 1) return false;
  return true;
}

function circleCutsBox(box, cx, cy, radius) {
  const nearestX = Math.max(box.x, Math.min(cx, box.x + box.w));
  const nearestY = Math.max(box.y, Math.min(cy, box.y + box.h));
  const nearest = Math.hypot(nearestX - cx, nearestY - cy);
  const corners = [
    [box.x, box.y],
    [box.x + box.w, box.y],
    [box.x, box.y + box.h],
    [box.x + box.w, box.y + box.h],
  ];
  const distances = corners.map(([x, y]) => Math.hypot(x - cx, y - cy));
  const min = Math.min(nearest, ...distances);
  const max = Math.max(...distances);
  return min < radius + 0.4 && max > radius - 0.4;
}

function rayBoxBoundary(box, origin) {
  const dx = box.cx - origin.x;
  const dy = box.cy - origin.y;
  const hits = [];
  if (Math.abs(dx) > 1e-8) {
    for (const x of [box.x, box.x + box.w]) {
      const t = (x - origin.x) / dx;
      const y = origin.y + t * dy;
      if (t > 0 && y >= box.y - 0.05 && y <= box.y + box.h + 0.05) hits.push({ t, x, y });
    }
  }
  if (Math.abs(dy) > 1e-8) {
    for (const y of [box.y, box.y + box.h]) {
      const t = (y - origin.y) / dy;
      const x = origin.x + t * dx;
      if (t > 0 && x >= box.x - 0.05 && x <= box.x + box.w + 0.05) hits.push({ t, x, y });
    }
  }
  hits.sort((a, b) => a.t - b.t);
  return hits[0] ? { x: hits[0].x, y: hits[0].y } : { x: box.cx, y: box.cy };
}

function segmentHitsBox(line, box, pad = 0.3) {
  const rect = { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
  const inside = (x, y) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  if (inside(line.x1, line.y1) || inside(line.x2, line.y2)) return true;
  const edges = [
    { x1: rect.x, y1: rect.y, x2: rect.x + rect.w, y2: rect.y },
    { x1: rect.x + rect.w, y1: rect.y, x2: rect.x + rect.w, y2: rect.y + rect.h },
    { x1: rect.x, y1: rect.y + rect.h, x2: rect.x + rect.w, y2: rect.y + rect.h },
    { x1: rect.x, y1: rect.y, x2: rect.x, y2: rect.y + rect.h },
  ];
  return edges.some((edge) => segmentsCross(line, edge));
}

function segmentsCross(a, b) {
  const side = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const p = { x: a.x1, y: a.y1 };
  const q = { x: a.x2, y: a.y2 };
  const r = { x: b.x1, y: b.y1 };
  const s = { x: b.x2, y: b.y2 };
  const d1 = side(p, q, r);
  const d2 = side(p, q, s);
  const d3 = side(r, s, p);
  const d4 = side(r, s, q);
  if (d1 === 0 || d2 === 0 || d3 === 0 || d4 === 0) return false;
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
}

function buildDimensions(model, views, layout) {
  const { place, scale } = layout;
  const boxes = [];
  const dims = [];
  const front = views.front;
  const side = views.right;
  const width = front.extent.w;
  const height = front.extent.h;
  const depth = side.extent.w;
  const frontRect = viewRect(place.front);
  const sideRect = viewRect(place.right);

  function addDim(dim) {
    let box = dim.box;
    for (let step = 0; step < 8 && hitsAny(box, boxes); step += 1) {
      box = { ...box, y: box.y + box.h + 1.1, cy: box.cy + box.h + 1.1 };
    }
    if (hitsAny(box, boxes)) return false;
    boxes.push(box);
    dims.push({ ...dim, box });
    return true;
  }

  const round = Math.abs(width - depth) <= 0.4 && Math.abs(width - height) > 0.4;
  const widthText = round ? `Ø${formatDim(width)}` : diameterText(width, front.frame.right, model.circles.all);
  const heightText = diameterText(height, front.frame.up, model.circles.all);
  const envelopeDiameters = new Set(round ? [formatDim(width)] : []);

  addDim({
    kind: 'overall',
    axis: 'width',
    value: width,
    text: widthText,
    orient: 'h',
    x1: frontRect.left,
    x2: frontRect.right,
    y: frontRect.bottom + 8,
    box: makeBox(widthText, (frontRect.left + frontRect.right) / 2, frontRect.bottom + 8),
    geom: frontRect.bottom,
  });
  addDim({
    kind: 'overall',
    axis: 'height',
    value: height,
    text: heightText,
    orient: 'v',
    y1: frontRect.top,
    y2: frontRect.bottom,
    x: frontRect.left - 9,
    box: makeBox(heightText, frontRect.left - 9 - textWidth(heightText) / 2 - 1.2, (frontRect.top + frontRect.bottom) / 2),
    geom: frontRect.left,
  });
  if (!round) {
    const depthText = diameterText(depth, side.frame.right, model.circles.all);
    addDim({
      kind: 'overall',
      axis: 'depth',
      value: depth,
      text: depthText,
      orient: 'h',
      x1: sideRect.left,
      x2: sideRect.right,
      y: sideRect.bottom + 8,
      box: makeBox(depthText, (sideRect.left + sideRect.right) / 2, sideRect.bottom + 8),
      geom: sideRect.bottom,
    });
  }

  const featureSet = collectFeatures(model);
  const titles = titleBoxes(layout);
  const leaders = [];
  const centreOnSheet = ['front', 'top', 'right'].flatMap((id) => sheetCentreLines(model, views[id], place[id], scale));
  for (const group of featureSet.diameters) {
    if (envelopeDiameters.has(formatDim(group.size))) continue;
    const sample = group.features[0];
    const callout = group.features.length > 1
      ? `${group.features.length} × Ø${formatDim(group.size)}`
      : `Ø${formatDim(group.size)}`;
    const host = viewForCircle({ normal: sample.axis, center: sample.center }, views) || front;
    const rings = featureSet.diameters
      .filter((other) => other !== group)
      .map((other) => sheetCircle(other.features[0], host, place, scale))
      .filter(Boolean);
    const placed = placeRadialCallout({
      text: callout,
      centre: sample.center,
      radius: sample.radius,
      view: host,
      place,
      scale,
      boxes: [...boxes, ...titles],
      leaders,
      rings,
      centreLines: centreOnSheet,
    });
    if (placed) {
      boxes.push(placed.box);
      leaders.push(placed.leaderLine);
      dims.push({
        kind: 'diameter',
        value: group.size,
        text: callout,
        box: placed.box,
        leader: placed.tip,
        leaderLine: placed.leaderLine,
        feature: placed.feature,
        radial: true,
        anchor: [placed.box.cx, placed.box.cy],
      });
    }
    const holes = group.features.filter((feature) => feature.hole);
    const positioned = holes.slice(0, 8);
    for (const hole of positioned) {
      const view = viewForCircle({ normal: hole.axis, center: hole.center }, views);
      if (!view) continue;
      const rect = viewRect(place[view.frame.id]);
      const centre = snapCentre(hole.center, envelopeCentre(model), hole.axis);
      const hx = dot3(centre, view.frame.right);
      const hy = dot3(centre, view.frame.up);
      const fromLeft = snapLength(hx - view.extent.minX);
      const fromBottom = snapLength(hy - view.extent.minY);
      if (fromLeft <= 0.2 && fromBottom <= 0.2) continue;
      const [px] = toSheet(hx - view.extent.midX, 0, place[view.frame.id], scale);
      const [, py] = toSheet(0, hy - view.extent.midY, place[view.frame.id], scale);
      const xText = formatDim(fromLeft);
      const yText = formatDim(fromBottom);
      if (fromLeft > 0.2) {
        const boxX = makeBox(xText, (rect.left + px) / 2, rect.top - 8);
        if (!hitsAny(boxX, boxes)) {
          boxes.push(boxX);
          dims.push({
            kind: 'position',
            value: fromLeft,
            text: xText,
            orient: 'h',
            x1: rect.left,
            x2: px,
            y: rect.top - 8,
            geom: rect.top,
            box: boxX,
          });
        }
      }
      if (fromBottom > 0.2) {
        const boxY = makeBox(yText, rect.left - 9 - textWidth(yText) / 2, (rect.bottom + py) / 2);
        if (!hitsAny(boxY, boxes)) {
          boxes.push(boxY);
          dims.push({
            kind: 'position',
            value: fromBottom,
            text: yText,
            orient: 'v',
            y1: py,
            y2: rect.bottom,
            x: rect.left - 9,
            geom: rect.left,
            box: boxY,
          });
        }
      }
    }
  }

  for (const group of featureSet.radii) {
    const sample = group.features[0];
    const callout = group.features.length > 1
      ? `${group.features.length} × R${formatDim(group.size)}`
      : `R${formatDim(group.size)}`;
    const host = sample.profile
      ? profileView(sample.revolution, views)
      : (viewForCircle({ normal: sample.axis, center: sample.center }, views) || front);
    const centre = sample.profile
      ? [
        sample.axial[0] + host.frame.right[0] * sample.spine,
        sample.axial[1] + host.frame.right[1] * sample.spine,
        sample.axial[2] + host.frame.right[2] * sample.spine,
      ]
      : sample.center;
    const placed = placeRadialCallout({
      text: callout,
      centre,
      radius: sample.radius,
      view: host,
      place,
      scale,
      boxes: [...boxes, ...titles],
      leaders,
      rings: [],
    });
    if (!placed) continue;
    boxes.push(placed.box);
    leaders.push(placed.leaderLine);
    dims.push({
      kind: 'radius',
      value: group.size,
      text: callout,
      box: placed.box,
      leader: placed.tip,
      leaderLine: placed.leaderLine,
      feature: placed.feature,
      radial: true,
    });
  }

  separateBoxes(dims);
  for (const dim of dims) {
    if (!dim.radial) dim.box = clampToFrame(dim.box);
  }
  separateBoxes(dims);
  for (const dim of dims) {
    if (!dim.radial) dim.box = clampToFrame(dim.box);
  }
  dims.forEach((dim, index) => {
    if (!dim.id) dim.id = `dim-${index}`;
  });
  return { dims, titles, centreLines: centreOnSheet };
}

function sheetCentreLines(model, view, place, scale) {
  return centreLines(model, view).map(([[x1, y1], [x2, y2]]) => {
    const [sx1, sy1] = toSheet(x1, y1, place, scale);
    const [sx2, sy2] = toSheet(x2, y2, place, scale);
    return { x1: sx1, y1: sy1, x2: sx2, y2: sy2 };
  });
}

function clampToFrame(box) {
  const left = 14;
  const top = 14;
  const right = SHEET.width - 14;
  const bottom = TITLE_Y - 2;
  let x = box.x;
  let y = box.y;
  if (x < left) x = left;
  if (y < top) y = top;
  if (x + box.w > right) x = right - box.w;
  if (y + box.h > bottom) y = bottom - box.h;
  if (x + box.w > TITLE_X - 1 && y + box.h > TITLE_Y - 1) y = Math.min(y, TITLE_Y - box.h - 1);
  return { ...box, x, y, cx: x + box.w / 2, cy: y + box.h / 2 };
}

function separateBoxes(dims) {
  for (let pass = 0; pass < 10; pass += 1) {
    let moved = false;
    for (let i = 0; i < dims.length; i += 1) {
      for (let j = i + 1; j < dims.length; j += 1) {
        if (!overlaps(dims[i].box, dims[j].box)) continue;
        const mover = dims[j].radial ? i : j;
        if (dims[mover].radial) continue;
        const shift = dims[mover].box.h + 1.2;
        dims[mover].box = {
          ...dims[mover].box,
          y: dims[mover].box.y + shift,
          cy: dims[mover].box.cy + shift,
        };
        if (dims[mover].orient === 'h') dims[mover].y = (dims[mover].y || 0) + shift;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function envelopeCentre(model) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const point of model.points) {
    for (let axis = 0; axis < 3; axis += 1) {
      if (point[axis] < min[axis]) min[axis] = point[axis];
      if (point[axis] > max[axis]) max[axis] = point[axis];
    }
  }
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
}

function profileView(axis, views) {
  let best = views.front;
  let bestAlign = 1;
  for (const view of [views.front, views.right, views.top]) {
    const align = Math.abs(dot3(axis, view.frame.eye));
    if (align < bestAlign) {
      bestAlign = align;
      best = view;
    }
  }
  return best;
}

function viewForCircle(circle, views) {
  let best = null;
  let bestAlign = 0.75;
  for (const view of [views.front, views.top, views.right]) {
    const align = Math.abs(dot3(circle.normal, view.frame.eye));
    if (align > bestAlign) {
      bestAlign = align;
      best = view;
    }
  }
  return best;
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function centreLines(model, view) {
  const lines = [];
  const used = new Set();
  for (const circle of model.circles.all) {
    if (!circle.hole && circle.diameter < 8) continue;
    const align = Math.abs(dot3(circle.normal, view.frame.eye));
    const cx = dot3(circle.center, view.frame.right) - view.extent.midX;
    const cy = dot3(circle.center, view.frame.up) - view.extent.midY;
    if (align > 0.82) {
      const extra = circle.radius + 2.5;
      lines.push([[cx - extra, cy], [cx + extra, cy]]);
      lines.push([[cx, cy - extra], [cx, cy + extra]]);
    }
  }
  const axes = [];
  for (const circle of model.circles.all) {
    if (!circle.hole && circle.diameter < 8) continue;
    const key = `${Math.round(circle.center[0])},${Math.round(circle.center[1])},${Math.round(circle.center[2])},${Math.round(circle.normal[0] * 5)}`;
    if (used.has(key)) continue;
    const group = model.circles.all.filter((other) => coaxial(circle, other));
    for (const item of group) {
      used.add(`${Math.round(item.center[0])},${Math.round(item.center[1])},${Math.round(item.center[2])},${Math.round(item.normal[0] * 5)}`);
    }
    axes.push(group);
  }
  for (const group of axes) {
    const circle = group[0];
    const align = Math.abs(dot3(circle.normal, view.frame.eye));
    if (align > 0.35) continue;
    const origin = [
      dot3(circle.center, view.frame.right) - view.extent.midX,
      dot3(circle.center, view.frame.up) - view.extent.midY,
    ];
    const axis = [
      dot3(circle.normal, view.frame.right),
      dot3(circle.normal, view.frame.up),
    ];
    const hyp = Math.hypot(axis[0], axis[1]) || 1;
    axis[0] /= hyp;
    axis[1] /= hyp;
    let minT = 0;
    let maxT = 0;
    for (const other of group) {
      const p = [
        dot3(other.center, view.frame.right) - view.extent.midX,
        dot3(other.center, view.frame.up) - view.extent.midY,
      ];
      const t = (p[0] - origin[0]) * axis[0] + (p[1] - origin[1]) * axis[1];
      minT = Math.min(minT, t);
      maxT = Math.max(maxT, t);
    }
    if (maxT - minT < 1) {
      minT = -circle.radius;
      maxT = circle.radius;
    }
    lines.push([
      [origin[0] + axis[0] * (minT - 3), origin[1] + axis[1] * (minT - 3)],
      [origin[0] + axis[0] * (maxT + 3), origin[1] + axis[1] * (maxT + 3)],
    ]);
  }
  return lines;
}

function coaxial(a, b) {
  const nd = Math.abs(dot3(a.normal, b.normal));
  if (Math.abs(nd - 1) > 0.08) return false;
  const dx = b.center[0] - a.center[0];
  const dy = b.center[1] - a.center[1];
  const dz = b.center[2] - a.center[2];
  const axial = Math.abs(dx * a.normal[0] + dy * a.normal[1] + dz * a.normal[2]);
  const crossLen = Math.hypot(
    dy * a.normal[2] - dz * a.normal[1],
    dz * a.normal[0] - dx * a.normal[2],
    dx * a.normal[1] - dy * a.normal[0],
  );
  return crossLen < Math.max(0.7, Math.min(a.radius, b.radius) * 0.12) || axial < 0.4;
}

function renderPaths(view, place, scale) {
  const visible = [];
  const hidden = [];
  for (const path of view.paths) {
    const d = path.points.map((point, index) => {
      const [x, y] = toSheet(point[0], point[1], place, scale);
      return `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ');
    (path.hidden ? hidden : visible).push(d);
  }
  const centres = view.frame?.id === 'iso'
    ? []
    : centreLines(view.model || { circles: { all: [] } }, view);
  return { visible, hidden, centres };
}

export function composeSheet({ model, views, options = {} }) {
  const scaleInfo = chooseScale(views, options.scale);
  const layout = layoutFor(views, scaleInfo.value);
  layout.scale = scaleInfo.value;
  const warnings = [...model.warnings];
  if (scaleInfo.tight) warnings.push('The part is larger than the 1:10 sheet. Views use 1:10 and may crowd the border.');
  for (const id of ['front', 'top', 'right', 'iso']) views[id].model = model;
  const built = buildDimensions(model, views, layout);
  const dimensions = built.dims;
  const titles = built.titles;
  const title = options.title || 'Untitled';
  const date = options.date || formatSheetDate(new Date());
  const svg = renderSvg({
    layout,
    views,
    dimensions,
    scaleLabel: scaleInfo.label,
    title,
    date,
    logoHref: options.logoHref || JET_LOGO,
  });
  const entities = buildEntities(model, views, layout);
  return {
    svg,
    scale: scaleInfo.value,
    scaleLabel: scaleInfo.label,
    maxScale: scaleInfo.fitting[scaleInfo.fitting.length - 1].label,
    fittingScales: scaleInfo.fitting.map((scale) => scale.label),
    dimensions,
    views: ['front', 'top', 'right', 'iso'].map((id) => ({
      id,
      paths: views[id].paths,
      place: layout.place[id],
    })),
    layout: layout.place,
    titles,
    centreLines: built.centreLines,
    entities,
    warnings,
    sheet: SHEET,
    title,
    date,
  };
}

/** Local calendar date, for example "19 Nov 2026". Pass timeZone only in tests. */
export function formatSheetDate(date = new Date(), timeZone) {
  const value = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type)?.value || '';
  return `${part('day')} ${part('month')} ${part('year')}`;
}

function renderSvg({ layout, views, dimensions, scaleLabel, title, date, logoHref }) {
  const scale = layout.scale;
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET.width} ${SHEET.height}" width="${SHEET.width}mm" height="${SHEET.height}mm">`);
  parts.push(`<rect width="100%" height="100%" fill="#ffffff"/>`);
  parts.push(`<rect x="${MARGIN}" y="${MARGIN}" width="${SHEET.width - MARGIN * 2}" height="${SHEET.height - MARGIN * 2}" fill="none" stroke="#111" stroke-width="0.7"/>`);
  parts.push(`<rect x="${MARGIN + 2}" y="${MARGIN + 2}" width="${SHEET.width - (MARGIN + 2) * 2}" height="${SHEET.height - (MARGIN + 2) * 2}" fill="none" stroke="#111" stroke-width="0.25"/>`);
  const names = { front: 'FRONT', top: 'TOP', right: 'RIGHT SIDE', iso: 'ISOMETRIC' };
  for (const id of ['front', 'top', 'right', 'iso']) {
    const view = views[id];
    const place = layout.place[id];
    const drawn = renderPaths(view, place, scale);
    parts.push(`<g id="view-${id}" data-view="${id}">`);
    for (const d of drawn.visible) parts.push(`<path d="${d}" fill="none" stroke="#161616" stroke-width="0.4" stroke-linejoin="round" stroke-linecap="round"/>`);
    for (const line of drawn.centres) {
      const [a, b] = line;
      const [x1, y1] = toSheet(a[0], a[1], place, scale);
      const [x2, y2] = toSheet(b[0], b[1], place, scale);
      parts.push(`<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" fill="none" stroke="#222" stroke-width="0.2" stroke-dasharray="6 1.3 1.1 1.3"/>`);
    }
    const rect = viewRect(place);
    parts.push(`<text x="${rect.left.toFixed(2)}" y="${(rect.top - 1.5).toFixed(2)}" font-family="Helvetica, Arial, sans-serif" font-size="2.6" fill="#5c564c">${names[id]}</text>`);
    parts.push(`</g>`);
  }
  parts.push(`<g id="dimensions">`);
  for (const dim of dimensions) parts.push(renderDimension(dim));
  parts.push(`</g><!--end-dimensions-->`);
  parts.push(renderTitle({ title, date, scaleLabel, logoHref }));
  parts.push(`</svg>`);
  return parts.join('');
}

export function dimensionMarkup(dims) {
  return dims.map((dim) => renderDimension(dim)).join('');
}

export function spliceDimensions(svg, markup) {
  const next = `<g id="dimensions">${markup}</g><!--end-dimensions-->`;
  if (!svg.includes('<!--end-dimensions-->')) return svg;
  return svg.replace(/<g id="dimensions">[\s\S]*?<!--end-dimensions-->/, next);
}

function renderDimension(dim) {
  const box = dim.box;
  const bits = [`<g data-kind="${dim.kind}" data-dim-id="${esc(dim.id || '')}">`];
  if (dim.orient === 'h' && Number.isFinite(dim.x1) && Number.isFinite(dim.x2)) {
    const y = box.cy;
    const gap = box.w / 2 + 0.8;
    const mid = (dim.x1 + dim.x2) / 2;
    const yStart = gapFrom(dim.geom, y);
    const yEnd = y + Math.sign(y - yStart || 1) * 1.6;
    bits.push(`<line x1="${dim.x1.toFixed(2)}" y1="${yStart.toFixed(2)}" x2="${dim.x1.toFixed(2)}" y2="${yEnd.toFixed(2)}" stroke="#111" stroke-width="0.18"/>`);
    bits.push(`<line x1="${dim.x2.toFixed(2)}" y1="${yStart.toFixed(2)}" x2="${dim.x2.toFixed(2)}" y2="${yEnd.toFixed(2)}" stroke="#111" stroke-width="0.18"/>`);
    bits.push(`<line x1="${dim.x1.toFixed(2)}" y1="${y.toFixed(2)}" x2="${(mid - gap).toFixed(2)}" y2="${y.toFixed(2)}" stroke="#111" stroke-width="0.18"/>`);
    bits.push(`<line x1="${(mid + gap).toFixed(2)}" y1="${y.toFixed(2)}" x2="${dim.x2.toFixed(2)}" y2="${y.toFixed(2)}" stroke="#111" stroke-width="0.18"/>`);
    bits.push(arrow(dim.x1, y, Math.PI));
    bits.push(arrow(dim.x2, y, 0));
  } else if (dim.orient === 'v' && Number.isFinite(dim.y1) && Number.isFinite(dim.y2)) {
    const x = dim.x;
    const y1 = Math.min(dim.y1, dim.y2);
    const y2 = Math.max(dim.y1, dim.y2);
    const xStart = gapFrom(dim.geom, x);
    bits.push(`<line x1="${xStart.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${(x - 1.6).toFixed(2)}" y2="${y1.toFixed(2)}" stroke="#111" stroke-width="0.18"/>`);
    bits.push(`<line x1="${xStart.toFixed(2)}" y1="${y2.toFixed(2)}" x2="${(x - 1.6).toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#111" stroke-width="0.18"/>`);
    bits.push(`<line x1="${x.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#111" stroke-width="0.18"/>`);
    bits.push(arrow(x, y1, -Math.PI / 2));
    bits.push(arrow(x, y2, Math.PI / 2));
  }
  if (dim.leaderLine) {
    const line = dim.leaderLine;
    bits.push(`<line data-leader="1" x1="${line.x1.toFixed(2)}" y1="${line.y1.toFixed(2)}" x2="${line.x2.toFixed(2)}" y2="${line.y2.toFixed(2)}" stroke="#111" stroke-width="0.18"/>`);
    const angle = Math.atan2(line.y2 - line.y1, line.x2 - line.x1);
    bits.push(arrow(line.x2, line.y2, angle));
  } else if (dim.leader) {
    const tip = dim.leader;
    const from = boxAnchor(box, tip);
    bits.push(`<line data-leader="1" x1="${from.x.toFixed(2)}" y1="${from.y.toFixed(2)}" x2="${tip.x.toFixed(2)}" y2="${tip.y.toFixed(2)}" stroke="#111" stroke-width="0.18"/>`);
    const angle = Math.atan2(tip.y - from.y, tip.x - from.x);
    bits.push(arrow(tip.x, tip.y, angle));
  }
  bits.push(`<text class="dim-text" x="${box.cx.toFixed(2)}" y="${box.cy.toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-family="Helvetica, Arial, sans-serif" font-size="${box.size}">${esc(box.text)}</text>`);
  bits.push(`</g>`);
  return bits.join('');
}

function boxAnchor(box, tip) {
  const dx = tip.x - box.cx;
  const dy = tip.y - box.cy;
  if (Math.abs(dx) > Math.abs(dy)) {
    return { x: dx > 0 ? box.x + box.w : box.x, y: box.cy };
  }
  return { x: box.cx, y: dy > 0 ? box.y + box.h : box.y };
}

function gapFrom(geom, dimPos) {
  if (!Number.isFinite(geom)) return dimPos;
  const dir = Math.sign(dimPos - geom) || 1;
  return geom + dir * 1.6;
}

function arrow(x, y, angle) {
  const len = 2.3;
  const spread = 0.32;
  const x1 = x - len * Math.cos(angle - spread);
  const y1 = y - len * Math.sin(angle - spread);
  const x2 = x - len * Math.cos(angle + spread);
  const y2 = y - len * Math.sin(angle + spread);
  return `<polygon points="${x.toFixed(2)},${y.toFixed(2)} ${x1.toFixed(2)},${y1.toFixed(2)} ${x2.toFixed(2)},${y2.toFixed(2)}" fill="#111"/>`;
}

function renderTitle({ title, date, scaleLabel, logoHref }) {
  const x = TITLE_X;
  const y = TITLE_Y;
  const w = TITLE.w;
  const h = TITLE.h;
  const rows = [14, 7.2, 7.2, 12, h - 14 - 7.2 - 7.2 - 12];
  let yy = y;
  const lines = [];
  lines.push(`<g id="title-block">`);
  lines.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="#111" stroke-width="0.45"/>`);
  for (let i = 0; i < rows.length - 1; i += 1) {
    yy += rows[i];
    lines.push(`<line x1="${x}" y1="${yy.toFixed(2)}" x2="${x + w}" y2="${yy.toFixed(2)}" stroke="#111" stroke-width="0.15"/>`);
  }
  const mid = x + w / 2;
  lines.push(`<line x1="${mid}" y1="${y + rows[0]}" x2="${mid}" y2="${y + rows[0] + rows[1] + rows[2]}" stroke="#111" stroke-width="0.15"/>`);
  lines.push(`<image href="${esc(logoHref)}" x="${x + 1.4}" y="${y + 1.2}" width="22" height="11.6" preserveAspectRatio="xMidYMid meet"/>`);
  lines.push(`<text x="${x + 26}" y="${y + 8.6}" font-family="Helvetica, Arial, sans-serif" font-size="4.2" font-weight="700" fill="#0b1f33">${esc(title)}</text>`);
  const y1 = y + rows[0];
  field(lines, 'DRAWING', title, x, y1, w / 2);
  field(lines, 'DATE', date, mid, y1, w / 2);
  const y2 = y1 + rows[1];
  field(lines, 'UNITS', 'MILLIMETRES (mm)', x, y2, w / 2);
  field(lines, 'SCALE', scaleLabel, mid, y2, w / 2);
  const y3 = y2 + rows[2];
  lines.push(`<text x="${x + 1.4}" y="${y3 + 2.6}" font-family="Helvetica, Arial, sans-serif" font-size="2.2" fill="#5c564c">PROJECTION</text>`);
  thirdAngle(lines, x + 6, y3 + 8);
  lines.push(`<text x="${x + 22}" y="${y3 + 7.4}" font-family="Helvetica, Arial, sans-serif" font-size="2.8" font-weight="700" fill="#111">THIRD ANGLE</text>`);
  const y4 = y3 + rows[3];
  lines.push(`<text x="${x + 1.4}" y="${y4 + 4.2}" font-family="Helvetica, Arial, sans-serif" font-size="2.5" fill="#111">Created with STEP Drawing Creator</text>`);
  lines.push(`</g>`);
  return lines.join('');
}

function field(lines, label, value, x, y, w) {
  lines.push(`<text x="${x + 1.3}" y="${y + 2.5}" font-family="Helvetica, Arial, sans-serif" font-size="2.1" fill="#5c564c">${esc(label)}</text>`);
  lines.push(`<text x="${x + 1.3}" y="${y + 5.8}" font-family="Helvetica, Arial, sans-serif" font-size="3.1" font-weight="700" fill="#111">${esc(fitText(value, w - 3))}</text>`);
}

function fitText(value, width) {
  const text = String(value);
  const max = Math.max(8, Math.floor(width / 1.8));
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function thirdAngle(lines, x, y) {
  const r = 2.6;
  lines.push(`<circle cx="${x + r}" cy="${y}" r="${r}" fill="none" stroke="#0b1f33" stroke-width="0.28"/>`);
  const x0 = x + r * 2 + 1.4;
  const hL = r;
  const hR = r * 0.46;
  const w = 7.2;
  lines.push(`<path d="M${x0} ${y - hL} L${x0 + w} ${y - hR} L${x0 + w} ${y + hR} L${x0} ${y + hL} Z" fill="none" stroke="#0b1f33" stroke-width="0.28"/>`);
}
