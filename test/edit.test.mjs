import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import occtimportjs from 'occt-import-js';
import { createDrawing } from '../js/drawing/create.js';
import { createSheetEditor, dimensionForOne, dimensionForPair, exportSheet, pickDimension, pickEntity } from '../js/drawing/edit.js';
import { hitSlopMm } from '../js/sheet-gestures.js';
import { STEP_IMPORT_PARAMS } from '../js/step-model.js';

test('a confirmed delete removes that dimension from the sheet', { timeout: 60000 }, async () => {
  const occt = await occtimportjs();
  const bytes = new Uint8Array(await readFile(new URL('./fixtures/cone_50x12_v2.step', import.meta.url)));
  const drawing = createDrawing(occt.ReadStepFile(bytes, STEP_IMPORT_PARAMS), { title: 'cone', date: '19 Nov 2026' });
  const editor = createSheetEditor(drawing);
  const hole = editor.dimensions().find((dim) => dim.text.includes('Ø20'));
  assert.ok(hole, 'cone has Ø20');
  const slop = hitSlopMm(1);
  const picked = pickDimension(editor.dimensions(), hole.box.cx, hole.box.cy, slop);
  assert.equal(picked.id, hole.id);
  assert.equal(pickDimension(editor.dimensions(), 2, 2, slop), null);
  assert.equal(editor.remove(hole.id), true);
  assert.equal(editor.svg().includes('Ø20'), false);
  assert.match(editor.svg(), /Ø50/);
  assert.equal(editor.dimensions().some((dim) => dim.id === hole.id), false);
});

test('one feature and two features add dimensions clear of the others', { timeout: 60000 }, async () => {
  const occt = await occtimportjs();
  const bytes = new Uint8Array(await readFile(new URL('./fixtures/cone_50x12_v2.step', import.meta.url)));
  const drawing = createDrawing(occt.ReadStepFile(bytes, STEP_IMPORT_PARAMS), { title: 'cone', date: '19 Nov 2026' });
  const hole = drawing.entities.find((entity) => entity.type === 'circle' && entity.measure === 'diameter' && Math.abs(entity.size - 20) < 0.2);
  assert.ok(hole, `entities ${drawing.entities.map((entity) => `${entity.measure || entity.type}:${entity.size.toFixed(1)}`).join(', ')}`);
  const picked = pickEntity(drawing.entities, hole.cx + hole.r, hole.cy, hitSlopMm(2));
  assert.equal(picked.id, hole.id);
  const one = dimensionForOne(hole, drawing.dimensions);
  assert.ok(one);
  assert.match(one.text, /Ø20/);
  assert.ok(one.leaderLine);
  assert.equal(drawing.dimensions.some((dim) => overlaps(dim.box, one.box)), false);
  assert.equal(dimensionForPair(hole, { ...hole, id: 'other-view', view: 'front' }, drawing.dimensions), null);
  const editor = createSheetEditor(drawing);
  const added = editor.add(one);
  assert.match(editor.svg(), new RegExp(`data-dim-id="${added.id}"`));
  assert.match(editor.svg(), /Ø20/);
});

test('undo restores add and delete, and export uses the edited sheet', { timeout: 60000 }, async () => {
  const occt = await occtimportjs();
  const bytes = new Uint8Array(await readFile(new URL('./fixtures/cone_50x12_v2.step', import.meta.url)));
  const drawing = createDrawing(occt.ReadStepFile(bytes, STEP_IMPORT_PARAMS), { title: 'cone', date: '19 Nov 2026' });
  const editor = createSheetEditor(drawing);
  const hole = editor.dimensions().find((dim) => dim.text.includes('Ø20'));
  const edge = drawing.entities.find((entity) => entity.type === 'edge');
  assert.equal(editor.undo(), false);
  assert.equal(editor.remove(hole.id), true);
  const added = editor.add(dimensionForOne(edge, editor.dimensions()));
  assert.equal(exportSheet(editor).includes('Ø20'), false);
  assert.match(exportSheet(editor), new RegExp(`data-dim-id="${added.id}"`));
  assert.equal(editor.undo(), true);
  assert.equal(exportSheet(editor).includes(`data-dim-id="${added.id}"`), false);
  assert.equal(editor.undo(), true);
  assert.match(exportSheet(editor), /Ø20/);
  assert.equal(editor.undo(), false);
});

test('parallel edges are dimensioned by the perpendicular distance', () => {
  const lower = {
    id: 'lower', type: 'edge', view: 'front', orient: 'h',
    x1: 0, x2: 50, y1: 10, y2: 10, cx: 25, cy: 10, size: 50, scale: 2,
  };
  const upper = {
    id: 'upper', type: 'edge', view: 'front', orient: 'h',
    x1: 4, x2: 36, y1: 34, y2: 34, cx: 20, cy: 34, size: 16, scale: 2,
  };
  const dim = dimensionForPair(lower, upper, []);
  assert.equal(dim.orient, 'v');
  assert.equal(dim.value, 12);
  assert.notEqual(dim.value, lower.size);
  assert.notEqual(dim.value, upper.size);
  const upright = {
    id: 'upright', type: 'edge', view: 'front', orient: 'v',
    x1: 80, x2: 80, y1: 0, y2: 40, cx: 80, cy: 20, size: 40, scale: 2,
  };
  const across = dimensionForPair(lower, upright, []);
  assert.ok(across);
  assert.equal(across.value, 27.5);
});

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
