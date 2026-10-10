// Lists class names used in TSX that no stylesheet defines.
import fs from 'node:fs';
import path from 'node:path';

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk('src');
const css = new Set();
for (const f of files.filter((f) => f.endsWith('.css'))) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)) css.add(m[1]);
}
const missing = new Map();
for (const f of files.filter((f) => f.endsWith('.tsx'))) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*(?:\}[^}]*)?)\})/g)) {
    const literal = m[1] ?? m[2] ?? (m[3] ? [...m[3].matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)].map((x) => x[1] ?? x[2] ?? x[3]).join(' ') : '');
    const tokens = literal.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/).filter((t) => /^[a-z][\w-]*$/.test(t));
    for (const t of tokens) if (!css.has(t)) missing.set(t, (missing.get(t) ?? new Set()).add(path.basename(f)));
  }
}
for (const [k, v] of [...missing].sort()) console.log(k.padEnd(32), [...v].join(', '));
