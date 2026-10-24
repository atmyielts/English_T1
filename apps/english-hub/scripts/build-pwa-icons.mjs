// Builds the installable-app icons for Schood English from the real Schood mark
// (public/schood-logo.png, identical to brand-materials/01-identity/logos/schood-original.png).
//
//   node apps/english-hub/scripts/build-pwa-icons.mjs
//
// Output (committed, served as static files):
//   public/icons/icon-192.png, icon-512.png        colour mark on brand navy, rounded tile ("any")
//   public/icons/icon-maskable-512.png              full-bleed navy, mark inside the 80% safe zone
//   public/icons/apple-touch-icon.png (180)         full-bleed navy, iOS rounds the corners itself
//   public/icons/favicon-32.png, favicon-64.png     transparent colour mark
//   public/icons/<skill>-{192,512,maskable-512,180}.png
//                                                   white mark on the skill's accent colour
//
// Uses sharp, which is already in the root lockfile. Run it again only when the
// logo or a skill accent changes.
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const out = join(root, 'icons');
const NAVY = '#0F172A';

// Skill accents: keep in step with .en-workspace.is-<skill> in src/english.css.
const SKILL_ACCENTS = {
  reading: '#4e6d3b',
  writing: '#8a4f1d',
  listening: '#1f537a',
  speaking: '#7a2531',
  grammar: '#2f4384',
  vocabulary: '#236a5f',
  immersion: '#7a5a1f',
};

const trimmed = await sharp(join(root, 'schood-logo.png')).trim().png().toBuffer();

/** The mark scaled to fit a box; `white` keeps only its silhouette, in white. */
const mark = async (box, white) => {
  const resized = await sharp(trimmed).resize(box, box, { fit: 'inside' }).png().toBuffer();
  if (!white) return resized;
  const { width, height } = await sharp(resized).metadata();
  const alpha = await sharp(resized).extractChannel('alpha').toBuffer();
  return sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .joinChannel(alpha)
    .png()
    .toBuffer();
};

const tile = (size, color, radius) => Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${color}"/></svg>`,
);

/**
 * size: canvas; markShare: mark box as a share of the canvas; radius: 0 for full-bleed.
 */
const icon = async ({ file, size, color, markShare, radius, white }) => {
  const box = Math.round(size * markShare);
  const input = await mark(box, white);
  const { width, height } = await sharp(input).metadata();
  await sharp(tile(size, color, radius))
    .composite([{ input, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(join(out, file));
};

await mkdir(out, { recursive: true });

// The main app.
await icon({ file: 'icon-192.png', size: 192, color: NAVY, markShare: 0.68, radius: 42 });
await icon({ file: 'icon-512.png', size: 512, color: NAVY, markShare: 0.68, radius: 112 });
// Maskable: launchers may crop to a circle of 80% diameter; keep the mark well inside it.
await icon({ file: 'icon-maskable-512.png', size: 512, color: NAVY, markShare: 0.56, radius: 0 });
await icon({ file: 'apple-touch-icon.png', size: 180, color: NAVY, markShare: 0.66, radius: 0 });
for (const size of [32, 64]) {
  await sharp(trimmed)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(join(out, `favicon-${size}.png`));
}

// One app per skill: the same mark, in white, on the skill's own colour.
for (const [skill, color] of Object.entries(SKILL_ACCENTS)) {
  await icon({ file: `${skill}-192.png`, size: 192, color, markShare: 0.66, radius: 42, white: true });
  await icon({ file: `${skill}-512.png`, size: 512, color, markShare: 0.66, radius: 112, white: true });
  await icon({ file: `${skill}-maskable-512.png`, size: 512, color, markShare: 0.54, radius: 0, white: true });
  await icon({ file: `${skill}-180.png`, size: 180, color, markShare: 0.64, radius: 0, white: true });
}

console.log(`Icons written to ${out}`);
