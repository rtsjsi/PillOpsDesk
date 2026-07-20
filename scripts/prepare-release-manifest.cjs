#!/usr/bin/env node
/**
 * Build latest.json for GitHub Releases OTA.
 *
 * Usage:
 *   node scripts/prepare-release-manifest.cjs <path-to-PillOpsDesk-X.Y.Z-win64.zip> ["Release notes"]
 *
 * Upload the zip and latest.json to the same GitHub release (tag vX.Y.Z).
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const GITHUB_REPO = 'rtsjsi/PillOpsDesk';
const projectRoot = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const version = pkg.version;
const tag = `v${version}`;
const zipName = `PillOpsDesk-${version}-win64.zip`;

const zipPath = process.argv[2];
if (!zipPath) {
  console.error(
    `Usage: node scripts/prepare-release-manifest.cjs <path-to-${zipName}> ["Release notes"]`
  );
  process.exit(1);
}

const resolvedZip = path.resolve(zipPath);
if (!fs.existsSync(resolvedZip)) {
  console.error(`Update package not found: ${resolvedZip}`);
  process.exit(1);
}

const notes = process.argv[3] || `PillOpsDesk ${version}`;

const hash = crypto.createHash('sha256');
hash.update(fs.readFileSync(resolvedZip));
const sha256 = hash.digest('hex');

const manifest = {
  version,
  releaseDate: new Date().toISOString().slice(0, 10),
  notes,
  url: `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${zipName}`,
  sha256,
};

const outPath = path.join(path.dirname(resolvedZip), 'latest.json');
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Wrote ${outPath}`);
console.log(JSON.stringify(manifest, null, 2));
