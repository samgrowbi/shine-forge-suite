import { useEffect } from "react";
import { DEFAULT_ACUITY_APPOINTMENT_TYPE_ID } from "@/config/acuity";

// Acuity owner ID (from the account's scheduling page URL)
const ACUITY_OWNER_ID = "39766885";
const EMBED_SCRIPT = "https://embed.acuityscheduling.com/js/embed.js";

interface AcuityEmbedProps {
  className?: string;
  appointmentTypeId?: string;
  calendarId?: string;
}

export function AcuityEmbed({
  className = "",
  appointmentTypeId = DEFAULT_ACUITY_APPOINTMENT_TYPE_ID,
  calendarId,
}: AcuityEmbedProps) {
  useEffect(() => {
    if (document.querySelector(`script[src="${EMBED_SCRIPT}"]`)) return;
    const script = document.createElement("script");
    script.src = EMBED_SCRIPT;
    script.async = true;
    document.body.appendChild(script);
  }, []);

  const params = new URLSearchParams({ owner: ACUITY_OWNER_ID, appointmentType: appointmentTypeId });
  if (calendarId) params.set("calendarID", calendarId);
  const embedUrl = `https://app.acuityscheduling.com/schedule.php?${params.toString()}`;

  return (
    <div className={className}>
      <iframe
        src={embedUrl}
        title="Schedule Appointment"
        width="100%"
        height="900"
        frameBorder="0"
        allow="payment"
        className="rounded-lg"
        style={{ minHeight: "700px" }}
      />
    </div>
  );
}
