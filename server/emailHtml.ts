import { PRODUCT } from '../src/config/product';
import type { Locale } from '../src/i18n/config';

/**
 * The HTML version of an email. Mail clients ignore <style>, SVG and most
 * layout CSS, so this is tables and inline styles only. The plain-text body
 * still goes out alongside it.
 */

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const linkify = (html: string) => html.replace(/https?:\/\/[^\s<]+[^\s<.,:;!?)]/g, (url) => `<a href="${url}" style="color:#1c1c1e;font-weight:600">${url}</a>`);

const SENT_WITH: Record<Locale, string> = { he: 'נשלח באמצעות', en: 'Sent with' };

export const EMAIL_LOGO_PATH = '/email/logo.png';

function logo(origin: string | undefined, size: number) {
  if (!origin) return '';
  return `<img src="${origin}${EMAIL_LOGO_PATH}" width="${size}" height="${size}" alt="" style="display:block;border:0;width:${size}px;height:${size}px">`;
}

/** Name beside the logo; the logo cell is left out when there is no site address to load it from. */
function brandRow(origin: string | undefined, name: string, size: number, text: string) {
  const mark = logo(origin, size);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${mark ? `<td style="padding:0;vertical-align:middle">${mark}</td><td style="width:10px"></td>` : ''}<td style="padding:0;vertical-align:middle;${text}">${escape(name)}</td></tr></table>`;
}

export function emailHtml(opts: {
  body: string;
  locale: Locale;
  /** Messages to customers go out in the business's name; alerts to the business come from the product. */
  from: { kind: 'product' } | { kind: 'business'; name: string };
  origin?: string;
}) {
  const dir = opts.locale === 'he' ? 'rtl' : 'ltr';
  const align = dir === 'rtl' ? 'right' : 'left';
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
  const paragraphs = opts.body
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1c1c1e">${linkify(escape(p)).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const header =
    opts.from.kind === 'product'
      ? brandRow(opts.origin, PRODUCT.name, 32, 'font-size:17px;font-weight:700;color:#1c1c1e')
      : `<div style="font-size:17px;font-weight:700;color:#1c1c1e">${escape(opts.from.name)}</div>`;
  const footer =
    opts.from.kind === 'business'
      ? `<tr><td align="center" style="padding:18px 0 0">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="padding:0;vertical-align:middle;font-size:12px;color:#86868b">${SENT_WITH[opts.locale]}</td><td style="width:6px"></td>
            <td style="padding:0;vertical-align:middle">${brandRow(opts.origin, PRODUCT.name, 16, 'font-size:12px;font-weight:600;color:#3a3a3c')}</td>
          </tr></table>
        </td></tr>`
      : '';
  return `<!doctype html>
<html lang="${opts.locale}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f5f5f7">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f7;font-family:${font}">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px">
      <tr><td dir="${dir}" style="background:#ffffff;border-radius:16px;padding:28px;text-align:${align}">
        <div style="margin:0 0 22px">${header}</div>
        ${paragraphs}
      </td></tr>
      ${footer}
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
