create or replace function public._probe_members()
returns text language plpgsql as $fn$
declare r text;
begin
  execute 'set role anon';
  begin
    perform count(*) from public.members;
    r := 'members_READ_OK (anon bypasses RLS!)';
  exception when insufficient_privilege then
    r := 'members_DENIED (good)';
  end;
  execute 'reset role';
  return r;
end $fn$;
