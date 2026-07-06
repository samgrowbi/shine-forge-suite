// Sofia chatbot: per-treatment Acuity intake field definitions.
// Kept separate from src/config/treatments.ts so booking pages remain untouched.
//
// When the Acuity plan is upgraded and the acuity-forms API returns 200 for a
// given appointmentTypeID, hardcode the real numeric Acuity field IDs here and
// mirror the same list in supabase/functions/skin-specialist-chat/index.ts.

export type IntakeFieldType =
  | "checkboxes"
  | "radio"
  | "select"
  | "text"
  | "textarea"
  | "yesno";

export interface IntakeField {
  acuityFieldId: number;
  label: string;
  type: IntakeFieldType;
  options?: string[];
  required: boolean;
  helpText?: string;
}

// The list of treatment slugs Sofia is allowed to book right now.
// Add a slug here only after its appointmentTypeId is confirmed working in Acuity.
export const SOFIA_ACTIVE_TREATMENT_SLUGS: readonly string[] = [
  "non-surgical-face-neck-lift",
] as const;

// Intake fields per active treatment. Empty array = only universal contact
// fields are collected (first name, last name, email, phone).
// TODO(intake): populate once Acuity Powerhouse API access is enabled and the
// real numeric field IDs are known.
export const SOFIA_INTAKE_FIELDS: Record<string, IntakeField[]> = {
  "non-surgical-face-neck-lift": [],
};

export function getSofiaIntakeFields(slug: string): IntakeField[] {
  return SOFIA_INTAKE_FIELDS[slug] ?? [];
}