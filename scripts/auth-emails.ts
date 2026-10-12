/**
 * Supabase Auth emails, in the product's look. Writes one file per template to
 * supabase/emails/ plus index.html: open it in a browser to preview each email
 * and copy its subject and body into Supabase › Authentication › Emails.
 *
 *   npm run emails:auth
 *
 * Supabase fills {{ .Token }}, {{ .ConfirmationURL }}, {{ .Email }}, {{ .NewEmail }}
 * and {{ .SiteURL }} (= the Site URL in URL Configuration).
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const SITE = 'https://tornu.co.il';
const NAME = 'תורנו';
const INK = '#1c1c1e';
const MUTED = '#86868b';
const BODY = '#3a3a3c';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

type Block =
  | { p: string }
  | { code: string }
  | { button: string; href: string }
  | { note: string };

interface Template {
  file: string;
  /** Where it lives in Supabase. */
  section: 'Authentication' | 'Security';
  supabase: string;
  /** Whether this product ever sends it today. */
  used: boolean;
  subject: string;
  title: string;
  blocks: Block[];
  /** One English line under the card. */
  english: string;
}

const block = (b: Block) => {
  if ('p' in b) return `<p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:${BODY}">${b.p}</p>`;
  if ('code' in b)
    return `<div dir="ltr" style="font-size:32px;letter-spacing:8px;font-weight:700;text-align:center;background:#f5f5f7;border-radius:12px;padding:18px 0;margin:0 0 24px;font-family:'SF Mono',Menlo,Consolas,monospace;color:${INK}">${b.code}</div>`;
  if ('button' in b)
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr><td style="background:${INK};border-radius:12px"><a href="${b.href}" style="display:inline-block;padding:14px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px">${b.button}</a></td></tr></table>`;
  return `<p style="font-size:13px;line-height:1.6;margin:0;color:${MUTED}">${b.note}</p>`;
};

const render = (t: Template) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f7;font-family:${FONT}">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px">
      <tr><td dir="rtl" style="background:#ffffff;border-radius:16px;padding:32px 28px;text-align:right;color:${INK}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px"><tr>
          <td style="padding:0;vertical-align:middle"><img src="${SITE}/email/logo.png" width="32" height="32" alt="" style="display:block;border:0;width:32px;height:32px"></td>
          <td style="width:10px"></td>
          <td style="padding:0;vertical-align:middle;font-size:17px;font-weight:700;color:${INK}">${NAME}</td>
        </tr></table>
        <h1 style="font-size:22px;line-height:1.3;margin:0 0 8px;font-weight:700;color:${INK}">${t.title}</h1>
        ${t.blocks.map(block).join('\n        ')}
      </td></tr>
      <tr><td dir="ltr" style="padding:16px 0 0;font-size:12px;line-height:1.6;color:${MUTED};text-align:center">${t.english}</td></tr>
    </table>
  </td></tr>
</table>
`;

const notYou = (what: string): Block => ({
  note: `לא ${what}? כדאי לאפס את הסיסמה עכשיו ולפנות אלינו. <a href="{{ .SiteURL }}/reset-password" style="color:${INK}">לאיפוס הסיסמה</a>`,
});

const TEMPLATES: Template[] = [
  {
    file: 'confirm-signup',
    section: 'Authentication',
    supabase: 'Confirm sign up',
    used: false,
    subject: 'אישור כתובת המייל שלך בתורנו',
    title: 'ברוכים הבאים לתורנו',
    blocks: [
      { p: 'נשאר רק לאשר שכתובת המייל הזו שלך.' },
      { button: 'אישור המייל', href: '{{ .ConfirmationURL }}' },
      { p: 'אפשר גם להקליד את הקוד הזה:' },
      { code: '{{ .Token }}' },
      { note: 'לא נרשמת לתורנו? אפשר להתעלם מהמייל הזה.' },
    ],
    english: 'Confirm your email for Tornu.',
  },
  {
    file: 'invite-user',
    section: 'Authentication',
    supabase: 'Invite user',
    used: false,
    subject: 'הוזמנת להצטרף לתורנו',
    title: 'הוזמנת להצטרף',
    blocks: [
      { p: 'קיבלת הזמנה לפתוח חשבון בתורנו, מערכת התורים והיומן של העסק.' },
      { button: 'קבלת ההזמנה', href: '{{ .ConfirmationURL }}' },
      { note: 'לא ציפית להזמנה? אפשר להתעלם מהמייל הזה.' },
    ],
    english: 'You have been invited to join Tornu.',
  },
  {
    file: 'magic-link',
    section: 'Authentication',
    supabase: 'Magic link or OTP',
    used: false,
    subject: 'קוד הכניסה שלך לתורנו: {{ .Token }}',
    title: 'כניסה לתורנו',
    blocks: [
      { p: 'זה קוד הכניסה שלך. הוא תקף לשעה ולשימוש אחד.' },
      { code: '{{ .Token }}' },
      { p: 'או בלחיצה אחת:' },
      { button: 'כניסה לחשבון', href: '{{ .ConfirmationURL }}' },
      { note: 'לא ניסית להיכנס? אפשר להתעלם מהמייל הזה. אף אחד לא נכנס בלי הקוד.' },
    ],
    english: 'Your Tornu sign-in code: {{ .Token }}',
  },
  {
    file: 'change-email',
    section: 'Authentication',
    supabase: 'Change email address',
    used: false,
    subject: 'אישור כתובת המייל החדשה בתורנו',
    title: 'אישור החלפת מייל',
    blocks: [
      { p: 'ביקשת להחליף את כתובת המייל בחשבון מ־<span dir="ltr">{{ .Email }}</span> ל־<span dir="ltr">{{ .NewEmail }}</span>.' },
      { button: 'אישור הכתובת החדשה', href: '{{ .ConfirmationURL }}' },
      { p: 'אפשר גם להקליד את הקוד הזה:' },
      { code: '{{ .Token }}' },
      notYou('ביקשת את השינוי'),
    ],
    english: 'Confirm your new email address for Tornu.',
  },
  {
    file: 'reset-password',
    section: 'Authentication',
    supabase: 'Reset password',
    used: true,
    subject: 'קוד איפוס הסיסמה שלך בתורנו: {{ .Token }}',
    title: 'איפוס סיסמה',
    blocks: [
      { p: 'זה הקוד לאיפוס הסיסמה שלך. מקלידים אותו בדף האיפוס, והוא תקף לשעה.' },
      { code: '{{ .Token }}' },
      { note: 'לא ביקשת לאפס סיסמה? אפשר להתעלם מהמייל הזה. הסיסמה שלך לא תשתנה.' },
    ],
    english: 'Your Tornu password reset code: {{ .Token }}',
  },
  {
    file: 'reauthentication',
    section: 'Authentication',
    supabase: 'Reauthentication',
    used: false,
    subject: 'קוד האימות שלך בתורנו: {{ .Token }}',
    title: 'אימות זהות',
    blocks: [
      { p: 'לפני פעולה רגישה בחשבון צריך לוודא שזה באמת אתם. זה הקוד:' },
      { code: '{{ .Token }}' },
      notYou('ביקשת קוד'),
    ],
    english: 'Your Tornu verification code: {{ .Token }}',
  },
  {
    file: 'password-changed',
    section: 'Security',
    supabase: 'Password changed',
    used: true,
    subject: 'הסיסמה שלך בתורנו שונתה',
    title: 'הסיסמה שונתה',
    blocks: [{ p: 'הסיסמה של החשבון <span dir="ltr">{{ .Email }}</span> שונתה עכשיו.' }, notYou('שינית את הסיסמה')],
    english: 'Your Tornu password was changed.',
  },
  {
    file: 'email-changed',
    section: 'Security',
    supabase: 'Email address changed',
    used: false,
    subject: 'כתובת המייל בחשבון תורנו שונתה',
    title: 'כתובת המייל שונתה',
    blocks: [{ p: 'כתובת המייל של החשבון שלך בתורנו שונתה ל־<span dir="ltr">{{ .Email }}</span>.' }, notYou('שינית את הכתובת')],
    english: 'The email address on your Tornu account was changed.',
  },
  {
    file: 'phone-changed',
    section: 'Security',
    supabase: 'Phone number changed',
    used: false,
    subject: 'מספר הטלפון בחשבון תורנו שונה',
    title: 'מספר הטלפון שונה',
    blocks: [{ p: 'מספר הטלפון של החשבון <span dir="ltr">{{ .Email }}</span> שונה.' }, notYou('שינית את המספר')],
    english: 'The phone number on your Tornu account was changed.',
  },
  {
    file: 'identity-linked',
    section: 'Security',
    supabase: 'Identity linked',
    used: true,
    subject: 'שיטת כניסה חדשה חוברה לחשבון תורנו',
    title: 'שיטת כניסה חדשה',
    blocks: [{ p: 'לחשבון <span dir="ltr">{{ .Email }}</span> חוברה שיטת כניסה חדשה, למשל חשבון Google.' }, notYou('חיברת אותה')],
    english: 'A new sign-in method was linked to your Tornu account.',
  },
  {
    file: 'identity-unlinked',
    section: 'Security',
    supabase: 'Identity unlinked',
    used: false,
    subject: 'שיטת כניסה הוסרה מחשבון תורנו',
    title: 'שיטת כניסה הוסרה',
    blocks: [{ p: 'מהחשבון <span dir="ltr">{{ .Email }}</span> הוסרה שיטת כניסה.' }, notYou('הסרת אותה')],
    english: 'A sign-in method was removed from your Tornu account.',
  },
  {
    file: 'mfa-enrolled',
    section: 'Security',
    supabase: 'Multi-factor authentication method added',
    used: false,
    subject: 'אימות דו שלבי נוסף לחשבון תורנו',
    title: 'אימות דו שלבי נוסף',
    blocks: [{ p: 'לחשבון <span dir="ltr">{{ .Email }}</span> נוספה שיטת אימות דו שלבי.' }, notYou('הוספת אותה')],
    english: 'A two-step verification method was added to your Tornu account.',
  },
  {
    file: 'mfa-unenrolled',
    section: 'Security',
    supabase: 'Multi-factor authentication method removed',
    used: false,
    subject: 'אימות דו שלבי הוסר מחשבון תורנו',
    title: 'אימות דו שלבי הוסר',
    blocks: [{ p: 'מהחשבון <span dir="ltr">{{ .Email }}</span> הוסרה שיטת אימות דו שלבי.' }, notYou('הסרת אותה')],
    english: 'A two-step verification method was removed from your Tornu account.',
  },
];

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SAMPLE: Record<string, string> = {
  '{{ .Token }}': '482913',
  '{{ .ConfirmationURL }}': '#',
  '{{ .SiteURL }}': SITE,
  '{{ .Email }}': 'noa@example.com',
  '{{ .NewEmail }}': 'noa@studio.co.il',
};
const sample = (s: string) => Object.entries(SAMPLE).reduce((out, [k, v]) => out.split(k).join(v), s);

mkdirSync('supabase/emails', { recursive: true });
for (const t of TEMPLATES) writeFileSync(`supabase/emails/${t.file}.html`, `<!-- Supabase › Authentication › Emails › ${t.supabase}\n     Subject: ${t.subject} -->\n${render(t)}`);

const card = (t: Template, i: number) => `
<section class="tpl">
  <header>
    <span class="where">${t.section} › <b>${t.supabase}</b></span>
    <span class="tag ${t.used ? 'used' : ''}">${t.used ? 'בשימוש היום' : 'לא בשימוש כרגע'}</span>
  </header>
  <div class="row"><label>Subject</label><code id="s${i}">${escape(t.subject)}</code><button data-copy="s${i}">העתקה</button></div>
  <div class="row"><label>Body</label><span class="hint">להדביק במצב Source</span><button data-copy="b${i}">העתקת ה־HTML</button></div>
  <textarea id="b${i}" readonly>${escape(render(t))}</textarea>
  <iframe srcdoc="${escape(sample(render(t)))}"></iframe>
</section>`;

writeFileSync(
  'supabase/emails/index.html',
  `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><title>תבניות מייל ל־Supabase</title>
<style>
  body{margin:0;background:#f5f5f7;font:15px/1.5 ${FONT};color:${INK}}
  main{max-width:1100px;margin:0 auto;padding:32px 20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(500px,1fr));gap:20px}
  h1{grid-column:1/-1;margin:0;font-size:26px} .intro{grid-column:1/-1;margin:0;color:${BODY}}
  .tpl{background:#fff;border-radius:16px;padding:18px;display:flex;flex-direction:column;gap:10px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
  header{display:flex;justify-content:space-between;align-items:center;gap:8px} .where{direction:ltr;font-size:13px;color:${MUTED}}
  .tag{font-size:12px;padding:2px 10px;border-radius:99px;background:#f0f0f2;color:${MUTED}} .tag.used{background:${INK};color:#fff}
  .row{display:flex;align-items:center;gap:10px} label{font-size:12px;font-weight:600;color:${MUTED};width:56px;direction:ltr;text-align:left}
  code{flex:1;font:inherit;font-size:14px;unicode-bidi:plaintext;background:#f5f5f7;border-radius:8px;padding:6px 10px} .hint{flex:1;font-size:13px;color:${MUTED}}
  button{font:inherit;font-size:13px;font-weight:600;border:0;border-radius:8px;padding:6px 12px;background:${INK};color:#fff;cursor:pointer}
  button.done{background:#2e7d32}
  textarea{display:none}
  iframe{width:100%;height:600px;border:0;border-radius:12px;background:#f5f5f7}
</style></head>
<body><main>
<h1>תבניות מייל ל־Supabase</h1>
<p class="intro">Supabase › Authentication › Emails. לכל תבנית: מעתיקים את ה־Subject, מדביקים את ה־Body במצב Source, ושומרים. בתצוגה המקדימה כאן יש ערכים לדוגמה במקום הקוד והקישור.</p>
${TEMPLATES.map(card).join('\n')}
</main>
<script>
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-copy]');
    if (!b) return;
    const el = document.getElementById(b.dataset.copy);
    await navigator.clipboard.writeText(el.value ?? el.textContent);
    const label = b.textContent;
    b.textContent = 'הועתק';
    b.classList.add('done');
    setTimeout(() => { b.textContent = label; b.classList.remove('done'); }, 1400);
  });
</script>
</body></html>
`,
);
console.log(`${TEMPLATES.length} templates → supabase/emails/`);
