// supabase/functions/get-service-variations/index.ts

import { corsHeaders } from '../_shared/cors.ts'

console.log("🚀 get-service-variations function initialized");

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const { serviceID } = await req.json()
    if (!serviceID) throw new Error("serviceID is required.")
    
    const response = await fetch(`https://sandbox.vtpass.com/api/service-variations?serviceID=${serviceID}`);
    const result = await response.json();
    
    if (result.content && result.content.varations) {
      const plans = result.content.varations.map(plan => ({
        name: plan.name,
        variation_code: plan.variation_code,
        price: parseFloat(plan.variation_amount)
      }));
      return new Response(JSON.stringify({ plans }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      })
    } else {
      throw new Error(result.response_description || "Could not fetch service plans.")
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    })
  }
})