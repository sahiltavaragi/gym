create or replace function public._rls_probe()
returns text language plpgsql as $fn$
declare
  who text;
begin
  execute 'set role anon';
  select current_user into who;
  begin
    execute 'set local row_security = on';
    perform count(*) from public.attendance;
    execute 'reset role';
    return who || ' | SELECT_OK (RLS NOT enforced!)';
  exception when insufficient_privilege then
    execute 'reset role';
    return who || ' | DENIED (good)';
  end;
end $fn$;
