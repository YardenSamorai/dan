-- ============================================================================
-- Booking app: database schema (Supabase / Postgres)
--
-- Three tables and one storage bucket:
--
--   profiles     one row per person who signs in (the login itself lives in
--                Supabase's auth.users)
--   businesses   one row per business; `data` holds everything about it:
--                details, page design, services, staff, hours, appointments,
--                customers (the TenantData type in src/domain/types.ts)
--   members      who may work in which business, and in what role
--
--   storage bucket "media"   logos and photos, publicly readable by URL
--
-- Only the app's server talks to these tables, with the secret key. Browsers
-- never query them directly: row level security is on and there are no
-- policies, so the public (publishable) key can't read or write anything.
--
-- Safe to run more than once.
-- ============================================================================


-- ── profiles ────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  email       text        not null,
  name        text        not null default '',
  locale      text        not null default 'he' check (locale in ('he', 'en')),
  created_at  timestamptz not null default now()
);

comment on table public.profiles is 'People who sign in. Created by the server on first sign-in.';


-- ── businesses ──────────────────────────────────────────────────────────────

create table if not exists public.businesses (
  id          text        primary key,
  data        jsonb       not null,
  -- The public booking address (/book/{slug}); taken from data, unique.
  slug        text        generated always as (data -> 'business' ->> 'slug') stored
                          unique
                          check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  -- Raised on every save; a save based on an older version is rejected.
  version     integer     not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.businesses is 'One row per business. data = TenantData (src/domain/types.ts).';
comment on column public.businesses.version is 'Optimistic locking: saves must name the version they read.';


-- ── members ─────────────────────────────────────────────────────────────────

create table if not exists public.members (
  id           text        primary key,
  business_id  text        not null references public.businesses (id) on delete cascade,
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  role         text        not null check (role in ('owner', 'manager', 'staff')),
  -- The bookable staff profile (inside businesses.data) this person works as.
  staff_id     text,
  created_at   timestamptz not null default now(),
  unique (business_id, user_id)
);

create index if not exists members_user_id_idx on public.members (user_id);

comment on table public.members is 'Access: which person works in which business, as owner / manager / staff.';


-- ── Access: server only ─────────────────────────────────────────────────────

alter table public.profiles   enable row level security;
alter table public.businesses enable row level security;
alter table public.members    enable row level security;

revoke all on public.profiles, public.businesses, public.members from anon, authenticated;


-- ── Saving ──────────────────────────────────────────────────────────────────
-- One request's changes, applied together or not at all. Raises
-- 'version_conflict' when a business changed since it was read; the server
-- then reloads and retries.
--
-- changes = {
--   profiles:          [{ id, email, name, locale }],
--   businesses:        [{ id, data, version }]    version null = new business
--   deletedBusinesses: [id],
--   members:           [{ id, businessId, userId, role, staffId }],
--   deletedMembers:    [id]
-- }

create or replace function public.commit_changes(changes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b jsonb;
  updated integer;
begin
  insert into public.profiles (id, email, name, locale)
  select (p ->> 'id')::uuid, p ->> 'email', coalesce(p ->> 'name', ''), coalesce(p ->> 'locale', 'he')
  from jsonb_array_elements(coalesce(changes -> 'profiles', '[]')) as p
  on conflict (id) do update
    set email = excluded.email, name = excluded.name, locale = excluded.locale;

  delete from public.businesses
  where id in (select jsonb_array_elements_text(coalesce(changes -> 'deletedBusinesses', '[]')));

  for b in select * from jsonb_array_elements(coalesce(changes -> 'businesses', '[]')) loop
    if b ->> 'version' is null then
      insert into public.businesses (id, data) values (b ->> 'id', b -> 'data');
    else
      update public.businesses
         set data = b -> 'data', version = version + 1, updated_at = now()
       where id = b ->> 'id' and version = (b ->> 'version')::integer;
      get diagnostics updated = row_count;
      if updated = 0 then
        -- PT409 = HTTP 409. Not 40001: the API layer retries that one by itself and the request hangs.
        raise exception 'version_conflict' using errcode = 'PT409';
      end if;
    end if;
  end loop;

  delete from public.members
  where id in (select jsonb_array_elements_text(coalesce(changes -> 'deletedMembers', '[]')));

  insert into public.members (id, business_id, user_id, role, staff_id)
  select m ->> 'id', m ->> 'businessId', (m ->> 'userId')::uuid, m ->> 'role', m ->> 'staffId'
  from jsonb_array_elements(coalesce(changes -> 'members', '[]')) as m
  on conflict (id) do update
    set role = excluded.role, staff_id = excluded.staff_id;
end;
$$;

revoke all on function public.commit_changes(jsonb) from public, anon, authenticated;
grant execute on function public.commit_changes(jsonb) to service_role;


-- ── Images ──────────────────────────────────────────────────────────────────
-- Public read by URL; only the server uploads (with the secret key).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 3145728, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
