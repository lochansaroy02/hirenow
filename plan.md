# HireNow fix plan

This plan fixes the problems found in the October 2026 code audit. Work is grouped into phases in the order it should be done. Each phase can ship as its own PR.

Each item says **what** changes, **why** it matters, and **where** the change goes.

---

## Phase 0: Stop the bleeding (do this before running any Prisma command)

### 0.1 Restore the `User` model and `Role` enum in `prisma/schema.prisma`
- **What:** Copy the `Role` enum and `User` model back into `prisma/schema.prisma`. The copy that the generated client was built from is in `node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/schema.prisma`.
- **Why:** The auth code (`src/lib/auth.ts`, `/api/users`, `/api/auth/*`) reads and writes `prisma.user`. The schema file doesn't define it right now, so the next `prisma generate` breaks the build. Running `prisma db push` or `migrate` would also **drop the live `User` table and every account in it**.
- **Check:** `npx prisma generate && npx tsc --noEmit` passes. `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma` reports no `User` drop.

### 0.2 Start committing migrations
- **What:** Run `npx prisma migrate diff` against the live database to create a baseline migration, mark it as applied with `prisma migrate resolve --applied`, and commit `prisma/migrations/`.
- **Why:** The README tells people to run `migrate dev`, but the repo has no migrations. Without them, schema changes depend on `db push`, which is what put the `User` table at risk.

### 0.3 Remove resumes from git
- **What:** Add `public/uploads/` (but keep `.gitkeep`) to `.gitignore`, then `git rm --cached` the PDFs. If the repo has ever been pushed anywhere shared, also rewrite history with `git filter-repo`.
- **Why:** The repo contains real resumes, which are personal data (name, phone, email). Anyone with access to the repo can read them.

---

## Phase 1: Access control

### 1.1 Gate destructive and admin-level endpoints by role
- **What:** Add `await requireAdmin()` to `POST /api/purge`. Add `await requireUser()` (which checks the database) to every other mutating route: campaign create, start and pause; uploads; template and resume writes. Return errors through `authAwareErrorResponse`.
- **Why:** Right now any signed-in `USER` can wipe the whole database, including the sent-email history that prevents double emails. The proxy only proves that a token was valid at some point, not that the account is still active or allowed to do this.

### 1.2 Make deactivation and logout actually revoke access
- **What:** Add a `tokenVersion Int @default(0)` column to `User` and put it in the JWT. `requireUser()` compares the token's version with the database value. Increment it on deactivation, role change, password reset and logout.
- **Why:** Tokens last 7 days and the proxy never checks the database, so a fired or demoted user keeps full access until their token expires. Logout only clears the cookie in that one browser.
- **Note:** This keeps the proxy fast (it still only verifies the signature) and puts the database check in the route handlers, which already call `requireUser()` after step 1.1.

### 1.3 Fix the open redirect on login
- **What:** In `LoginForm.tsx`, only accept `next` if it starts with `/` and not `//` or `/\`. Otherwise use `/`.
- **Why:** `/login?next=https://evil.com` currently sends the user to an attacker's site right after a real sign-in. That makes phishing links look trustworthy.

### 1.4 Rate-limit login and make bootstrap safe
- **What:**
  - Add an in-memory limiter (this is a single-process app) for `/api/auth/login`: about 5 failures per email+IP per 15 minutes.
  - Wrap bootstrap in a `$transaction` with a `SERIALIZABLE` isolation level so only one first admin can be created.
  - Optionally require a `BOOTSTRAP_TOKEN` env var for the first signup.
- **Why:** Without a limit, passwords can be brute-forced. Two simultaneous bootstrap requests can both see "no users" and create two admins. Anyone who reaches the app before the owner signs up can claim admin.

### 1.5 Stop serving local resumes publicly
- **What:** Save local uploads to `storage/resumes/` (outside `public/`) and serve them through an authenticated route `GET /api/resumes/[id]/file`. Update `readLocalResume` in `mailer.ts` to read from the new location and keep accepting old `/uploads/...` paths.
- **Why:** Files in `public/` are served by Next directly, and the proxy matcher skips `.pdf`, so anyone who knows the URL can download a resume.

---

## Phase 2: Sending correctness (the core of the product)

### 2.1 Count the daily cap per Gmail account, not per campaign
- **What:** Add a `SenderDailyLog { date String @id; countSent Int }` table, keyed only by date because there is one sender account. The send loop checks and increments it in the same transaction as the send record. Keep `DailySendLog` for per-campaign display only, or remove it. Purge must **not** delete `SenderDailyLog`.
- **Why:** Gmail's limit (about 500 a day) applies to the whole account. Today two campaigns at 400 each send 800, and deleting mail history resets the counter mid-day. Either one can get the Gmail account suspended, which stops all outreach.

### 2.2 Reserve the address before sending, not after
- **What:** Change the order in `runSendLoop`:
  1. **Reserve:** insert into `SentEmail` with a new `state` column set to `SENDING`. Because `hrEmail` is unique, the insert fails if any other loop has already reserved or sent to this address. If it fails, mark the recipient `SKIPPED`.
  2. **Send** with nodemailer.
  3. **Confirm:** in one transaction, set `SentEmail.state = SENT`, delete the recipient, and increment the daily counter.
  4. **Release on a definite failure** (SMTP rejected it): delete the `SENDING` reservation and mark the recipient as failed.
- **Why:** Today the check and the write happen at different times, so two campaigns can both pass the check and email the same recruiter. With a reservation, the database's unique constraint makes a double send impossible.

### 2.3 Never re-send after "sent, but the database write failed"
- **What:** Keep the two failure cases separate:
  - If `sendMail` resolved but step 3 failed, keep the `SENDING` reservation. The address stays blocked, which is the safe direction. Log the error and mark the recipient `SENT_UNCONFIRMED` (or just leave it in place).
  - On startup, or when a campaign resumes, treat any `SENDING` row older than a few minutes as **sent**. Never re-send it.
- **Why:** At the moment, a database error after a successful send marks the row `FAILED` with no send record, and a crash between the send and the write leaves it `PENDING`. Both lead to a second email to the same recruiter, which is the one thing this app is meant to prevent.

### 2.4 Make retries work
- **What:** For temporary SMTP errors (4xx codes, timeouts, `ECONNRESET`), put the recipient back to `PENDING` with `attempts` incremented and a `nextAttemptAt` backoff. For permanent errors (5xx, invalid address), set `FAILED`. Add `POST /api/campaign/[id]/retry-failed`, which resets `FAILED` rows to `PENDING`, and a button for it in the dashboard.
- **Why:** Right now one network blip fails a recipient permanently. The 3-attempt limit exists but never takes effect.

### 2.5 Fix the "Pause, then Start straight away" state
- **What:** Store an `AbortController` with each campaign's runtime. Pausing aborts it, which wakes the `sleep`/`waitUnlessStopped` call immediately. `startCampaignJob` waits for the old loop to exit (or for the abort) before deciding the campaign is "already sending".
- **Why:** At the moment the loop can sleep for up to 20 seconds after a pause, so pressing Start says "already sending" while the campaign is actually stopping.

### 2.6 Cache the resume and reuse one SMTP connection
- **What:** Download or read the resume once per loop run and keep the `Buffer`. Create one nodemailer transporter with `pool: true` per loop and close it in `finally`. Use the saved `attachmentFilename` (from `SavedResume`) instead of the last part of the URL.
- **Why:** Each email currently downloads the PDF from ImageKit again and opens a new SMTP login. That's slow, uses ImageKit bandwidth, and many logins can trigger Gmail's abuse checks. The attachment name also currently includes ImageKit's random suffix.

---

## Phase 3: Data and API correctness

### 3.1 Validate and dedupe recipients when a campaign is created
- **What:** In `/api/campaign/create`:
  - Validate `hr_email` with the same regex as `csv.ts`.
  - Lowercase it and remove duplicates.
  - Reject the request if both `recipients` and `contactIds` are empty. **Never** fall back to "all contacts".
  - Set a maximum recipient count, for example 10,000.
  - Show "N already contacted" by checking `SentEmail` before the campaign is created.
- **Why:** If the request body is empty, the current fallback quietly targets the entire contact book. The client sends `validRows` before duplicates are removed, and invalid addresses are only discovered when the send fails.

### 3.2 Fix the campaign totals
- **What:** In `/api/campaign/status`, set `total = sent + remaining recipients`, where `sent` is `SentEmail.count({ campaignId })`. Paginate the `recipients` list (for example the first 200, with filters) instead of returning every row on every 4-second poll.
- **Why:** Sent rows are deleted, so "Total" currently goes down as mail goes out and ends up smaller than "Sent". Returning thousands of rows every 4 seconds is also slow.

### 3.3 Make the mail dashboard tallies follow the filters
- **What:** In `/api/mails`, build `sentWhere` from the same campaign and search filters and use `sentEmail.count({ where: sentWhere })` for the `sent` count and the total.
- **Why:** The "Sent" tally is always the global number, so it doesn't match the table when a campaign or search filter is applied.

### 3.4 Make multi-step writes atomic
- **What:** Wrap "clear the old default, then set the new one" in `$transaction` for templates and resumes. Wrap purge in a single `$transaction`. Map Prisma `P2002` (unique constraint) errors to a 409 with a readable message. "Delete queued" also deletes or completes campaigns left with no recipients.
- **Why:** A failure halfway through can leave no default, or several. Purge can leave a partial delete. Renaming a template to an existing name currently returns a raw Prisma 500. Empty `ACTIVE` campaigns keep the dashboard polling forever.

### 3.5 Return errors that are accurate and don't leak internals
- **What:**
  - In `apiErrors.ts`, only classify an error as a database connection problem by Prisma error class or code. Remove the `/connection|connect|database/` regex.
  - Return a generic message to the client and log the details on the server. Show `details` only when `NODE_ENV !== "production"`.
- **Why:** Today SMTP timeouts show up as "Database connection failed", and raw Prisma or SMTP messages, including internal details, reach the browser.

---

## Phase 4: Dependencies and uploads

### 4.1 Replace `xlsx@0.18.5`
- **What:** Install SheetJS from its own CDN (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) or switch to `exceljs`.
- **Why:** The npm version has known vulnerabilities (prototype pollution CVE-2023-30533 and ReDoS CVE-2024-22363), and it parses files that users upload.

### 4.2 Limit and check uploads
- **What:** Limit `/api/upload-csv` to 5 MB and 20,000 rows. In `/api/upload-resume`, check that the file starts with `%PDF-` instead of trusting `file.type`.
- **Why:** A large spreadsheet can use up all the server's memory. The browser-reported file type is easy to fake.

### 4.3 Guard CSV export against formula injection
- **What:** In `csvEscape`, put a `'` in front of cells that start with `=`, `+`, `-`, `@`, a tab or a carriage return.
- **Why:** Contact names come from imported spreadsheets. A value like `=HYPERLINK(...)` runs as a formula when the export is opened in Excel.

---

## Phase 5: Docs and setup

- Add `AUTH_SECRET` (with `openssl rand -base64 32`) to `.env.example` and the README. **Why:** Without it, sign-in quietly fails and every request is treated as signed out.
- Document the roles (what `ADMIN` can do that `USER` can't) and the fact that all users share one Gmail account and one data set. **Why:** It's a deliberate single-account model, and it should be written down rather than discovered by accident.
- Add a `postinstall: prisma generate` script. **Why:** This keeps the generated client in sync with the schema, which is how the `User` model drift (0.1) went unnoticed.

---

## Testing plan

There are no tests today. Add Vitest with a throwaway Postgres database (Docker or a Neon branch), and cover:
1. **Dedup race:** two loops send to the same address at once, and exactly one email goes out.
2. **Crash after send:** make the confirm transaction throw, and check that the address is never emailed again.
3. **Shared daily cap:** two campaigns stop together at the account limit.
4. **Authorization:** a `USER` gets 403 on purge, and a deactivated user gets 401 on the next request.
5. **Login redirect:** `next=//evil.com` goes to `/`.

Use a mocked nodemailer transport (`jsonTransport: true`) so tests never send real email.

## Order and effort

| Phase | Effort | Blocks |
|---|---|---|
| 0: schema, migrations, resumes in git | ~1 hr | Everything else |
| 1: access control | ~0.5 day | — |
| 2: sending correctness | ~1 day | Needs the 0.2 migrations |
| 3: data and API correctness | ~0.5 day | — |
| 4: dependencies and uploads | ~2 hr | — |
| 5: docs, plus tests | ~0.5 day | Tests follow phase 2 |
