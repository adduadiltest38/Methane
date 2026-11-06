import postgres from "postgres";

// The web app only ever reads. In production DATABASE_URL_READONLY points at the
// `flarewatch_web` role, which has SELECT-only grants (db/migrations/003_readonly_role.sql).
const url = process.env.DATABASE_URL_READONLY ?? process.env.DATABASE_URL;

declare global {
  var __flarewatchSql: postgres.Sql | undefined;
}

export class ConfigError extends Error {}

function create(): postgres.Sql {
  if (!url) throw new ConfigError("DATABASE_URL_READONLY is not set");
  try {
    new URL(url);
  } catch {
    // Never include the URL itself: it contains the password.
    throw new ConfigError(
      "DATABASE_URL_READONLY is not a valid URL. Special characters in the password " +
        "(such as @ # / ? :) must be percent-encoded, or use a letters-and-digits password.",
    );
  }
  return postgres(url, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // compatible with transaction-mode poolers (Neon / Supabase)
    connection: { default_transaction_read_only: true },
  });
}

export function sql(): postgres.Sql {
  globalThis.__flarewatchSql ??= create();
  return globalThis.__flarewatchSql;
}
