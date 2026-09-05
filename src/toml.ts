/**
 * Renders JSON-shaped values as TOML for Codex's `-c key=value`, which parses
 * the value as TOML. Basic strings with escapes keep newlines and quotes intact
 * where a raw fallback would not.
 */
const BARE_KEY = /^[A-Za-z0-9_-]+$/;

export function tomlString(value: string): string {
  let out = '"';
  for (const char of value) {
    switch (char) {
      case '"':
        out += '\\"';
        break;
      case "\\":
        out += "\\\\";
        break;
      case "\n":
        out += "\\n";
        break;
      case "\r":
        out += "\\r";
        break;
      case "\t":
        out += "\\t";
        break;
      default: {
        const code = char.codePointAt(0)!;
        out += code < 0x20 || code === 0x7f ? `\\u${code.toString(16).padStart(4, "0")}` : char;
      }
    }
  }
  return `${out}"`;
}

export function tomlKey(key: string): string {
  return BARE_KEY.test(key) ? key : tomlString(key);
}

export function tomlValue(value: unknown): string {
  if (typeof value === "string") return tomlString(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`cannot render ${value} as TOML`);
    return Number.isInteger(value) ? String(value) : value.toString();
  }
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([key, entry]) => `${tomlKey(key)}=${tomlValue(entry)}`,
    );
    return `{${entries.join(",")}}`;
  }
  throw new Error(`cannot render ${String(value)} as TOML`);
}
