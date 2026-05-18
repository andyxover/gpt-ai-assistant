# See TCS Tutor working — quickstart

Goal: in ~30 minutes, get a working bot in your own LINE app that you
can chat with. This is for trying it yourself, not for a real school
pilot.

> **Cost:** ~$0.30 of Anthropic credit (one-time, builds the question
> pool). Everything else is free.

---

## What you'll need

Before starting, sign up for these (all have free tiers):

- [ ] **Anthropic API account** — https://console.anthropic.com
      (you'll add ~$5 credit; we'll use ~$0.30 of it)
- [ ] **Supabase** — https://supabase.com (free Postgres database)
- [ ] **LINE Developers** — https://developers.line.biz
      (free; same login as your normal LINE account)
- [ ] **ngrok** — https://ngrok.com (free; we use it to give your
      local server a public HTTPS URL that LINE can reach)

And on your machine:

- [ ] **Node.js 20 or newer** — `node --version` to check
- [ ] **psql** (the Postgres command-line client) — needed once to
      set up the database

---

## Step 1 — Clone & install (~3 min)

The code lives on a feature branch in the `gpt-ai-assistant` repo. The
app itself is in a subfolder; all the commands in this guide run from
that subfolder.

```bash
git clone https://github.com/andyxover/gpt-ai-assistant.git
cd gpt-ai-assistant
git checkout claude/ai-tutoring-platform-AuElt
cd claude/project/tcs-tutor/app          # ← this is "the app folder"
npm install
cp .env.example .env
```

After this you should be sitting in `.../tcs-tutor/app/` with a fresh
`.env` file and `node_modules/` populated. Every later step runs from
this same folder. Leave `.env` open in a text editor — you'll paste
several values into it over the next steps.

---

## Step 2 — Anthropic API key (~2 min)

1. https://console.anthropic.com → **Settings → API Keys → Create Key**
2. Copy the key (starts with `sk-ant-...`)
3. In `.env`, set:
   ```
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   ```
4. Make sure your account has credit (Settings → Billing → Add credits;
   $5 is plenty for testing).

---

## Step 3 — Database (~5 min)

1. https://supabase.com → **New Project**
   - Project name: anything (e.g. "tcs-tutor-test")
   - Region: pick the closest one
   - Database password: generate one and **save it somewhere**
   - Wait ~1 minute for it to provision
2. Once ready: **Settings → Database → Connection string**
3. Choose the **"URI"** format under **"Connection pooling"** (port 6543)
4. Replace `[YOUR-PASSWORD]` with the one you saved
5. In `.env`, set:
   ```
   DATABASE_URL=postgresql://postgres.xxx:your-password@aws-...pooler.supabase.com:6543/postgres
   ```
6. Initialize the schema:
   ```bash
   npm run db:init
   ```
   You should see a bunch of `CREATE TABLE` lines and no errors.

---

## Step 4 — Seed data + build the question pool (~3 min, ~$0.30)

This generates real practice questions using AI and stores them in the
database. Only needs to run once.

```bash
node cli/simulate-session.js samples/science-7-syllabus.txt \
  --concepts 3 --questions-per-concept 4 --rounds 0
```

What you'll see:
```
▸ Parsing syllabus...
▸ Seeding demo entities...
▸ Ensuring question pool for 3 concepts...
  biotic_abiotic       generating 4 Qs...  → 4 approved
  classification       generating 4 Qs...  → 4 approved
  cell_membrane        generating 4 Qs...  → 3 approved, 1 needs_review
Total API cost: $0.2871
```

If you want to see the mastery engine work too, run it again with
`--rounds 25` (no extra API cost — questions get reused).

---

## Step 5 — LINE channel (~5 min)

1. https://developers.line.biz/console → **Log in with your LINE
   account**
2. **Create a new provider** — any name (e.g. "Personal Testing")
3. Inside that provider: **Create a new channel → Messaging API**
   - Channel name: "TCS Tutor (test)"
   - Channel description: anything
   - Category: Education
   - Subcategory: Tutoring service
   - Region: Taiwan
   - Accept terms, create.
4. Open your new channel. Two tabs matter:

   **Basic settings tab:**
   - Find **Channel secret** → click **Issue/Show** → copy it
   - Scroll down, find **Your user ID** → copy it (you'll need it in Step 6)

   **Messaging API tab:**
   - Find **Channel access token (long-lived)** → click **Issue** → copy it
   - Scroll down to **LINE Official Account features** and click the
     gear icon to edit:
     - **Auto-reply messages: Disabled**
     - **Greeting messages: Disabled**
     (LINE adds canned auto-replies by default; they'll fight with the bot.)

5. In `.env`, set:
   ```
   LINE_CHANNEL_SECRET=your-channel-secret
   LINE_CHANNEL_ACCESS_TOKEN=your-long-access-token
   LINE_API_DRY_RUN=false
   ```

---

## Step 6 — Link your LINE account to the demo student (~1 min)

The bot only talks to enrolled students. Connect your personal LINE
account to the demo student row:

```bash
psql $DATABASE_URL -c "UPDATE users SET line_user_id='YOUR-LINE-USER-ID' WHERE id='00000000-0000-0000-0000-000000000020';"
```

Replace `YOUR-LINE-USER-ID` with the **Your user ID** value you copied
from the Basic settings tab in Step 5. (It starts with `U` followed by
a long string.)

---

## Step 7 — Run the server + ngrok (~3 min)

Open **two terminals**.

**Terminal 1** — start the server:
```bash
cd gpt-ai-assistant/claude/project/tcs-tutor/app
npm run dev
```
You should see: `TCS Tutor API listening on http://localhost:3000`.
Leave it running.

**Terminal 2** — expose it publicly with ngrok:
```bash
ngrok http 3000
```
Look for the line that says **Forwarding** — copy the `https://...ngrok.app`
URL (ignore the http one). Leave ngrok running too.

---

## Step 8 — Point LINE at your server (~2 min)

Back in the LINE Developer Console:

1. Your channel → **Messaging API tab**
2. **Webhook URL** → paste `https://your-ngrok-url.ngrok.app/webhook/line`
   (note the `/webhook/line` path at the end)
3. Click **Update**
4. Click **Verify** → should say "Success"
5. Toggle **Use webhook** ON

---

## Step 9 — Add the bot on your phone (~1 min)

In the same Messaging API tab, scroll to the **QR code** section.

1. Open the LINE app on your phone
2. Tap the friends icon → **Add friends** → **QR code**
3. Scan the QR code
4. Tap **Add**

The bot now appears in your chats.

---

## Step 10 — Talk to it

In the LINE app, send the bot:

> review

It should reply with a multiple-choice question and four quick-reply
buttons (A, B, C, D). Tap one — it'll tell you if you were right,
show the explanation, and offer "Next →" to continue.

Other commands:
- **preview** — concepts from next week
- **exam prep** — assessment-focused practice
- **stop** — end the session

---

## Step 11 — See what a parent would receive

After you've answered a few questions in the bot, generate the weekly
report:

```bash
node cli/render-report.js --week 5
open /tmp/tcs-report.html
```

That's what would land in a parent's LINE inbox at the end of the week.

For the Traditional Chinese version:
```bash
node cli/render-report.js --week 5 --lang zh
```

---

## Common gotchas

- **"Verify" failed in Step 8.** Check that the server is running
  (Terminal 1) and ngrok is running (Terminal 2). Make sure
  `LINE_CHANNEL_SECRET` is set correctly in `.env`. Restart the
  server after editing `.env`.
- **Bot doesn't reply.** Most common: LINE's "Auto-reply messages" or
  "Greeting messages" weren't disabled (Step 5). Or your LINE userId
  in the database doesn't match the one in your phone.
- **"You're not enrolled" message.** The `UPDATE users SET line_user_id`
  in Step 6 didn't run, or used the wrong ID. Run `psql $DATABASE_URL
  -c "SELECT line_user_id FROM users WHERE id='00000000-0000-0000-0000-000000000020';"`
  to check what's stored, and compare to your "Your user ID" from LINE
  Developer Console.
- **ngrok URL changed.** Free ngrok rotates the URL every time you
  restart it. After re-starting ngrok, re-paste the new URL into LINE's
  Webhook URL field (Step 8) and verify again.
- **API cost.** The simulator's question generation is the only
  meaningful cost (~$0.30 once). The bot's per-turn cost is near-zero
  (questions are pre-generated; LINE responses don't use the AI). You
  can keep practicing for free after Step 4.

---

## When you're done testing

You can leave the LINE channel set up and come back anytime — just
restart the server + ngrok (Steps 7-8) and re-paste the new ngrok URL
into LINE.

To shut down cleanly: Ctrl+C in both terminals. Nothing keeps running.

To deploy properly (not just ngrok): the same code runs on Vercel or
Fly.io. That's a separate guide; this one is just to see it work.
