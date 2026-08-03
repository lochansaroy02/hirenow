# Bulk Job-Application Mailer

A local Next.js app for sending personalized job-application emails from a CSV list of HR contacts. It uses Gmail SMTP, a resume PDF attachment, Prisma, and PostgreSQL. Sending runs in a local background loop with a daily safety cap and randomized delays.

## Requirements

- Node.js 20.9+
- PostgreSQL running locally
- Gmail account with 2-Step Verification enabled
- Gmail App Password

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
```

4. Create a Gmail App Password:

- Enable 2-Step Verification on your Google account.
- Open Google Account > Security > App passwords.
- Create an app password for Mail.
- Paste the generated password into `GMAIL_APP_PASSWORD`.

5. Generate Prisma Client and run the first migration:

```bash
npx prisma generate
npx prisma migrate dev --name init
```

6. Start the app:

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

## Sending Rules

- The app never sends more than `floor(dailyLimit * safetyPercent / 100)` emails for a campaign per calendar day.
- Recipients already marked `SENT` are never sent again.
- Sends are sequential, not parallel.
- A randomized server-side delay is awaited between consecutive sends.
- Failed sends are marked `FAILED` with the error message and are not retried automatically.
- Pause sets the campaign to `PAUSED`; the background loop checks this before each send.
