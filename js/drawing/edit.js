import { formatDim } from './geometry.js';
import { dimensionMarkup, spliceDimensions } from './sheet.js';

function cloneDims(dims) {
  return dims.map((dim) => ({ ...dim, box: { ...dim.box } }));
}

/** Editable copy of a drawing. PNG and PDF export the svg() result. */
export function createSheetEditor(drawing) {
  let dims = cloneDims(drawing.dimensions).map((dim, index) => ({ ...dim, id: dim.id || `dim-${index}` }));
  let svg = spliceDimensions(drawing.svg, dimensionMarkup(dims));
  let added = 0;
  function redraw() {
    svg = spliceDimensions(svg, dimensionMarkup(dims));
  }
  return {
    svg: () => svg,
    dimensions: () => cloneDims(dims),
    remove(id) {
      if (!dims.some((dim) => dim.id === id)) return false;
      dims = dims.filter((dim) => dim.id !== id);
      redraw();
      return true;
    },
    add(dim) {
      if (!dim) return null;
      const next = { ...dim, id: dim.id || `add-${added += 1}`, box: { ...dim.box } };
      dims = [...dims, next];
      redraw();
      return next;
    },
  };
}

function textBox(text, cx, cy) {
  const w = Math.max(6, String(text).length * 2.1);
  const h = 4.4;
  return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy, text, size: 3.3 };
}

function overlaps(a, b) {
  return a.x < b.x + b.w + 0.8
    && a.x + a.w + 0.8 > b.x
    && a.y < b.y + b.h + 0.8
    && a.y + a.h + 0.8 > b.y;
}

function park(box, boxes) {
  let next = box;
  for (let step = 0; step < 10 && boxes.some((other) => overlaps(next, other)); step += 1) {
    const shift = next.h + 1.6;
    next = { ...next, y: next.y + shift, cy: next.cy + shift };
  }
  return next;
}

function boxesOf(existing) {
  return (existing || []).map((item) => item.box || item).filter((box) => box && Number.isFinite(box.x));
}

/** A diameter, radius or edge length for one selected feature. */
export function dimensionForOne(entity, existing = []) {
  if (!entity) return null;
  const boxes = boxesOf(existing);
  if (entity.type === 'circle') {
    const text = entity.measure === 'radius' ? `R${formatDim(entity.size)}` : `Ø${formatDim(entity.size)}`;
    const angles = [Math.PI / 4, -Math.PI / 4, (3 * Math.PI) / 4, Math.PI * 0.9];
    for (const angle of angles) {
      for (let step = 0; step < 6; step += 1) {
        const dist = entity.r + 7 + step * 5;
        const box = textBox(text, entity.cx + Math.cos(angle) * dist, entity.cy + Math.sin(angle) * dist);
        if (boxes.some((other) => overlaps(box, other))) continue;
        const tip = {
          x: entity.cx + Math.cos(angle) * entity.r,
          y: entity.cy + Math.sin(angle) * entity.r,
        };
        return {
          kind: entity.measure === 'radius' ? 'radius' : 'diameter',
          text,
          value: entity.size,
          box,
          leader: tip,
          leaderLine: { x1: box.cx, y1: box.cy, x2: tip.x, y2: tip.y },
          feature: { x: entity.cx, y: entity.cy, r: entity.r, view: entity.view },
          radial: true,
        };
      }
    }
    return null;
  }
  if (entity.type !== 'edge') return null;
  const text = formatDim(entity.size);
  const box = park(textBox(
    text,
    entity.cx + (entity.orient === 'v' ? -12 : 0),
    entity.cy + (entity.orient === 'h' ? -8 : 0),
  ), boxes);
  if (entity.orient === 'h') {
    return {
      kind: 'overall',
      text,
      value: entity.size,
      orient: 'h',
      x1: Math.min(entity.x1, entity.x2),
      x2: Math.max(entity.x1, entity.x2),
      y: box.cy,
      geom: entity.cy,
      box,
    };
  }
  return {
    kind: 'overall',
    text,
    value: entity.size,
    orient: 'v',
    x: box.cx,
    y1: Math.min(entity.y1, entity.y2),
    y2: Math.max(entity.y1, entity.y2),
    geom: entity.cx,
    box,
  };
}

/** Distance between two features in the same view, horizontal or vertical. */
export function dimensionForPair(a, b, existing = []) {
  if (!a || !b || a.id === b.id || a.view !== b.view) return null;
  const scale = a.scale || b.scale || 1;
  const boxes = boxesOf(existing);
  if (a.type === 'circle' && b.type === 'circle') {
    return axisDistance(a.cx, a.cy, b.cx, b.cy, scale, boxes);
  }
  if (a.type === 'edge' && b.type === 'edge' && a.orient === b.orient) {
    if (a.orient === 'h') {
      const span = Math.abs(a.cy - b.cy) / scale;
      if (span < 0.3) return null;
      const x1 = Math.min(a.x1, a.x2, b.x1, b.x2);
      const x2 = Math.max(a.x1, a.x2, b.x1, b.x2);
      return linearDim('h', x1, x2, Math.max(a.cy, b.cy) + 8, span, boxes);
    }
    const span = Math.abs(a.cx - b.cx) / scale;
    if (span < 0.3) return null;
    const y1 = Math.min(a.y1, a.y2, b.y1, b.y2);
    const y2 = Math.max(a.y1, a.y2, b.y1, b.y2);
    return linearDim('v', y1, y2, Math.min(a.cx, b.cx) - 10, span, boxes);
  }
  const circle = a.type === 'circle' ? a : b.type === 'circle' ? b : null;
  const edge = a.type === 'edge' ? a : b.type === 'edge' ? b : null;
  if (circle && edge) {
    if (edge.orient === 'h') {
      const span = Math.abs(circle.cy - edge.cy) / scale;
      if (span < 0.3) return null;
      return linearDim('v', Math.min(circle.cy, edge.cy), Math.max(circle.cy, edge.cy), circle.cx - 10, span, boxes);
    }
    const span = Math.abs(circle.cx - edge.cx) / scale;
    if (span < 0.3) return null;
    return linearDim('h', Math.min(circle.cx, edge.cx), Math.max(circle.cx, edge.cx), circle.cy + 8, span, boxes);
  }
  return null;
}

function axisDistance(x1, y1, x2, y2, scale, boxes) {
  const dx = Math.abs(x1 - x2) / scale;
  const dy = Math.abs(y1 - y2) / scale;
  if (dx < 0.3 && dy < 0.3) return null;
  if (dx >= dy) return linearDim('h', Math.min(x1, x2), Math.max(x1, x2), Math.max(y1, y2) + 8, dx, boxes);
  return linearDim('v', Math.min(y1, y2), Math.max(y1, y2), Math.min(x1, x2) - 10, dy, boxes);
}

function linearDim(orient, a, b, at, value, boxes) {
  const text = formatDim(value);
  if (orient === 'h') {
    const box = park(textBox(text, (a + b) / 2, at), boxes);
    return { kind: 'position', text, value, orient, x1: a, x2: b, y: box.cy, geom: at, box };
  }
  const box = park(textBox(text, at, (a + b) / 2), boxes);
  return { kind: 'position', text, value, orient, y1: a, y2: b, x: box.cx, geom: at, box };
}

/** Nearest selectable feature within the tap slop. */
export function pickEntity(entities, x, y, slop = 0) {
  let best = null;
  let bestDist = Infinity;
  for (const entity of entities || []) {
    let dist = Math.hypot(entity.cx - x, entity.cy - y);
    if (entity.type === 'edge') {
      dist = Math.min(dist, distanceToSegment(x, y, entity.x1, entity.y1, entity.x2, entity.y2));
    } else if (entity.type === 'circle') {
      dist = Math.abs(dist - entity.r);
    }
    if (dist < bestDist) {
      best = entity;
      bestDist = dist;
    }
  }
  return bestDist <= Math.max(slop, 4) ? best : null;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len));
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

/** Nearest dimension whose text box, grown by slop, contains the sheet point. */
export function pickDimension(dims, x, y, slop = 0) {
  let best = null;
  let bestDist = Infinity;
  for (const dim of dims) {
    const box = dim.box;
    if (!box) continue;
    const dx = Math.max(box.x - slop - x, 0, x - (box.x + box.w + slop));
    const dy = Math.max(box.y - slop - y, 0, y - (box.y + box.h + slop));
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) {
      best = dim;
      bestDist = dist;
    }
  }
  return bestDist <= slop ? best : null;
}
