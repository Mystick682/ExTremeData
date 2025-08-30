// supabase/functions/verify-smartcard/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

console.log("🚀 verify-smartcard function initialized (v4 - Final Endpoint)");

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { serviceID, billersCode } = await req.json()
    if (!serviceID || !billersCode) {
      throw new Error("serviceID and billersCode are required.")
    }

    // --- VTPASS API CALL LOGIC (Using the correct 'biller-verify' endpoint) ---

    // 1. Prepare the payload. The 'type' is the key difference.
    const payload = {
        serviceId: serviceID,
        type: "decoder", // This tells VTPass what kind of number we are verifying
        accountNumber: billersCode
    };

    console.log("Sending payload to VTPass Biller API:", JSON.stringify(payload));
    
    // 2. Make the call to the SANDBOX Biller URL.
    const response = await fetch('https://sandbox.vtpass.com/api/biller-verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': Deno.env.get('VTPASS_API_KEY')!,
        'secret-key': Deno.env.get('VTPASS_SECRET_KEY')!,
      },
      body: JSON.stringify(payload),
    })

    const result = await response.json();
    console.log("Received response from VTPass Biller API:", JSON.stringify(result));

    // 3. Check the result. The response format is different for this endpoint.
    if (result.biller_name) {
      // The customer name is in the 'biller_name' field for this endpoint.
      console.log("✅ Verification successful:", result.biller_name);
      return new Response(JSON.stringify({ customerName: result.biller_name }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    } else {
      // Provide a more detailed error.
      const errorMessage = result.message || "Could not verify smartcard number.";
      console.error("Verification failed:", errorMessage);
      throw new Error(errorMessage)
    }
  } catch (error) {
    console.error("An error occurred in the function:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    })
  }
})