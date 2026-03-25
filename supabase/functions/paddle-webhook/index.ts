import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Map Paddle price IDs to internal plan names
const PRICE_TO_PLAN: Record<string, string> = {
  'pri_01kmfy8xs4nxvf48f51k6eqmg5': 'pro',
  'pri_01kmfy6fs8c5cyfyha6xwqtq9e': 'business',
};

async function verifySignature(payload: string, signature: string, secret: string): Promise<boolean> {
  try {
    const parts = Object.fromEntries(signature.split(';').map(p => p.split('=')));
    const ts = parts['ts'];
    const h1 = parts['h1'];
    if (!ts || !h1) return false;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`${ts}:${payload}`));
    const computed = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
    return computed === h1;
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const payload = await req.text();
  const signature = req.headers.get('Paddle-Signature') || '';
  const webhookSecret = Deno.env.get('PADDLE_WEBHOOK_SECRET') || '';

  // Verify signature (skip if secret is still placeholder)
  if (webhookSecret && webhookSecret !== 'placeholder') {
    const valid = await verifySignature(payload, signature, webhookSecret);
    if (!valid) {
      console.error('Invalid Paddle webhook signature');
      return new Response('Invalid signature', { status: 401 });
    }
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const eventType = event.event_type as string;
  const data = event.data as Record<string, unknown>;

  console.log('Paddle webhook event:', eventType);

  try {
    // Payment completed — link customer and activate plan
    if (eventType === 'transaction.completed') {
      const customData = data.custom_data as Record<string, string> | null;
      const userId = customData?.user_id;
      if (!userId) {
        console.log('No user_id in custom_data, skipping');
        return new Response(JSON.stringify({ received: true }), { status: 200 });
      }

      const items = data.items as Array<Record<string, unknown>>;
      const priceId = (items?.[0]?.price as Record<string, string>)?.id;
      const plan = PRICE_TO_PLAN[priceId] || 'pro';
      const customerId = data.customer_id as string;
      const subscriptionId = data.subscription_id as string;
      const billingPeriod = data.billing_period as Record<string, string> | null;
      const periodEnd = billingPeriod?.ends_at || null;

      await sb.from('profiles').update({
        plan,
        plan_status: 'active',
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_price_id: priceId,
        current_period_ends_at: periodEnd,
        cancel_at_period_end: false,
      }).eq('id', userId);

      console.log(`Plan activated: user=${userId} plan=${plan}`);
    }

    // Subscription updated (plan change, renewal)
    if (eventType === 'subscription.activated' || eventType === 'subscription.updated') {
      const subscriptionId = data.id as string;
      const items = data.items as Array<Record<string, unknown>>;
      const priceId = (items?.[0]?.price as Record<string, string>)?.id;
      const plan = PRICE_TO_PLAN[priceId] || 'pro';
      const billingPeriod = data.current_billing_period as Record<string, string> | null;
      const periodEnd = billingPeriod?.ends_at || null;
      const status = data.status as string;

      await sb.from('profiles').update({
        plan: status === 'active' ? plan : 'free',
        plan_status: status,
        stripe_price_id: priceId,
        current_period_ends_at: periodEnd,
      }).eq('stripe_subscription_id', subscriptionId);

      console.log(`Subscription updated: id=${subscriptionId} status=${status} plan=${plan}`);
    }

    // Subscription cancelled
    if (eventType === 'subscription.canceled' || eventType === 'subscription.cancelled') {
      const subscriptionId = data.id as string;

      await sb.from('profiles').update({
        plan: 'free',
        plan_status: 'canceled',
        cancel_at_period_end: true,
      }).eq('stripe_subscription_id', subscriptionId);

      console.log(`Subscription cancelled: id=${subscriptionId}`);
    }

  } catch (e) {
    console.error('Webhook processing error:', e);
    return new Response('Internal error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
