// supabase/functions/verify-betting-account/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'

// This function uses the same VTPass endpoint as cable TV verification
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const { serviceID, customerId } = await req.json()
    if (!serviceID || !customerId) {
      throw new Error("serviceID and customerId are required.")
    }

    const response = await fetch('https://sandbox.vtpass.com/api/merchant-verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': Deno.env.get('VTPASS_API_KEY')!,
        'secret-key': Deno.env.get('VTPASS_SECRET_KEY')!,
      },
      body: JSON.stringify({
        serviceID: serviceID,
        billersCode: customerId, // VTPass uses 'billersCode' for the customer ID
      }),
    })

    const result = await response.json();
    if (result.content && result.content.Customer_Name) {
      return new Response(JSON.stringify({ customerName: result.content.Customer_Name }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    } else {
      throw new Error(result.response_description || "Could not verify customer ID.")
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    })
  }
})