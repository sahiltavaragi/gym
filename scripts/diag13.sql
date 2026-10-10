create table public._rls_test(x int);
alter table public._rls_test enable row level security;
set role anon;
select current_user as u, count(*) as c from public._rls_test;
