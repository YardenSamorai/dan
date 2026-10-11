// Generated demo photos → public/demo/*.webp (sized for the booking page):
//   node tools/demo-images.mjs <folder with the .jpg sources>
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) throw new Error('usage: node tools/demo-images.mjs <source folder>');
const out = 'public/demo';
mkdirSync(out, { recursive: true });

const jobs = [
  ['cover', 1600],
  ...[1, 2, 3, 4, 5, 6].map((n) => [`gallery-${n}`, 900]),
  ...['noa', 'maya', 'lior', 'dana'].map((n) => [`staff-${n}`, 600]),
];
for (const [name, width] of jobs) {
  const info = await sharp(join(src, `${name}.jpg`)).resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toFile(join(out, `${name}.webp`));
  console.log(name, `${Math.round(info.size / 1024)} KB`);
}
