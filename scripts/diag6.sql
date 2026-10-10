select r.rolname, r.rolbypassrls, r.rolsuper from pg_roles r where pg_has_role('anon', r.oid, 'member');
