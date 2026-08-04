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
GMAIL_USER="your.email@gmail.com"
GMAIL_APP_PASSWORD="your-16-character-app-password"
SENDER_NAME="Your Name"
IMAGEKIT_PRIVATE_KEY="private_xxxxxxxxxxxxxxxxxxxxxxxxxxx"
IMAGEKIT_FOLDER="/hirenow/resumes"
```

4. Create a Gmail App Password:

- Enable 2-Step Verification on your Google account.
- Open Google Account > Security > App passwords.
- Create an app password for Mail.
- Paste the generated password into `GMAIL_APP_PASSWORD`.

5. Get your ImageKit private key:

- Sign up at [imagekit.io](https://imagekit.io) and open the dashboard.
- Go to Developer options > API keys.
- Copy the **private key** (it starts with `private_`) into `IMAGEKIT_PRIVATE_KEY`.

Only the private key is needed — the SDK uploads server-side and returns the file URL.
`IMAGEKIT_FOLDER` is optional and defaults to `/hirenow/resumes`.

6. Generate Prisma Client and run the first migration:

```bash
npx prisma generate
npx prisma migrate dev --name init
```

7. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

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
- If `IMAGEKIT_PRIVATE_KEY` is blank, resumes fall back to `public/uploads/resumes/` on this machine and the upload panel says so.
- If the key is set but the upload fails, the upload errors out instead of silently saving locally.
- Campaigns created before the ImageKit switch keep working — local resume paths are still supported.

## Sending Rules

- The app never sends more than `floor(dailyLimit * safetyPercent / 100)` emails for a campaign per calendar day.
- Recipients already marked `SENT` are never sent again.
- Sends are sequential, not parallel.
- A randomized server-side delay is awaited between consecutive sends.
- Failed sends are marked `FAILED` with the error message and are not retried automatically.
- Pause sets the campaign to `PAUSED`; the background loop checks this before each send.
