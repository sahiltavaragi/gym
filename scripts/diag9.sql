select rolname, rolconfig from pg_roles where rolname in ('anon','authenticated','service_role');
