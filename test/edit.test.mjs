import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import occtimportjs from 'occt-import-js';
import { createDrawing } from '../js/drawing/create.js';
import { createSheetEditor, dimensionForOne, dimensionForPair, pickDimension, pickEntity } from '../js/drawing/edit.js';
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
  const edges = drawing.entities.filter((entity) => entity.type === 'edge' && entity.view === 'front' && entity.orient === 'h');
  assert.ok(edges.length >= 2, `front edges ${edges.length}`);
  const pair = [...edges].sort((a, b) => a.cy - b.cy);
  const two = dimensionForPair(pair[0], pair[pair.length - 1], drawing.dimensions);
  assert.ok(two, 'two edges');
  assert.ok(two.value > 1);
  assert.equal(dimensionForPair(hole, { ...edges[0], view: 'right' }, drawing.dimensions), null);
  const editor = createSheetEditor(drawing);
  const added = editor.add(one);
  assert.match(editor.svg(), new RegExp(`data-dim-id="${added.id}"`));
  assert.match(editor.svg(), /Ø20/);
});

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
