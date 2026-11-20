import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import occtimportjs from 'occt-import-js';
import { formatBytes } from '../js/format.js';
import {
  LARGE_FILE_BYTES,
  STEP_IMPORT_PARAMS,
  boundingBox,
  countFaces,
  isSensibleBoundingBox,
  isStepFilename,
  needsLargeFileWarning,
} from '../js/step-model.js';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const SLOW_MS = 2000;

test('large-file warning and STEP names', () => {
  assert.equal(needsLargeFileWarning(LARGE_FILE_BYTES - 1), false);
  assert.equal(needsLargeFileWarning(LARGE_FILE_BYTES), true);
  assert.equal(isStepFilename('Part.STEP'), true);
  assert.equal(isStepFilename('Part.stp'), true);
  assert.equal(isStepFilename('notes.txt'), false);
  assert.equal(STEP_IMPORT_PARAMS.linearUnit, 'millimeter');
});

test('every STEP fixture parses to meshes with a sensible bounding box', async () => {
  const occt = await occtimportjs();
  const files = (await readdir(FIXTURES))
    .filter((name) => isStepFilename(name))
    .sort((a, b) => a.localeCompare(b, 'en-GB', { sensitivity: 'base' }));
  assert.ok(files.length > 0, 'test/fixtures has no STEP files');

  const rows = [];
  for (const file of files) {
    const full = path.join(FIXTURES, file);
    const info = await stat(full);
    const bytes = new Uint8Array(await readFile(full));
    const started = performance.now();
    let result;
    let thrown = '';
    try {
      result = occt.ReadStepFile(bytes, STEP_IMPORT_PARAMS);
    } catch (error) {
      thrown = error instanceof Error ? error.message : String(error);
    }
    const ms = performance.now() - started;
    const box = result?.success ? boundingBox(result) : null;
    const sensible = isSensibleBoundingBox(box);
    const notes = [
      thrown ? `failed: ${thrown}` : '',
      result && result.success !== true ? 'did not parse' : '',
      !sensible ? 'bounding box not sensible' : '',
      ms > SLOW_MS ? 'slow' : '',
    ].filter(Boolean).join('; ');
    rows.push({
      file,
      bytes: info.size,
      ms,
      meshes: result?.meshes?.length || 0,
      faces: result?.success ? countFaces(result) : 0,
      box,
      sensible,
      success: result?.success === true && !thrown,
      notes,
    });
  }

  printTable(rows);
  const slow = rows.filter((row) => row.ms > SLOW_MS).map((row) => row.file);
  if (slow.length) {
    console.log(`Slow (over ${SLOW_MS} ms in ReadStepFile): ${slow.join(', ')}`);
  } else {
    console.log(`No fixture took over ${SLOW_MS} ms in ReadStepFile.`);
  }

  for (const row of rows) {
    assert.equal(row.success, true, `${row.file} should parse`);
    assert.ok(row.meshes > 0, `${row.file} should contain meshes`);
    assert.ok(row.sensible, `${row.file} bounding box should be sensible`);
    if (row.file === 'cone_50x12_v2.step') {
      const [x, y, z] = row.box.size;
      assert.ok(Math.abs(x - 50) < 0.5, `cone width ${x}`);
      assert.ok(Math.abs(y - 50) < 0.5, `cone depth ${y}`);
      assert.ok(Math.abs(z - 12) < 0.5, `cone height ${z}`);
    }
  }

  const junk = occt.ReadStepFile(new TextEncoder().encode('not a step file'), null);
  assert.equal(junk.success, false);
});

function printTable(rows) {
  const header = ['File', 'Size', 'Load time', 'Meshes', 'Faces', 'Bounding box (mm)', 'Notes'];
  const body = rows.map((row) => [
    row.file,
    formatBytes(row.bytes),
    `${row.ms.toFixed(0)} ms`,
    String(row.meshes),
    String(row.faces),
    row.box ? row.box.size.map((value) => value.toFixed(3)).join(' × ') : '—',
    row.notes || '—',
  ]);
  const widths = header.map((cell, index) => Math.max(
    cell.length,
    ...body.map((line) => line[index].length),
  ));
  const format = (cells) => `| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(' | ')} |`;
  console.log(format(header));
  console.log(`| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`);
  for (const line of body) console.log(format(line));
}
