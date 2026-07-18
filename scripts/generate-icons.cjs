/**
 * Regenerates app icons from assets/icons/icon.svg:
 *   - assets/icons/icon.png  (1024 RGBA)
 *   - assets/icons/icon.ico  (16/32/48/64/128/256)
 *   - public/icon.png
 *   - public/favicon.ico
 *
 * Usage: node scripts/generate-icons.cjs
 * Requires: sharp, png-to-ico (devDependencies or npx install)
 */
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  let sharp;
  let pngToIco;
  try {
    sharp = require('sharp');
    const pngToIcoMod = require('png-to-ico');
    pngToIco = pngToIcoMod.default || pngToIcoMod;
  } catch {
    console.error(
      'Missing sharp/png-to-ico. Run: npm install -D sharp png-to-ico'
    );
    process.exit(1);
  }

  const root = path.resolve(__dirname, '..');
  const svgPath = path.join(root, 'assets/icons/icon.svg');
  const pngPath = path.join(root, 'assets/icons/icon.png');
  const icoPath = path.join(root, 'assets/icons/icon.ico');
  const publicPng = path.join(root, 'public/icon.png');
  const publicIco = path.join(root, 'public/favicon.ico');

  const svg = fs.readFileSync(svgPath);

  // Master PNG — RGBA, full-bleed square (no baked white corners)
  await sharp(svg, { density: 384 })
    .resize(1024, 1024)
    .ensureAlpha()
    .png()
    .toFile(pngPath);

  fs.copyFileSync(pngPath, publicPng);

  const sizes = [16, 32, 48, 64, 128, 256];
  const buffers = await Promise.all(
    sizes.map((size) =>
      sharp(svg, { density: 384 })
        .resize(size, size)
        .ensureAlpha()
        .png()
        .toBuffer()
    )
  );

  const ico = await pngToIco(buffers);
  fs.writeFileSync(icoPath, ico);
  fs.writeFileSync(publicIco, ico);

  console.log('Generated:');
  console.log(' ', pngPath);
  console.log(' ', icoPath);
  console.log(' ', publicPng);
  console.log(' ', publicIco);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
