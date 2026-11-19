export const TRIGGER_LABELS = {
  welcome: "Welcome",
  keyword: "Keyword",
  default: "Default reply",
} as const;

export const TRIGGER_OPTIONS = {
  welcome: "Welcome: first message or /start",
  keyword: "Keyword: a message has a keyword",
  default: "Default reply: nothing else matched",
} as const;

export const FIELD_TYPE_LABELS = {
  text: "Text",
  number: "Number",
  email: "Email",
  phone: "Phone",
} as const;
