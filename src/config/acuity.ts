// Centralized configuration for the Acuity integration.
// Keep IDs as strings to match how they are passed through query params / JSON.

import treatmentImage from "@/assets/treatment-facial.webp";

export const DEFAULT_ACUITY_APPOINTMENT_TYPE_ID = "95406341";
export const DEFAULT_ACUITY_CALENDAR_ID = "14289823";
export const DEFAULT_ACUITY_TIMEZONE = "America/Los_Angeles";

// Local treatment image for use with dynamic API data
export const TREATMENT_IMAGE = treatmentImage;

// Promotional price override (API returns full price)
export const PROMOTIONAL_PRICE = "79.99";

// Fallback details if API fails
export const TREATMENT_DETAILS_FALLBACK = {
  id: 95406341,
  name: "Treatment",
  description: "",
  duration: 60,
  price: PROMOTIONAL_PRICE,
  category: "Treatment",
  color: "#8B5CF6",
  image: treatmentImage,
};

// ---- Deposit checkout (Acuity-hosted) ----
// Acuity's API bookings (admin: true) skip payment, so treatments that require a
// deposit hand the client off to Acuity's own scheduler for the selected slot,
// where the Square deposit is collected before the appointment is confirmed.
export const ACUITY_SCHEDULER_HASH = "ce401de1";
export const DEPOSIT_AMOUNT = "20.00";

export function buildAcuityCheckoutUrl(opts: {
  appointmentTypeId: string;
  calendarId: string;
  datetime: string; // ISO string from Acuity, e.g. 2026-10-13T17:30:00-0700
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}): string {
  const { appointmentTypeId, calendarId, datetime } = opts;
  const base =
    `https://app.acuityscheduling.com/schedule/${ACUITY_SCHEDULER_HASH}` +
    `/appointment/${appointmentTypeId}` +
    `/calendar/${calendarId}` +
    `/datetime/${encodeURIComponent(datetime)}`;
  const params = new URLSearchParams();
  params.append("appointmentTypeIds[]", appointmentTypeId);
  // Prefill client details so they don't retype them on Acuity
  if (opts.firstName) params.set("firstName", opts.firstName);
  if (opts.lastName) params.set("lastName", opts.lastName);
  if (opts.email) params.set("email", opts.email);
  if (opts.phone) params.set("phone", opts.phone);
  return `${base}?${params.toString()}`;
}
