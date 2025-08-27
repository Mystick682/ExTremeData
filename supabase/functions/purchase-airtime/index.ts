import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("User not authenticated")

    // Get airtime-specific details from the website
    const { serviceID, phoneNumber, amount } = await req.json()

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles').select('balance').eq('id', user.id).single()
    if (profileError || profile.balance < amount) {
      throw new Error("You have insufficient balance for this transaction.")
    }

    // Call the VTpass API to buy airtime
    const response = await fetch('https://sandbox.vtpass.com/api/pay', { // CHANGE to https://api.vtpass.com/api/pay for LIVE
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': Deno.env.get('VTPASS_API_KEY')!,
        'secret-key': Deno.env.get('VTPASS_SECRET_KEY')!,
      },
      body: JSON.stringify({
        request_id: `XT_AIRTIME_${Date.now()}`,
        serviceID: serviceID, // e.g., 'mtn', 'airtel' (no '-data' suffix needed for airtime)
        billersCode: phoneNumber,
        variation_code: 'airtime', // For airtime, this is usually just 'airtime'
        amount: amount,
        phone: phoneNumber,
      }),
    })

    const vtpassResult = await response.json();
    if (vtpassResult.code !== '000') {
      throw new Error(`VTpass Error: ${vtpassResult.response_description}`)
    }

    const newBalance = profile.balance - amount;
    await supabase.from('user_profiles').update({ balance: newBalance }).eq('id', user.id);
    
    // Save to the database with the correct type
    await supabase.from('transactions').insert([{
        user_email: user.email, 
        type: 'airtime_purchase', // Use a specific type for airtime
        amount: amount,
        status: 'completed', 
        reference: vtpassResult.requestId,
        description: `${vtpassResult.content?.transactions?.product_name || 'Airtime Top-up'} for ${phoneNumber}`,
        payment_method: 'wallet'
    }]);

    return new Response(JSON.stringify({ success: true, newBalance: newBalance }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
    });
  }
})