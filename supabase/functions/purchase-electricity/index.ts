// supabase/functions/purchase-electricity/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  try {
    const { serviceID, billersCode, variation_code, amount } = await req.json()
    if (!serviceID || !billersCode || !variation_code || !amount) {
      throw new Error("Missing required fields.")
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { data: { user } } = await supabaseAdmin.auth.getUser(req.headers.get('Authorization').replace('Bearer ', ''))
    if (!user) throw new Error("User not authenticated")

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles').select('balance').eq('id', user.id).single()
    if (profileError) throw profileError
    if (profile.balance < amount) {
      throw new Error("Insufficient balance.")
    }

    const response = await fetch('https://sandbox.vtpass.com/api/pay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': Deno.env.get('VTPASS_API_KEY')!,
        'secret-key': Deno.env.get('VTPASS_SECRET_KEY')!,
      },
      body: JSON.stringify({
        request_id: `XT_ELEC_${Date.now()}`,
        serviceID: serviceID,
        billersCode: billersCode,
        variation_code: variation_code, // This will be 'prepaid' or 'postpaid'
        amount: amount,
        phone: Deno.env.get('YOUR_DEFAULT_PHONE_NUMBER') || '08000000000',
      }),
    })

    const vtpassResult = await response.json();
    if (vtpassResult.code !== '000') {
      throw new Error(`VTpass Error: ${vtpassResult.response_description}`)
    }

    const newBalance = profile.balance - amount;
    await supabaseAdmin.from('user_profiles').update({ balance: newBalance }).eq('id', user.id)
    
    // For prepaid, VTPass returns a token in the response
    const token = vtpassResult.token || null;

    await supabaseAdmin.from('transactions').insert([{
      user_id: user.id, service_type: 'electricity', 
      description: `${serviceID.replace('-electric', '').toUpperCase()} (${variation_code}) for ${billersCode}`,
      amount, status: 'success', reference_id: vtpassResult.requestId, 
      provider_reference: vtpassResult.requestId
    }]);
    
    return new Response(JSON.stringify({ success: true, newBalance, token }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
    });
  }
})