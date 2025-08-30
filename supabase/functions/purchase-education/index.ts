// supabase/functions/purchase-education/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { variation_code, amount, quantity } = await req.json()
    if (!variation_code || !amount || !quantity) {
      throw new Error("Missing required fields: variation_code, amount, and quantity are required.")
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { data: { user } } = await supabaseAdmin.auth.getUser(req.headers.get('Authorization').replace('Bearer ', ''))
    if (!user) throw new Error("User not authenticated")

    const totalCost = amount * quantity;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles').select('balance').eq('id', user.id).single()
    if (profileError) throw profileError
    if (profile.balance < totalCost) {
      throw new Error("Insufficient balance.")
    }

    // --- VTPASS API CALL FOR WAEC E-PIN ---
    const requestId = `XT_WAEC_${Date.now()}_${Math.random().toString(36).substring(2)}`
    const response = await fetch('https://sandbox.vtpass.com/api/pay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': Deno.env.get('VTPASS_API_KEY')!,
        'secret-key': Deno.env.get('VTPASS_SECRET_KEY')!,
      },
      body: JSON.stringify({
        request_id: requestId,
        serviceID: 'waec',
        variation_code: variation_code,
        quantity: quantity,
        phone: Deno.env.get('YOUR_DEFAULT_PHONE_NUMBER') || '08000000000', // A placeholder phone
      }),
    })

    const vtpassResult = await response.json();
    // For WAEC PINs, '000' is success, but the PINs are inside the 'cards' array
    if (vtpassResult.code !== '000' || !vtpassResult.cards) {
      throw new Error(`VTpass Error: ${vtpassResult.response_description || 'Failed to purchase PINs.'}`)
    }
    
    // --- IF PURCHASE IS SUCCESSFUL, UPDATE BALANCE AND LOG TRANSACTION ---
    const newBalance = profile.balance - totalCost;
    await supabaseAdmin.from('user_profiles').update({ balance: newBalance }).eq('id', user.id)
    
    // We can even store the purchased PINs in the transaction log for the user's reference
    const description = `${quantity} x WAEC Result Checker PIN(s)`;
    await supabaseAdmin.from('transactions').insert([{
      user_id: user.id, service_type: 'education', description,
      amount: totalCost, status: 'success', reference_id: requestId, 
      provider_reference: vtpassResult.requestId,
      // You could add a new 'metadata' column (type: jsonb) to your transactions table
      // to store the actual PINs like this: metadata: { pins: vtpassResult.cards }
    }]);
    
    // Return a success message with the new balance and the transaction ID
    return new Response(JSON.stringify({ 
      success: true, 
      newBalance: newBalance,
      transactionId: vtpassResult.requestId
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
    });
  }
})