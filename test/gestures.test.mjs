import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { clampZoom, hitSlopMm, panBy, zoomBy } from '../js/sheet-gestures.js';

test('the edit sheet zooms, pans, and keeps a generous tap target', () => {
  assert.equal(clampZoom(20), 8);
  assert.equal(clampZoom(0.01), 0.35);
  assert.equal(zoomBy(1, 1.2), 1.2);
  assert.deepEqual(panBy({ x: 4, y: -2 }, 10, 3), { x: 14, y: 1 });
  assert.ok(hitSlopMm(1) >= 12);
  assert.ok(hitSlopMm(4) < hitSlopMm(1));
  assert.ok(hitSlopMm(4) * 4 * 2.6 >= 44 - 0.1);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="edit-drawing"/);
  assert.match(html, /id="edit-back"/);
  assert.match(html, /Back to sheet/);
  assert.match(html, /id="sheet-edit"/);
});
