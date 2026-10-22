'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const target = path.resolve(root, '../docs/samsung');
const scripts = ['ratings.js', 'core.js', 'player.js', 'posters.js', 'home.js', 'app.js'];
function source(file) { return fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'); }
function build() {
  const version = JSON.parse(source('package.json')).version;
  if (!source('core.js').includes("C.VERSION = '" + version + "'")) throw new Error('Runtime version disagrees with package.json');
  const html = /<body[^>]*>([\s\S]*)<\/body>/i.exec(source('index.html'))[1].replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').trim();
  const data = { schema: 1, shell: 1, version, html, css: source('style.css') + '\n' + source('tv-compat.css') + '\n' + source('../docs/announcement.css'), js: scripts.map(file => '/* ' + file + ' */\n' + source(file)).join('\n;\n') + '\n;\n' + source('../docs/announcement.js') };
  if (/<\s*(?:script|iframe|base)\b/i.test(html)) throw new Error('Runtime HTML must not embed executable scripts or frames');
  const text = JSON.stringify(data) + '\n';
  const sha256 = crypto.createHash('sha256').update(text).digest('hex');
  const manifest = { schema: 1, shell: 1, version, bundle: 'bundles/' + sha256 + '.json', sha256, size: Buffer.byteLength(text) };
  if (manifest.size > 800000) throw new Error('Runtime exceeds shell update size limit');
  return { text, manifest };
}
if (require.main === module) {
  const { text, manifest } = build();
  const manifestText = JSON.stringify(manifest, null, 2) + '\n';
  const bundleFile = path.join(target, manifest.bundle);
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(path.join(target, 'update.json'), 'utf8').replace(/\r\n/g, '\n') !== manifestText || fs.readFileSync(bundleFile, 'utf8').replace(/\r\n/g, '\n') !== text) throw new Error('Samsung OTA is stale. Run node tv-samsung-tizen/tools/build-update.cjs');
    console.log('Samsung OTA matches runtime ' + manifest.version);
  } else {
    fs.mkdirSync(path.dirname(bundleFile), { recursive: true });
    fs.writeFileSync(bundleFile, text);
    fs.writeFileSync(path.join(target, 'update.json'), manifestText);
    console.log(JSON.stringify(manifest));
  }
}
module.exports = { build };
