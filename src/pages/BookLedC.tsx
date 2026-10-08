import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar } from "lucide-react";
import { AcuityEmbed } from "@/components/AcuityEmbed";
import { LED_C_TREATMENT } from "@/config/treatments";
import { BRAND_NAME } from "@/config/brand";

// Deposit booking: Acuity's own scheduler collects the $20 deposit (Square) before confirming the slot.
const BookLedC = () => {
  const navigate = useNavigate();
  const t = LED_C_TREATMENT;

  useEffect(() => {
    document.title = `${BRAND_NAME} | Book ${t.label}`;
  }, [t.label]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50 flex flex-col">
      <header className="bg-gradient-to-r from-pink-50 to-pink-100 border-b sticky top-0 z-10">
        <div className="container mx-auto px-5 pt-3 pb-4">
          <button
            onClick={() => navigate(`/${t.slug}`)}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm text-pink-600 hover:text-pink-700 font-medium mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to {t.label}</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-pink-100 rounded-full">
              <Calendar className="h-5 w-5 text-pink-500" />
            </div>
            <div>
              <h1 className="text-xl font-serif text-foreground font-medium">Book Your Appointment</h1>
              <p className="text-sm text-muted-foreground">
                {t.label} - pay a $20.00 deposit or the full $79.99
              </p>
            </div>
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-5 py-6">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg shadow-pink-100/50 overflow-hidden p-2">
          <AcuityEmbed appointmentTypeId={t.appointmentTypeId} calendarId="14289823" />
        </div>
      </main>
    </div>
  );
};

export default BookLedC;
