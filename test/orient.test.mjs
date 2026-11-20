import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyQuaternion,
  basisAlignedTo,
  basisForFront,
  basisFromUp,
  dot,
  featureDirection,
  nearestAxis,
  quaternionFromTo,
  seatOnGrid,
  toAligned,
} from '../js/orient.js';
import { readGridVisible, writeGridVisible } from '../js/settings.js';
import { createTopArm } from '../js/top-arm.js';

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

test('a tilted face snaps onto the nearest axis and squares the part', () => {
  const angle = 7 * Math.PI / 180;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rotY = (p) => [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]];
  const raw = [
    [0, 0, 0], [10, 0, 0], [10, 4, 0], [0, 4, 0],
    [0, 0, 6], [10, 0, 6], [10, 4, 6], [0, 4, 6],
  ].map(rotY);
  const normal = rotY([0, 0, 1]);
  assert.deepEqual(nearestAxis(normal).map((value) => Math.round(value)), [0, 0, 1]);
  const flat = featureDirection(raw.slice(0, 4), [normal, normal, normal]);
  assert.ok(dot(nearestAxis(flat), [0, 0, 1]) > 0.9);
  const basis = basisAlignedTo(normal, raw);
  const aligned = raw.map((point) => toAligned(point, basis, seatOnGrid(raw, basis)));
  const span = (axis) => {
    const values = aligned.map((point) => point[axis]);
    return Math.max(...values) - Math.min(...values);
  };
  const spans = [span(0), span(1), span(2)].sort((a, b) => a - b);
  assert.ok(Math.abs(spans[0] - 4) < 0.05, spans.join(','));
  assert.ok(Math.abs(spans[1] - 6) < 0.05, spans.join(','));
  assert.ok(Math.abs(spans[2] - 10) < 0.05, spans.join(','));
  assert.ok(Math.abs(Math.min(...aligned.map((point) => point[2]))) < 1e-6);
});

test('a click does not set the top until Set top is armed', () => {
  const arm = createTopArm();
  assert.equal(arm.click(), false);
  assert.equal(arm.isArmed(), false);
  arm.arm();
  assert.equal(arm.isArmed(), true);
  assert.equal(arm.click(), true);
  assert.equal(arm.click(), false);
  arm.arm();
  arm.cancel();
  assert.equal(arm.click(), false);
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
