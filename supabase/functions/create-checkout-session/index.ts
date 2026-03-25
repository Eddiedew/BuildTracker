import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PADDLE_API = 'https://api.paddle.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

  const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' };

  try {
    const { price_id } = await req.json();
    if (!price_id) {
      return new Response(JSON.stringify({ error: 'price_id is required' }), { status: 400, headers: jsonHeaders });
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), { status: 401, headers: jsonHeaders });
    }

    const { data: { user }, error: authError } = await sb.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: jsonHeaders });
    }

    // Get existing Paddle customer ID if any
    const { data: profile } = await sb.from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    const body: Record<string, unknown> = {
      items: [{ price_id, quantity: 1 }],
      checkout: { url: 'https://buildtracker.tech?upgraded=1' },
      custom_data: { user_id: user.id },
    };

    if (profile?.stripe_customer_id) {
      body.customer_id = profile.stripe_customer_id;
    } else {
      body.customer = { email: user.email };
    }

    const res = await fetch(`${PADDLE_API}/transactions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('PADDLE_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      const detail = data.error?.detail || data.error?.type || JSON.stringify(data);
      console.error('Paddle error:', detail);
      return new Response(
        JSON.stringify({ error: detail }),
        { status: 200, headers: jsonHeaders }
      );
    }

    return new Response(
      JSON.stringify({ url: data.data.checkout.url }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (e) {
    console.error('Checkout error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
  }
});
