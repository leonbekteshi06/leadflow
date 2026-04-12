# LeadFlow CRM

A lead tracking CRM for your outreach team. Built with Next.js + Supabase.

## Setup (takes about 10 minutes)

### Step 1: Create a Supabase Project (free)

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Click **"New Project"**
3. Name it "leadflow" (or whatever you want)
4. Set a database password (save this somewhere)
5. Choose the region closest to you (EU West for Norway)
6. Click **"Create new project"** and wait ~2 minutes

### Step 2: Set Up the Database

1. In your Supabase project, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Open the `supabase-setup.sql` file from this project
4. Copy ALL the SQL and paste it into the editor
5. Click **"Run"** (the green play button)
6. You should see "Success" — this creates your tables and loads the default message templates

### Step 3: Get Your Supabase Keys

1. In Supabase, go to **Settings** (gear icon) → **API**
2. Copy the **"Project URL"** (looks like `https://xxxxx.supabase.co`)
3. Copy the **"anon/public"** key (the long string under "Project API keys")
4. Keep these handy for Step 5

### Step 4: Push Code to GitHub

1. Go to [github.com](https://github.com) and create a new repository called "leadflow"
2. On your computer, open Terminal and run:

```bash
cd leadflow
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/leadflow.git
git push -u origin main
```

(Replace YOUR-USERNAME with your actual GitHub username)

### Step 5: Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"**
3. Select your "leadflow" repository
4. Before clicking Deploy, click **"Environment Variables"**
5. Add these two variables:
   - `NEXT_PUBLIC_SUPABASE_URL` → paste your Project URL from Step 3
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → paste your anon key from Step 3
6. Click **"Deploy"**
7. Wait 1-2 minutes. Done!

### Step 6: Share with Your Team

Vercel gives you a URL like `leadflow-xxx.vercel.app`. Send this URL to Kent and Lukas. That's it. Everyone uses the same URL, picks their name from the dropdown, and all data syncs in real-time.

You can also add a custom domain in Vercel settings if you want something like `crm.yourdomain.com`.

## How It Works

- **Dashboard**: Overview of pipeline, stats, team performance, and today's actions
- **My Leads**: Filtered view showing only YOUR assigned leads and what's due today
- **All Leads**: Full database with search, filters, and CSV import
- **Outreach**: Your cold outreach message sequence (edit templates here)
- **Nurture**: Follow-up sequence for leads who responded but went quiet

### The Flow

1. Add a lead (or import via CSV)
2. The CRM shows "ASAP" — copy the first message and send it
3. Mark it as sent — the CRM auto-advances to the next message and shows the exact date to send it
4. When they respond, change stage to "Responded" — kicks off the nurture sequence
5. When they book a call, change to "Call Booked"
6. When you close, select "Closed Won" and enter the deal value

Everything syncs live between all team members.

## Customizing

- Edit team members: Change the `TEAM` array at the top of `src/app/page.js`
- Edit message templates: Use the Outreach and Nurture tabs in the app
- Change currency: Modify the `fmtMoney` function in `src/app/page.js`
