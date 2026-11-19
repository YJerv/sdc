import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyQuaternion,
  basisForFront,
  basisFromUp,
  dot,
  quaternionFromTo,
  seatOnGrid,
  toAligned,
} from '../js/orient.js';
import { readGridVisible, writeGridVisible } from '../js/settings.js';

test('a clicked face normal becomes the top axis', () => {
  const clicked = [0, -1, 0];
  const q = quaternionFromTo(clicked, [0, 0, 1]);
  const up = applyQuaternion(q, clicked);
  assert.ok(Math.abs(up[0]) < 1e-6);
  assert.ok(Math.abs(up[1]) < 1e-6);
  assert.ok(up[2] > 0.999);
  const basis = basisFromUp(clicked, [
    [0, 0, 0], [4, 0, 0], [4, 1, 0], [0, 1, 0],
  ]);
  assert.ok(dot(basis.z, clicked) > 0.999);
  assert.ok(Math.abs(dot(basis.x, basis.z)) < 1e-6);
  assert.ok(Math.abs(dot(basis.y, basis.z)) < 1e-6);
  assert.ok(dot(basis.x, [1, 0, 0]) > 0.9 || dot(basis.x, [0, 0, 1]) > 0.9);
});

test('a changed front face squares the part and seats it on the grid', () => {
  const angle = 15 * Math.PI / 180;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const raw = [
    [0, 0, 2], [10, 0, 2], [10, 4, 2], [0, 4, 2],
    [0, 0, 8], [10, 0, 8], [10, 4, 8], [0, 4, 8],
  ].map((p) => [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]]);
  const basis = basisForFront('negY', raw, 0);
  const translation = seatOnGrid(raw, basis);
  const aligned = raw.map((point) => toAligned(point, basis, translation));
  const xs = aligned.map((p) => p[0]);
  const ys = aligned.map((p) => p[1]);
  const zs = aligned.map((p) => p[2]);
  assert.ok(Math.abs(Math.min(...zs)) < 1e-6);
  const span = (values) => Math.max(...values) - Math.min(...values);
  const sx = span(xs);
  const sy = span(ys);
  assert.ok(Math.abs(sx - 10) < 0.05 || Math.abs(sx - 4) < 0.05);
  assert.ok(Math.abs(sy - 10) < 0.05 || Math.abs(sy - 4) < 0.05);
  assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2) < 0.05);
  assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2) < 0.05);
  assert.ok(dot(basis.y, [0, -1, 0]) < -0.7);
});

test('the grid choice is remembered', () => {
  const saved = new Map();
  const storage = {
    getItem: (key) => (saved.has(key) ? saved.get(key) : null),
    setItem: (key, value) => saved.set(key, value),
  };
  assert.equal(readGridVisible(storage), true);
  writeGridVisible(false, storage);
  assert.equal(readGridVisible(storage), false);
  writeGridVisible(true, storage);
  assert.equal(readGridVisible(storage), true);
});
