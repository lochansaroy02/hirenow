# HireNow

A local Next.js app for sending personalized hiring outreach emails from saved Excel/CSV HR contacts. It uses Gmail SMTP, a resume PDF attachment stored in ImageKit, Prisma, and PostgreSQL. Sending runs in a local background loop with a daily safety cap and randomized delays.

## Requirements

- Node.js 20.9+
- PostgreSQL running locally
- Gmail account with 2-Step Verification enabled
- Gmail App Password
- ImageKit account (free tier is enough) for resume storage

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a local PostgreSQL database:

```bash
createdb job_mailer
```

If your local Postgres user or password differs, update `DATABASE_URL` accordingly.

3. Create your environment file:

```bash
cp .env.example .env
```

Set these values in `.env`:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/job_mailer?schema=public"
IMAGEKIT_PRIVATE_KEY="private_xxxxxxxxxxxxxxxxxxxxxxxxxxx"
IMAGEKIT_FOLDER="/hirenow/resumes"
AUTH_SECRET="output of: openssl rand -base64 32"
```

`AUTH_SECRET` signs session cookies and encrypts saved Gmail App Passwords. It must be at least 32 characters.
Without it nobody can sign in. If you change it, everyone is signed out and must re-enter their App Password.

There are no Gmail settings in `.env`. Each user connects their own Gmail account in the app (step 4).

4. Each user connects their own Gmail account, after signing in:

- Right after signing in, HireNow opens **Settings** and asks for a Gmail address, the name recruiters should
  see, and a Gmail **App Password**. The page walks through creating one:
  1. Turn on 2-Step Verification: <https://myaccount.google.com/signinoptions/twosv>
  2. Create an App Password: <https://myaccount.google.com/apppasswords>
  3. Paste the 16-letter password into Settings.
- HireNow logs in to Gmail before saving, so a wrong password is caught straight away. **Send test email**
  sends a message to yourself to confirm it works.
- The App Password is stored encrypted (AES-256-GCM, key derived from `AUTH_SECRET`) and is never shown again.
  Revoke it at any time in your Google account; **Disconnect** in Settings deletes it from HireNow.
- Until Gmail is connected, every page redirects to Settings, and campaigns cannot be created or started.

5. Get your ImageKit private key:

- Sign up at [imagekit.io](https://imagekit.io) and open the dashboard.
- Go to Developer options > API keys.
- Copy the **private key** (it starts with `private_`) into `IMAGEKIT_PRIVATE_KEY`.

Only the private key is needed — the SDK uploads server-side and returns the file URL.
`IMAGEKIT_FOLDER` is optional and defaults to `/hirenow/resumes`.

6. Apply the database migrations (`npm install` already ran `prisma generate`):

```bash
npx prisma migrate deploy
```

Migrations live in `prisma/migrations/` and are committed. **Upgrading a database that was set up with
`prisma db push`** (no migration history yet): mark the baseline as already applied, then deploy the rest:

```bash
npx prisma migrate resolve --applied 0_init
npx prisma migrate deploy
```

Never run `prisma db push` against a database with real data; use `prisma migrate dev` to make schema changes.

7. Create the first administrator. The sign-in page has no sign-up, so accounts are only ever created by an
   admin. Run this once from the project folder (it uses `DATABASE_URL` from `.env`):

```bash
pnpm create-admin
```

It asks for a name, email and password (at least 10 characters, typed twice and never shown). To run it without
prompts, for example on a server:

```bash
ADMIN_EMAIL="you@example.com" ADMIN_NAME="Your Name" ADMIN_PASSWORD="..." pnpm create-admin
```

Running it for an email that already has an account promotes that account to admin and resets its password,
signing it out everywhere. Interactive runs ask first; non-interactive runs need `ADMIN_UPDATE_EXISTING=yes`.
This is also how to recover if every admin is locked out.

8. Start the app:

```bash
pnpm dev
```

Open `http://localhost:3000`, sign in, and connect your Gmail when asked. Add other people in **Users & roles**.

## CSV Format

Required headers are case-insensitive and tolerate common variants:

```csv
name,company_name,hr_email,hr_name
Lochan,Example Inc,hr@example.com,Avery
```

Invalid rows are shown during upload and are not inserted into a campaign.

## Resume Storage

- Uploaded resumes go to ImageKit and the campaign stores the returned file URL.
- The sender downloads that URL and attaches the PDF to each email.
- ImageKit files are publicly readable by URL, so treat the resume as public.
- If `IMAGEKIT_PRIVATE_KEY` is blank, resumes fall back to `storage/uploads/resumes/` on this machine and the upload panel says so. That folder is outside `public/`, so the files are never served over HTTP, and it is git-ignored.
- If the key is set but the upload fails, the upload errors out instead of silently saving locally.
- Campaigns created before the ImageKit switch keep working — local resume paths are still supported.

## Templates and Saved Resumes

`/templates` manages both, so an email is written once and a resume uploaded once.

**Email templates** store the subject, the body, and your own contact details (email, phone,
LinkedIn, GitHub) — those are merged into `{{your_email}}`-style placeholders at compose time
and would otherwise be retyped for every campaign.

- One template can be marked **default**; the compose screen loads it automatically.
- "Save as template" on the compose screen saves whatever you have written.
- Template names are unique, so saving an existing name asks you to rename or edit instead.

**Saved resumes** are recorded automatically on every upload. Uploading is a one-time cost:
after that, pick the resume from the list on the home screen and it is attached straight away.

- One resume can be marked **default**.
- Removing a resume deletes only the library entry. The file stays in ImageKit, so campaigns
  already referencing it keep working.

Both track when they were last used, so the most recently used options sort to the top.

## Users and Roles

Each user sends from **their own Gmail account** (connected in Settings). Contacts, templates and resumes are
shared by everyone; each campaign belongs to the user who created it.

- Only a campaign's owner (or an admin) can start it, and it always sends from the owner's Gmail.
- Campaigns created before per-user Gmail have no owner; the first user to start one becomes its owner.

- **ADMIN** can do everything a user can, plus manage users (Users & roles) and use the Danger zone.
- **USER** can import contacts, compose and send their own campaigns, and manage templates and resumes.
- The sign-in page has no sign-up. The first admin is created with `pnpm create-admin` (setup step 7); after
  that, admins create every other account in **Users & roles**.
- Deactivating a user or resetting their password signs them out on every device at once. Signing out
  also ends the session everywhere.
- Sign-in is limited to 5 failed attempts per address and IP in 15 minutes.

## Deleting Data

The mail dashboard has a **Danger zone** at the bottom, shown to admins only, with these options:

- **Delete saved contacts** — empties the contact book. Campaigns and mail history are untouched.
- **Delete queued mail** — removes everything not yet sent. Campaigns left empty are marked completed.
- **Delete mail history** — removes every campaign and mail record. Saved contacts stay. Today's
  account-wide send count is kept, so deleting history cannot push you over Gmail's daily limit.
- **Delete everything** — empties all of the above.

Each one opens a dialog showing exactly how many rows will go, and the button stays disabled until you type `DELETE`
(case-sensitive). Each delete runs in one transaction. There is no undo and no backup.

**Deleting mail history turns off duplicate protection.** HireNow only knows not to email someone twice because it can
see the mails it already sent. Once those records are gone, everyone in your contact book becomes eligible again.

Deleting mail history is refused with a 409 while a send loop is actually running — pause the campaign first. Deleting
contacts is always allowed.

## Sending Rules

- The daily cap is per **Gmail account**, because that is how Gmail counts. A campaign stops once the account's
  sends today, across every campaign, reach that campaign's `floor(dailyLimit * safetyPercent / 100)`.
- An address that has already been emailed is never emailed again (see below).
- Sends are sequential, not parallel.
- A randomized server-side delay is awaited between consecutive sends.
- Temporary failures (timeouts, dropped connections, SMTP 4xx) are retried automatically, up to 3 attempts,
  waiting 5, then 10 minutes. Permanent failures (SMTP 5xx, bad address) are marked `FAILED` at once.
- **Retry failed** on the campaign page puts its `FAILED` recipients back in the queue.
- Pause sets the campaign to `PAUSED` and wakes the sender immediately; only an email already being sent finishes.
- If Gmail rejects the login (App Password revoked) or reports its own daily limit, the campaign pauses itself
  with the reason shown on the campaign page. Recipients stay queued; nobody is marked failed.
- One SMTP connection is reused for the whole run, and the resume is downloaded once per run, not once per email.

## One Email Per Address, Ever

An address is emailed at most once **per Gmail account**, across every campaign sent from it. Two users with
different Gmail accounts can each contact the same recruiter once.

- **Before** each send, the address is reserved by inserting a `SentEmail` row in state `SENDING`. The pair
  (sending Gmail, recruiter email) is unique, so if two campaigns from the same account reach an address at the
  same moment, only one insert succeeds and the other recipient is marked `SKIPPED`. No email goes out for a
  skipped recipient.
- History recorded before per-user Gmail (when one shared account sent everything) has no sender. It blocks
  **every** account, to be safe.
- After the email is accepted, the reservation becomes `SENT` and the recipient row is deleted, in one transaction.
- If sending fails outright, the reservation is removed so the address can be tried again.
- If the email went out but could not be recorded (the database failed, or the app crashed mid-send), the
  reservation stays. The address remains blocked: missing one recruiter is better than emailing them twice.
- Addresses are stored lowercased, so `HR@x.com` and `hr@x.com` are the same person.
- Skipped rows consume no daily quota and no batch capacity.
- `SentEmail` has no foreign key to `Campaign`, so deleting a campaign never erases the fact that
  someone was already contacted. Only "Delete mail history" clears it.
- This matters when the same contact list is imported into several campaigns, which is the normal way to use the app.

Recipients are also claimed atomically before sending, so if two send loops are ever alive at once (a dev hot reload can leave the old one running) only one of them can take a given recipient.

## Batches

Sending runs in batches rather than one continuous stream, which looks far less like a spam cannon.

- `batchSize` — how many emails go out before a pause. Default 50.
- `batchCooldownMin` — how long to wait between batches, in minutes. Default 30.
- Both are set per campaign on the compose screen.
- The batch counts send *attempts*, so a failed send still counts toward pacing.
- Set `batchCooldownMin` to `0` to send continuously up to the daily cap.
- Pausing takes effect immediately, even in the middle of a long cooldown.

### Sending pace

Pick a preset on the compose screen, or set your own values. You can change the pace later from the campaign
page with **Change**, even while it is sending.

| Preset | Delay between emails | Batch | Rest between batches | About |
|---|---|---|---|---|
| Careful | 90–240 s | 15 | 60 min | 9 / hour |
| Balanced (default) | 45–120 s | 25 | 30 min | 23 / hour |
| Steady | 20–60 s | 40 | 20 min | 51 / hour |

- Each wait is a random time between min and max, so the timing never looks machine-regular.
- Changing the delay mid-send re-times the wait already in progress; batch changes apply from the next email.
- The form warns when settings look like a burst to Gmail: under 15 s between emails, a min–max gap under 10 s,
  or more than about 80 emails an hour.
- Start new or rarely used Gmail accounts on **Careful** and move up over a week or two.
- The campaign dashboard shows the current batch and, during a cooldown, when sending resumes.
