
update public.gym_attendance_settings
set latitude = 12.9716, longitude = 77.5946, location_configured = true,
    allowed_radius_meters = 50, max_gps_accuracy_meters = 50,
    duplicate_policy = 'daily', timezone = 'Asia/Kolkata',
    qr_mode = 'rotating', qr_validity_seconds = 60
where id = 1;

insert into public.members (full_name, phone_number, status)
values ('E2E Test Member', '9999999999', 'active');
insert into public.member_attendance_tokens (member_id, token_hash)
select id, 'bb390b934504840a05c3dc42f37d6529ef4020b8da07cee1c55536fe08d5c246' from public.members where full_name = 'E2E Test Member';

insert into public.members (full_name, phone_number, status)
values ('E2E Race Member', '8888888888', 'active');
insert into public.member_attendance_tokens (member_id, token_hash)
select id, '011f15643f4616a60436b7a0a939317330973ae9d551ef77d6763aa1b9446b4d' from public.members where full_name = 'E2E Race Member';

insert into public.attendance_qr_tokens (token_hash, mode, expires_at)
values ('ace6a45fc53f8a208f138818db5a482825c4437d2a01252629a34f337f779618', 'rotating', now() + interval '10 minutes');
insert into public.attendance_qr_tokens (token_hash, mode, expires_at)
values ('24f1f620743189d8987fc2aa6331d90d8d0152846473e188294051c87c60256c', 'rotating', now() - interval '1 minute');

select 'PREP_OK' as status;

