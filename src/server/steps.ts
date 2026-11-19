import { z } from "zod";

const id = z.string().min(1).max(64);
const url = z
  .string()
  .trim()
  .url("Enter a full link, starting with https://")
  .refine(
    (value) => /^https?:\/\//i.test(value),
    "Links start with http:// or https://",
  );

export const buttonSchema = z.object({
  label: z.string().trim().min(1, "Give each button a label").max(64),
  url,
});

export const stepSchema = z.discriminatedUnion("type", [
  z.object({
    id,
    type: z.literal("text"),
    text: z.string().trim().min(1, "A message step needs text").max(4000),
  }),
  z.object({
    id,
    type: z.literal("buttons"),
    text: z.string().trim().min(1, "A message step needs text").max(4000),
    buttons: z.array(buttonSchema).min(1).max(5),
  }),
  z.object({
    id,
    type: z.literal("question"),
    text: z.string().trim().min(1, "A question needs text").max(4000),
    /** "email", "phone" or "field:<custom field id>" */
    target: z.string().min(1, "Choose where to save the answer"),
    retryText: z.string().trim().max(4000).default(""),
  }),
  z.object({
    id,
    type: z.literal("delay"),
    amount: z.number().int().min(1).max(1000),
    unit: z.enum(["minutes", "hours", "days"]),
  }),
  z.object({
    id,
    type: z.literal("add_tag"),
    tagId: z.string().min(1, "Choose a tag"),
  }),
  z.object({
    id,
    type: z.literal("remove_tag"),
    tagId: z.string().min(1, "Choose a tag"),
  }),
]);

export type Step = z.infer<typeof stepSchema>;
export type StepType = Step["type"];
export type Button = z.infer<typeof buttonSchema>;

export const DEFAULT_RETRY = "That doesn't look right. Please try again.";

const UNIT_MS = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };

export function delayMs(step: { amount: number; unit: keyof typeof UNIT_MS }) {
  return step.amount * UNIT_MS[step.unit];
}

export function delayLabel(step: {
  amount: number;
  unit: keyof typeof UNIT_MS;
}) {
  const unit = step.amount === 1 ? step.unit.slice(0, -1) : step.unit;
  return `${step.amount} ${unit}`;
}

/** Lowercased and trimmed, inner whitespace collapsed. */
export function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Whether a message matches any keyword, case-insensitively. */
export function matchesKeywords(
  text: string,
  keywords: string[],
  match: "exact" | "contains",
): boolean {
  const message = normalize(text);
  return keywords
    .map(normalize)
    .filter(Boolean)
    .some((keyword) =>
      match === "exact" ? message === keyword : message.includes(keyword),
    );
}

/** Splits "hours, opening" into ["hours", "opening"]. */
export function parseKeywords(input: string): string[] {
  return [
    ...new Set(
      input
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
    ),
  ];
}

type FieldType = "text" | "number" | "email" | "phone";

/** The value to store, or null when the answer isn't of the type. */
export function validateValue(type: FieldType, input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  switch (type) {
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? value.toLowerCase()
        : null;
    case "phone": {
      const digits = value.replace(/[\s().-]/g, "");
      return /^\+?\d{6,15}$/.test(digits) ? digits : null;
    }
    case "number":
      return value !== "" && Number.isFinite(Number(value))
        ? String(Number(value))
        : null;
    default:
      return value.slice(0, 1000);
  }
}
