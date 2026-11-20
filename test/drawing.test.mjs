import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import occtimportjs from 'occt-import-js';
import { createDrawing } from '../js/drawing/create.js';
import { prepareModel } from '../js/drawing/geometry.js';
import { collectFeatures, withoutNearDuplicates } from '../js/drawing/features.js';
import { formatDim, viewFrames } from '../js/drawing/geometry.js';
import { formatSheetDate } from '../js/drawing/sheet.js';
import { JET_LOGO } from '../js/drawing/jet-logo.js';
import { pdfFromJpeg } from '../js/pdf-image.js';
import { canExport, exportPolicy } from '../js/export-policy.js';
import { STEP_IMPORT_PARAMS, boundingBox, isStepFilename } from '../js/step-model.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const SHEET_RIGHT = 420 - 14;
const SHEET_BOTTOM = 297 - 10 - 52 - 2;
const SCALES = new Set(['1:1', '1:2', '1:5', '1:10', '2:1', '5:1']);

test('sheet helpers', () => {
  assert.equal(formatDim(49.996), '50');
  assert.equal(formatDim(12), '12');
  assert.equal(formatDim(6.44), '6.4');
  assert.equal(formatDim(6.36), '6.4');
  const frames = viewFrames('negY', 0);
  assert.ok(frames.front.eye[1] < -0.9);
  assert.ok(frames.front.up[2] > 0.9);
  assert.ok(frames.front.right[0] > 0.9);
  assert.equal(exportPolicy.unlocked, true);
  const logoFile = readFileSync(new URL('../icons/jet-logo.png', import.meta.url)).toString('base64');
  assert.equal(JET_LOGO, `data:image/png;base64,${logoFile}`);
  const lateUtc = new Date('2026-11-20T03:30:00Z');
  assert.equal(formatSheetDate(lateUtc, 'Etc/GMT+4'), '19 Nov 2026');
  assert.equal(formatSheetDate(lateUtc, 'UTC'), '20 Nov 2026');
  const kept = withoutNearDuplicates(
    [{ size: 48.3, features: [{ hole: false }] }, { size: 46, features: [{ hole: false }] }, { size: 20, features: [{ hole: true }] }],
    [50],
  );
  assert.deepEqual(kept.map((group) => group.size), [20]);
  assert.equal(canExport(), true);
  const pdf = pdfFromJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), 420, 297);
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-');
});

test('every fixture produces a third-angle drawing', { timeout: 180000 }, async () => {
  const occt = await occtimportjs();
  const files = (await readdir(FIXTURES))
    .filter((name) => isStepFilename(name))
    .sort((a, b) => a.localeCompare(b, 'en-GB', { sensitivity: 'base' }));
  const rows = [];
  for (const file of files) {
    const bytes = new Uint8Array(await readFile(path.join(FIXTURES, file)));
    const result = occt.ReadStepFile(bytes, STEP_IMPORT_PARAMS);
    const started = performance.now();
    const drawing = createDrawing(result, {
      title: file.replace(/\.(step|stp)$/i, ''),
      date: '19 Nov 2026',
    });
    const ms = performance.now() - started;
    const box = boundingBox(result).size.slice().sort((a, b) => a - b);
    const overall = drawing.dimensions
      .filter((dim) => dim.kind === 'overall')
      .map((dim) => dim.value)
      .sort((a, b) => a - b);
    rows.push({ file, ms, scale: drawing.scaleLabel, overall, box });
    assert.equal(result.success, true, file);
    for (const id of ['front', 'top', 'right', 'iso']) {
      assert.match(drawing.svg, new RegExp(`id="view-${id}"`), `${file} ${id}`);
      const view = drawing.views.find((item) => item.id === id);
      assert.ok(view.paths.length > 0, `${file} ${id} has linework`);
    }
    assert.ok(SCALES.has(drawing.scaleLabel), `${file} scale ${drawing.scaleLabel}`);
    assert.ok(overall.length === 2 || overall.length === 3, `${file} overall count ${overall.length}`);
    for (const value of overall) {
      assert.ok(box.some((edge) => Math.abs(edge - value) <= 0.1), `${file} overall ${value} is not an envelope edge`);
    }
    if (overall.length === 2) {
      const diameter = overall.find((value) => box.filter((edge) => Math.abs(edge - value) <= 0.15).length > 1) || overall[0];
      const labelled = drawing.dimensions.filter((dim) => dim.text === `Ø${formatDim(diameter)}` || dim.text.includes(`Ø${formatDim(diameter)}`));
      assert.equal(labelled.length, 1, `${file} should show Ø${formatDim(diameter)} once`);
    }
    assert.ok(drawing.layout.top.cy < drawing.layout.front.cy, `${file} top view is above the front`);
    assert.ok(drawing.layout.right.cx > drawing.layout.front.cx, `${file} right view is to the right`);
    assert.match(drawing.svg, /id="title-block"/);
    assert.ok(drawing.svg.includes(JET_LOGO), `${file} title block has no JET logo`);
    assert.match(drawing.svg, /THIRD ANGLE/);
    assert.match(drawing.svg, /Created with STEP Drawing Creator/);
    assert.match(drawing.svg, /MILLIMETRES/);
    for (const dim of drawing.dimensions) {
      assert.ok(dim.box.x >= 13.5, `${file} ${dim.text} left of the frame`);
      assert.ok(dim.box.y >= 13.5, `${file} ${dim.text} above the frame`);
      assert.ok(dim.box.x + dim.box.w <= SHEET_RIGHT, `${file} ${dim.text} right of the frame`);
      assert.ok(dim.box.y + dim.box.h <= SHEET_BOTTOM, `${file} ${dim.text} below the frame`);
      if (dim.kind === 'diameter' || dim.kind === 'radius') {
        assert.ok(dim.leader, `${file} ${dim.text} has no leader`);
      }
    }
    const boxes = drawing.dimensions.map((dim) => dim.box);
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        assert.equal(boxesOverlap(boxes[i], boxes[j]), false, `${file} dimensions overlap: ${drawing.dimensions[i].text} and ${drawing.dimensions[j].text}`);
      }
    }
    const iso = drawing.views.find((view) => view.id === 'iso');
    assert.equal(iso.paths.some((path) => path.hidden), false, `${file} isometric has a hidden path`);
    const isoSvg = drawing.svg.split('id="view-iso"')[1].split('</g>')[0];
    assert.equal(isoSvg.includes('stroke-dasharray'), false, `${file} isometric draws a dashed line`);
    if (file === 'cad_upload_1.step') {
      const topView = drawing.views.find((view) => view.id === 'top');
      const iso = drawing.views.find((view) => view.id === 'iso');
      assert.ok(topView.paths.length < 80, `top view still has facet chains (${topView.paths.length})`);
      assert.ok(iso.paths.length < 550, `iso still has facet chains (${iso.paths.length})`);
    }
    if (file === 'cone_50x12_v2.step') {
      const cluster = (drawing.layout.front.cx + drawing.layout.right.cx) / 2;
      assert.ok(Math.abs(cluster - 210) < 40, `cone views are not centred (${cluster})`);
    }
    const leaders = drawing.dimensions.filter((dim) => dim.leaderLine);
    for (let i = 0; i < leaders.length; i += 1) {
      for (let j = i + 1; j < leaders.length; j += 1) {
        assert.equal(segmentsCross(leaders[i].leaderLine, leaders[j].leaderLine), false, `${file} leaders cross: ${leaders[i].text} and ${leaders[j].text}`);
      }
    }
    for (const dim of drawing.dimensions) {
      for (const title of drawing.titles) {
        assert.equal(boxesOverlap(dim.box, title), false, `${file} ${dim.text} overlaps ${title.text}`);
      }
    }
    const diameters = drawing.dimensions.filter((dim) => dim.kind === 'diameter');
    for (const dim of diameters) {
      assert.ok(
        boxOutsideCircle(dim.box, dim.feature.x, dim.feature.y, dim.feature.r),
        `${file} ${dim.text} sits inside its circle`,
      );
      for (const line of drawing.centreLines) {
        assert.equal(segmentHitsBox(line, dim.box), false, `${file} ${dim.text} crosses a centre line`);
      }
    }
    if (diameters.length >= 2) {
      const xs = diameters.map((dim) => dim.box.cx);
      const ys = diameters.map((dim) => dim.box.cy);
      const spread = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      assert.ok(spread > 8, `${file} diameter labels are stacked (${spread.toFixed(1)})`);
    }
    if (file === 'cone_50x12_v2.step') {
      const hole = diameters.find((dim) => dim.text.includes('Ø20'));
      assert.ok(hole, 'cone Ø20');
      assert.equal(hole.feature.view, 'top');
      const tip = Math.hypot(hole.leaderLine.x2 - hole.feature.x, hole.leaderLine.y2 - hole.feature.y);
      assert.ok(Math.abs(tip - hole.feature.r) < 0.6, `leader tip is not on the hole (${tip})`);
      assert.ok(pointLineDistance(hole.feature, hole.leaderLine) < 0.4);
      const leaderLength = Math.hypot(hole.leaderLine.x2 - hole.leaderLine.x1, hole.leaderLine.y2 - hole.leaderLine.y1);
      assert.ok(leaderLength < 22, `Ø20 leader is too long (${leaderLength.toFixed(1)})`);
    }
    if (file === 'cone_50x12_v2.step') {
      const text = drawing.dimensions.map((dim) => dim.text).join(' ');
      const diameters = drawing.dimensions.filter((dim) => dim.text.includes('Ø50'));
      assert.equal(diameters.length, 1);
      assert.match(text, /Ø20/);
      assert.equal(/Ø46|Ø48/.test(text), false, text);
      const rim = drawing.dimensions.find((dim) => dim.kind === 'radius' && dim.text.includes('R2'));
      assert.ok(rim, `cone radii ${drawing.dimensions.filter((dim) => dim.kind === 'radius').map((dim) => dim.text).join(', ')}`);
      assert.ok(rim.feature.view === 'front' || rim.feature.view === 'right', rim.feature.view);
      assert.ok(rim.leaderLine);
      assert.match(text, /(^|\s)12(\s|$)/);
      assert.match(drawing.svg, /data-leader="1"/);
      const positions = drawing.dimensions.filter((dim) => dim.kind === 'position').map((dim) => dim.text);
      assert.ok(positions.includes('25'), `cone positions ${positions.join(', ')}`);
      assert.equal(positions.some((text) => text === '24.9' || text === '24.8'), false);
    }
    const features = collectFeatures(prepareModel(result));
    for (const group of features.radii) {
      const label = `R${Number.isInteger(group.size) ? group.size : group.size.toFixed(1)}`;
      assert.ok(
        drawing.dimensions.some((dim) => dim.kind === 'radius' && dim.text.includes(label)),
        `${file} missing radius ${label}`,
      );
    }
    for (const group of features.diameters) {
      const label = `Ø${Number.isInteger(group.size) ? group.size : group.size.toFixed(1)}`;
      const present = drawing.dimensions.some((dim) => dim.kind === 'diameter' && dim.text.includes(label.replace(/\.0$/, '')));
      assert.equal(present, true, `${file} missing diameter ${label}`);
    }
  }
  console.log('| File | Drawing | Scale | Overall dims |');
  console.log('| --- | --- | --- | --- |');
  for (const row of rows) {
    console.log(`| ${row.file} | ${row.ms.toFixed(0)} ms | ${row.scale} | ${row.overall.map((value) => value.toFixed(2)).join(', ')} |`);
  }
});

function boxOutsideCircle(box, cx, cy, radius) {
  const nearestX = Math.max(box.x, Math.min(cx, box.x + box.w));
  const nearestY = Math.max(box.y, Math.min(cy, box.y + box.h));
  return Math.hypot(nearestX - cx, nearestY - cy) >= radius - 0.05;
}

function segmentHitsBox(line, box) {
  const pad = 0.4;
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
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
}

function pointLineDistance(point, line) {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const length = Math.hypot(dx, dy) || 1;
  return Math.abs(dy * point.x - dx * point.y + line.x2 * line.y1 - line.y2 * line.x1) / length;
}

function boxesOverlap(a, b) {
  return a.x < b.x + b.w - 0.05
    && a.x + a.w - 0.05 > b.x
    && a.y < b.y + b.h - 0.05
    && a.y + a.h - 0.05 > b.y;
}
