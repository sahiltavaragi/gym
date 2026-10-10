This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Deploy on Render

This repository includes a Render Blueprint in [render.yaml](render.yaml) for a Node.js web service. To deploy:

1. Push this repository to GitHub or GitLab.
2. In Render, choose **New → Blueprint**, connect the repository, and deploy the Blueprint.
3. Enter the required environment values when prompted. Set `NEXT_PUBLIC_APP_URL` to the HTTPS URL Render assigns to the service (or your custom domain), then deploy/redeploy so it is included in the build.
4. In Supabase Authentication settings, set the Site URL to the production URL and add the production `/auth/update-password` URL to the allowed redirect URLs. Also add the production URL to any relevant OAuth provider settings.
5. Confirm the Supabase `gym-media` storage bucket and its intended access policy are configured for QR uploads.

Required Render environment variables:

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase publishable/anon key.
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service-role secret; keep this server-only and never expose it in client code or commit it.
- `NEXT_PUBLIC_APP_URL` — public HTTPS origin of the deployed site, with no trailing slash.

The Blueprint uses the paid Starter instance to avoid the sleep/wake delay of a free instance. Render injects the listening port automatically; do not hard-code `PORT`. Keep all Supabase keys in Render's environment settings, not in the repository.

## Attendance (QR + Live GPS)

Members scan the gym's QR code, confirm their identity with their personal attendance token, verify their GPS position, and the server records the check-in.

### Database setup

1. Run `supabase/attendance.sql` in the Supabase SQL editor (or via the Management API). It is additive and idempotent — it creates `gym_attendance_settings`, `attendance_qr_tokens`, `member_attendance_tokens` and `attendance`, a race-safe duplicate-prevention trigger, and RLS policies. **No existing tables are modified.**
2. Run `supabase/attendance_verify.sql` — it asserts the duplicate trigger, correction flow, policy switching, unique references, "no raw GPS stored", and that `anon` is denied on every attendance table. It raises an exception if any check fails.

### First-time configuration

1. **Settings → Attendance**: enter the gym coordinates (*Use my current location* or manual entry), radius (default50 m), max GPS accuracy (default50 m), timezone (default `Asia/Kolkata`), QR validity (default60 s), QR mode and duplicate policy. Coordinates must be **reviewed and confirmed** before they go live.
2. **Attendance → QR Display** (`/attendance/qr`): show at the entrance. Rotating mode refreshes the code automatically with an overlap so it is always scannable; use *Large*/*Full screen* for distance. Printing requires the permanent-QR fallback (weaker security — the UI explains why).
3. **Members → member profile → Attendance tab**: *Generate* produces the member's personal link (`/attend/me/<token>`) and typed code (`ABCD-EFGH-JKMN-PQRS`), revealed **once**; only a SHA-256 hash is stored. Admins can revoke/regenerate any time.

### How validation works

The browser supplies only raw GPS + opaque tokens to three server-side endpoints:

- `POST /api/attendance/context` — validates the scanned QR and the member token, returns identity + gym display data only.
- `POST /api/attendance/mark` — validates QR authenticity/expiry/revocation, membership eligibility, coordinate ranges, GPS accuracy, computes the Haversine distance against trusted settings, checks the duplicate policy, then inserts. The DB trigger is the race-proof duplicate guard. The browser is never trusted about distance, identity or time.
- `POST /api/attendance/qr` — admin-session-only endpoint that issues QR nonces (hashes stored, plaintext returned only to the admin display).

Environment variables are unchanged: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public) and `SUPABASE_SERVICE_ROLE_KEY` (server-only — never expose it to the browser). `NEXT_PUBLIC_APP_URL` must be the HTTPS origin of the Render deployment, otherwise browsers refuse geolocation.

### Security notes / limitations

- RLS: **no anon policies** on any attendance table; members cannot read or write attendance data directly. All public flows go through the server endpoints above, and every admin action re-verifies the caller's session and writes an audit-log entry.
- Tokens are cryptographically random, stored only as hashes, revocable, and never appear in member lists or QR payloads beyond their own opaque value. No OTP/SMS is used.
- GPS is **not foolproof presence proof** — browser locations can be spoofed. It is a convenience deterrent, and the member-facing UI says so.
- Raw GPS coordinates are never persisted; only distance and accuracy are stored for audit.

### Tests

```bash
npm test        # vitest: validation matrix (radius, accuracy, expiry, revocation,
                # eligibility, duplicates, timezone boundaries, token handling)
```

Database-level checks (duplicate race guard, RLS) are in `supabase/attendance_verify.sql`; UI checks (permission prompts, small screens, network loss) are listed in the feature spec §15 and are exercised manually against a deployed instance.
