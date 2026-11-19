import { describe, expect, it } from "vitest";
import {
  matchesKeywords,
  parseKeywords,
  validateValue,
  delayLabel,
} from "./steps";

describe("keywords", () => {
  it("matches exactly, ignoring case and spacing", () => {
    expect(matchesKeywords("  Price ", ["price"], "exact")).toBe(true);
    expect(matchesKeywords("price list", ["price"], "exact")).toBe(false);
  });
  it("matches inside a message", () => {
    expect(matchesKeywords("What are your HOURS?", ["hours"], "contains")).toBe(
      true,
    );
    expect(matchesKeywords("hello", ["hours", "open"], "contains")).toBe(false);
  });
  it("splits a keyword list", () => {
    expect(parseKeywords("hours, opening,,hours")).toEqual([
      "hours",
      "opening",
    ]);
  });
});

describe("answers", () => {
  it("checks emails", () => {
    expect(validateValue("email", "Dana@Example.com")).toBe("dana@example.com");
    expect(validateValue("email", "dana at example")).toBeNull();
  });
  it("checks phone numbers", () => {
    expect(validateValue("phone", "+1 (555) 123-4567")).toBe("+15551234567");
    expect(validateValue("phone", "call me")).toBeNull();
  });
  it("checks numbers", () => {
    expect(validateValue("number", "42")).toBe("42");
    expect(validateValue("number", "forty")).toBeNull();
  });
  it("labels delays", () => {
    expect(delayLabel({ amount: 1, unit: "hours" })).toBe("1 hour");
    expect(delayLabel({ amount: 2, unit: "days" })).toBe("2 days");
  });
});
