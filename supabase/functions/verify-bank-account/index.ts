// supabase/functions/verify-bank-account/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') { return new Response('ok', { headers: corsHeaders }) }
  try {
    const { accountNumber, bankCode } = await req.json()
    if (!accountNumber || !bankCode) throw new Error("Account number and bank code are required.")

    // This uses your Paystack Secret Key, which should be set in Supabase secrets
    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY')!
    
    const response = await fetch(`https://api.paystack.co/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`, {
      headers: { 'Authorization': `Bearer ${paystackSecretKey}` },
    })
    const result = await response.json();
    
    if (!result.status) throw new Error(result.message || "Could not verify account details.");
    
    return new Response(JSON.stringify({ accountName: result.data.account_name }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    })
  }
})