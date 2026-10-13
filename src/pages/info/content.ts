import type { Locale } from '../../i18n/config';

/**
 * Long-form content: the help centre and the legal pages. Kept out of the UI
 * message catalogues because it's prose, not interface copy.
 *
 * Placeholders: {product} {company} {companyRef} {address} {addressRef} {email} {a11yContact} {updated}
 * {companyRef} and {addressRef} read " (id)" and ", address", or nothing when unset.
 * A paragraph that uses an unset {address} is left out.
 *
 * The legal texts are a careful starting point written for an Israeli SaaS
 * (Privacy Protection Law incl. Amendment 13, IS 5568). Have a lawyer review
 * them before launch.
 */

export interface Doc {
  title: string;
  intro?: string;
  sections: { h: string; p: string[] }[];
}

export type DocKey = 'privacy' | 'terms' | 'accessibility';

export const LEGAL: Record<DocKey, Record<Locale, Doc>> = {
  privacy: {
    he: {
      title: 'מדיניות פרטיות',
      intro:
        'המדיניות מסבירה איזה מידע {product} אוסף, למה, עם מי הוא משותף ומה הזכויות שלך. השירות מופעל על ידי {company}{companyRef}{addressRef}. עדכון אחרון: {updated}.',
      sections: [
        {
          h: 'מי אחראי על המידע',
          p: [
            'על מידע של בעלי עסקים ואנשי צוות שנרשמים לשירות (שם, אימייל, פרטי העסק), {company} היא בעלת השליטה במידע.',
            'על מידע של לקוחות שקובעים תור אצל עסק (שם, טלפון, אימייל, הערות ותורים), העסק הוא בעל השליטה, ואנחנו מחזיקים ומעבדים את המידע רק בשבילו ולפי הוראותיו. לקוח שרוצה לעיין במידע עליו, לתקן או למחוק אותו, יפנה קודם לעסק. אם פנית אלינו, נעביר את הפנייה לעסק ונעזור לו לטפל בה.',
          ],
        },
        {
          h: 'איזה מידע נאסף',
          p: [
            'פרטי חשבון: שם, כתובת אימייל, שפה מועדפת ופרטי הכניסה.',
            'פרטי העסק: שם, כתובת, טלפון, שירותים, מחירים, שעות פעילות, תמונות ותוכן שהעסק מעלה לעמוד שלו.',
            'פרטי לקוחות ותורים: שם, טלפון, אימייל אם נמסר, הערות, מועדי התורים והיסטוריית שינויים.',
            'הודעות ללקוחות: תוכן ההודעות שנשלחות בשם העסק (אישור, תזכורת, שינוי או ביטול של תור), מספר הטלפון או האימייל שאליו נשלחו, ומצב המסירה (נשלחה, נמסרה, נקראה או לא נמסרה).',
            'מידע טכני: כתובת IP, סוג דפדפן ומכשיר, ויומני שרת שנשמרים לצורכי אבטחה ותקלות.',
            'תשלומים: פרטי כרטיס האשראי נמסרים ישירות לחברת הסליקה ואינם נשמרים אצלנו. אנחנו שומרים רק את סטטוס המנוי וחשבוניות.',
          ],
        },
        {
          h: 'למה המידע משמש',
          p: [
            'כדי להפעיל את השירות: עמוד קביעת התורים, היומן, ניהול הלקוחות, תזכורות וסנכרון ליומן.',
            'כדי לשלוח ללקוחות הודעות על התורים שלהם בשם העסק, בוואטסאפ, ב־SMS או באימייל, ולהציג לעסק כמה הודעות נשלחו החודש.',
            'כדי לגבות תשלום על המנוי ולהפיק חשבוניות כנדרש בחוק.',
            'כדי לשמור על אבטחת השירות, למנוע שימוש לרעה ולטפל בתקלות.',
            'כדי לשלוח לבעלי עסקים הודעות שירות (למשל שינוי בתנאים או תקלה). דיוור שיווקי יישלח רק בהסכמה, ואפשר להסיר את ההסכמה בכל עת.',
            'אנחנו לא מוכרים מידע, לא משתמשים במידע של לקוחות העסקים לפרסום, ולא משתפים אותו עם מפרסמים.',
          ],
        },
        {
          h: 'עם מי המידע משותף',
          p: [
            'עם ספקים שמפעילים עבורנו חלקים מהשירות, ורק במידה הנדרשת. הספקים מחויבים בחוזה לשמור על המידע ולהשתמש בו רק לצורך השירות:',
            'Cloudflare: אחסון האתר והשרתים. Supabase: מסד הנתונים, התמונות והכניסה לחשבון. Meta Platforms (WhatsApp Business): שליחת הודעות וואטסאפ, והיא מקבלת את מספר הטלפון של הלקוח ואת תוכן ההודעה. Global SMS: שליחת הודעות SMS, והיא מקבלת את מספר הטלפון ואת תוכן ההודעה. Resend: שליחת אימיילים, והיא מקבלת את כתובת האימייל ואת תוכן ההודעה.',
            'הודעות וואטסאפ עוברות דרך השירות של WhatsApp, וחלים עליהן גם תנאי השימוש ומדיניות הפרטיות של WhatsApp.',
            'חלק מהספקים מאחסנים מידע מחוץ לישראל, למשל בארצות הברית ובאיחוד האירופי. העברת המידע נעשית לפי תקנות הגנת הפרטיות (העברת מידע אל מאגרי מידע שמחוץ לגבולות המדינה).',
            'עם רשויות, רק כשהחוק מחייב זאת או לפי צו שיפוטי.',
          ],
        },
        {
          h: 'הודעות וואטסאפ, SMS ואימייל',
          p: [
            'כשקובעים תור אצל עסק, העסק יכול לשלוח הודעות על התור: אישור, תזכורת, שינוי מועד או ביטול. אלה הודעות שירות שקשורות לתור שקבעת.',
            'הודעה שמזמינה לקבוע תור חדש היא הודעה שיווקית, והעסק רשאי לשלוח אותה רק למי שהסכים לקבל ממנו הודעות כאלה.',
            'אם הודעת וואטסאפ לא נמסרה, ייתכן שאותה הודעה תישלח ב־SMS.',
            'כדי להפסיק לקבל הודעות, אפשר לבקש זאת מהעסק או לכתוב לנו ל־{email}, ונטפל בבקשה.',
          ],
        },
        {
          h: 'כמה זמן המידע נשמר',
          p: [
            'כל עוד החשבון פעיל. אחרי מחיקת עסק או חשבון, המידע נמחק תוך 30 יום, וגיבויים נמחקים תוך 30 יום נוספים.',
            'חשבוניות ורשומות תשלום נשמרות לתקופה שדיני המס מחייבים.',
          ],
        },
        {
          h: 'אבטחת מידע',
          p: [
            'המידע מוצפן בהעברה (HTTPS), הגישה אליו מוגבלת לפי הרשאות, וכל בקשה לשרת נבדקת כדי לוודא שהמשתמש רשאי לגשת לעסק המבוקש. אנחנו פועלים לפי תקנות הגנת הפרטיות (אבטחת מידע).',
            'אם יתרחש אירוע אבטחה חמור, נודיע לעסקים שנפגעו ולרשות להגנת הפרטיות כנדרש בחוק.',
          ],
        },
        {
          h: 'הזכויות שלך',
          p: [
            'לפי חוק הגנת הפרטיות, מותר לעיין במידע עליך, לבקש לתקן מידע שגוי ולבקש למחוק מידע.',
            'בעלי עסקים יכולים להוריד את כל המידע של העסק ולמחוק את העסק בעצמם, בהגדרות › חשבון ונתונים.',
            'לכל בקשה אחרת: {email}. נענה תוך 30 יום.',
          ],
        },
        {
          h: 'עוגיות ואחסון בדפדפן',
          p: [
            'אנחנו משתמשים באחסון בדפדפן רק כדי שהשירות יעבוד: לשמור שנכנסת לחשבון, את השפה שבחרת וטיוטות. אין עוגיות פרסום ואין מעקב של צד שלישי.',
            'סרטוני הדרכה מוטמעים מ-YouTube או Vimeo במצב פרטיות מוגבר, ונטענים רק כשלוחצים עליהם.',
          ],
        },
        {
          h: 'קטינים',
          p: ['השירות מיועד לבעלי עסקים מגיל 18 ומעלה.'],
        },
        {
          h: 'שינויים במדיניות',
          p: ['אם נשנה את המדיניות באופן מהותי, נודיע לבעלי העסקים באימייל לפחות 14 יום לפני שהשינוי ייכנס לתוקף.'],
        },
        {
          h: 'יצירת קשר',
          p: ['{company}{addressRef}. אימייל: {email}.'],
        },
      ],
    },
    en: {
      title: 'Privacy policy',
      intro:
        'This policy explains what information {product} collects, why, who it’s shared with and what your rights are. The service is operated by {company}{companyRef}{addressRef}. Last updated: {updated}.',
      sections: [
        {
          h: 'Who is responsible for the data',
          p: [
            'For business owners and staff who sign up (name, email, business details), {company} is the data controller.',
            'For customers who book with a business (name, phone, email, notes and appointments), the business is the controller; we hold and process that data only on its behalf and under its instructions. Customers who want to see, correct or delete their data should contact the business first. If you contact us, we’ll pass your request on and help the business handle it.',
          ],
        },
        {
          h: 'What we collect',
          p: [
            'Account details: name, email address, preferred language and sign-in details.',
            'Business details: name, address, phone, services, prices, opening hours, photos and other content the business puts on its page.',
            'Customer and appointment details: name, phone, email if given, notes, appointment times and change history.',
            'Messages to customers: the content of messages sent on the business’s behalf (booking confirmations, reminders, changes and cancellations), the phone number or email they went to, and their delivery status (sent, delivered, read or not delivered).',
            'Technical data: IP address, browser and device type, and server logs kept for security and troubleshooting.',
            'Payments: card details go straight to the payment provider and are never stored by us. We keep only the subscription status and invoices.',
          ],
        },
        {
          h: 'How we use it',
          p: [
            'To run the service: the booking page, calendar, customer list, reminders and calendar sync.',
            'To send customers messages about their appointments on the business’s behalf, by WhatsApp, SMS or email, and to show the business how many messages went out this month.',
            'To charge for the subscription and issue invoices as the law requires.',
            'To keep the service secure, prevent abuse and fix problems.',
            'To send business owners service messages (for example a change in terms or an outage). Marketing emails are sent only with consent, which you can withdraw at any time.',
            'We don’t sell data, don’t use businesses’ customer data for advertising, and don’t share it with advertisers.',
          ],
        },
        {
          h: 'Who we share it with',
          p: [
            'Providers that run parts of the service for us, and only as much as they need. They’re contractually bound to protect the data and use it only for the service:',
            'Cloudflare: website hosting and servers. Supabase: database, images and sign-in. Meta Platforms (WhatsApp Business): WhatsApp messages; it receives the customer’s phone number and the message. Global SMS: text messages; it receives the phone number and the message. Resend: email; it receives the email address and the message.',
            'WhatsApp messages go through WhatsApp’s service, so WhatsApp’s own terms and privacy policy also apply to them.',
            'Some providers store data outside Israel, for example in the United States and the European Union. Transfers follow the Israeli Privacy Protection (Transfer of Data to Databases Abroad) Regulations.',
            'Authorities, only when the law or a court order requires it.',
          ],
        },
        {
          h: 'WhatsApp, text and email messages',
          p: [
            'When you book with a business, it can send you messages about that booking: a confirmation, a reminder, a new time or a cancellation. These are service messages about your appointment.',
            'A message inviting you to book again is a marketing message, and the business may send it only if you agreed to get such messages from it.',
            'If a WhatsApp message isn’t delivered, the same message may be sent as a text message instead.',
            'To stop getting messages, ask the business or email us at {email} and we’ll take care of it.',
          ],
        },
        {
          h: 'How long we keep it',
          p: [
            'For as long as the account is active. After a business or account is deleted, its data is erased within 30 days, and backups within a further 30 days.',
            'Invoices and payment records are kept for as long as tax law requires.',
          ],
        },
        {
          h: 'Security',
          p: [
            'Data is encrypted in transit (HTTPS), access is limited by role, and every request is checked to make sure the user may access that business. We follow the Israeli Privacy Protection (Data Security) Regulations.',
            'If a serious security incident happens, we’ll notify the affected businesses and the Privacy Protection Authority as the law requires.',
          ],
        },
        {
          h: 'Your rights',
          p: [
            'Under the Privacy Protection Law you may see the data about you, ask us to correct it and ask us to delete it.',
            'Business owners can download all of their business’s data and delete the business themselves, in Settings › Account & data.',
            'For anything else: {email}. We’ll reply within 30 days.',
          ],
        },
        {
          h: 'Cookies and browser storage',
          p: [
            'We use browser storage only to make the service work: keeping you signed in, remembering your language and saving drafts. There are no advertising cookies and no third-party tracking.',
            'Help videos are embedded from YouTube or Vimeo in privacy-enhanced mode and load only when you press play.',
          ],
        },
        {
          h: 'Children',
          p: ['The service is for business owners aged 18 and over.'],
        },
        {
          h: 'Changes',
          p: ['If we change this policy in a meaningful way, we’ll email business owners at least 14 days before the change takes effect.'],
        },
        {
          h: 'Contact',
          p: ['{company}{addressRef}. Email: {email}.'],
        },
      ],
    },
  },

  terms: {
    he: {
      title: 'תנאי שימוש',
      intro: 'התנאים חלים על השימוש ב-{product}, שמופעל על ידי {company}{companyRef}. השימוש בשירות מהווה הסכמה לתנאים. עדכון אחרון: {updated}.',
      sections: [
        {
          h: 'השירות',
          p: [
            '{product} היא מערכת לניהול תורים לעסקים: עמוד קביעת תורים, יומן, ניהול לקוחות, תזכורות וסנכרון ליומנים חיצוניים.',
            'אנחנו משפרים את השירות כל הזמן, ולכן תכונות עשויות להשתנות. לא נסיר תכונה מרכזית בלי הודעה מראש.',
          ],
        },
        {
          h: 'החשבון',
          p: [
            'כדי להשתמש בשירות צריך להיות בן 18 ומעלה ולמסור פרטים נכונים.',
            'האחריות על שמירת פרטי הכניסה ועל הפעולות שנעשות בחשבון היא שלך. אם יש חשש לשימוש לא מורשה, יש לפנות אלינו מיד.',
            'מי שמוסיף אנשי צוות לעסק אחראי על ההרשאות שהוא נותן להם.',
          ],
        },
        {
          h: 'תקופת ניסיון, מנוי ותשלום',
          p: [
            'אפשר לנסות את השירות בחינם לתקופה שמופיעה בעמוד המחירים. בסוף התקופה המנוי מתחיל רק אם הזנת אמצעי תשלום.',
            'המנוי מתחדש אוטומטית כל חודש, והתשלום נגבה מראש. המחירים מופיעים בעמוד המחירים וכוללים מע"מ, אלא אם צוין אחרת.',
            'אפשר לבטל בכל עת בהגדרות. הביטול נכנס לתוקף בסוף תקופת החיוב הנוכחית, ועד אז השירות ממשיך לעבוד. אין החזר על חלק מחודש, אלא אם החוק מחייב זאת.',
            'אם נשנה מחיר, נודיע באימייל לפחות 30 יום מראש. המחיר החדש יחול רק מהחיוב שאחרי ההודעה.',
            'אם תשלום נכשל, ננסה לגבות שוב ונודיע לך. אם התשלום לא יוסדר תוך 14 יום, העמוד הציבורי עלול להיות מושהה עד להסדרה. המידע לא יימחק בשלב הזה.',
          ],
        },
        {
          h: 'האחריות של העסק כלפי הלקוחות שלו',
          p: [
            'העסק הוא שמספק את השירות ללקוחות שלו, וקובע את המחירים, מדיניות הביטול והתנאים. אנחנו לא צד להתקשרות בין העסק ללקוחותיו.',
            'העסק אחראי שהמידע בעמוד שלו נכון ושיש לו זכות להשתמש בתמונות ובתוכן שהוא מעלה.',
            'העסק אחראי לפעול לפי דיני הגנת הפרטיות כלפי הלקוחות שלו, ולשלוח הודעות שיווקיות רק למי שהסכים לקבל אותן (סעיף 30א לחוק התקשורת). הודעות אישור ותזכורת לתור הן הודעות שירות.',
            'הודעות וואטסאפ נשלחות דרך WhatsApp Business, והעסק מתחייב לפעול גם לפי מדיניות ההודעות העסקיות של WhatsApp. החבילה יכולה לכלול מספר מוגבל של הודעות בחודש, ומספר ההודעות שנשלחו מופיע בהגדרות. אנחנו לא יכולים להבטיח שכל הודעה תימסר, למשל כשהמספר שגוי או שהלקוח חסם את העסק.',
            'העסק אחראי להנגשת השירות שהוא נותן ללקוחותיו. אנחנו מספקים עמוד קביעת תורים נגיש, אבל התוכן שהעסק מוסיף (כמו טקסטים ותמונות) באחריותו.',
          ],
        },
        {
          h: 'שימוש מותר',
          p: [
            'אסור להשתמש בשירות לפעילות לא חוקית, להעלות תוכן פוגעני או מפר זכויות, לשלוח דואר זבל, לנסות לעקוף את מנגנוני האבטחה או לגשת למידע של עסקים אחרים.',
            'אנחנו רשאים להשעות חשבון שמפר את התנאים. כשאפשר, נודיע קודם ונאפשר לתקן.',
          ],
        },
        {
          h: 'המידע שלך',
          p: [
            'המידע שהעסק מכניס לשירות שייך לעסק. אפשר להוריד אותו בכל עת ולמחוק אותו, בהגדרות › חשבון ונתונים.',
            'כדי להפעיל את השירות, העסק נותן לנו רשות להשתמש בתוכן שהוא מעלה (למשל להציג את התמונות בעמוד שלו). הרשות מסתיימת כשהתוכן נמחק.',
            'פרטים על השימוש במידע אישי מופיעים במדיניות הפרטיות.',
          ],
        },
        {
          h: 'זמינות',
          p: [
            'אנחנו עושים כל מאמץ שהשירות יהיה זמין ויציב, אבל ייתכנו תקלות והפסקות, למשל לצורך תחזוקה. נשתדל להודיע מראש על תחזוקה מתוכננת.',
            'מומלץ להוריד מדי פעם עותק של המידע.',
          ],
        },
        {
          h: 'הגבלת אחריות',
          p: [
            'השירות ניתן כפי שהוא (AS IS). ככל שהחוק מתיר, לא נהיה אחראים לנזק עקיף או תוצאתי, כמו אובדן הכנסה בגלל תור שלא נקבע או תזכורת שלא נשלחה.',
            'ככל שהחוק מתיר, האחריות הכוללת שלנו מוגבלת לסכום ששילמת עבור השירות ב-3 החודשים שלפני האירוע.',
          ],
        },
        {
          h: 'סיום השימוש',
          p: [
            'אפשר להפסיק להשתמש בשירות ולמחוק את העסק בכל עת. אחרי המחיקה המידע נמחק כמתואר במדיניות הפרטיות.',
            'אם נחליט להפסיק את השירות כולו, נודיע לפחות 60 יום מראש כדי שיהיה זמן להוריד את המידע.',
          ],
        },
        {
          h: 'שינויים בתנאים',
          p: ['על שינוי מהותי נודיע באימייל לפחות 14 יום מראש. המשך השימוש אחרי שהשינוי נכנס לתוקף מהווה הסכמה לו.'],
        },
        {
          h: 'דין וסמכות שיפוט',
          p: ['על התנאים חלים דיני מדינת ישראל. סמכות השיפוט הבלעדית נתונה לבתי המשפט המוסמכים במחוז תל אביב.'],
        },
        {
          h: 'יצירת קשר',
          p: ['{company}{addressRef}. אימייל: {email}.'],
        },
      ],
    },
    en: {
      title: 'Terms of service',
      intro: 'These terms apply to your use of {product}, operated by {company}{companyRef}. By using the service you agree to them. Last updated: {updated}.',
      sections: [
        {
          h: 'The service',
          p: [
            '{product} is an appointment system for businesses: a booking page, calendar, customer list, reminders and sync with external calendars.',
            'We keep improving the service, so features may change. We won’t remove a core feature without notice.',
          ],
        },
        {
          h: 'Your account',
          p: [
            'You must be 18 or over and give accurate details.',
            'You’re responsible for keeping your sign-in details safe and for what happens in your account. Tell us right away if you suspect unauthorised use.',
            'Whoever adds team members to a business is responsible for the access they give them.',
          ],
        },
        {
          h: 'Trial, subscription and payment',
          p: [
            'You can try the service free for the period shown on the pricing page. When it ends, the subscription starts only if you’ve added a payment method.',
            'The subscription renews automatically every month and is charged in advance. Prices are shown on the pricing page and include VAT unless stated otherwise.',
            'You can cancel any time in Settings. Cancellation takes effect at the end of the current billing period, and the service keeps working until then. There are no refunds for part of a month unless the law requires one.',
            'If we change a price, we’ll email you at least 30 days in advance. The new price applies only from the charge after the notice.',
            'If a payment fails, we’ll retry and let you know. If it isn’t settled within 14 days, your public page may be paused until it is. Your data won’t be deleted at that point.',
          ],
        },
        {
          h: 'The business’s responsibility to its customers',
          p: [
            'The business provides its services to its customers and sets its own prices, cancellation policy and terms. We aren’t a party to the agreement between a business and its customers.',
            'The business is responsible for the accuracy of its page and for having the right to use the photos and content it uploads.',
            'The business is responsible for complying with privacy law towards its customers, and for sending marketing messages only to people who agreed to receive them (section 30A of the Israeli Communications Law). Booking confirmations and reminders are service messages.',
            'WhatsApp messages are sent through WhatsApp Business, and the business agrees to follow WhatsApp’s Business Messaging Policy too. Your plan may include a limited number of messages a month, and the number sent is shown in Settings. We can’t guarantee every message is delivered, for example when a number is wrong or a customer has blocked the business.',
            'The business is responsible for the accessibility of the services it provides. We supply an accessible booking page, but content the business adds (such as text and photos) is its responsibility.',
          ],
        },
        {
          h: 'Acceptable use',
          p: [
            'Don’t use the service for anything illegal, upload offensive or infringing content, send spam, try to get around security, or access other businesses’ data.',
            'We may suspend an account that breaks these terms. Where possible we’ll warn you first and give you a chance to fix it.',
          ],
        },
        {
          h: 'Your data',
          p: [
            'The data a business puts into the service belongs to the business. You can download it and delete it any time in Settings › Account & data.',
            'To run the service, the business lets us use the content it uploads (for example to show its photos on its page). That permission ends when the content is deleted.',
            'How we handle personal data is described in the privacy policy.',
          ],
        },
        {
          h: 'Availability',
          p: [
            'We do our best to keep the service available and stable, but outages can happen, for example during maintenance. We’ll try to announce planned maintenance in advance.',
            'We recommend downloading a copy of your data from time to time.',
          ],
        },
        {
          h: 'Limitation of liability',
          p: [
            'The service is provided as is. To the extent the law allows, we aren’t liable for indirect or consequential loss, such as lost income from a booking that wasn’t made or a reminder that wasn’t sent.',
            'To the extent the law allows, our total liability is limited to what you paid for the service in the 3 months before the event.',
          ],
        },
        {
          h: 'Ending the service',
          p: [
            'You can stop using the service and delete your business at any time. After deletion, data is erased as described in the privacy policy.',
            'If we decide to shut down the service entirely, we’ll give at least 60 days’ notice so you have time to download your data.',
          ],
        },
        {
          h: 'Changes to these terms',
          p: ['We’ll email you at least 14 days before a meaningful change. Continuing to use the service after it takes effect means you accept it.'],
        },
        {
          h: 'Governing law',
          p: ['These terms are governed by Israeli law. The competent courts of the Tel Aviv district have exclusive jurisdiction.'],
        },
        {
          h: 'Contact',
          p: ['{company}{addressRef}. Email: {email}.'],
        },
      ],
    },
  },

  accessibility: {
    he: {
      title: 'הצהרת נגישות',
      intro:
        'אנחנו רוצים שכל אחד יוכל לקבוע תור ולנהל עסק ב-{product}, כולל אנשים עם מוגבלות. ההצהרה עודכנה לאחרונה ב-{updated}.',
      sections: [
        {
          h: 'רמת הנגישות',
          p: [
            'האתר, עמודי קביעת התורים ומערכת הניהול נבנו כך שיעמדו בדרישות תקן ישראלי 5568 ברמה AA, שמבוסס על הנחיות WCAG, ובתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג-2013.',
          ],
        },
        {
          h: 'מה עשינו',
          p: [
            'אפשר לנווט בכל האתר עם המקלדת, ויש קישור "דילוג לתוכן" בתחילת כל עמוד.',
            'הרכיבים מסומנים לקוראי מסך: כותרות, כפתורים, טפסים, חלונות ותיבות דו-שיח.',
            'ניגודיות הצבעים עומדת בתקן. כשבעל עסק בוחר צבע מותג בהיר מדי, המערכת מכהה אותו אוטומטית כדי שהטקסט יישאר קריא.',
            'אפשר להגדיל את הטקסט עד 200% בלי לאבד תוכן, והאתר מתאים את עצמו למסכים קטנים.',
            'מי שהגדיר במכשיר "הפחתת תנועה" יקבל אתר בלי אנימציות.',
            'השפה וכיוון הכתיבה (עברית מימין לשמאל, אנגלית משמאל לימין) מוגדרים בכל עמוד, כדי שקוראי מסך יקראו נכון.',
            'הודעות שגיאה בטפסים מופיעות ליד השדה ומוקראות לקוראי מסך.',
          ],
        },
        {
          h: 'מגבלות ידועות',
          p: [
            'תמונות שבעלי עסקים מעלים לעמוד שלהם עשויות להופיע בלי תיאור חלופי מלא. אנחנו עובדים על דרך פשוטה להוסיף תיאורים.',
            'סרטוני הדרכה מוטמעים מ-YouTube או Vimeo. הנגישות של הנגן תלויה בספקים האלה.',
            'האנימציה התלת-ממדית בעמוד הבית היא קישוטית בלבד, ואין בה מידע שלא מופיע גם בטקסט.',
          ],
        },
        {
          h: 'עמודים של עסקים',
          p: [
            'כל עסק שמשתמש ב-{product} אחראי להנגשת השירות שהוא נותן, ולתוכן שהוא מוסיף לעמוד שלו. אם נתקלת בבעיה בעמוד של עסק מסוים, אפשר לפנות לעסק או אלינו ונעזור.',
          ],
        },
        {
          h: 'נתקלת בבעיה?',
          p: [
            'נשמח לשמוע ולתקן. כדאי לכתוב באיזה עמוד מדובר, מה ניסית לעשות ובאיזה דפדפן או טכנולוגיה מסייעת השתמשת.',
            'רכז/ת הנגישות: {a11yContact}. אימייל: {email}.',
            'כתובת: {address}.',
            'נחזור אליך תוך 5 ימי עסקים.',
          ],
        },
      ],
    },
    en: {
      title: 'Accessibility statement',
      intro: 'We want everyone to be able to book and run a business with {product}, including people with disabilities. This statement was last updated on {updated}.',
      sections: [
        {
          h: 'Conformance',
          p: [
            'The website, booking pages and the business app are built to meet Israeli Standard 5568 at level AA, which is based on WCAG, and the Israeli Equal Rights for Persons with Disabilities (Service Accessibility Adjustments) Regulations, 2013.',
          ],
        },
        {
          h: 'What we’ve done',
          p: [
            'Everything works with a keyboard, and every page starts with a “Skip to content” link.',
            'Headings, buttons, forms, dialogs and menus are labelled for screen readers.',
            'Colour contrast meets the standard. If a business picks a brand colour that’s too light, the app darkens it automatically so text stays readable.',
            'Text can be enlarged to 200% without losing content, and the layout adapts to small screens.',
            'If your device is set to reduce motion, animations are turned off.',
            'Each page declares its language and direction (Hebrew right-to-left, English left-to-right) so screen readers pronounce it correctly.',
            'Form errors appear next to the field and are announced to screen readers.',
          ],
        },
        {
          h: 'Known limitations',
          p: [
            'Photos that businesses upload may not have full text alternatives. We’re working on an easy way to add descriptions.',
            'Help videos are embedded from YouTube or Vimeo; the player’s accessibility depends on those providers.',
            'The 3D animation on the home page is decorative only and carries no information that isn’t also in the text.',
          ],
        },
        {
          h: 'Business pages',
          p: [
            'Each business using {product} is responsible for the accessibility of its own services and of the content it adds to its page. If you run into a problem on a particular business’s page, contact the business or us and we’ll help.',
          ],
        },
        {
          h: 'Found a problem?',
          p: [
            'We’d like to hear about it and fix it. Tell us which page, what you were trying to do and which browser or assistive technology you used.',
            'Accessibility coordinator: {a11yContact}. Email: {email}.',
            'Address: {address}.',
            'We’ll get back to you within 5 business days.',
          ],
        },
      ],
    },
  },
};

export interface HelpGroup {
  title: string;
  items: { q: string; a: string[]; video?: string }[];
}

export const HELP: Record<Locale, { title: string; lede: string; contact: string; groups: HelpGroup[] }> = {
  he: {
    title: 'עזרה',
    lede: 'תשובות לשאלות הנפוצות, וסרטונים קצרים שמראים בדיוק מה לעשות.',
    contact: 'לא מצאת תשובה? כתבו לנו ל-{email} ונחזור אליכם תוך יום עסקים.',
    groups: [
      {
        title: 'צעדים ראשונים',
        items: [
          {
            q: 'איך מתחילים?',
            a: [
              'נרשמים, עונים על כמה שאלות על העסק (שם, שירותים ושעות), והעמוד מוכן. אחר כך מופיעה בעמוד "היום" רשימת צעדים קצרה עם סרטון לכל צעד: עיצוב העמוד, תמונות, צוות, פרסום, חיבור ליומן ושיתוף הקישור.',
            ],
            video: 'welcome',
          },
          {
            q: 'איך הלקוחות קובעים תור?',
            a: [
              'לכל עסק יש קישור משלו. הלקוח בוחר שירות, איש צוות (או "מי שפנוי"), יום ושעה, ממלא שם וטלפון, וזהו. הוא מקבל קוד תור, ויכול לבטל או לשנות את התור בעצמו לפי מדיניות הביטול שהגדרת.',
              'המערכת מציגה רק שעות פנויות באמת, ולא תאפשר לשני לקוחות לקבוע את אותה שעה.',
            ],
          },
          {
            q: 'איפה כדאי לשים את הקישור?',
            a: ['בביו של האינסטגרם, בכפתור "הזמנה" בפרופיל העסק בגוגל, בסטטוס ובחתימה בוואטסאפ, ובכל מקום שלקוחות שואלים "מתי יש לך תור?".'],
            video: 'share',
          },
        ],
      },
      {
        title: 'העמוד שלי',
        items: [
          {
            q: 'איך משנים את העיצוב?',
            a: ['בתפריט "העמוד שלי": בוחרים מראה, צבע ופריסה, מסדרים את החלקים (שירותים, גלריה, אודות, צוות, המלצות, שאלות נפוצות) ורואים תצוגה מקדימה במחשב ובטלפון לפני ששומרים.'],
            video: 'page',
          },
          {
            q: 'איך מוסיפים תמונות?',
            a: ['גם הן ב"העמוד שלי": לוגו, תמונת רקע, גלריה, תמונה לכל שירות ולכל איש צוות. תמונות גדולות מוקטנות אוטומטית כדי שהעמוד ייטען מהר.'],
            video: 'photos',
          },
          {
            q: 'אפשר להסתיר את העמוד בזמן שאני מסדר/ת אותו?',
            a: ['כן. עד שלוחצים "פרסום", רק את/ה רואה את העמוד. אפשר להחזיר אותו לטיוטה בכל רגע בהגדרות › העסק.'],
            video: 'publish',
          },
        ],
      },
      {
        title: 'יומן וצוות',
        items: [
          {
            q: 'איך רואים את התורים ביומן Google או Outlook?',
            a: [
              'בהגדרות › סנכרון יומן יוצרים קישור ומוסיפים אותו ליומן כמינוי. אפשר קישור לכל התורים, וקישור נפרד לכל איש צוות.',
              'הסנכרון הוא בכיוון אחד: התורים מופיעים ביומן שלך, אבל שינויים שעושים שם לא חוזרים למערכת. Google מתעדכן כל כמה שעות.',
            ],
            video: 'calendar',
          },
          {
            q: 'איך מוסיפים איש צוות?',
            a: ['בתפריט "צוות": שם, תפקיד, צבע ביומן, שעות עבודה, ואילו שירותים הוא נותן. אפשר להגדיר לכל אחד מחיר ומשך שונים לאותו שירות.'],
            video: 'team',
          },
          {
            q: 'איך חוסמים זמן (הפסקה, חופשה)?',
            a: ['ביומן לוחצים על שעה ובוחרים "חסימת זמן", או בתפריט "זמינות" מוסיפים חופשה או שינוי שעות ליום מסוים.'],
          },
        ],
      },
      {
        title: 'חשבון ופרטיות',
        items: [
          {
            q: 'מי רואה את פרטי הלקוחות שלי?',
            a: ['רק את/ה ומי שנתת לו הרשאה. איש צוות רואה רק את התורים שלו. בעמוד הציבורי לא מופיע שום פרט על לקוחות אחרים, רק אילו שעות פנויות.'],
          },
          {
            q: 'איך מורידים את המידע או מוחקים את העסק?',
            a: ['בהגדרות › חשבון ונתונים. אפשר להוריד את כל המידע (לקוחות, תורים ושירותים) בכל עת, ולמחוק את העסק לצמיתות.'],
          },
        ],
      },
    ],
  },
  en: {
    title: 'Help',
    lede: 'Answers to common questions, and short videos that show exactly what to do.',
    contact: 'Didn’t find an answer? Email {email} and we’ll get back to you within one business day.',
    groups: [
      {
        title: 'Getting started',
        items: [
          {
            q: 'How do I start?',
            a: [
              'Sign up, answer a few questions about your business (name, services and hours), and your page is ready. Then the Today screen shows a short list of steps, each with a video: design your page, photos, team, publish, connect your calendar and share your link.',
            ],
            video: 'welcome',
          },
          {
            q: 'How do customers book?',
            a: [
              'Every business has its own link. The customer picks a service, a person (or “anyone available”), a day and a time, enters a name and phone number, and that’s it. They get a booking code and can cancel or reschedule on their own within your cancellation policy.',
              'Only genuinely free times are shown, and two customers can never book the same slot.',
            ],
          },
          {
            q: 'Where should I put my link?',
            a: ['In your Instagram bio, the “Book” button on your Google Business profile, your WhatsApp status and signature, and anywhere customers ask “when are you free?”.'],
            video: 'share',
          },
        ],
      },
      {
        title: 'My page',
        items: [
          {
            q: 'How do I change the design?',
            a: ['In “My page”: choose a look, colour and layout, arrange the sections (services, gallery, about, team, reviews, FAQ) and preview on desktop and phone before saving.'],
            video: 'page',
          },
          {
            q: 'How do I add photos?',
            a: ['Also in “My page”: logo, cover photo, gallery, and a photo for each service and team member. Large photos are resized automatically so the page loads fast.'],
            video: 'photos',
          },
          {
            q: 'Can I hide the page while I set it up?',
            a: ['Yes. Until you press “Publish”, only you can see the page. You can switch it back to draft any time in Settings › Business.'],
            video: 'publish',
          },
        ],
      },
      {
        title: 'Calendar and team',
        items: [
          {
            q: 'How do I see appointments in Google Calendar or Outlook?',
            a: [
              'In Settings › Calendar sync, create a link and add it to your calendar as a subscription. There’s one link for all appointments and a separate one for each team member.',
              'Sync is one-way: appointments show up in your calendar, but changes made there don’t come back. Google refreshes every few hours.',
            ],
            video: 'calendar',
          },
          {
            q: 'How do I add a team member?',
            a: ['In “Team”: name, role, calendar colour, working hours and which services they offer. Each person can have their own price and duration for the same service.'],
            video: 'team',
          },
          {
            q: 'How do I block time (a break, a holiday)?',
            a: ['In the calendar, tap a time and choose “Block time”, or add time off or different hours for a specific day in “Availability”.'],
          },
        ],
      },
      {
        title: 'Account and privacy',
        items: [
          {
            q: 'Who can see my customers’ details?',
            a: ['Only you and the people you give access to. Staff see only their own appointments. The public page shows nothing about other customers, only which times are free.'],
          },
          {
            q: 'How do I download my data or delete my business?',
            a: ['In Settings › Account & data. You can download everything (customers, appointments and services) at any time, and delete the business permanently.'],
          },
        ],
      },
    ],
  },
};
