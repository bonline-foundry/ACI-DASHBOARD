export function assertEnv(env: Record<string, string | undefined>): { databaseUrl: string } {
  const url = env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Run `neon checkout dev` to pull it into .env.local.");
  const expected = env.NEON_EXPECTED_ENDPOINT;
  if (!expected) throw new Error("NEON_EXPECTED_ENDPOINT is not set. Add the Neon endpoint id to .env.local.");

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("DATABASE_URL is not a valid URL.");
  }
  if (!host.startsWith(expected)) {
    const actual = host.split(".")[0];
    throw new Error(`DATABASE_URL points to "${actual}", expected endpoint "${expected}". Refusing to start.`);
  }
  return { databaseUrl: url };
}
