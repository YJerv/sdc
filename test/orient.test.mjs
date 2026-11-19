import assert from 'node:assert/strict';
import test from 'node:test';
import { applyQuaternion, basisFromUp, dot, quaternionFromTo } from '../js/orient.js';

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
