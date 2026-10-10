/* E2E tests against the running production build. */
import { readFileSync } from "node:fs";

const BASE = "http://localhost:3000";
const j = JSON.parse(readFileSync(new URL("./tokens.json", import.meta.url), "utf8"));

const GYM_LAT = 12.9716;
const GYM_LNG = 77.5946;
const DEG = 1 / 111194.9266;
const INSIDE = { latitude: GYM_LAT + 18 * DEG, longitude: GYM_LNG, accuracy: 15 };
const FAR = { latitude: GYM_LAT + 300 * DEG, longitude: GYM_LNG, accuracy: 15 };

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}  →  ${detail}`);
  }
}

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

// ---1. context: valid scan, no identity yet
{
  const r = await post("/api/attendance/context", { qrToken: j.qr });
  check(
    "context: valid QR → gym info, needs identity",
    r.status === 200 && r.json?.data?.needsIdentity === true && r.json?.data?.gym?.name,
    JSON.stringify(r)
  );
}

// ---2. context: identity via member token
{
  const r = await post("/api/attendance/context", { qrToken: j.qr, memberToken: j.mem });
  check(
    "context: member token → identity confirmed",
    r.status === 200 &&
      r.json?.data?.member?.name === "E2E Test Member" &&
      r.json?.data?.member?.eligible === true,
    JSON.stringify(r)
  );
}

// ---3. context: garbage QR
{
  const r = await post("/api/attendance/context", { qrToken: "DOESNOTEXIST123" });
  check("context: unknown QR → 403 QR_INVALID", r.status === 403 && r.json?.error?.code === "QR_INVALID", JSON.stringify(r));
}

// ---4. context: expired QR (server-side clock, not JS)
{
  const r = await post("/api/attendance/context", { qrToken: j.expired });
  check("context: expired QR → 403 QR_EXPIRED", r.status === 403 && r.json?.error?.code === "QR_EXPIRED", JSON.stringify(r));
}

// ---5. mark: valid member, valid QR,18 m away (spec happy path)
let firstRef = null;
{
  const r = await post("/api/attendance/mark", { qrToken: j.qr, memberToken: j.mem, ...INSIDE, clientTimestamp: new Date().toISOString() });
  firstRef = r.json?.data?.reference;
  check(
    "mark: inside radius → success + reference + name",
    r.status === 200 &&
      typeof firstRef === "string" &&
      r.json?.data?.memberName === "E2E Test Member" &&
      typeof r.json?.data?.distanceMeters === "number" &&
      r.json.data.distanceMeters <= 20,
    JSON.stringify(r)
  );
}

// ---6. mark again same day → duplicate
{
  const r = await post("/api/attendance/mark", { qrToken: j.qr, memberToken: j.mem, ...INSIDE });
  check("mark: second scan same day → 409 ALREADY_CHECKED_IN", r.status === 409 && r.json?.error?.code === "ALREADY_CHECKED_IN", JSON.stringify(r));
  check("duplicate message matches spec copy", r.json?.error?.message === "Your attendance has already been recorded today.", r.json?.error?.message);
}

// ---7. mark far away → outside radius (distance checked before duplicate)
{
  const r = await post("/api/attendance/mark", { qrToken: j.qr, memberToken: j.mem, ...FAR });
  check("mark:300 m away → 403 OUTSIDE_RADIUS", r.status === 403 && r.json?.error?.code === "OUTSIDE_RADIUS", JSON.stringify(r));
}

// ---8. mark with poor accuracy
{
  const r = await post("/api/attendance/mark", { qrToken: j.qr, memberToken: j.mem, ...INSIDE, accuracy: 60 });
  check("mark: ±60 m accuracy → 422 GPS_ACCURACY_INSUFFICIENT", r.status === 422 && r.json?.error?.code === "GPS_ACCURACY_INSUFFICIENT", JSON.stringify(r));
}

// ---9. mark with expired QR
{
  const r = await post("/api/attendance/mark", { qrToken: j.expired, memberToken: j.mem, ...INSIDE });
  check("mark: expired QR → 403 QR_EXPIRED", r.status === 403 && r.json?.error?.code === "QR_EXPIRED", JSON.stringify(r));
}

// ---10. mark with invalid member token
{
  const r = await post("/api/attendance/mark", { qrToken: j.qr, memberToken: "TOTALLY-BOGUS-CODE", ...INSIDE });
  check("mark: invalid member token → 403 MEMBER_TOKEN_INVALID", r.status === 403 && r.json?.error?.code === "MEMBER_TOKEN_INVALID", JSON.stringify(r));
}

// ---11. malformed body
{
  const r = await post("/api/attendance/mark", { qrToken: j.qr });
  check("mark: malformed body → 400", r.status === 400, String(r.status));
}

// ---12. admin QR endpoint without session →401
{
  const res = await fetch(BASE + "/api/attendance/qr", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  check("qr endpoint: no admin session → 401", res.status === 401, String(res.status));
}

// ---13. admin pages redirect to login (middleware)
{
  const res = await fetch(BASE + "/attendance", { redirect: "manual" });
  const loc = res.headers.get("location") || "";
  check("middleware: /attendance unauthenticated → login redirect", res.status >= 300 && res.status < 400 && loc.includes("/auth/login"), `${res.status} ${loc}`);
}

// ---14. public attendance page renders
{
  const res = await fetch(BASE + `/attend?qr=${j.qr}`);
  const html = await res.text();
  check("page: /attend?qr= renders200", res.status === 200 && html.includes("Mark your attendance"), String(res.status));
}
{
  const res = await fetch(BASE + `/attend/me/${j.mem}`);
  const html = await res.text();
  check("page: /attend/me/<token> renders member link", res.status === 200 && html.includes("E2E Test Member"), String(res.status));
}

// ---15. CONCURRENCY: two simultaneous check-ins for the race member
{
  const payload = { qrToken: j.qr, memberToken: j.raceMem, ...INSIDE };
  const [a, b] = await Promise.all([post("/api/attendance/mark", payload), post("/api/attendance/mark", payload)]);
  const codes = [a.status, b.status].sort();
  const successes = [a, b].filter((r) => r.status === 200).length;
  check(
    "race: two simultaneous marks → exactly one recorded",
    successes === 1 && codes[1] === 409,
    `statuses=${JSON.stringify(codes)} a=${JSON.stringify(a.json)} b=${JSON.stringify(b.json)}`
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
