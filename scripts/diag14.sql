create table public._rls_t2(x int);
alter table public._rls_t2 enable row level security;
insert into public._rls_t2 values (42);
set role anon;
select 'rls_test' as src, count(*) as visible_rows from public._rls_t2;
select 'members' as src, count(*) as visible_members from public.members;
select 'attendance' as src, count(*) as visible_attendance from public.attendance;
