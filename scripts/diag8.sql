set role anon;
select count(*) as cnt_from_attendance from public.attendance;
reset role;
