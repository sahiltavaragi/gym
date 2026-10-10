select c.relname, pg_get_userbyid(c.relowner) as owner, c.relrowsecurity
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('attendance','gym_attendance_settings','attendance_qr_tokens','member_attendance_tokens')
order by c.relname;
