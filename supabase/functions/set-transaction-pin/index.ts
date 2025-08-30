// supabase/functions/set-transaction-pin/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  // Handle the browser's preflight CORS request.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { pin } = await req.json()

    // 1. Validate the PIN format. Must be 4 digits.
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      throw new Error("Invalid PIN format. Must be 4 digits.")
    }

    // 2. Create a Supabase admin client to find out who is making this request.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    const { data: { user } } = await supabaseAdmin.auth.getUser(req.headers.get('Authorization').replace('Bearer ', ''))

    if (!user) {
      throw new Error("User not found or authentication failed.")
    }

    // 3. Call the secure database function we created in Part 1.
    // We pass it the user's ID and the plain-text PIN.
    const { error: rpcError } = await supabaseAdmin.rpc('set_user_pin', {
      user_id_input: user.id,
      plain_pin_input: pin
    })

    if (rpcError) {
      throw new Error(`Database error: ${rpcError.message}`)
    }

    // 4. If everything worked, send a success message back to the browser.
    return new Response(JSON.stringify({ message: "PIN set successfully" }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    // If anything went wrong, send an error message back.
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})