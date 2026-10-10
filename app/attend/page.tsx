import { AttendanceFlow } from "./attend-flow";

export const dynamic = "force-dynamic";

export default async function AttendPage({
  searchParams,
}: {
  searchParams: Promise<{ qr?: string }>;
}) {
  const { qr } = await searchParams;
  return <AttendanceFlow qrToken={qr ?? null} />;
}
