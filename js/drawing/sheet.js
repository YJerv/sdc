/**
 * A3 landscape sheet: third-angle layout, scale, dimensions and SVG.
 * Coordinates on the sheet are millimetres, origin top-left, Y down.
 */

import { formatDim } from './geometry.js';
import { collectFeatures } from './features.js';

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

function chooseScale(modelViews) {
  const sizes = modelViews;
  const scales = [
    { value: 5, label: '5:1' },
    { value: 2, label: '2:1' },
    { value: 1, label: '1:1' },
    { value: 0.5, label: '1:2' },
    { value: 0.2, label: '1:5' },
    { value: 0.1, label: '1:10' },
  ];
  for (const scale of scales) {
    if (layoutFor(sizes, scale.value).fits) return scale;
  }
  return { ...scales[scales.length - 1], tight: true };
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
  return { place, bounds, scale, fits: inside && !overlapsTitle, title };
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
  for (const group of featureSet.diameters) {
    if (envelopeDiameters.has(formatDim(group.size))) continue;
    const sample = group.features[0];
    const callout = group.features.length > 1
      ? `${group.features.length} × Ø${formatDim(group.size)}`
      : `Ø${formatDim(group.size)}`;
    const host = viewForCircle({ normal: sample.axis, center: sample.center }, views) || front;
    const hostPlace = place[host.frame.id];
    const rect = viewRect(hostPlace);
    let box = makeBox(callout, rect.left + textWidth(callout) / 2 + 1, rect.top - DIM_LANE - 5);
    let placed = false;
    for (let step = 0; step < 8; step += 1) {
      if (!hitsAny(box, boxes) && !hitsRect(box, rect)) {
        placed = true;
        break;
      }
      box = { ...box, y: box.y - (box.h + 1.2), cy: box.cy - (box.h + 1.2) };
    }
    const hx = dot3(sample.center, host.frame.right) - host.extent.midX;
    const hy = dot3(sample.center, host.frame.up) - host.extent.midY;
    const [sx, sy] = toSheet(hx, hy, hostPlace, scale);
    const edge = Math.max(sample.radius * scale, 1.5);
    const leader = {
      x: Math.min(rect.right, Math.max(rect.left, sx + Math.sign(box.cx - sx || 1) * edge)),
      y: Math.min(rect.bottom, Math.max(rect.top, sy)),
    };
    if (placed) {
      boxes.push(box);
      dims.push({
        kind: 'diameter',
        value: group.size,
        text: callout,
        box,
        leader,
        anchor: [box.cx, box.cy],
      });
    }
    const holes = group.features.filter((feature) => feature.hole);
    const positioned = holes.slice(0, 8);
    for (const hole of positioned) {
      const view = viewForCircle({ normal: hole.axis, center: hole.center }, views);
      if (!view) continue;
      const rect = viewRect(place[view.frame.id]);
      const hx = dot3(hole.center, view.frame.right);
      const hy = dot3(hole.center, view.frame.up);
      const fromLeft = hx - view.extent.minX;
      const fromBottom = hy - view.extent.minY;
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
    const host = viewForCircle({ normal: sample.axis, center: sample.center }, views) || views.front;
    const hostPlace = place[host.frame.id];
    const rect = viewRect(hostPlace);
    let box = makeBox(callout, rect.right + 2 + textWidth(callout) / 2, rect.top + 6);
    let placed = false;
    for (let step = 0; step < 8; step += 1) {
      if (!hitsAny(box, boxes) && !hitsRect(box, rect)) {
        placed = true;
        break;
      }
      box = { ...box, x: box.x + 4, cx: box.cx + 4 };
    }
    if (!placed) continue;
    const hx = dot3(sample.center, host.frame.right) - host.extent.midX;
    const hy = dot3(sample.center, host.frame.up) - host.extent.midY;
    const [sx, sy] = toSheet(hx, hy, hostPlace, scale);
    boxes.push(box);
    dims.push({
      kind: 'radius',
      value: group.size,
      text: callout,
      box,
      leader: { x: sx, y: sy },
    });
  }

  separateBoxes(dims);
  return dims;
}

function separateBoxes(dims) {
  for (let pass = 0; pass < 10; pass += 1) {
    let moved = false;
    for (let i = 0; i < dims.length; i += 1) {
      for (let j = i + 1; j < dims.length; j += 1) {
        if (!overlaps(dims[i].box, dims[j].box)) continue;
        const shift = dims[i].box.h + 1.2;
        dims[j].box = {
          ...dims[j].box,
          y: dims[j].box.y + shift,
          cy: dims[j].box.cy + shift,
        };
        if (dims[j].orient === 'h') dims[j].y = (dims[j].y || 0) + shift;
        moved = true;
      }
    }
    if (!moved) break;
  }
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
  const scaleInfo = chooseScale(views);
  const layout = layoutFor(views, scaleInfo.value);
  layout.scale = scaleInfo.value;
  const warnings = [...model.warnings];
  if (scaleInfo.tight) warnings.push('The part is larger than the 1:10 sheet. Views use 1:10 and may crowd the border.');
  for (const id of ['front', 'top', 'right', 'iso']) views[id].model = model;
  const dimensions = buildDimensions(model, views, layout);
  const title = options.title || 'Untitled';
  const date = options.date || formatSheetDate(new Date());
  const svg = renderSvg({
    layout,
    views,
    dimensions,
    scaleLabel: scaleInfo.label,
    title,
    date,
    logoHref: options.logoHref || 'icons/jet-logo.png',
  });
  return {
    svg,
    scale: scaleInfo.value,
    scaleLabel: scaleInfo.label,
    dimensions,
    views: ['front', 'top', 'right', 'iso'].map((id) => ({
      id,
      paths: views[id].paths,
      place: layout.place[id],
    })),
    layout: layout.place,
    warnings,
    sheet: SHEET,
    title,
    date,
  };
}

export function formatSheetDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const value = date instanceof Date ? date : new Date(date);
  const day = String(value.getDate()).padStart(2, '0');
  return `${day} ${months[value.getMonth()]} ${value.getFullYear()}`;
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
    for (const d of drawn.hidden) parts.push(`<path d="${d}" fill="none" stroke="#161616" stroke-width="0.22" stroke-dasharray="2.4 1.15" stroke-linecap="butt"/>`);
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
  parts.push(`</g>`);
  parts.push(renderTitle({ title, date, scaleLabel, logoHref }));
  parts.push(`</svg>`);
  return parts.join('');
}

function renderDimension(dim) {
  const box = dim.box;
  const bits = [`<g data-kind="${dim.kind}">`];
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
  if (dim.leader) {
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
