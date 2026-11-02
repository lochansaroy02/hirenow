#!/usr/bin/env node
// Creates an administrator account, or promotes an existing account to admin and
// resets its password. This is the only way to create the first account: the sign-in
// page has no sign-up.
//
//   pnpm create-admin                       # prompts for name, email, password
//   ADMIN_EMAIL=… ADMIN_NAME=… ADMIN_PASSWORD=… pnpm create-admin   # no prompts
//
// Uses DATABASE_URL from the environment or .env, like the app.

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

// Must match src/lib/auth.ts.
const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

/** Reads a line without echoing it, for passwords. */
function askHidden(question) {
  return new Promise((resolve) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";

    function onData(char) {
      if (char === "\r" || char === "\n" || char === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolve(value);
      } else if (char === "\u0003") {
        stdout.write("\n");
        process.exit(130);
      } else if (char === "\u007f" || char === "\b") {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    }

    stdin.on("data", onData);
  });
}

async function readInput() {
  const fromEnv = {
    email: process.env.ADMIN_EMAIL,
    name: process.env.ADMIN_NAME,
    password: process.env.ADMIN_PASSWORD,
  };

  if (fromEnv.email && fromEnv.password) {
    return { ...fromEnv, interactive: false };
  }

  if (!stdin.isTTY) {
    fail("Run this in a terminal, or set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD.");
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const name = (await rl.question("Name: ")).trim();
  const email = (await rl.question("Email: ")).trim();
  rl.close();

  const password = await askHidden(`Password (at least ${MIN_PASSWORD_LENGTH} characters): `);
  const confirm = await askHidden("Repeat password: ");

  if (password !== confirm) {
    fail("The passwords did not match. Nothing was changed.");
  }

  return { name, email, password, interactive: true };
}

async function confirm(question) {
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question(question)).trim().toLowerCase();
  rl.close();
  return answer === "y" || answer === "yes";
}

async function main() {
  const input = await readInput();
  const email = input.email?.trim().toLowerCase() ?? "";
  const name = input.name?.trim() ?? "";

  if (!EMAIL_REGEX.test(email)) {
    fail("Enter a valid email address.");
  }

  if ((input.password ?? "").length < MIN_PASSWORD_LENGTH) {
    fail(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const prisma = new PrismaClient();

  try {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const existing = await prisma.user.findUnique({ where: { email } });

    if (existing) {
      const proceed = input.interactive
        ? await confirm(`${email} already has an account. Make it an admin and set this password? (y/N) `)
        : process.env.ADMIN_UPDATE_EXISTING === "yes";

      if (!proceed) {
        fail(
          input.interactive
            ? "Nothing was changed."
            : `${email} already exists. Set ADMIN_UPDATE_EXISTING=yes to promote it and reset its password.`,
        );
      }

      await prisma.user.update({
        where: { email },
        data: {
          role: "ADMIN",
          isActive: true,
          passwordHash,
          ...(name ? { name } : {}),
          // A password reset ends any session already open with the old password.
          tokenVersion: { increment: 1 },
        },
      });

      console.log(`\n✓ ${email} is now an administrator, with the new password. Sign in at /login.`);
      return;
    }

    if (!name) {
      fail("Enter a name for the new account.");
    }

    await prisma.user.create({ data: { email, name, passwordHash, role: "ADMIN" } });
    console.log(`\n✓ Created administrator ${email}. Sign in at /login, then add other users in Users & roles.`);
  } catch (error) {
    if (error?.code === "P1001" || error?.name === "PrismaClientInitializationError") {
      fail(`Could not reach the database. Check DATABASE_URL.\n  ${error.message.split("\n").find(Boolean)}`);
    }

    if (error?.code === "P2022" || error?.code === "P2021") {
      fail("The database schema is out of date. Run: npx prisma migrate deploy");
    }

    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

await main();
