/** Colour maths for owner-picked accents. Accents carry white text, so they must reach 4.5:1 against white. */

export const HEX = /^#[0-9a-f]{6}$/i;

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function luminance(hex: string) {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** The colour itself if white text reads on it, otherwise the nearest darker shade that does. */
export function readableAccent(hex: string): string {
  if (!HEX.test(hex)) return hex;
  const rgb = channels(hex);
  for (let k = 0; k <= 1; k += 0.04) {
    const shade = toHex(rgb.map((v) => v * (1 - k)));
    if (contrast(shade, '#ffffff') >= 4.5) return shade;
  }
  return '#000000';
}
