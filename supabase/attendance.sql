-- ============================================================
-- QR + GPS ATTENDANCE SYSTEM — MIGRATION (additive only)
-- Run after schema.sql. Safe to re-run (idempotent).
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- ENUM TYPES
-- ------------------------------------------------------------
do $$ begin
  create type attendance_event as enum ('check_in', 'check_out');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attendance_status as enum ('present', 'voided');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attendance_verification as enum ('qr_gps', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type qr_mode as enum ('rotating', 'permanent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type duplicate_policy as enum ('daily', 'multiple');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- TABLES
-- ------------------------------------------------------------

-- Attendance configuration (single row, admin-managed)
create table if not exists public.gym_attendance_settings (
  id int primary key default 1 check (id = 1),
  gym_name text not null default 'FitGym',
  latitude double precision,
  longitude double precision,
  allowed_radius_meters int not null default 50
    check (allowed_radius_meters between 10 and 1000),
  max_gps_accuracy_meters int not null default 50
    check (max_gps_accuracy_meters between 5 and 1000),
  timezone text not null default 'Asia/Kolkata',
  qr_validity_seconds int not null default 60
    check (qr_validity_seconds between 15 and 3600),
  qr_mode qr_mode not null default 'rotating',
  duplicate_policy duplicate_policy not null default 'daily',
  location_configured boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

-- Short-lived (rotating) or long-lived (permanent) gym QR tokens.
-- Only the SHA-256 hash of the token is stored; the plaintext nonce
-- exists only in the QR payload returned to the admin display.
create table if not exists public.attendance_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  mode qr_mode not null default 'rotating',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

-- One attendance identity token per member. Plaintext is shown to the
-- admin exactly once (at generation) and never stored or listed later.
create table if not exists public.member_attendance_tokens (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.members(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

-- Attendance records. Precise GPS coordinates are deliberately NOT
-- stored: only distance + accuracy are kept for audit purposes.
-- Retention policy: attendance rows are kept for reporting until an
-- admin voids or (if ever implemented) deletes them; raw coordinates
-- are never persisted.
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  event_type attendance_event not null default 'check_in',
  check_in_at timestamptz not null default now(),
  attendance_date date not null, -- local calendar date in gym timezone (set by trigger if null)
  status attendance_status not null default 'present',
  distance_meters numeric(8,2),
  gps_accuracy_meters numeric(8,2),
  verification_method attendance_verification not null default 'qr_gps',
  confirmation_reference text not null unique,
  correction_reason text,
  corrected_by uuid references auth.users(id) on delete set null,
  corrected_at timestamptz,
  recorded_by uuid references auth.users(id) on delete set null,
  qr_token_id uuid references public.attendance_qr_tokens(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------
create index if not exists idx_attendance_date on public.attendance(attendance_date desc);
create index if not exists idx_attendance_member_date on public.attendance(member_id, attendance_date desc);
create index if not exists idx_attendance_checkin on public.attendance(check_in_at desc);
create index if not exists idx_qr_tokens_expires on public.attendance_qr_tokens(expires_at desc);
create index if not exists idx_member_tokens_member on public.member_attendance_tokens(member_id);

-- ------------------------------------------------------------
-- DUPLICATE-PREVENTION + LOCAL DATE TRIGGER
-- Race-safe: serializes concurrent inserts for the same member with a
-- row lock on public.members, then re-checks the configured policy
-- inside the inserting transaction. Works for both app inserts and
-- any direct database writes.
-- ------------------------------------------------------------
create or replace function public.attendance_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pol public.duplicate_policy := 'daily';
  tz text := 'Asia/Kolkata';
  dup_count int := 0;
begin
  select coalesce(s.duplicate_policy, 'daily'), coalesce(s.timezone, 'Asia/Kolkata')
    into pol, tz
  from public.gym_attendance_settings s
  where s.id = 1;

  if new.attendance_date is null then
    new.attendance_date := (now() at time zone tz)::date;
  end if;

  if new.confirmation_reference is null or new.confirmation_reference = '' then
    new.confirmation_reference := 'FG-' || upper(encode(gen_random_bytes(6), 'hex'));
  end if;

  if new.status = 'present' and pol = 'daily' then
    -- Lock this member's row so concurrent check-ins serialize.
    perform 1 from public.members m where m.id = new.member_id for update;

    select count(*) into dup_count
    from public.attendance a
    where a.member_id = new.member_id
      and a.attendance_date = new.attendance_date
      and a.event_type = new.event_type
      and a.status = 'present';

    if dup_count > 0 then
      raise exception 'ATTENDANCE_DUPLICATE'
        using errcode = '23505', hint = 'Attendance already recorded for this local day.';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_attendance_before_insert on public.attendance;
create trigger trg_attendance_before_insert
  before insert on public.attendance
  for each row execute function public.attendance_before_insert();

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- No policies for anon anywhere: members/anonymous clients cannot read
-- or write attendance data directly. All public flows go through the
-- app's server-side endpoints (service role, which bypasses RLS).
-- Authenticated = invited admins (matches existing project convention).
-- ------------------------------------------------------------
alter table public.gym_attendance_settings enable row level security;
alter table public.attendance_qr_tokens enable row level security;
alter table public.member_attendance_tokens enable row level security;
alter table public.attendance enable row level security;

drop policy if exists attendance_settings_read_admin on public.gym_attendance_settings;
create policy attendance_settings_read_admin on public.gym_attendance_settings
  for select to authenticated using (true);

drop policy if exists attendance_settings_write_admin on public.gym_attendance_settings;
create policy attendance_settings_write_admin on public.gym_attendance_settings
  for all to authenticated using (true) with check (true);

drop policy if exists qr_tokens_admin_all on public.attendance_qr_tokens;
create policy qr_tokens_admin_all on public.attendance_qr_tokens
  for all to authenticated using (true) with check (true);

drop policy if exists member_tokens_admin_all on public.member_attendance_tokens;
create policy member_tokens_admin_all on public.member_attendance_tokens
  for all to authenticated using (true) with check (true);

drop policy if exists attendance_admin_all on public.attendance;
create policy attendance_admin_all on public.attendance
  for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- SEED DEFAULTS (gym name copied from existing gym_settings row)
-- ------------------------------------------------------------
insert into public.gym_attendance_settings (id, gym_name)
select 1, coalesce((select gym_name from public.gym_settings where id = 1), 'FitGym')
on conflict (id) do nothing;
