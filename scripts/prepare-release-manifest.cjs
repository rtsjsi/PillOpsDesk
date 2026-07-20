#!/usr/bin/env node
/**
 * Build latest.json for GitHub Releases OTA.
 *
 * Usage:
 *   node scripts/prepare-release-manifest.cjs <path-to-PillOpsDeskSetup.exe> ["Release notes"]
 *
 * Upload both the .exe and latest.json to the same GitHub release (tag vX.Y.Z).
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const GITHUB_REPO = 'rtsjsi/PillOpsDesk';
const projectRoot = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const version = pkg.version;
const tag = `v${version}`;

const exePath = process.argv[2];
if (!exePath) {
  console.error(
    'Usage: node scripts/prepare-release-manifest.cjs <path-to-PillOpsDeskSetup.exe> ["Release notes"]'
  );
  process.exit(1);
}

const resolvedExe = path.resolve(exePath);
if (!fs.existsSync(resolvedExe)) {
  console.error(`Installer not found: ${resolvedExe}`);
  process.exit(1);
}

const notes = process.argv[3] || `PillOpsDesk ${version}`;

const hash = crypto.createHash('sha256');
hash.update(fs.readFileSync(resolvedExe));
const sha256 = hash.digest('hex');

const manifest = {
  version,
  releaseDate: new Date().toISOString().slice(0, 10),
  notes,
  url: `https://github.com/${GITHUB_REPO}/releases/download/${tag}/PillOpsDeskSetup.exe`,
  sha256,
};

const outPath = path.join(path.dirname(resolvedExe), 'latest.json');
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote ${outPath}`);
console.log(JSON.stringify(manifest, null, 2));
