import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Deposit booking: authorize the deposit on Square, create the Acuity appointment,
// then capture the payment. If the booking fails the authorization is released,
// so a client is never charged without an appointment.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Deposit amount per Acuity appointment type, in cents. Set server-side so the
// browser can't change the amount charged.
const DEPOSITS_CENTS: Record<string, number> = {
  '99210631': 2000, // Hale /c - Non-Surgical Face & Neck Lift (deposit)
};

const SQUARE_VERSION = '2025-01-23';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const squareToken = Deno.env.get('SQUARE_ACCESS_TOKEN');
  const locationId = Deno.env.get('SQUARE_LOCATION_ID');
  const squareBase = Deno.env.get('SQUARE_ENVIRONMENT') === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com';
  const acuityUser = Deno.env.get('ACUITY_USER_ID');
  const acuityKey = Deno.env.get('ACUITY_API_KEY');

  if (!squareToken || !locationId || !acuityUser || !acuityKey) {
    console.error('Missing Square or Acuity configuration');
    return json({ error: 'Payments are not configured yet. Please call us to book.' }, 500);
  }

  const square = (path: string, body: unknown) =>
    fetch(`${squareBase}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${squareToken}`,
        'Square-Version': SQUARE_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  const acuityAuth = `Basic ${btoa(`${acuityUser}:${acuityKey}`)}`;

  let paymentId: string | null = null;

  try {
    const body = await req.json();
    const {
      sourceId,
      verificationToken,
      idempotencyKey,
      firstName,
      lastName,
      email,
      phone,
      datetime,
      fields,
      appointmentTypeID,
      calendarID,
    } = body;

    if (!sourceId || !idempotencyKey || !firstName || !lastName || !email || !datetime || !appointmentTypeID) {
      return json({ error: 'Missing required booking or payment information' }, 400);
    }

    const amount = DEPOSITS_CENTS[String(appointmentTypeID)];
    if (!amount) {
      return json({ error: 'This appointment type does not take a deposit' }, 400);
    }

    // 1) Authorize (not capture) the deposit
    const payRes = await square('/v2/payments', {
      source_id: sourceId,
      verification_token: verificationToken || undefined,
      idempotency_key: String(idempotencyKey).slice(0, 45),
      amount_money: { amount, currency: 'USD' },
      autocomplete: false,
      location_id: locationId,
      buyer_email_address: email,
      note: `Appointment deposit - ${firstName} ${lastName} - ${datetime}`,
    });
    const payData = await payRes.json();

    if (!payRes.ok || !payData.payment?.id) {
      console.error('Square authorization failed:', payData);
      const code = payData.errors?.[0]?.code as string | undefined;
      const message =
        code === 'CARD_DECLINED' || code === 'GENERIC_DECLINE'
          ? 'Your card was declined. Please try another card.'
          : code === 'INSUFFICIENT_FUNDS'
          ? 'Your card was declined for insufficient funds. Please try another card.'
          : code === 'CVV_FAILURE' || code === 'ADDRESS_VERIFICATION_FAILURE' || code === 'INVALID_EXPIRATION'
          ? 'Please check your card details and try again.'
          : 'We could not process your card. Please check the details or try another card.';
      return json({ error: message, code }, 402);
    }
    paymentId = payData.payment.id as string;

    // 2) Create the Acuity appointment
    const deposit = (amount / 100).toFixed(2);
    const bookingData: Record<string, unknown> = {
      appointmentTypeID: parseInt(String(appointmentTypeID), 10),
      datetime,
      firstName,
      lastName,
      email,
      phone: phone || '',
      admin: true,
      notes: `$${deposit} deposit paid online via Square (payment ${paymentId}).`,
    };
    if (calendarID) bookingData.calendarID = parseInt(String(calendarID), 10);
    if (Array.isArray(fields) && fields.length > 0) bookingData.fields = fields;

    const bookRes = await fetch('https://acuityscheduling.com/api/v1/appointments', {
      method: 'POST',
      headers: { 'Authorization': acuityAuth, 'Content-Type': 'application/json' },
      body: JSON.stringify(bookingData),
    });
    const bookData = await bookRes.json();

    if (!bookRes.ok) {
      console.error('Acuity booking failed, releasing deposit:', bookRes.status, bookData);
      await square(`/v2/payments/${paymentId}/cancel`, {});
      let message = bookData.message || 'We could not complete your booking. Your card was not charged.';
      if (bookRes.status === 403 || bookRes.status === 409) {
        message = 'That time was just booked by someone else. Your card was not charged — please pick another slot.';
      }
      return json({ error: message, status: bookRes.status }, bookRes.status);
    }

    // 3) Capture the deposit now that the appointment exists
    const completeRes = await square(`/v2/payments/${paymentId}/complete`, {});
    if (!completeRes.ok) {
      const completeData = await completeRes.json().catch(() => ({}));
      console.error('Square capture failed, cancelling appointment:', completeData);
      await fetch(`https://acuityscheduling.com/api/v1/appointments/${bookData.id}/cancel?admin=true&noEmail=true`, {
        method: 'PUT',
        headers: { 'Authorization': acuityAuth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelNote: 'Deposit capture failed' }),
      });
      await square(`/v2/payments/${paymentId}/cancel`, {});
      return json({ error: 'We could not complete your payment. Your card was not charged. Please try again.' }, 402);
    }

    console.log('Deposit booking complete:', { appointmentId: bookData.id, paymentId });
    return json({ ...bookData, depositPaymentId: paymentId, depositAmount: deposit });
  } catch (error) {
    console.error('Error in square-deposit-book:', error);
    if (paymentId) {
      await square(`/v2/payments/${paymentId}/cancel`, {}).catch(() => {});
    }
    return json({ error: 'Something went wrong. Your card was not charged. Please try again.' }, 500);
  }
});
