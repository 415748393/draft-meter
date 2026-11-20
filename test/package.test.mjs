// Package shape: the manifest fields DSH's bundle loader and plugin manager
// actually read, plus the bundle-display checklist (locale metadata, artwork
// rules, detail docs). These checks are about the package, not the UI.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSuite, summarise } from './harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suite = createSuite('package');

function readJson(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    suite.fail(`missing ${rel}`);
    return null;
  }
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    suite.ok(`${rel} parses`);
    return value;
  } catch (err) {
    suite.fail(`${rel} does not parse`, err.message);
    return null;
  }
}

// ---- manifest -------------------------------------------------------------
const pkg = readJson('package.json');

if (pkg !== null) {
  const manifest = pkg.exports ?? {};
  suite.equal(manifest['.'], './index.js', 'exports "." points at the Host half');
  suite.equal(manifest['./client'], './client.js', 'exports "./client" points at the Client half');
  suite.equal(manifest['./locale/*.json'], './locale/*.json', 'exports the locale dictionaries');
  suite.equal(manifest['./icon'], './icon.svg', 'exports the icon');
  suite.equal(pkg.type, 'module', 'package is an ES module');

  const dsh = pkg.dsh ?? {};
  suite.equal(dsh.bundle?.patch, './cordis.patch.yml', 'dsh.bundle.patch installs a Loader row');
  suite.equal(dsh.client?.platform, 'web', 'dsh.client targets the web surface');
  suite.check(
    Array.isArray(dsh.client?.inject) && dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'),
    'dsh.client.inject names the conversation package it slots into',
  );
  suite.check(
    dsh.client?.external === undefined || Array.isArray(dsh.client.external),
    'dsh.client.external is absent or a list (react/react-dom are baseline modules)',
  );

  // Every path the manifest advertises must exist, or installation produces a
  // package that only breaks once the browser asks for a chunk.
  for (const entry of pkg.files ?? []) {
    const target = path.join(root, entry);
    if (entry.includes('*')) {
      const folder = path.dirname(target);
      const suffix = entry.slice(entry.indexOf('*') + 1);
      const hits = fs.existsSync(folder)
        ? fs.readdirSync(folder).filter((name) => name.endsWith(suffix))
        : [];
      suite.check(hits.length > 0, `files entry "${entry}" resolves`, `no ${suffix} files in ${folder}`);
    } else {
      suite.check(fs.existsSync(target), `files entry "${entry}" exists`);
    }
  }

  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.peerDependencies ?? {}) };
  const harness = Object.keys(deps).filter((name) => name.startsWith('@deepseek-ai/'));
  suite.check(harness.length === 0, 'no dependency on a Harness package', harness.join(', '));
}

// ---- client entry ---------------------------------------------------------
const clientFile = path.join(root, 'client.js');
if (!fs.existsSync(clientFile)) {
  suite.fail('missing client.js');
} else {
  const src = fs.readFileSync(clientFile, 'utf8');
  // new Function runs the parser without executing the body: the browser loads
  // this file through a classic <script>, so a syntax error is fatal at boot.
  try {
    new Function(src);
    suite.ok('client.js parses as JavaScript');
  } catch (err) {
    suite.fail('client.js does not parse', err.message);
  }
  const expectedId = pkg?.name ?? '';
  suite.check(src.includes('window.__ModuleLoader__.load('), 'registers through window.__ModuleLoader__');
  suite.check(src.includes(`id: '${expectedId}'`), `module id matches the package name (${expectedId})`);

  const requires = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
  const forbidden = requires.filter((name) => name.startsWith('@deepseek-ai/'));
  suite.check(forbidden.length === 0, 'requires only baseline modules', forbidden.join(', '));
  suite.check(requires.includes('react'), 'requires react');
}

// ---- host half ------------------------------------------------------------
const hostFile = path.join(root, 'index.js');
if (!fs.existsSync(hostFile)) suite.fail('missing index.js');
else {
  const src = fs.readFileSync(hostFile, 'utf8');
  suite.check(/export\s+function\s+apply/.test(src), 'Host half exports apply()');
}

// ---- loader patch ---------------------------------------------------------
const patchFile = path.join(root, 'cordis.patch.yml');
if (!fs.existsSync(patchFile)) suite.fail('missing cordis.patch.yml');
else {
  const patch = fs.readFileSync(patchFile, 'utf8');
  suite.check(patch.includes(`name: '${pkg?.name ?? ''}'`), 'patch inserts this package');
  const rowId = /id:\s*([A-Za-z0-9-]+)/.exec(patch)?.[1];
  suite.check(rowId !== undefined, 'patch row has an id', rowId);
  suite.check(/^-\s*insert:/m.test(patch), 'patch is an insert operation');
}

// ---- display checklist ----------------------------------------------------
for (const lang of ['en', 'zh']) {
  const locale = readJson(`locale/${lang}.json`);
  if (locale === null) continue;
  const meta = locale.meta ?? {};
  suite.check(typeof meta.title === 'string' && meta.title.length > 0, `locale/${lang} has meta.title`);
  suite.check(
    typeof meta.description === 'string' && meta.description.length > 1,
    `locale/${lang} has meta.description`,
  );
  if (meta.detail !== undefined) {
    suite.check(fs.existsSync(path.join(root, meta.detail)), `locale/${lang} meta.detail resolves`, meta.detail);
  }
}

function checkArtwork(rel, width, height, maxBytes) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    suite.fail(`missing ${rel}`);
    return;
  }
  const raw = fs.readFileSync(file, 'utf8');
  const size = fs.statSync(file).size;
  suite.check(size <= maxBytes, `${rel} is within ${maxBytes} bytes`, `${size}B`);
  suite.check(!/<script/i.test(raw), `${rel} carries no script`);
  suite.check(!/<text/i.test(raw), `${rel} carries no <text> (the UI supplies the words)`);
  suite.check(!/<style/i.test(raw), `${rel} carries no <style>`);
  suite.check(!/<foreignObject/i.test(raw), `${rel} carries no <foreignObject>`);

  // A renderer must be able to draw this offline: only #fragment references.
  const external = [
    ...[...raw.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)].map((m) => m[1].trim()),
    ...[...raw.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1].trim()),
  ].filter((target) => !target.startsWith('#'));
  suite.check(external.length === 0, `${rel} references nothing external`, external.join(', '));

  if (width !== null) {
    const declared = /width="(\d+(?:\.\d+)?)"/.exec(raw)?.[1];
    const tall = /height="(\d+(?:\.\d+)?)"/.exec(raw)?.[1];
    suite.equal(Number(declared), width, `${rel} is ${width}px wide`);
    suite.equal(Number(tall), height, `${rel} is ${height}px tall`);
  }
  suite.check(/viewBox="[^"]+"/.test(raw), `${rel} declares a viewBox`);
}

checkArtwork('icon.svg', 36, 36, 256 * 1024);
checkArtwork('docs/preview.svg', 640, 300, 1024 * 1024);

// The detail doc is rendered as a single illustration: more than one line and
// the plugin page layout has nothing sensible to do with it.
for (const rel of ['docs/DETAIL.md', 'docs/DETAIL.zh.md']) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    suite.fail(`missing ${rel}`);
    continue;
  }
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((line) => line.trim().length > 0);
  suite.equal(lines.length, 1, `${rel} is a single line`);
  const target = /!\[[^\]]*\]\(([^)]+)\)/.exec(lines[0] ?? '')?.[1];
  suite.check(target !== undefined, `${rel} is an image line`);
  if (target !== undefined) {
    suite.check(
      fs.existsSync(path.join(root, path.dirname(rel), target)),
      `${rel} image "${target}" exists beside it`,
    );
  }
}

export { suite as packageSuite };

// Running this file directly gives the same report as the combined runner.
if (process.argv[1] !== undefined && process.argv[1].endsWith('package.test.mjs')) {
  const { text, failed } = summarise([suite]);
  process.stdout.write(text + '\n');
  process.exitCode = failed === 0 ? 0 : 1;
}
