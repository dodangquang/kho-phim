'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
module.exports = function () {
  const platform = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'core.js'), 'utf8'), platform);
  const core = platform.window.KhoCore;
  for (const sourceSize of [6, 12, 24]) {
    const found = [];
    for (let displayPage = 1; displayPage <= 9; displayPage++) {
      const sourcePage = Math.floor((displayPage - 1) * 6 / sourceSize) + 1;
      const start = (sourcePage - 1) * sourceSize;
      const items = Array.from({ length: Math.min(sourceSize, 49 - start) }, (_, index) => ({ slug: String(start + index) }));
      const result = core.list({ data: { items, params: { pagination: { totalItems: 49, totalItemsPerPage: sourceSize, totalPages: Math.ceil(49 / sourceSize) } } } }, displayPage);
      assert.equal(result.totalPages, 9);
      assert.ok(result.items.length <= 6);
      found.push(...result.items.map(item => Number(item.slug)));
    }
    assert.deepEqual(found, Array.from({ length: 49 }, (_, index) => index));
  }
};
