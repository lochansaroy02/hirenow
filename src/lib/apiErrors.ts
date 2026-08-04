import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

type ApiErrorOptions = {
  fallback: string;
  fallbackStatus?: number;
};

function isDatabaseConnectionError(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P1000" || error.code === "P1001" || error.code === "P1002";
  }

  const message = error instanceof Error ? error.message : String(error);
  return /database|postgres|connection|connect|ECONNREFUSED|Can't reach database|P1001/i.test(message);
}

export function apiErrorResponse(error: unknown, { fallback, fallbackStatus = 500 }: ApiErrorOptions) {
  const message = error instanceof Error ? error.message : "";

  if (isDatabaseConnectionError(error)) {
    return NextResponse.json(
      {
        error: "Database connection failed. Please make sure PostgreSQL is running and DATABASE_URL is correct.",
        details: message,
      },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      error: message || fallback,
    },
    { status: fallbackStatus },
  );
}
