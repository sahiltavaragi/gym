select
 (select relrowsecurity from pg_class where relname='members' and relnamespace='public'::regnamespace) as members_rls_enabled,
 (select count(*) from pg_policies where schemaname='public' and tablename='members') as members_policy_count,
 (select array_agg(policyname || ':' || cmd || ':' || roles::text) from pg_policies where schemaname='public' and tablename='attendance') as attendance_policies;
