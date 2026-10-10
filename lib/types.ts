export type MemberStatus = "active" | "expiring_soon" | "expired" | "inactive";
export type InvoiceStatus = "pending" | "paid" | "overdue" | "cancelled";
export type PaymentMethod = "upi" | "cash" | "card" | "online" | "other";
export type WhatsAppStatus = "pending" | "sent" | "delivered" | "failed";

export interface Member {
  id: string;
  full_name: string;
  profile_photo_url: string | null;
  phone_number: string | null;
  whatsapp_number: string | null;
  date_of_birth: string | null;
  gender: "male" | "female" | "other" | null;
  address: string | null;
  emergency_contact: string | null;
  joining_date: string;
  membership_plan_id: string | null;
  membership_start_date: string | null;
  membership_end_date: string | null;
  monthly_fee: number;
  status: MemberStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipPlan {
  id: string;
  name: string;
  monthly_fee: number;
  duration_months: number;
  is_active: boolean;
}

export interface HealthAssessment {
  id: string;
  member_id: string;
  assessment_date: string;
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  body_fat_pct: number | null;
  chest_cm: number | null;
  waist_cm: number | null;
  arms_cm: number | null;
  thigh_cm: number | null;
  blood_pressure: string | null;
  resting_heart_rate: number | null;
  notes: string | null;
  trainer_notes: string | null;
  created_at: string;
}

export interface HealthReport {
  id: string;
  member_id: string;
  report_month: string;
  current_assessment_id: string | null;
  previous_assessment_id: string | null;
  summary_text: string | null;
  trainer_notes: string | null;
  share_token: string;
  token_expires_at: string | null;
  token_revoked: boolean;
  created_at: string;
}

export interface Invoice {
  id: string;
  member_id: string;
  billing_month: string;
  amount: number;
  due_date: string;
  status: InvoiceStatus;
  payment_method: PaymentMethod | null;
  payment_date: string | null;
  notes: string | null;
  pay_token: string;
  pay_token_expires_at: string | null;
  created_at: string;
  member?: Member;
}

export interface Payment {
  id: string;
  invoice_id: string;
  member_id: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  reference: string | null;
  confirmed_by_admin: boolean;
  created_at: string;
  member?: Member;
  invoice?: Invoice;
}

export interface WhatsAppMessage {
  id: string;
  member_id: string | null;
  invoice_id: string | null;
  health_report_id: string | null;
  phone: string | null;
  body: string;
  report_link: string | null;
  status: WhatsAppStatus;
  provider: string;
  provider_message_id: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_at: string;
  member?: Member;
}

export interface GymSettings {
  id: number;
  gym_name: string;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  email: string | null;
  upi_id: string | null;
  upi_display_name: string | null;
  upi_qr_url: string | null;
  cash_payment_enabled: boolean;
  cash_payment_instructions: string | null;
  default_monthly_fee: number;
  default_due_day: number;
  whatsapp_template: string | null;
}

export type QrMode = "rotating" | "permanent";
export type DuplicatePolicy = "daily" | "multiple";
export type AttendanceStatus = "present" | "voided";
export type AttendanceVerification = "qr_gps" | "manual";
export type AttendanceEvent = "check_in" | "check_out";

export interface AttendanceSettings {
  id: number;
  gym_name: string;
  latitude: number | null;
  longitude: number | null;
  allowed_radius_meters: number;
  max_gps_accuracy_meters: number;
  timezone: string;
  qr_validity_seconds: number;
  qr_mode: QrMode;
  duplicate_policy: DuplicatePolicy;
  location_configured: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface AttendanceMemberRef {
  id: string;
  full_name: string;
  phone_number: string | null;
  status: MemberStatus;
}

export interface AttendanceRecord {
  id: string;
  member_id: string;
  event_type: AttendanceEvent;
  check_in_at: string;
  attendance_date: string;
  status: AttendanceStatus;
  distance_meters: number | null;
  gps_accuracy_meters: number | null;
  verification_method: AttendanceVerification;
  confirmation_reference: string;
  correction_reason: string | null;
  corrected_by: string | null;
  corrected_at: string | null;
  recorded_by: string | null;
  qr_token_id: string | null;
  created_at: string;
  member?: AttendanceMemberRef;
}

export interface MemberAttendanceToken {
  id: string;
  member_id: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_by: string | null;
}

export interface AuditLog {
  id: string;
  admin_id: string | null;
  action: string;
  entity: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}
