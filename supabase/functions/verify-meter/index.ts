// supabase/functions/verify-meter/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const { serviceID, billersCode } = await req.json()
    if (!serviceID || !billersCode) {
      throw new Error("serviceID and billersCode are required.")
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
        billersCode: billersCode,
      }),
    })

    const result = await response.json();

    // The electricity verification response often includes both name and address
    if (result.content && result.content.Customer_Name) {
      const customerDetails = {
          name: result.content.Customer_Name,
          address: result.content.Address || null
      }
      return new Response(JSON.stringify({ customerDetails }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    } else {
      throw new Error(result.response_description || "Could not verify meter number.")
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    })
  }
})