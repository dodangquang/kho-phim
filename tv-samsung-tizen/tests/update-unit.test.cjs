'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const { build } = require('../tools/build-update.cjs');
const acorn = require(process.env.ACORN_PATH || 'acorn');

test('Update shell and downloadable runtime remain ES5', () => {
  for (const file of ['boot.js', 'update-hash.js', 'updater.js']) acorn.parse(fs.readFileSync(path.join(root, file), 'utf8'), { ecmaVersion: 5 });
  acorn.parse(JSON.parse(build().text).js, { ecmaVersion: 5 });
});
test('TV SHA-256 agrees with Node for empty, Unicode, boundary and full runtime inputs', () => {
  const scope = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'update-hash.js'), 'utf8'), scope);
  for (const text of ['', 'abc', 'Kho Phim — Lồng tiếng 🎬', ...[55, 56, 63, 64, 65, 128, 1024].map(length => 'a'.repeat(length)), build().text]) {
    assert.equal(scope.window.KhoUpdateHash(text), crypto.createHash('sha256').update(text).digest('hex'));
  }
});
test('Published bundle matches source, digest, UTF-8 size, shell and package version', () => {
  const { text, manifest } = build();
  const published = JSON.parse(fs.readFileSync(path.resolve(root, '../docs/samsung/update.json'), 'utf8'));
  assert.deepEqual(published, manifest);
  const bytes = fs.readFileSync(path.resolve(root, '../docs/samsung', manifest.bundle));
  assert.equal(bytes.length, manifest.size);
  assert.equal(bytes.toString('utf8'), text);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
  assert.match(fs.readFileSync(path.join(root, 'updater.js'), 'utf8'), new RegExp("PACKAGE_VERSION = '" + manifest.version.replaceAll('.', '\\.') + "'"));
  assert.match(fs.readFileSync(path.join(root, 'config.xml'), 'utf8'), new RegExp('version="' + manifest.version.replaceAll('.', '\\.') + '"'));
  assert.equal(/<script\b|<iframe\b/i.test(JSON.parse(text).html), false);
  assert.ok(manifest.size < 800000);
});
test('Update CSP allows only local/blob execution, without eval or inline script permission', () => {
  const xml = fs.readFileSync(path.join(root, 'config.xml'), 'utf8');
  assert.match(xml, /script-src 'self' file: blob:/);
  assert.doesNotMatch(xml, /unsafe-eval|unsafe-inline|packagemanager/);
  const updater = fs.readFileSync(path.join(root, 'updater.js'), 'utf8');
  assert.doesNotMatch(updater, /localStorage\.clear\(|eval\(|new Function\(/);
  assert.match(updater, /https:\/\/khophimqd\.vercel\.app\/samsung\//);
});
