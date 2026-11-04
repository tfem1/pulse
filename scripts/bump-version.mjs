#!/usr/bin/env node
// Set the same version in package.json, Cargo.toml (workspace) and tauri.conf.json.
// Usage: node scripts/bump-version.mjs 0.2.0
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
  console.error('usage: node scripts/bump-version.mjs <semver>, e.g. 0.2.0');
  process.exit(1);
}

const json = (path, mutate) => {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  mutate(data);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
};

json('package.json', (p) => (p.version = version));
json('src-tauri/tauri.conf.json', (c) => (c.version = version));

const cargo = readFileSync('Cargo.toml', 'utf8');
const next = cargo.replace(/(\[workspace\.package\][^[]*?\nversion = ")[^"]+(")/, `$1${version}$2`);
if (next === cargo) {
  console.error('could not find [workspace.package] version in Cargo.toml');
  process.exit(1);
}
writeFileSync('Cargo.toml', next);
console.log(`version set to ${version}`);
