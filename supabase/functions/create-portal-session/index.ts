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

    const { data: profile } = await sb.from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: 'No billing account found. Please upgrade your plan first.' }),
        { status: 400, headers: jsonHeaders }
      );
    }

    const res = await fetch(`${PADDLE_API}/customers/${profile.stripe_customer_id}/portal-sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('PADDLE_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Paddle portal error:', JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: 'Could not open billing portal' }),
        { status: 400, headers: jsonHeaders }
      );
    }

    return new Response(
      JSON.stringify({ url: data.data.urls.general.overview }),
      { status: 200, headers: jsonHeaders }
    );
  } catch (e) {
    console.error('Portal error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: jsonHeaders });
  }
});
