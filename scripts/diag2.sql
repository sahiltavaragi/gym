select c.relname, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls,
       coalesce(p.rolbypassrls, false) as anon_bypasses_rls,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_has_select
from pg_class c
left join pg_roles p on p.rolname = 'anon'
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('attendance','gym_attendance_settings','attendance_qr_tokens','member_attendance_tokens')
order by c.relname;
