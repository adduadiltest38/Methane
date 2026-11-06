import postgres from "postgres";

// The web app only ever reads. In production DATABASE_URL_READONLY points at the
// `flarewatch_web` role, which has SELECT-only grants (db/migrations/003_readonly_role.sql).
const url = clean(process.env.DATABASE_URL_READONLY ?? process.env.DATABASE_URL);

// Tolerate common copy-paste slips: surrounding whitespace/newlines and wrapping quotes.
function clean(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  let s = v.trim();
  if (s.length >= 2 && (s[0] === '"' || s[0] === "'") && s.at(-1) === s[0]) s = s.slice(1, -1).trim();
  return s;
}

// Explain what is wrong with an unparseable connection string WITHOUT echoing any of it.
export function describeUrlProblem(v: string): string {
  if (!/^postgres(ql)?:\/\//.test(v)) return "it must start with postgresql://";
  if (/\s/.test(v)) return "it contains a space or line break";
  const rest = v.replace(/^postgres(ql)?:\/\//, "");
  const at = rest.lastIndexOf("@");
  if (at < 0) return "it has no '@' between the password and the host";
  const userinfo = rest.slice(0, at);
  if (userinfo.includes("@")) return "the password contains '@' (use letters and digits only, or encode it as %40)";
  if (/[#?/]/.test(userinfo)) return "the password contains '#', '?' or '/' (use letters and digits only)";
  if ((userinfo.match(/:/g) ?? []).length > 1) return "the password contains ':' (use letters and digits only)";
  if (/%(?![0-9A-Fa-f]{2})/.test(userinfo)) return "the password contains '%' (use letters and digits only)";
  return "check the host and database parts after '@'";
}

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
    throw new ConfigError(`DATABASE_URL_READONLY is not a valid URL: ${describeUrlProblem(url)}`);
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
