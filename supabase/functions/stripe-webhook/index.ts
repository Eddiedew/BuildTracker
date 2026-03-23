import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') as string,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string
);

// Map Stripe price IDs to internal plan names
function priceIdToPlan(priceId: string): string {
  const proMonthly  = Deno.env.get('STRIPE_PRICE_PRO_MONTHLY')  || 'price_pro_monthly';
  const proAnnual   = Deno.env.get('STRIPE_PRICE_PRO_ANNUAL')   || 'price_pro_annual';
  const bizMonthly  = Deno.env.get('STRIPE_PRICE_BIZ_MONTHLY')  || 'price_biz_monthly';
  const bizAnnual   = Deno.env.get('STRIPE_PRICE_BIZ_ANNUAL')   || 'price_biz_annual';
  if (priceId === proMonthly || priceId === proAnnual) return 'pro';
  if (priceId === bizMonthly || priceId === bizAnnual) return 'business';
  return 'free';
}

async function updateProfile(
  stripeCustomerId: string,
  updates: Record<string, unknown>
) {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('stripe_customer_id', stripeCustomerId);
  if (error) {
    console.error('Profile update error:', error.message);
  }
}

Deno.serve(async (req: Request) => {
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') as string;

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  console.log(`Received Stripe event: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const userId = session.metadata?.supabase_user_id;

        if (userId && customerId) {
          // Link Stripe customer to Supabase user
          await supabase
            .from('profiles')
            .update({ stripe_customer_id: customerId })
            .eq('id', userId);
        }

        if (subscriptionId && customerId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const priceId = subscription.items.data[0]?.price.id ?? '';
          const plan = priceIdToPlan(priceId);
          const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

          await updateProfile(customerId, {
            stripe_subscription_id: subscriptionId,
            stripe_price_id: priceId,
            plan,
            plan_status: subscription.status,
            current_period_ends_at: periodEnd,
            cancel_at_period_end: subscription.cancel_at_period_end,
          });
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const priceId = subscription.items.data[0]?.price.id ?? '';
        const plan = priceIdToPlan(priceId);
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        await updateProfile(customerId, {
          stripe_subscription_id: subscription.id,
          stripe_price_id: priceId,
          plan,
          plan_status: subscription.status,
          current_period_ends_at: periodEnd,
          cancel_at_period_end: subscription.cancel_at_period_end,
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        await updateProfile(customerId, {
          stripe_subscription_id: null,
          stripe_price_id: null,
          plan: 'free',
          plan_status: 'canceled',
          current_period_ends_at: null,
          cancel_at_period_end: false,
        });
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const subscriptionId = invoice.subscription as string;

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();
          await updateProfile(customerId, {
            plan_status: 'active',
            current_period_ends_at: periodEnd,
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        await updateProfile(customerId, { plan_status: 'past_due' });
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Error processing webhook event:', err);
    return new Response('Internal server error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
