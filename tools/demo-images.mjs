// Generated demo photos → public/demo/*.webp (sized for the booking page):
//   node tools/demo-images.mjs <folder with the .jpg sources>
// Photos missing from the folder are skipped, so one batch can be added at a time.
import sharp from 'sharp';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) throw new Error('usage: node tools/demo-images.mjs <source folder>');
const out = 'public/demo';
mkdirSync(out, { recursive: true });

const jobs = [
  ['cover', 1600],
  ['about-studio', 1000],
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => [`gallery-${n}`, 900]),
  ...['gel-manicure', 'gel-refill', 'french-gel', 'builder-gel', 'gel-pedicure', 'removal'].map((n) => [`svc-${n}`, 800]),
  ...['noa', 'maya', 'lior', 'dana'].map((n) => [`staff-${n}`, 600]),
];
for (const [name, width] of jobs) {
  const file = join(src, `${name}.jpg`);
  if (!existsSync(file)) continue;
  const info = await sharp(file).resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toFile(join(out, `${name}.webp`));
  console.log(name, `${Math.round(info.size / 1024)} KB`);
}
