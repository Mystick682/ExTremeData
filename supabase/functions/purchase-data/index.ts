import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // This handles a required pre-flight request from the browser
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create a Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // Get the authenticated user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("User not authenticated")

    // Get the order details from the website
    const { serviceID, phoneNumber, variationCode, amount } = await req.json()

    // 1. CHECK USER'S WALLET BALANCE
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles').select('balance').eq('id', user.id).single()
    if (profileError || profile.balance < amount) {
      throw new Error("You have insufficient balance for this transaction.")
    }

    // 2. SECURELY CALL THE VTPASS API
    const response = await fetch('https://sandbox.vtpass.com/api/pay', { // IMPORTANT: Change to https://api.vtpass.com/api/pay for LIVE
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': Deno.env.get('VTPASS_API_KEY')!,
        'secret-key': Deno.env.get('VTPASS_SECRET_KEY')!,
      },
      body: JSON.stringify({
        request_id: `XT_${Date.now()}`,
        serviceID: serviceID,
        billersCode: phoneNumber,
        variation_code: variationCode,
        amount: amount,
        phone: phoneNumber,
      }),
    })

    const vtpassResult = await response.json();
    if (vtpassResult.code !== '000') {
      // If the purchase fails with VTpass, stop here.
      throw new Error(`VTpass Error: ${vtpassResult.response_description}`)
    }

    // =================================================================
    // ▼▼▼ THESE ARE THE MISSING STEPS THAT ARE NOW RESTORED ▼▼▼
    // =================================================================

    // 3. IF VTPASS PURCHASE IS SUCCESSFUL, DEDUCT FROM WALLET
    const newBalance = profile.balance - amount;
    await supabase.from('user_profiles').update({ balance: newBalance }).eq('id', user.id);
    
    // 4. LOG THE TRANSACTION IN YOUR DATABASE
    await supabase.from('transactions').insert([{
        user_email: user.email, 
        type: 'data_purchase', 
        amount: amount,
        status: 'completed', 
        reference: vtpassResult.requestId, // Use the real reference from VTpass
        payment_method: 'wallet'
    }]);

    // =================================================================

    // 5. SEND A SUCCESS MESSAGE BACK TO THE WEBSITE
    return new Response(JSON.stringify({ success: true, newBalance: newBalance }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });

  } catch (error) {
    // Send any error message back to the website
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
    });
  }
})