// supabase/functions/purchase-airtime/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { serviceID, phoneNumber, amount } = await req.json()

    if (!serviceID || !phoneNumber || !amount) {
      throw new Error("Missing required fields: serviceID, phoneNumber, and amount are required.")
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { data: { user } } = await supabaseAdmin.auth.getUser(req.headers.get('Authorization').replace('Bearer ', ''))

    if (!user) {
      throw new Error("User not found or authentication failed.")
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('balance')
      .eq('id', user.id)
      .single()

    if (profileError) throw profileError
    if (profile.balance < amount) {
      throw new Error("Insufficient balance.")
    }
    
    // --- VTPASS API CALL FOR AIRTIME ---
    // This is a placeholder. You'll need to add your VTPass username, password,
    // and the actual API call logic here. For now, it simulates success.
    console.log(`Simulating VTPass AIRTIME purchase for ${phoneNumber} with amount ${amount}`);
    const purchaseSuccessful = true;
    if (!purchaseSuccessful) {
        throw new Error("Purchase failed at provider.");
    }
    
    const newBalance = profile.balance - amount;
    const { error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update({ balance: newBalance })
      .eq('id', user.id)

    if (updateError) throw updateError

    return new Response(JSON.stringify({ newBalance: newBalance }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})