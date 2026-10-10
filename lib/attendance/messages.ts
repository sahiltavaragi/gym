import type { AttendanceErrorCode } from "./core";

/**
 * Member-facing copy for every failure mode. Messages are safe to show:
 * they never expose internals, credentials or other members' data.
 * Server responses carry these codes (and may override with an equally
 * safe message), so the UI always explains the next step.
 */
export const ATTENDANCE_MESSAGES: Record<AttendanceErrorCode, string> = {
  QR_MISSING:
    "No gym QR code detected. Scan the QR code posted at the gym entrance, then try again.",
  QR_EXPIRED:
    "This QR code has expired. Scan the current QR code at the gym entrance.",
  QR_INVALID:
    "This QR code is not valid. Scan the current QR code at the gym entrance.",
  MEMBER_TOKEN_REQUIRED: "Enter your personal attendance code to continue.",
  MEMBER_TOKEN_INVALID:
    "Member token invalid or revoked. Ask the front desk for a new attendance link.",
  GYM_NOT_CONFIGURED:
    "Attendance is not set up yet. Please contact the gym front desk.",
  INVALID_COORDINATES:
    "We could not read a valid location from your device. Make sure GPS is on and try again.",
  GPS_ACCURACY_INSUFFICIENT:
    "Your GPS accuracy is too low for a reliable check-in. Move near a window or outdoors with a clear view of the sky, wait a few seconds, and try again.",
  OUTSIDE_RADIUS:
    "You appear to be outside the gym's allowed area. Please check in from inside the gym.",
  MEMBER_INELIGIBLE:
    "Membership inactive or attendance not allowed. Please contact the front desk.",
  ALREADY_CHECKED_IN: "Your attendance has already been recorded today.",
  PERMISSION_DENIED:
    "Location permission denied. Allow location access for this site in your browser settings, then tap Verify Location again.",
  LOCATION_UNAVAILABLE:
    "Could not get your location. Turn on your phone's GPS/Location services and try again.",
  NETWORK:
    "Temporary problem reaching the server. Check your internet connection and try again.",
  RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
  SERVER_ERROR: "Temporary server error. Please try again in a moment.",
};

export function attendanceMessage(
  code: string | undefined | null,
  fallback = ATTENDANCE_MESSAGES.SERVER_ERROR
): string {
  if (code && code in ATTENDANCE_MESSAGES) {
    return ATTENDANCE_MESSAGES[code as AttendanceErrorCode];
  }
  return fallback;
}
