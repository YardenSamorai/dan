import { DEFAULT_POLICIES, dayHours, defaultNotifications, range, weekly, weeklyFrom } from '../../domain/defaults';
import type { BusinessMember, User } from '../../domain/platform';
import { checkSlot, termsFor } from '../../domain/scheduling';
import { addDays, parseHHMM, weekdayOf, zonedInstant, zonedNow } from '../../domain/time';
import type { Appointment, Business, Customer, Service, Staff, TenantData } from '../../domain/types';
import type { Locale } from '../../i18n/config';

/**
 * DEMO DATA ONLY. Two example tenants that show the product working:
 *   • "Ten Atelier" — a four-person nail studio (slug: demo-studio)
 *   • "Shira Lash Studio" — a solo lash & brow artist (slug: lash-room)
 * Nothing outside the mock adapters imports this file.
 */

export const SEED_VERSION = 9;
export const DEMO_BUSINESS_IDS = ['biz_demo_studio', 'biz_lash_room'];
const TZ = 'Asia/Jerusalem';

/** Small deterministic PRNG so the demo is stable between reloads. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CODE_ALPHABET = 'ACDEFGHJKMNPQRTVWXY34679';
export function makeCode(rand: () => number = Math.random) {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return s;
}

// ── Tenant 1: team studio ────────────────────────────────────────────

function tenStudio(today: string, createdAt: string): TenantData {
  const B = 'biz_demo_studio';
  const business: Business = {
    id: B,
    slug: 'demo-studio',
    type: 'nails',
    status: 'published',
    createdAt,
    publishedAt: createdAt,
    name: { en: 'Ten Atelier', he: 'טן אטלייה' },
    tagline: { en: 'Gel nails in Neve Tzedek.', he: 'ציפורני ג׳ל בנווה צדק.' },
    description: {
      en: 'A small gel-nail studio. Pick a service, then someone from the team or whoever’s free first, and a time that works for you.',
      he: 'סטודיו קטן לציפורני ג׳ל. בוחרים טיפול, מטפלת מהצוות או את מי שפנויה ראשונה, ושעה שנוחה לכם.',
    },
    timezone: TZ,
    currency: 'ILS',
    defaultLocale: 'he',
    address: { en: '14 Shabazi St, Neve Tzedek, Tel Aviv', he: 'שבזי 14, נווה צדק, תל אביב' },
    phone: '03-555-0110',
    email: 'hello@ten-atelier.example',
    social: { instagram: 'ten.atelier.demo' },
    branding: { accent: 'fig', coverUrl: '/demo/cover.webp' },
    page: {
      theme: 'editorial',
      sections: [
        { id: 'hero', kind: 'hero', visible: true, layout: 'cover' },
        {
          id: 'services',
          kind: 'services',
          visible: true,
          layout: 'cards',
          title: { en: 'Book a treatment', he: 'הטיפולים שלנו' },
        },
        {
          id: 'gallery',
          kind: 'gallery',
          visible: true,
          layout: 'masonry',
          title: { en: 'From the studio', he: 'מהסטודיו' },
          images: [7, 1, 8, 9, 2, 10, 5, 3, 6, 4].map((n) => `/demo/gallery-${n}.webp`),
        },
        {
          id: 'about',
          kind: 'about',
          visible: true,
          imageUrl: '/demo/about-studio.webp',
          title: { en: 'A small studio, on purpose', he: 'סטודיו קטן, בכוונה' },
          body: {
            en: 'Four chairs, one long oak table and a window onto Shabazi Street. We keep the studio small so every appointment gets the time it needs.\nWe work only with gel, and we tell you honestly what will last on your nails.',
            he: 'ארבעה כיסאות, שולחן עץ ארוך וחלון לרחוב שבזי. אנחנו שומרות על סטודיו קטן כדי שלכל תור יהיה הזמן שהוא צריך.\nאנחנו עובדות רק עם ג׳ל, ואומרות בכנות מה יחזיק על הציפורניים שלך.',
          },
        },
        {
          id: 'reviews',
          kind: 'reviews',
          visible: true,
          items: [
            { id: 'r1', title: { en: 'Shira K.', he: 'שירה כ.' }, body: { en: 'Three weeks and not a single chip. Booking took me under a minute.', he: 'שלושה שבועות ואף סדק. קבעתי את התור בפחות מדקה.' } },
            { id: 'r2', title: { en: 'Yael M.', he: 'יעל מ.' }, body: { en: 'Noa listened to what I wanted and talked me out of what wouldn’t work. Exactly right.', he: 'נועה הקשיבה למה שרציתי, והורידה אותי ממה שלא היה מחזיק. בדיוק נכון.' } },
            { id: 'r3', title: { en: 'Tamar F.', he: 'תמר פ.' }, body: { en: 'Quiet, clean and always on time. I can move my appointment myself when plans change.', he: 'שקט, נקי ותמיד בזמן. כשמשהו משתנה אני מזיזה את התור לבד.' } },
            { id: 'r4', title: { en: 'Noga P.', he: 'נוגה פ.' }, body: { en: 'Lior rebuilt my nails after a bad set elsewhere. Two months later they’re finally strong.', he: 'ליאור בנתה לי מחדש את הציפורניים אחרי סט גרוע במקום אחר. חודשיים אחרי, הן סוף סוף חזקות.' } },
            { id: 'r5', title: { en: 'Adi S.', he: 'עדי ש.' }, body: { en: 'I booked “whoever’s free first” at 8am and had a slot that same afternoon.', he: 'קבעתי ב־8 בבוקר עם "מי שפנויה ראשונה", וקיבלתי תור לאותו אחר צהריים.' } },
            { id: 'r6', title: { en: 'Michal R.', he: 'מיכל ר.' }, body: { en: 'The reminder the day before saves me every time. Maya’s French is the finest I’ve had.', he: 'התזכורת יום לפני מצילה אותי כל פעם. הפרנץ׳ של מאיה הוא הכי עדין שהיה לי.' } },
          ],
        },
        { id: 'team', kind: 'team', visible: true, title: { en: 'Who you’ll meet', he: 'מי תפגשו כאן' } },
        {
          id: 'faq',
          kind: 'faq',
          visible: true,
          items: [
            {
              id: 'q1',
              title: { en: 'How long does gel last?', he: 'כמה זמן ג׳ל מחזיק?' },
              body: { en: 'Three to four weeks for most people. After that, book a refill rather than a new set: it’s quicker and kinder to your nails.', he: 'שלושה עד ארבעה שבועות אצל רוב האנשים. אחרי זה עדיף לקבוע מילוי ולא סט חדש: זה מהיר יותר ועדין יותר לציפורניים.' },
            },
            {
              id: 'q2',
              title: { en: 'Can I change or cancel my appointment?', he: 'אפשר לשנות או לבטל תור?' },
              body: { en: 'Yes, from the link in your confirmation or from “My bookings” on this page. You can cancel up to 24 hours before and move it up to 12 hours before.', he: 'כן, דרך הקישור באישור או דרך "התורים שלי" בעמוד הזה. אפשר לבטל עד 24 שעות לפני, ולהזיז עד 12 שעות לפני.' },
            },
            {
              id: 'q3',
              title: { en: 'I have gel on from somewhere else. What do I book?', he: 'יש לי ג׳ל ממקום אחר. מה לקבוע?' },
              body: { en: 'Book the treatment you want and add “Gel removal” as a separate appointment right before it, so we have time to take it off gently.', he: 'קבעו את הטיפול שאתם רוצים, והוסיפו "הסרת ג׳ל" כתור נפרד ממש לפניו, כדי שיהיה לנו זמן להסיר בעדינות.' },
            },
            {
              id: 'q4',
              title: { en: 'Do I have to choose someone from the team?', he: 'חייבים לבחור מטפלת?' },
              body: { en: 'No. Choose “whoever’s free first” and you’ll see every open time across the team. Prices can differ a little between team members, and you always see the price before you book.', he: 'לא. בוחרים "מי שפנויה ראשונה" ורואים את כל השעות הפנויות בצוות. המחיר יכול להשתנות מעט בין המטפלות, ותמיד רואים אותו לפני שקובעים.' },
            },
            {
              id: 'q5',
              title: { en: 'How do I pay?', he: 'איך משלמים?' },
              body: { en: 'At the studio, after your appointment: card, cash or Bit. Nothing is charged when you book.', he: 'בסטודיו, אחרי הטיפול: אשראי, מזומן או ביט. שום דבר לא נגבה בזמן הקביעה.' },
            },
          ],
        },
        { id: 'info', kind: 'info', visible: true },
      ],
    },
    hours: weekly({
      0: dayHours([range('09:00', '20:00')]),
      1: dayHours([range('09:00', '20:00')]),
      2: dayHours([range('09:00', '20:00')]),
      3: dayHours([range('09:00', '20:00')]),
      4: dayHours([range('09:00', '20:00')]),
      5: dayHours([range('09:00', '14:00')]),
    }),
    policies: { ...DEFAULT_POLICIES },
    notifications: { ...defaultNotifications(), confirmation: { enabled: true, channels: ['whatsapp', 'email'] } },
    subscription: { status: 'not_configured', planId: null },
  };

  const ALL = ['noa', 'maya', 'lior', 'dana'];
  const svc = (s: Omit<Service, 'businessId' | 'active' | 'onlineBookable' | 'bufferBefore'> & { bufferBefore?: number }): Service => ({
    businessId: B,
    active: true,
    onlineBookable: true,
    bufferBefore: 0,
    ...s,
  });
  const services: Service[] = [
    svc({
      id: 'gel-manicure',
      categoryId: 'hands',
      name: { en: 'Gel manicure', he: 'מניקור ג׳ל' },
      description: { en: 'Shape, cuticle care and a long-wear gel colour.', he: 'עיצוב, טיפול בעור וצבע ג׳ל עמיד.' },
      duration: 60,
      price: 180,
      bufferAfter: 10,
      staffIds: ALL,
      // Noa is the senior artist; Dana is newer and takes a little longer for less.
      staffTerms: { noa: { price: 200 }, dana: { duration: 75, price: 150 } },
    }),
    svc({
      id: 'gel-refill',
      categoryId: 'hands',
      name: { en: 'Gel refill', he: 'מילוי ג׳ל' },
      description: { en: 'Grow-out filled and rebalanced, with fresh colour.', he: 'מילוי הצמיחה, איזון המבנה וצבע חדש.' },
      duration: 75,
      price: 210,
      bufferAfter: 10,
      staffIds: ALL,
      staffTerms: { dana: { duration: 90, price: 180 } },
    }),
    svc({
      id: 'french-gel',
      categoryId: 'hands',
      name: { en: 'French gel', he: 'ג׳ל פרנץ׳' },
      description: { en: 'A fine, hand-painted tip over a sheer base.', he: 'קו פרנץ׳ עדין מעל בסיס שקוף.' },
      duration: 75,
      price: 230,
      bufferAfter: 10,
      staffIds: ['noa', 'maya'],
    }),
    svc({
      id: 'builder-gel',
      categoryId: 'structure',
      name: { en: 'Builder gel', he: 'בניית ג׳ל' },
      description: { en: 'A structured overlay that strengthens or adds length.', he: 'שכבת מבנה שמחזקת או מוסיפה אורך.' },
      duration: 90,
      price: 280,
      bufferBefore: 5,
      bufferAfter: 15,
      staffIds: ['noa', 'lior'],
    }),
    svc({
      id: 'gel-pedicure',
      categoryId: 'feet',
      name: { en: 'Gel pedicure', he: 'פדיקור ג׳ל' },
      description: { en: 'Dry pedicure, shaping and gel colour.', he: 'פדיקור יבש, עיצוב וצבע ג׳ל.' },
      duration: 70,
      price: 220,
      bufferAfter: 10,
      staffIds: ['maya', 'dana'],
      staffTerms: { dana: { price: 190 } },
    }),
    svc({
      id: 'removal',
      categoryId: 'care',
      name: { en: 'Gel removal', he: 'הסרת ג׳ל' },
      description: { en: 'Gentle removal, a light buff and nourishing oil.', he: 'הסרה עדינה, ליטוש קל ושמן מזין.' },
      duration: 30,
      price: 80,
      bufferAfter: 5,
      staffIds: ALL,
    }),
  ].map((s) => ({ ...s, imageUrl: `/demo/svc-${s.id}.webp` }));

  const BIOS: Record<string, Staff['bio']> = {
    noa: { en: 'Opened the studio in 2016. Loves a clean, short almond.', he: 'פתחה את הסטודיו ב־2016. אוהבת שקד קצר ונקי.' },
    maya: { en: 'Calm hands and fine lines. Ask her for French.', he: 'ידיים רגועות וקווים עדינים. תבקשו ממנה פרנץ׳.' },
    lior: { en: 'Builder gel and repairs. Makes weak nails strong again.', he: 'בניית ג׳ל ותיקונים. מחזירה כוח לציפורניים חלשות.' },
    dana: { en: 'Joined last year. Pedicures and bold colour.', he: 'הצטרפה בשנה שעברה. פדיקור וצבעים נועזים.' },
  };
  const person = (id: string, name: Staff['name'], role: Staff['role'], color: string, schedule: Staff['schedule'], userId?: string): Staff => ({
    businessId: B,
    id,
    name,
    role,
    bio: BIOS[id] ?? { en: '' },
    avatarUrl: BIOS[id] ? `/demo/staff-${id}.webp` : undefined,
    color,
    active: true,
    onlineBookable: true,
    schedule,
    userId,
  });
  const lunch = (s: string, e: string) => [range(s, e)];
  const staff: Staff[] = [
    person('noa', { en: 'Noa Levi', he: 'נועה לוי' }, { en: 'Owner', he: 'בעלת העסק' }, '#c24d6b', weekly({
      0: dayHours([range('09:00', '17:00')], lunch('13:00', '13:30')),
      1: dayHours([range('09:00', '17:00')], lunch('13:00', '13:30')),
      2: dayHours([range('09:00', '17:00')], lunch('13:00', '13:30')),
      3: dayHours([range('09:00', '17:00')], lunch('13:00', '13:30')),
      4: dayHours([range('09:00', '15:00')]),
    }), 'u_noa'),
    person('maya', { en: 'Maya Cohen', he: 'מאיה כהן' }, { en: 'Nail technician', he: 'טכנאית ציפורניים' }, '#2e7bb8', weekly({
      0: dayHours([range('12:00', '20:00')], lunch('16:00', '16:30')),
      1: dayHours([range('12:00', '20:00')], lunch('16:00', '16:30')),
      3: dayHours([range('12:00', '20:00')], lunch('16:00', '16:30')),
      4: dayHours([range('12:00', '20:00')], lunch('16:00', '16:30')),
      5: dayHours([range('09:00', '14:00')]),
    }), 'u_maya'),
    person('lior', { en: 'Lior Ben-David', he: 'ליאור בן דוד' }, { en: 'Structure specialist', he: 'מתמחה בבנייה' }, '#c8862a', weekly({
      1: dayHours([range('09:00', '18:00')], lunch('13:30', '14:00')),
      2: dayHours([range('09:00', '18:00')], lunch('13:30', '14:00')),
      3: dayHours([range('09:00', '18:00')], lunch('13:30', '14:00')),
      4: dayHours([range('09:00', '18:00')], lunch('13:30', '14:00')),
      5: dayHours([range('09:00', '14:00')]),
    })),
    person('dana', { en: 'Dana Azulay', he: 'דנה אזולאי' }, { en: 'Nail technician', he: 'טכנאית ציפורניים' }, '#4f9a5c', weekly({
      0: dayHours([range('10:00', '19:00')], lunch('14:00', '14:30')),
      2: dayHours([range('10:00', '19:00')], lunch('14:00', '14:30')),
      3: dayHours([range('10:00', '19:00')], lunch('14:00', '14:30')),
    })),
  ];

  return {
    business,
    categories: [
      { businessId: B, id: 'hands', name: { en: 'Hands', he: 'ידיים' } },
      { businessId: B, id: 'structure', name: { en: 'Structure', he: 'בנייה וחיזוק' } },
      { businessId: B, id: 'feet', name: { en: 'Feet', he: 'רגליים' } },
      { businessId: B, id: 'care', name: { en: 'Care', he: 'טיפול' } },
    ],
    services,
    addOns: [
      { businessId: B, id: 'art', name: { en: 'Nail art (per set)', he: 'עיצוב ציפורניים (לסט)' }, duration: 15, price: 40, active: true },
      { businessId: B, id: 'chrome', name: { en: 'Chrome finish', he: 'גימור כרום' }, duration: 10, price: 30, active: true },
      { businessId: B, id: 'repair', name: { en: 'Single nail repair', he: 'תיקון ציפורן בודדת' }, duration: 10, price: 25, active: true },
    ],
    staff,
    timeOff: [
      { businessId: B, id: 'to1', staffId: 'lior', from: addDays(today, 5), to: addDays(today, 9), kind: 'vacation' },
      { businessId: B, id: 'to2', staffId: 'dana', from: addDays(today, -6), to: addDays(today, -5), kind: 'sick' },
    ],
    blocks: [
      { businessId: B, id: 'b1', staffId: 'noa', date: today, start: parseHHMM('10:30'), end: parseHHMM('11:00'), kind: 'blocked', label: 'Supplier visit' },
      { businessId: B, id: 'b2', staffId: null, date: addDays(today, 2), start: parseHHMM('17:00'), end: parseHHMM('18:00'), kind: 'blocked', label: 'Team training' },
      { businessId: B, id: 'b3', staffId: 'maya', date: addDays(today, 1), start: parseHHMM('12:00'), end: parseHHMM('13:00'), kind: 'personal', label: '' },
    ],
    exceptions: [
      { businessId: B, id: 'ex1', staffId: null, date: addDays(today, 13), closed: true, ranges: [], breaks: [], label: 'Holiday' },
      { businessId: B, id: 'ex2', staffId: 'noa', date: addDays(today, 3), closed: false, ranges: [range('09:00', '13:00')], breaks: [], label: 'Short day' },
    ],
    customers: [],
    appointments: [],
    outbox: [],
  };
}

const TEN_CUSTOMERS: [string, Locale][] = [
  ['שירה כץ', 'he'], ['יעל מזרחי', 'he'], ['תמר פרידמן', 'he'], ['נוגה פרץ', 'he'], ['עדי שפירא', 'he'],
  ['מיכל רוזן', 'he'], ['הילה אברהם', 'he'], ['רותם גולן', 'he'], ['ענבר דהן', 'he'], ['קרן הלוי', 'he'],
  ['ליהי ששון', 'he'], ['מעיין אוחנה', 'he'], ['נטע ברק', 'he'], ['אורלי סגל', 'he'], ['רוני אלבז', 'he'],
  ['ספיר עמר', 'he'], ['מורן חדד', 'he'], ['ליאת קורן', 'he'], ['אורטל זילבר', 'he'], ['ענבל רז', 'he'],
  ['Ella Weiss', 'en'], ['Talia Stern', 'en'], ['Sophie Martin', 'en'], ['Hannah Clarke', 'en'], ['Gal Biton', 'en'],
  ['Olivia Brandt', 'en'], ['Daniel Goldberg', 'en'], ['Rachel Adler', 'en'],
];

// ── Tenant 2: solo provider ──────────────────────────────────────────

function lashRoom(today: string, createdAt: string): TenantData {
  const B = 'biz_lash_room';
  const business: Business = {
    id: B,
    slug: 'lash-room',
    type: 'lashes_brows',
    status: 'published',
    createdAt,
    publishedAt: createdAt,
    name: { en: 'Shira Lash Studio', he: 'הסטודיו של שירה' },
    tagline: { en: 'Lashes and brows in Haifa.', he: 'ריסים וגבות בחיפה.' },
    description: {
      en: 'Shira works on her own: lash lifts, extensions and brows. She confirms each new booking herself, usually within a few hours.',
      he: 'שירה עובדת לבד: הרמת ריסים, תוספות ריסים וגבות. כל תור חדש מחכה לאישור שלה, בדרך כלל תוך כמה שעות.',
    },
    timezone: TZ,
    currency: 'ILS',
    defaultLocale: 'he',
    address: { en: '8 Masada St, Haifa', he: 'מסדה 8, חיפה' },
    phone: '04-555-0177',
    email: 'shira@lash-room.example',
    social: { instagram: 'shira.lash.demo' },
    branding: { accent: 'clay' },
    hours: weeklyFrom([0, 1, 2, 3, 4], '10:00', '19:00', [range('13:30', '14:00')]),
    policies: { ...DEFAULT_POLICIES, confirmationMode: 'manual', allowAnyStaff: false, leadTimeMinutes: 720, cancelWindowHours: 48 },
    notifications: defaultNotifications(),
    subscription: { status: 'not_configured', planId: null },
  };
  const svc = (id: string, name: Service['name'], duration: number, price: number, bufferBefore = 0, bufferAfter = 10): Service => ({
    businessId: B,
    id,
    categoryId: null,
    name,
    description: { en: '' },
    duration,
    price,
    bufferBefore,
    bufferAfter,
    staffIds: ['shira'],
    active: true,
    onlineBookable: true,
  });
  return {
    business,
    categories: [],
    services: [
      svc('lash-lift', { en: 'Lash lift & tint', he: 'הרמת ריסים וצבע' }, 60, 250),
      svc('classic-set', { en: 'Classic lash set', he: 'סט ריסים קלאסי' }, 120, 380, 10, 10),
      svc('lash-fill', { en: 'Lash fill', he: 'מילוי ריסים' }, 75, 220),
      svc('brow-lamination', { en: 'Brow lamination', he: 'למינציה לגבות' }, 45, 180),
      svc('brow-shape', { en: 'Brow shape', he: 'עיצוב גבות' }, 30, 90, 0, 5),
    ],
    addOns: [],
    staff: [
      {
        businessId: B,
        id: 'shira',
        name: { en: 'Shira Amar', he: 'שירה עמר' },
        role: { en: 'Lash & brow artist', he: 'מעצבת ריסים וגבות' },
        bio: { en: '' },
        color: '#c0623f',
        active: true,
        onlineBookable: true,
        schedule: weeklyFrom([0, 1, 2, 3, 4], '10:00', '19:00'),
        userId: 'u_shira',
      },
    ],
    timeOff: [{ businessId: B, id: 'to1', staffId: 'shira', from: addDays(today, 16), to: addDays(today, 19), kind: 'vacation' }],
    blocks: [{ businessId: B, id: 'b1', staffId: null, date: addDays(today, 1), start: parseHHMM('17:00'), end: parseHHMM('19:00'), kind: 'blocked', label: 'Course' }],
    exceptions: [{ businessId: B, id: 'ex1', staffId: null, date: addDays(today, 6), closed: false, ranges: [range('10:00', '14:00')], breaks: [], label: 'Short day' }],
    customers: [],
    appointments: [],
    outbox: [],
  };
}

const LASH_CUSTOMERS: [string, Locale][] = [
  ['אביגיל נחום', 'he'], ['דנה לוין', 'he'], ['גלית רבינוביץ', 'he'], ['שני אדרי', 'he'], ['טל יוסף', 'he'],
  ['רעות בכר', 'he'], ['מאיה אשכנזי', 'he'], ['עדן מלכה', 'he'], ['Noor Haddad', 'en'], ['Emma Rossi', 'en'],
  ['ליאל שמש', 'he'], ['יובל טל', 'he'], ['Kate Morgan', 'en'], ['הדר נגר', 'he'],
];

// ── Generation ───────────────────────────────────────────────────────

function fill(t: TenantData, prefix: string, names: [string, Locale][], seed: number, now: Date) {
  const rand = mulberry32(seed);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const tz = t.business.timezone;
  const here = zonedNow(tz, now);
  const today = here.date;
  const B = t.business.id;
  const at = (date: string, min: number) => zonedInstant(date, min, tz).toISOString();
  const manual = t.business.policies.confirmationMode === 'manual';

  // Most customers are regulars from before the history starts; the rest join over the last two months.
  const regulars = Math.ceil(names.length * 0.55);
  const joinedOn = names.map((_, i) => (i < regulars ? -88 + i * 2 : -56 + Math.round(((i - regulars) * 54) / Math.max(1, names.length - regulars - 1))));
  t.customers = names.map(([name, locale], i): Customer => ({
    businessId: B,
    id: `${prefix}-c${i + 1}`,
    name,
    locale,
    phone: `05${pick([0, 2, 3, 4, 8])}-${String(100 + Math.floor(rand() * 900))}-${String(1000 + Math.floor(rand() * 9000))}`,
    email: locale === 'en' ? `${name.split(' ')[0].toLowerCase()}@example.com` : undefined,
    note: i === 2 ? 'Prefers a short almond shape.' : i === 6 ? 'Sensitive skin. Patch test first.' : undefined,
    createdAt: at(addDays(today, joinedOn[i]), 600),
  }));

  const services = t.services;
  for (let offset = -63; offset <= 21; offset++) {
    const joined = t.customers.filter((_, i) => joinedOn[i] <= offset);
    const date = addDays(today, offset);
    if (t.business.hours[weekdayOf(date)].ranges.length === 0) continue;
    const density = offset < 0 ? 0.74 : offset === 0 ? 0.7 : offset < 4 ? 0.58 : 0.34;
    for (const s of t.staff) {
      for (const r of s.schedule[weekdayOf(date)].ranges) {
        let m = r.start;
        while (m < r.end) {
          if (rand() > density) {
            m += pick([15, 30, 45, 60]);
            continue;
          }
          const service = pick(services);
          if (!service.staffIds.includes(s.id)) {
            m += 15;
            continue;
          }
          const addOnIds = t.addOns.length && rand() < 0.2 ? [pick(t.addOns).id] : [];
          const own = termsFor(service, s.id);
          const duration = own.duration + addOnIds.reduce((x, id) => x + t.addOns.find((a) => a.id === id)!.duration, 0);
          const start = m + service.bufferBefore;
          if (checkSlot(t, { staffId: s.id, date, start, duration, serviceId: service.id })) {
            m += 15;
            continue;
          }
          const past = offset < 0 || (offset === 0 && start + duration <= here.minutes);
          const inProgress = offset === 0 && start <= here.minutes && start + duration > here.minutes;
          const roll = rand();
          const online = rand() < 0.72;
          const status: Appointment['status'] = past
            ? roll < 0.05 ? 'no_show' : roll < 0.11 ? 'cancelled' : 'completed'
            : inProgress
              ? 'arrived'
              : roll < 0.06 ? 'cancelled' : manual && online && roll < 0.4 ? 'pending' : 'confirmed';
          const created = at(addDays(date, -Math.floor(2 + rand() * 12)), 540 + Math.floor(rand() * 600));
          const cancelledBy = rand() < 0.6 ? 'customer' : 'staff';
          t.appointments.push({
            businessId: B,
            id: `${prefix}-a${t.appointments.length + 1}`,
            code: makeCode(rand),
            customerId: pick(joined).id,
            staffId: s.id,
            serviceId: service.id,
            addOnIds,
            date,
            start,
            duration,
            price: own.price + addOnIds.reduce((x, id) => x + t.addOns.find((a) => a.id === id)!.price, 0),
            status,
            source: online ? 'online' : 'studio',
            anyStaff: t.staff.length > 1 && rand() < 0.2,
            note: rand() < 0.07 ? pick(['Running 5 min late', 'Bringing a reference photo', 'First visit']) : undefined,
            cancellation: status === 'cancelled' ? { at: created, by: cancelledBy, reason: cancelledBy === 'customer' ? pick(['Schedule change', 'Feeling unwell', undefined]) : undefined } : undefined,
            createdAt: created,
            updatedAt: created,
            history: [{ at: created, type: 'created', by: online ? 'customer' : 'staff' }],
          });
          m = Math.ceil((start + duration + service.bufferAfter) / 15) * 15;
        }
      }
    }
  }
}

export interface DemoDatabase {
  users: User[];
  members: BusinessMember[];
  tenants: Record<string, TenantData>;
}

export function buildDemoDatabase(now = new Date()): DemoDatabase {
  const today = zonedNow(TZ, now).date;
  const createdAt = zonedInstant(addDays(today, -90), 600, TZ).toISOString();
  const ten = tenStudio(today, createdAt);
  const lash = lashRoom(today, createdAt);
  fill(ten, 'ten', TEN_CUSTOMERS, 20261007, now);
  fill(lash, 'lr', LASH_CUSTOMERS, 4242, now);

  const users: User[] = [
    { id: 'u_noa', name: 'Noa Levi', email: 'noa@demo-studio.example', locale: 'he', createdAt },
    { id: 'u_maya', name: 'Maya Cohen', email: 'maya@demo-studio.example', locale: 'he', createdAt },
    { id: 'u_shira', name: 'Shira Amar', email: 'shira@lash-room.example', locale: 'he', createdAt },
  ];
  const members: BusinessMember[] = [
    { id: 'm1', businessId: ten.business.id, userId: 'u_noa', role: 'owner', staffId: 'noa' },
    { id: 'm2', businessId: ten.business.id, userId: 'u_maya', role: 'staff', staffId: 'maya' },
    { id: 'm3', businessId: lash.business.id, userId: 'u_shira', role: 'owner', staffId: 'shira' },
  ];
  return { users, members, tenants: { [ten.business.id]: ten, [lash.business.id]: lash } };
}
