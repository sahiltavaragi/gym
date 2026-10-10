-- ============================================================
-- GYM MANAGEMENT SYSTEM — DATABASE SCHEMA
-- Project ref: tmdcgzevahtbpjsjfoyq
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- ENUM TYPES
-- ------------------------------------------------------------
do $$ begin
  create type member_status as enum ('active', 'expiring_soon', 'expired', 'inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invoice_status as enum ('pending', 'paid', 'overdue', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('upi', 'cash', 'card', 'online', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type whatsapp_status as enum ('pending', 'sent', 'delivered', 'failed');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- TABLES
-- ------------------------------------------------------------

-- Admin profile (1:1 with auth.users)
create table if not exists public.admins (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Admin',
  email text not null,
  role text not null default 'admin' check (role in ('admin','owner')),
  created_at timestamptz not null default now()
);

-- Gym settings (single row)
create table if not exists public.gym_settings (
  id int primary key default 1 check (id = 1),
  gym_name text not null default 'FitGym',
  logo_url text,
  address text,
  phone text,
  whatsapp_number text,
  email text,
  upi_id text,
  upi_display_name text,
  upi_qr_url text,
  cash_payment_enabled boolean not null default true,
  cash_payment_instructions text default 'Pay at the reception counter.',
  default_monthly_fee numeric(10,2) not null default 1000.00,
  default_due_day int not null default 10,
  whatsapp_template text,
  billing_month_offset int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Membership plans
create table if not exists public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  monthly_fee numeric(10,2) not null default 1000.00,
  duration_months int not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Members (admin-managed, no auth account)
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  profile_photo_url text,
  phone_number text,
  whatsapp_number text,
  date_of_birth date,
  gender text check (gender in ('male','female','other')),
  address text,
  emergency_contact text,
  joining_date date not null default current_date,
  membership_plan_id uuid references public.membership_plans(id) on delete set null,
  membership_start_date date,
  membership_end_date date,
  monthly_fee numeric(10,2) not null default 1000.00,
  status member_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Monthly health assessments (never overwrite)
create table if not exists public.health_assessments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  assessment_date date not null default current_date,
  weight_kg numeric(6,2),
  height_cm numeric(6,2),
  bmi numeric(5,2),
  body_fat_pct numeric(5,2),
  chest_cm numeric(6,2),
  waist_cm numeric(6,2),
  arms_cm numeric(6,2),
  thigh_cm numeric(6,2),
  blood_pressure text,
  resting_heart_rate int,
  notes text,
  trainer_notes text,
  created_at timestamptz not null default now(),
  unique (member_id, assessment_date)
);

-- Monthly health reports (snapshot of two consecutive assessments)
create table if not exists public.health_reports (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  report_month date not null, -- first day of report month
  current_assessment_id uuid references public.health_assessments(id) on delete set null,
  previous_assessment_id uuid references public.health_assessments(id) on delete set null,
  summary_text text,
  trainer_notes text,
  share_token uuid not null default gen_random_uuid() unique,
  token_expires_at timestamptz,
  token_revoked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (member_id, report_month)
);

-- Invoices (monthly bills)
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  billing_month date not null, -- first day of month
  amount numeric(10,2) not null,
  due_date date not null,
  status invoice_status not null default 'pending',
  payment_method payment_method,
  payment_date date,
  notes text,
  pay_token uuid not null default gen_random_uuid() unique,
  pay_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (member_id, billing_month)
);

-- Payments
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  amount numeric(10,2) not null,
  payment_method payment_method not null default 'cash',
  payment_date date not null default current_date,
  reference text,
  confirmed_by_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- WhatsApp message log
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  health_report_id uuid references public.health_reports(id) on delete set null,
  phone text,
  body text not null,
  report_link text,
  status whatsapp_status not null default 'pending',
  provider_message_id text,
  provider text not null default 'manual',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Audit logs
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------
create index if not exists idx_members_status on public.members(status);
create index if not exists idx_members_name on public.members(full_name);
create index if not exists idx_members_end_date on public.members(membership_end_date);
create index if not exists idx_assessments_member_date on public.health_assessments(member_id, assessment_date desc);
create index if not exists idx_reports_member_month on public.health_reports(member_id, report_month desc);
create index if not exists idx_reports_token on public.health_reports(share_token);
create index if not exists idx_invoices_member_month on public.invoices(member_id, billing_month desc);
create index if not exists idx_invoices_status on public.invoices(status);
create index if not exists idx_invoices_due on public.invoices(due_date);
create index if not exists idx_payments_member on public.payments(member_id);
create index if not exists idx_payments_date on public.payments(payment_date);
create index if not exists idx_wam_status on public.whatsapp_messages(status);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ------------------------------------------------------------
alter table public.admins enable row level security;
alter table public.gym_settings enable row level security;
alter table public.membership_plans enable row level security;
alter table public.members enable row level security;
alter table public.health_assessments enable row level security;
alter table public.health_reports enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.whatsapp_messages enable row level security;
alter table public.audit_logs enable row level security;

-- Admin-only: authenticated users get full access on admin data
-- (auth is invite-only: only admins created server-side can log in)
create policy "admins_all" on public.admins for all
  to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "settings_read_admin" on public.gym_settings for select to authenticated using (true);
create policy "settings_write_admin" on public.gym_settings for all to authenticated using (true) with check (true);
create policy "settings_public_payment" on public.gym_settings for select to anon using (true);

create policy "plans_all_admin" on public.membership_plans for all to authenticated using (true) with check (true);
create policy "plans_public_read" on public.membership_plans for select to anon using (is_active = true);

create policy "members_all_admin" on public.members for all to authenticated using (true) with check (true);
create policy "assessments_all_admin" on public.health_assessments for all to authenticated using (true) with check (true);
create policy "reports_all_admin" on public.health_reports for all to authenticated using (true) with check (true);
create policy "invoices_all_admin" on public.invoices for all to authenticated using (true) with check (true);
create policy "payments_all_admin" on public.payments for all to authenticated using (true) with check (true);
create policy "wam_all_admin" on public.whatsapp_messages for all to authenticated using (true) with check (true);
create policy "audit_read_admin" on public.audit_logs for select to authenticated using (true);
create policy "audit_insert_admin" on public.audit_logs for insert to authenticated with check (true);

-- Public token-based access: NO blanket policies for anon on
-- members/reports/invoices. Public pages fetch token-scoped rows
-- through RPC security definer functions below — RLS stays airtight.

-- ------------------------------------------------------------
-- FUNCTIONS / TRIGGERS
-- ------------------------------------------------------------

-- Auto-create admin profile on signup
create or replace function public.handle_new_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.admins (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', 'Admin'))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_admin();

-- Auto-compute BMI
create or replace function public.compute_bmi()
returns trigger language plpgsql as $$
begin
  if new.weight_kg is not null and new.height_cm is not null and new.height_cm > 0 then
    new.bmi := round(new.weight_kg / ((new.height_cm / 100.0) * (new.height_cm / 100.0))::numeric, 2);
  end if;
  return new;
end $$;

drop trigger if exists trg_compute_bmi on public.health_assessments;
create trigger trg_compute_bmi
  before insert or update on public.health_assessments
  for each row execute function public.compute_bmi();

-- Auto-update member status from membership_end_date
create or replace function public.update_member_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.membership_end_date is null then
    new.status := coalesce(new.status, 'active'::member_status);
  elsif new.membership_end_date < current_date then
    new.status := 'expired'::member_status;
  elsif new.membership_end_date <= current_date + interval '10 days' then
    new.status := 'expiring_soon'::member_status;
  else
    new.status := 'active'::member_status;
  end if;
  return new;
end $$;

-- Refresh status on membership end date change
drop trigger if exists trg_member_status on public.members;
create trigger trg_member_status
  before insert or update of membership_end_date, status on public.members
  for each row execute function public.update_member_status();

-- Mark overdue invoices
drop function if exists public.mark_overdue_invoices();
create function public.mark_overdue_invoices()
returns void language sql security definer set search_path = public as $$
  update public.invoices set status = 'overdue'
  where status = 'pending' and due_date < current_date;
$$;

-- Daily CRON to refresh member statuses & overdue bills (pg_cron if available)
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('gym-daily-refresh', '0 2 * * *', 'select public.mark_overdue_invoices();');
  end if;
end $$;

-- ------------------------------------------------------------
-- SECURE TOKEN-BASED PUBLIC ACCESS (security definer RPCs)
-- ------------------------------------------------------------

-- Public health-report fetch by token (only exposes that one row + member name)
create or replace function public.get_report_by_token(token uuid)
returns table (
  member_name text,
  report_month date,
  current_weight numeric, previous_weight numeric,
  body_fat numeric, previous_body_fat numeric,
  waist numeric, previous_waist numeric,
  bmi numeric, summary_text text, trainer_notes text,
  created_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare r public.health_reports%rowtype;
begin
  select * into r from public.health_reports hr
  where hr.share_token = token and not hr.token_revoked
    and (hr.token_expires_at is null or hr.token_expires_at > now());
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;

  return query
  select m.full_name, hr2.report_month,
    cur.weight_kg, prev.weight_kg,
    cur.body_fat_pct, prev.body_fat_pct,
    cur.waist_cm, prev.waist_cm,
    coalesce(cur.bmi, null), hr2.summary_text, coalesce(hr2.trainer_notes, cur.trainer_notes),
    hr2.created_at
  from public.health_reports hr2
  join public.members m on m.id = hr2.member_id
  left join public.health_assessments cur on cur.id = hr2.current_assessment_id
  left join public.health_assessments prev on prev.id = hr2.previous_assessment_id
  where hr2.id = r.id;
end $$;

grant execute on function public.get_report_by_token(uuid) to anon, authenticated;

-- Public payment-page fetch by token
create or replace function public.get_invoice_by_token(token uuid)
returns table (
  gym_name text, upi_id text, upi_display_name text, upi_qr_url text,
  cash_enabled boolean, cash_instructions text,
  member_name text, billing_month date, amount numeric, due_date date,
  status text
) language plpgsql security definer set search_path = public as $$
declare r public.invoices%rowtype;
begin
  select * into r from public.invoices iv
  where iv.pay_token = token
    and (iv.pay_token_expires_at is null or iv.pay_token_expires_at > now())
    and iv.status in ('pending','overdue');
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;

  return query
  select gs.gym_name, gs.upi_id, gs.upi_display_name, gs.upi_qr_url,
    gs.cash_payment_enabled, gs.cash_payment_instructions,
    m.full_name, iv.billing_month, iv.amount, iv.due_date, iv.status::text
  from public.invoices iv2
  join public.members m on m.id = iv2.member_id
  cross join public.gym_settings gs
  where iv2.id = r.id;
end $$;

grant execute on function public.get_invoice_by_token(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- SEED DEFAULTS
-- ------------------------------------------------------------
insert into public.gym_settings (id) values (1) on conflict (id) do nothing;

insert into public.membership_plans (name, monthly_fee, duration_months)
values ('Monthly', 1000.00, 1), ('Quarterly', 2700.00, 3), ('Yearly', 9600.00, 12)
on conflict (name) do nothing;
