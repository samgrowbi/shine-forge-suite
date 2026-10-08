import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Returns the public Square identifiers the browser needs to render the card form.
// Values live in Supabase secrets so they can be changed without a code deploy.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const applicationId = Deno.env.get('SQUARE_APPLICATION_ID');
  const locationId = Deno.env.get('SQUARE_LOCATION_ID');
  const environment = Deno.env.get('SQUARE_ENVIRONMENT') === 'sandbox' ? 'sandbox' : 'production';

  if (!applicationId || !locationId) {
    return new Response(
      JSON.stringify({ error: 'Square is not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ applicationId, locationId, environment }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
