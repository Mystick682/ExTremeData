// supabase/functions/process-transfer/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') { return new Response('ok', { headers: corsHeaders }) }
  try {
    const { bankCode, accountNumber, accountName, amount } = await req.json();
    if (!bankCode || !accountNumber || !accountName || !amount) throw new Error("Missing required fields.");

    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user } } = await supabaseAdmin.auth.getUser(req.headers.get('Authorization')?.replace('Bearer ', ''))
    if (!user) throw new Error("User not authenticated")

    const { data: profile, error: profileError } = await supabaseAdmin.from('user_profiles').select('balance').eq('id', user.id).single()
    if (profileError) throw profileError
    if (profile.balance < amount) throw new Error("Insufficient balance.")

    const paystackSecretKey = Deno.env.get('PAYSTACK_SECRET_KEY')!

    // 1. Create a Transfer Recipient on Paystack
    const recipientResponse = await fetch('https://api.paystack.co/transferrecipient', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${paystackSecretKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: "nuban", name: accountName, account_number: accountNumber, bank_code: bankCode, currency: "NGN" })
    });
    const recipientResult = await recipientResponse.json();
    if (!recipientResult.status) throw new Error(`Paystack Error (Recipient): ${recipientResult.message}`);
    const recipientCode = recipientResult.data.recipient_code;

    // 2. Initiate the Transfer
    const transferResponse = await fetch('https://api.paystack.co/transfer', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${paystackSecretKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: "balance", reason: "Wallet Withdrawal", amount: amount * 100, recipient: recipientCode }) // amount is in kobo
    });
    const transferResult = await transferResponse.json();
    if (!transferResult.status) throw new Error(`Paystack Error (Transfer): ${transferResult.message}`);

    // 3. If transfer is queued, deduct from balance and log transaction
    const newBalance = profile.balance - amount;
    await supabaseAdmin.from('user_profiles').update({ balance: newBalance }).eq('id', user.id);
    await supabaseAdmin.from('transactions').insert([{
        user_id: user.id, service_type: 'transfer', description: `Transfer to ${accountName} (${accountNumber})`,
        amount: amount, status: 'success', reference_id: transferResult.data.reference
    }]);

    return new Response(JSON.stringify({ success: true, newBalance }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
    });
  }
})

