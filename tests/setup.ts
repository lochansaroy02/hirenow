// Tests truncate tables, so they must never reach a real database. Prisma reads
// .env on its own when DATABASE_URL is unset, so it is always set explicitly here:
// to TEST_DATABASE_URL when that points at localhost, otherwise to an address that
// cannot connect.
const testUrl = process.env.TEST_DATABASE_URL;
const isLocal = Boolean(testUrl && /@(localhost|127\.0\.0\.1)(:\d+)?\//.test(testUrl));

process.env.DATABASE_URL = isLocal ? testUrl : "postgresql://no-test-database@127.0.0.1:1/none";

export const hasTestDatabase = isLocal;
