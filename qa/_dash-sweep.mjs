import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = [...walk('src'), 'index.html'].filter((f) => /\.(tsx?|css|html)$/.test(f));
const dash = /[\u2014\u2013]/;
for (const f of files) {
  readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    const comment = t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*');
    const hit = dash.test(line) || (/\.(ts|tsx)$/.test(f) && /['"`][^'"`]*\s--\s/.test(line));
    if (hit && !comment) console.log(`${f}:${i + 1}: ${t.slice(0, 120)}`);
  });
}
console.log('sweep done');
