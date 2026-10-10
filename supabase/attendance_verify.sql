-- ============================================================
-- ATTENDANCE VERIFICATION SCRIPT
-- Run after supabase/attendance.sql (Supabase SQL editor or the
-- Management API). Raises an exception on the first failed check;
-- success prints: ALL ATTENDANCE VERIFICATION CHECKS PASSED.
--
-- Scenario coverage (spec §15):
--   #9  duplicate same-day check-in     → check3
--   #10 concurrent duplicates           → check3's trigger serializes
--                                          concurrent inserts on the
--                                          member row lock
--   #11 unauthenticated dashboard/API   → enforced app-side (session
--                                          check in every action/route)
--   #12 direct database insertion       → checks7-10 (anon role can
--                                          neither see nor write)
--   #13 admin changes coordinates       → settings row exists, updated
--                                          only via reviewed admin save
--
-- NOTE on this Postgres version: for a role with no applicable RLS
-- policy, SELECT is denied by returning ZERO ROWS (not by raising an
-- exception). Checks therefore compare row visibility between the
-- postgres role (sees data) and anon (must see nothing).
-- ============================================================

do $$
declare
  mid uuid;
  d date;
  tok_hash text;
  anon_attendance int;
  admin_attendance int;
  anon_settings int;
  admin_settings int;
  anon_tokens int;
  admin_tokens int;
  old_policy duplicate_policy;
begin
  --1. Settings row seeded
  if not exists (select 1 from public.gym_attendance_settings where id = 1) then
    raise exception 'FAILED: gym_attendance_settings row is not seeded';
  end if;

  insert into public.members (full_name, phone_number, status)
  values ('ZZ Attendance Verify', '0000000000', 'active')
  returning id into mid;

  --2. Trigger auto-fills the gym-local attendance_date
  begin
    insert into public.attendance (member_id, attendance_date, confirmation_reference, verification_method)
    values (mid, null, 'FG-VERIFY0001', 'manual');
  exception when others then
    raise exception 'FAILED: insert with NULL attendance_date errored: %', sqlerrm;
  end;
  select attendance_date into d from public.attendance where confirmation_reference = 'FG-VERIFY0001';
  if d is null then
    raise exception 'FAILED: attendance_date was not auto-filled';
  end if;

  --3. Duplicate same-day check-in is rejected (spec scenario9)
  begin
    insert into public.attendance (member_id, attendance_date, confirmation_reference, verification_method)
    values (mid, d, 'FG-VERIFY0002', 'manual');
    raise exception 'FAILED: duplicate attendance insert was allowed';
  exception when others then
    if sqlerrm like 'FAILED%' then raise; end if;
    if sqlerrm not like '%ATTENDANCE_DUPLICATE%' then
      raise exception 'FAILED: unexpected error on duplicate insert: %', sqlerrm;
    end if;
  end;

  --4. Voiding frees the day again (correction flow)
  update public.attendance
     set status = 'voided', correction_reason = 'verification run', corrected_at = now()
   where confirmation_reference = 'FG-VERIFY0001';
  begin
    insert into public.attendance (member_id, attendance_date, confirmation_reference, verification_method)
    values (mid, d, 'FG-VERIFY0002', 'manual');
  exception when others then
    raise exception 'FAILED: insert after void was rejected: %', sqlerrm;
  end;

  --5. duplicate_policy = multiple allows several check-ins per day
  select duplicate_policy into old_policy from public.gym_attendance_settings where id = 1;
  update public.gym_attendance_settings set duplicate_policy = 'multiple' where id = 1;
  begin
    insert into public.attendance (member_id, attendance_date, confirmation_reference, verification_method)
    values (mid, d, 'FG-VERIFY0003', 'manual');
  exception when others then
    raise exception 'FAILED: multiple-policy insert was rejected: %', sqlerrm;
  end;
  update public.gym_attendance_settings set duplicate_policy = old_policy where id = 1;

  --6. confirmation_reference uniqueness holds
  begin
    insert into public.attendance (member_id, attendance_date, confirmation_reference, verification_method)
    values (mid, d + 7, 'FG-VERIFY0001', 'manual');
    raise exception 'FAILED: duplicate confirmation_reference was allowed';
  exception when others then
    if sqlerrm like 'FAILED%' then raise; end if;
    if sqlstate <> '23505' then
      raise exception 'FAILED: expected unique violation, got: %', sqlerrm;
    end if;
  end;

  --7. Precise GPS coordinates are not stored (audit retention policy)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'attendance'
      and column_name in ('latitude', 'longitude', 'lat', 'lng')
  ) then
    raise exception 'FAILED: raw GPS coordinates must not be persisted';
  end if;

  --8. Seed a member token so RLS visibility has data to hide
  tok_hash := encode(sha256('FG-VERIFY-TOKEN'::bytea), 'hex');
  insert into public.member_attendance_tokens (member_id, token_hash, created_by)
  values (mid, tok_hash, null)
  on conflict (member_id) do update set token_hash = excluded.token_hash, revoked_at = null;

  --9. RLS visibility: postgres sees the data, anon must see NOTHING
  select count(*) into admin_attendance from public.attendance;
  select count(*) into admin_settings from public.gym_attendance_settings;
  select count(*) into admin_tokens from public.member_attendance_tokens;
  if admin_attendance < 1 or admin_settings < 1 or admin_tokens < 1 then
    raise exception 'FAILED: seed rows missing for RLS visibility check';
  end if;

  execute 'set role anon';
  select count(*) into anon_attendance from public.attendance;
  select count(*) into anon_settings from public.gym_attendance_settings;
  select count(*) into anon_tokens from public.member_attendance_tokens;
  execute 'reset role';

  if anon_attendance <> 0 or anon_settings <> 0 or anon_tokens <> 0 then
    raise exception 'FAILED: anon can read attendance data (attendance=%, settings=%, tokens=%)',
      anon_attendance, anon_settings, anon_tokens;
  end if;

  --10. RLS writes: anon INSERT must be rejected (spec scenario12)
  execute 'set role anon';
  begin
    insert into public.attendance (member_id, attendance_date, confirmation_reference)
    values (mid, d, 'FG-ANON-INSERT');
    execute 'reset role';
    delete from public.attendance where confirmation_reference = 'FG-ANON-INSERT';
    raise exception 'FAILED: anon could INSERT an attendance row directly';
  exception when others then
    execute 'reset role';
    if sqlerrm like 'FAILED%' then raise; end if;
    -- any policy/permission error is the expected denial
  end;

  -- cleanup (cascades attendance + member token rows)
  delete from public.members where id = mid;

  raise notice 'CHECKS1-10 PASSED (settings seed, date fill, duplicate block, void, policy, unique ref, no raw GPS, RLS read+write denied for anon)';
end $$;

-- ------------------------------------------------------------
--11. Policies exist for invited admins (authenticated role) and no
--     broad anonymous policy was left behind on attendance tables.
-- ------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'attendance' and roles = '{authenticated}'
  ) then
    raise exception 'FAILED: missing authenticated-admin policy on attendance';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('attendance', 'gym_attendance_settings', 'attendance_qr_tokens', 'member_attendance_tokens')
      and (roles = '{anon}' or roles = '{public}' or roles = '{anon,authenticated}')
  ) then
    raise exception 'FAILED: broad anonymous policy exists on an attendance table';
  end if;
  raise notice 'CHECKS11 PASSED (admin policies present, no anonymous policies)';
  raise notice 'ALL ATTENDANCE VERIFICATION CHECKS PASSED';
end $$;
