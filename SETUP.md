# BuildFlow — Production Setup Guide

## Prerequisites

- [Supabase account](https://supabase.com) (free tier is fine to start)
- [Stripe account](https://stripe.com) (test mode first, then live)
- [Vercel account](https://vercel.com) or [Netlify account](https://netlify.com)
- Node.js 18+ and npm installed locally
- [Supabase CLI](https://supabase.com/docs/guides/cli) installed: `npm i -g supabase`

---

## 1. Supabase Setup

### 1.1 Create a new Supabase project
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New project**, choose your organisation, give it a name (e.g. `buildflow-prod`)
3. Set a strong database password and choose a region close to your users
4. Wait for the project to provision (~2 minutes)

### 1.2 Run the migration SQL files
1. In the Supabase Dashboard, go to **SQL Editor**
2. Open `supabase/migrations/001_schema.sql`, paste the entire contents, and click **Run**
3. Open `supabase/migrations/002_rls.sql`, paste the entire contents, and click **Run**

### 1.3 Enable Email Authentication
1. Go to **Authentication > Providers**
2. Ensure **Email** is enabled
3. Under **Email**, you may want to enable **Confirm email** for production

### 1.4 Configure Site URL
1. Go to **Authentication > URL Configuration**
2. Set **Site URL** to your production domain (e.g. `https://buildflow.yoursite.com`)
3. Add your development URL to **Redirect URLs** (e.g. `http://localhost:3000`)

### 1.5 Deploy Edge Functions
From the root of this project directory:

```bash
# Login to Supabase CLI
supabase login

# Link to your project (get the project ref from the dashboard URL)
supabase link --project-ref YOUR_PROJECT_REF

# Deploy all edge functions
supabase functions deploy stripe-webhook
supabase functions deploy create-checkout-session
supabase functions deploy create-portal-session
```

### 1.6 Set Edge Function Secrets
```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_YOUR_KEY
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET
supabase secrets set STRIPE_PRICE_PRO_MONTHLY=price_XXXXX
supabase secrets set STRIPE_PRICE_PRO_ANNUAL=price_XXXXX
supabase secrets set STRIPE_PRICE_BIZ_MONTHLY=price_XXXXX
supabase secrets set STRIPE_PRICE_BIZ_ANNUAL=price_XXXXX
```

The `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available inside Supabase edge functions — you do not need to set them manually.

---

## 2. Stripe Setup

### 2.1 Create Products and Prices
1. Go to [Stripe Dashboard > Products](https://dashboard.stripe.com/products)
2. Create **Pro** product:
   - Name: `BuildFlow Pro`
   - Add recurring price: **$29.00/month** → copy the Price ID
   - (Optional) Add annual price: **$290.00/year** → copy the Price ID
3. Create **Business** product:
   - Name: `BuildFlow Business`
   - Add recurring price: **$79.00/month** → copy the Price ID
   - (Optional) Add annual price: **$790.00/year** → copy the Price ID

### 2.2 Configure Webhook Endpoint
1. Go to [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Set the **Endpoint URL** to your Supabase edge function URL:
   ```
   https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook
   ```
4. Select the following events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Click **Add endpoint** and copy the **Signing secret** (`whsec_...`)
6. Set this as `STRIPE_WEBHOOK_SECRET` in your Supabase edge function secrets

### 2.3 Configure Billing Portal
1. Go to [Stripe Dashboard > Settings > Billing > Customer portal](https://dashboard.stripe.com/settings/billing/portal)
2. Enable the portal and configure which settings customers can change
3. Set the **Business information** (name, privacy policy URL, etc.)

---

## 3. Frontend Configuration

Open `index.html` and update the configuration constants near the top of the `<script>` block:

```js
const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY_HERE';
```

To find these values:
1. Go to Supabase Dashboard > **Project Settings > API**
2. Copy **Project URL** → `SUPABASE_URL`
3. Copy **anon public** key → `SUPABASE_ANON_KEY`

Also update the price IDs in the `showUpgradeModal()` method to match your Stripe price IDs:
```js
onclick="app.startCheckout('price_YOUR_PRO_MONTHLY_PRICE_ID')"
onclick="app.startCheckout('price_YOUR_BIZ_MONTHLY_PRICE_ID')"
```

---

## 4. Deployment to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy from the project folder
cd "Construction SaaS"
vercel deploy

# For production deployment
vercel --prod
```

Vercel will auto-detect the `vercel.json` config file.

### Set Environment Variables in Vercel
(These are not strictly needed for a frontend-only app since credentials are in index.html, but useful if you add a build step later.)

1. Go to your Vercel project > **Settings > Environment Variables**
2. Add `SUPABASE_URL` and `SUPABASE_ANON_KEY`

---

## 5. Deployment to Netlify

### Option A: Drag and Drop
1. Build: this is a single HTML file — just drag the folder to [app.netlify.com/drop](https://app.netlify.com/drop)

### Option B: CLI
```bash
npm i -g netlify-cli
netlify deploy --dir "." --prod
```

### Option C: Git-based
1. Push the project to GitHub
2. Connect the repo in Netlify dashboard
3. Set **Publish directory** to `.` (root)

### Add _redirects file for Netlify SPA routing
Create a file named `_redirects` in the project root:
```
/*  /index.html  200
```

---

## 6. Custom Domain

### Vercel
1. Go to your project > **Settings > Domains**
2. Add your domain and follow the DNS instructions

### Netlify
1. Go to your site > **Domain management > Add custom domain**
2. Follow the DNS instructions

---

## 7. Post-Deploy Checklist

- [ ] Supabase schema migrations ran successfully (001 and 002)
- [ ] Test registration: create a new account and confirm email arrives
- [ ] Verify profile row and default expense categories are auto-created
- [ ] Test login/logout flow
- [ ] Edge functions deployed and accessible
- [ ] Stripe webhook endpoint is active and receiving events (check Stripe dashboard)
- [ ] Test checkout flow in Stripe test mode
- [ ] Confirm plan badge appears after upgrade
- [ ] Test billing portal access
- [ ] Verify RLS is working (users cannot see each other's data)
- [ ] Set production Stripe keys (not test keys) when going live
- [ ] Configure Supabase email templates under **Authentication > Email Templates**
- [ ] Enable Supabase **Database backups** under **Project Settings > Database**
- [ ] Review Supabase **API rate limits** under **Project Settings > API**
