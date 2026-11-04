#!/usr/bin/env node
// Set the same version in package.json, Cargo.toml (workspace) and tauri.conf.json.
// Usage: node scripts/bump-version.mjs 0.2.0
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version ?? '')) {
  console.error('usage: node scripts/bump-version.mjs <semver>, e.g. 0.2.0');
  process.exit(1);
}

// Replace only the top-level "version" value so the files keep their
// existing (Prettier) formatting.
const setJsonVersion = (path) => {
  const text = readFileSync(path, 'utf8');
  const next = text.replace(/^(\s{2}"version":\s*")[^"]*(")/m, `$1${version}$2`);
  if (next === text && !text.includes(`"version": "${version}"`)) {
    console.error(`could not find a top-level "version" in ${path}`);
    process.exit(1);
  }
  writeFileSync(path, next);
};

setJsonVersion('package.json');
setJsonVersion('src-tauri/tauri.conf.json');

const cargo = readFileSync('Cargo.toml', 'utf8');
const next = cargo.replace(/(\[workspace\.package\][^[]*?\nversion = ")[^"]+(")/, `$1${version}$2`);
if (next === cargo) {
  console.error('could not find [workspace.package] version in Cargo.toml');
  process.exit(1);
}
writeFileSync('Cargo.toml', next);
console.log(`version set to ${version}`);
