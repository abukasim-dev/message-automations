export const BROADCAST_STATUS = {
  draft: { label: "Draft", variant: "outline" },
  scheduled: { label: "Scheduled", variant: "soft" },
  sending: { label: "Sending", variant: "warning" },
  sent: { label: "Sent", variant: "success" },
  canceled: { label: "Canceled", variant: "secondary" },
} as const;
