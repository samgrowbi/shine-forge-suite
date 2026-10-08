import BookingPage from "@/components/BookingPage";
import { LED_C_TREATMENT } from "@/config/treatments";

// Deposit booking: card is taken on-page via Square, no Acuity iframe.
const BookLedC = () => <BookingPage treatment={LED_C_TREATMENT} />;

export default BookLedC;
