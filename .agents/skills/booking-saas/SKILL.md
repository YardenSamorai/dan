---
name: booking-saas
description: Architecture, conventions and workflows for this multi-tenant booking SaaS (React 18 + TypeScript + Vite + three.js, Hebrew-first RTL, mock adapters over localStorage). Use whenever changing code in src/, adding features, pages, data fields, translations, scheduling rules, the 3D marketing hero, or running the qa/ and tools/blender/ scripts.
---

# Booking SaaS: working on this codebase

## Map

| Area | Path | Notes |
|---|---|---|
| Routes | `src/App.tsx`, `src/app/BusinessApp.tsx` | `/` marketing, `/sign-in` `/sign-up` `/onboarding`, `/book/:businessSlug/*` public booking, `/app/*` business workspace |
| Domain (pure, no React) | `src/domain/` | `types.ts` model, `scheduling.ts` availability engine, `policy.ts` cancel/reschedule, `permissions.ts` roles, `notifications.ts` templates, `time.ts` timezone math |
| Data contracts | `src/data/contracts.ts` | The only shapes the UI may depend on |
| Swap point | `src/data/index.ts` | UI imports `auth`, `directory`, `publicBooking`, `workspace` from here, never from `src/data/mock/` |
| Mock backend | `src/data/mock/` | localStorage DB (`saas.db`), imitates server authorization |
| Demo seed | `src/data/demo/seed.ts` | `demo-studio` (4 staff) and `lash-room` (solo); bump `SEED_VERSION` when the stored shape changes |
| Product identity | `src/config/product.ts` | `PRODUCT.name` (brand undecided), `CAPABILITIES` flags |
| i18n | `src/i18n/` | `he` default (RTL), `en` required fallback |
| Workspace context | `src/app/workspace.tsx` | `useWorkspace()` gives `tenant`, `api`, `can`, `me`, `solo` |
| 3D hero | `src/components/hero3d/` | `timeline.ts` + `story.ts` are pure functions of scroll progress `p`; `engine.ts` loads three.js lazily |

## Rules

- **Layering**: domain → data contracts → UI. Domain files never import React or `src/data`. UI never imports `src/data/mock/*` or `src/data/demo/*`.
- **Tenant scoping**: every tenant record extends `Owned` (`businessId`). Load records by `(businessId, id)`. Public endpoints return only the projections in `contracts.ts`, never customers, notes or other bookings.
- **Authorization**: shape UI with `can(permission)` from `useWorkspace()`, and also enforce it inside the workspace adapter (`authorize`/`authorizeAppointment` in `mock/workspace.ts`). Staff without `calendar.all` touch only their own appointments.
- **Availability**: all slot and conflict logic goes through `scheduling.ts` (`availableSlots`, `checkSlot`, `heldRange`). Never re-implement overlap checks in components. Times are `Minutes` after local midnight and dates are `ISODate`, both in the **business** timezone.
- **Per-staff terms**: a service's duration and price can differ per person (`Service.staffTerms`). Never read `service.duration`/`service.price` directly for a booking; use `termsFor(service, staffId)`, `bookingDuration`/`bookingPrice(…, staffId)`, `termsIfMoved` when an appointment changes hands, and `termsRange` + `fmt.durationRange`/`fmt.moneyRange` when no person is chosen yet.
- **Honest UI**: check `CAPABILITIES` before claiming an effect. Messages are queued in `outbox`, not sent, so never say "SMS sent" while `messaging` is false.
- **Product name**: never hardcode a brand. Use `PRODUCT.name`; storage keys use `storageKey()`.
- **Mutations**: adapters call `latency()` and `mutateTenant()`. Reads go through `useSyncExternalStore` hooks (`useTenant`, `useBusiness`, `useSession`).
- **Effects use block bodies**: write `useEffect(() => { call(); }, deps)`, never `useEffect(() => call(), deps)`. Newer Chrome returns a Promise from `scrollTo`, and React then crashes with "destroy is not a function".

## i18n checklist

1. Add the key to `src/i18n/messages/en.ts` (the source of the `MessageKey` type), then the same key to `he.ts`.
2. Use `t('key', vars)` for UI strings. Use `tx(lText)` / `pickText` for tenant content stored as `LText` (`{ en, he? }`).
3. Format dates, times and money with `fmt` from `useI18n()`. Inside `/app` and tenant pages, `FormatScope` already applies the business currency and timezone.
4. RTL: use logical CSS (`margin-inline-start`, `inset-inline-end`), not left/right. Wrap phone numbers, times and emails with the `ltr` class.
5. Copy follows the `ux-writing` skill: sentence case, active verbs, same action name from button to toast.

## Adding a field to a tenant entity

1. Extend the interface in `src/domain/types.ts`.
2. If customers need it, add it to the public projection in `contracts.ts` and `project()` in `mock/public.ts`.
3. Populate it in `seed.ts` and in `createBusiness` (`src/data/mock/auth.ts`, used by onboarding), then bump `SEED_VERSION`.
4. Expose edits through a `WorkspaceApi` method; never mutate the DB from components.

## Backend

- `src/data/index.ts` picks the adapters: `VITE_BACKEND=mock` = in-browser demo over localStorage; default = `src/data/remote/*`, which call `POST /api/rpc`.
- The server (`server/`) runs the **same** adapter logic from `src/data/mock/*` against real storage: `server/context.ts` installs a per-request db driver (AsyncLocalStorage), `server/handler.ts` whitelists functions and derives the caller's role from membership (never from the request), `server/store.ts` persists with optimistic concurrency (`Conflict` → retry).
- Dev: Vite serves `/api/rpc` (plugin in `vite.config.ts`), data in `.data/db.json`, email-only sign-in (`server/auth.ts`). Production refuses that mode.
- Public pages get `availabilityView()` (schedules + busy time, no customer data) and compute slots in the browser; the server re-checks every booking.
- Remote hooks return `null` while loading (`useBusiness`, `useBooking`); `undefined` means not found. Never treat loading as "missing".
- `npm run test:api` runs `qa/api-test.ts` (auth, role scoping, double-booking, races) against a throwaway copy.
- Supabase (when `VITE_SUPABASE_URL` + `SUPABASE_SECRET_KEY` are set in `.env`, the single local settings file, never committed; production reads Cloudflare's variables): schema in `supabase/schema.sql` — deliberately just `profiles`, `businesses` (one row per business, `data` jsonb = TenantData, generated unique `slug`, `version` for optimistic locking) and `members`, plus the public `media` bucket. RLS on, no policies: only the server (secret key) touches tables; saves go through `commit_changes()` in one transaction. Don't add tables for things that always load with a business. `server/supabase.ts` = store + token check + image upload (inline data URLs in savePage/updateBusiness/saveService/saveStaff become storage URLs). Browser sign-in = email + password (`src/pages/auth/PasswordForm.tsx`; + Google behind `VITE_AUTH_GOOGLE`), `src/data/remote/identity.ts`. Sign-up goes through `auth.createAccount` on the server, which creates the user already confirmed — no email round-trip (emailed links broke when opened in another browser). PostgREST replies to `return=minimal` writes with an empty body: never `res.json()` it blindly.
- Customer import (`/app/customers/import`): `src/lib/spreadsheet.ts` reads xlsx/xls/csv/ods into a text grid (SheetJS from cdn.sheetjs.com, lazy-loaded — don't import `xlsx` statically); `src/domain/customerImport.ts` guesses titles row/first row/column mapping and builds the rows; `importCustomers` saves them in one write, matching existing customers by `phoneKey` (never overwrites names). `npm run test:import` covers real-world files.
- Messages: `server/messaging.ts` sends what's due in each `outbox` and adds to `business.usage[month]` (server-written only; `updateBusiness` keeps it). WhatsApp messages carry `biz_opaque_callback_data` (`messageRef`), so Meta's delivery reports at `/api/whatsapp/webhook` (`server/whatsappWebhook.ts`, signed with `WHATSAPP_APP_SECRET`) find their business without a lookup table; a failed WhatsApp message is taken off the count and re-queued as SMS (`fallbackFor`) when SMS is connected. `npm run messages:usage` prints usage and WhatsApp cost per business.
- `npm run db:setup` checks the schema and adds demo businesses (`-- --import-local` copies `.data/db.json` businesses whose owners have signed in). `npm run test:supabase` = end-to-end against the real project with throwaway users.

## Self-serve pieces

- Calendar feeds: `src/domain/ics.ts` builds the iCalendar; `GET /api/ics/{slug}/{key}.ics` (`handleIcs`). Keys live in `business.calendarFeeds`, created/rotated only via `api.calendarFeed()`; `updateBusiness` can't touch them, staff only see their own, public views strip them.
- Setup checklist: `src/domain/setup.ts` (auto-detected steps + `business.setup.done` for manual ones), shown on the Today screen by `src/app/SetupChecklist.tsx`. Videos per step come from `VIDEOS` in `config/product.ts` (env `VITE_VIDEO_*`).
- Help + legal pages: prose lives in `src/pages/info/content.ts` (not the i18n catalogues); operator details from `OPERATOR` (env `VITE_LEGAL_*`, `VITE_SUPPORT_EMAIL`, `VITE_A11Y_CONTACT`). Bump `OPERATOR.legalUpdated` when legal wording changes.
- Settings › Account & data: CSV/JSON export (client-side) and `api.deleteBusiness(slug)` (owner only, demo businesses refused).
- Never edit source files with PowerShell `Get-Content`/`Set-Content`: Windows PowerShell 5 re-encodes them and garbles Hebrew.

## Booking page builder

- Model: `Business.page` (`PageConfig`: theme + ordered `PageSection[]`), helpers in `src/domain/page.ts`. Always read through `pageOf()` (hero first, defaults for old tenants). Custom colours go through `readableAccent()` in `src/domain/color.ts`.
- Public render: `TenantHome.tsx` switches on `section.kind`; styles and themes (`data-theme` on `.tenant-site`) live in `page.css`.
- Editor: `/app/page` (`src/app/pages/PageEditor.tsx`, full-screen, outside the app shell). The preview is an iframe of `/book/:slug?editor`; drafts and selection travel over `postMessage` (`src/pages/booking/pageBridge.ts`). Nothing persists until `workspace.savePage`.
- Images are downscaled/cropped to JPEG data URLs by `src/lib/image.ts` and stored in localStorage; `savePage` throws `too_large` when storage is full.
- New section kind: add it to `SectionKind`, `SECTION_KINDS`, `SectionBody`, the editor `SectionPanel`, and `pageEditor.kinds/kindDesc` in both locales.

## Commands

- `npm run dev` (Vite on `http://localhost:5173`), `npm run build` (`tsc -b` then `vite build`; this is the type check).
- Demo sign-in is email-only, e.g. `noa@demo-studio.example` (owner of `demo-studio`).
- Visual QA (requires `playwright` + Chromium, not in `package.json`): `LOCALE=he AS=noa@demo-studio.example node qa/app.mjs desktop`. Shots land in `qa/shots/` (gitignored). Check both `he` and `en`, desktop and mobile.
- Hero assets: `public/hero3d/` (poster, stills, `seq/nails/*.webp`) are generated by `tools/blender/*.py` (`render.py`, `pack_seq.py`) and `qa/export-*.mjs`. Without them the hero falls back to broken images.
- `?herodebug` in dev shows the hero's scroll progress.
