import { describe, expect, test } from "bun:test";
import { tomlKey, tomlString, tomlValue } from "../src/toml.ts";

describe("TOML rendering for -c values", () => {
  test("round-trips through a TOML parser, escapes included", () => {
    const value = {
      command: "uvx",
      args: ["a", 'quote"d', "line\nbreak", "tab\t", "back\\slash"],
      env: { A: "1", "odd key": "v" },
      enabled: true,
      startup_timeout_sec: 5,
      ratio: 0.5,
    };
    const rendered = tomlValue(value);
    expect(Bun.TOML.parse(`x = ${rendered}`)).toEqual({ x: value });
    expect(tomlString("plain")).toBe('"plain"');
    expect(tomlString("")).toBe('"\\u0001"');
    expect(tomlKey("ok-key_1")).toBe("ok-key_1");
    expect(tomlKey("a.b")).toBe('"a.b"');
    expect(() => tomlValue(Number.NaN)).toThrow();
    expect(() => tomlValue(null)).toThrow();
  });
});
