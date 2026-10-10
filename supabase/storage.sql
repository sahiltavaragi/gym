insert into storage.buckets (id, name, public) values ('gym-media','gym-media', true) on conflict (id) do nothing;

drop policy if exists read_gym_media on storage.objects;
create policy read_gym_media on storage.objects
  for select using (bucket_id = 'gym-media');

drop policy if exists upload_gym_media on storage.objects;
create policy upload_gym_media on storage.objects
  for insert to authenticated with check (bucket_id = 'gym-media');

drop policy if exists update_gym_media on storage.objects;
create policy update_gym_media on storage.objects
  for update to authenticated using (bucket_id = 'gym-media');

drop policy if exists delete_gym_media on storage.objects;
create policy delete_gym_media on storage.objects
  for delete to authenticated using (bucket_id = 'gym-media');
