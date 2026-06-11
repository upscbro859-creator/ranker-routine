# The Ranker Routine — website

A plain website (HTML + CSS + JavaScript, **no build step**) for UPSC RESOLVE.
Students log their own daily routine and see **only their own** data; **you, the admin, see every student** and their performance. An AI coach (Claude) writes the reports.

You only edit **two lines** of config, then upload the folder. The accounts, the database, and the privacy rules live in a free **Supabase** backend (a static-only site can't keep one student's data private from another — that needs a server).

```
index.html        the page
styles.css        styling
app.js            all the logic  ← paste your 2 Supabase keys at the top
schema.sql        run this once in Supabase (creates tables + privacy rules)
edge-function.ts  the AI report function (paste into Supabase dashboard)
```

---

## Setup (about 15 minutes, no command line)

### 1. Make a free Supabase project
Go to https://supabase.com → **New project**. Wait ~2 minutes for it to spin up.

### 2. Create the database + privacy rules
Supabase → **SQL Editor → New query** → paste all of `schema.sql` → **Run**.
This makes the `profiles` and `entries` tables and the Row-Level Security that keeps each student's data private.

### 3. Turn on email login
Supabase → **Authentication → Providers → Email** → make sure it's on.
For easy testing, you can switch **"Confirm email" off** so accounts work immediately. (Turn it back on later.)

### 4. Add your keys to the website
Supabase → **Project Settings → API**. Copy the **Project URL** and the **anon public** key.
Open `app.js` and paste them into the top two lines:
```js
const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";
```

### 5. Open the website
Easiest way to publish for free: go to https://app.netlify.com/drop and **drag this whole folder** onto the page. You get a live link instantly. (Any web host works too.)
*To test on your own computer first, you can't just double-click index.html — logins need a real address. Use the Netlify drop above, or any simple local server.*

### 6. Make yourself the admin
- On the live site, **Create account** with YOUR email — that's your admin login.
- In Supabase **SQL Editor**, run (use your email):
  ```sql
  update public.profiles set role = 'admin'
  where id = (select id from auth.users where email = 'you@example.com');
  ```
- Sign out, sign back in → you now see the **admin dashboard**.

### 7. Switch on the AI reports
The Claude key must stay off the website, so it lives in a Supabase function.
- Supabase → **Edge Functions → Create a function** → name it exactly **`daily-report`** → paste all of `edge-function.ts` → **Deploy** (this is all in the browser, no installs).
- Supabase → **Edge Functions → Secrets** (or Project Settings → Edge Functions) → add a secret:
  - name `ANTHROPIC_API_KEY`, value your key from https://console.anthropic.com
- At the top of `edge-function.ts` set the Claude `MODEL` you have access to (model list: https://docs.claude.com/en/docs/about-claude/models).

The **Generate report** button now works.

---

## How people use it
- **Students:** sign up → fill the daily form (targets, % achieved, hours, efficiency, tomorrow's plan, Revision/DNA/Topper checklist, manifestation) → see their own charts + AI report. They can never see another student.
- **You (admin):** a roster of all students sorted by hours, with streak, target %, and efficiency. Tap any student for their full charts and an AI coaching report.

## Why a student can't peek at others
Every read of the tracker passes through the database's Row-Level Security: a student's queries are automatically restricted to their own rows, and only the admin role can read everyone. This holds even if someone tries to call the API directly — the database refuses to hand over other students' data.
