import { cn } from "cn";
import { Badge } from "@/client/components/ui/badge";
import { formatWhen } from "@/client/lib/format";

interface ThreadMessage {
  id: string;
  kind: "incoming" | "manual" | "automated" | "broadcast" | "system";
  text: string;
  buttons: string | null;
  status: "received" | "sent" | "failed" | "shown";
  error: string | null;
  createdAt: number;
  author: string | null;
}

const KIND_LABELS = {
  incoming: null,
  manual: "Reply",
  automated: "Automation",
  broadcast: "Broadcast",
  system: null,
} as const;

/** A conversation, oldest first: what came in on the left, what went out on the right. */
export function MessageList({
  messages,
  showStatus = true,
}: {
  messages: ThreadMessage[];
  showStatus?: boolean;
}) {
  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        if (m.kind === "system") {
          return (
            <li
              key={m.id}
              data-testid="message"
              data-kind={m.kind}
              className="text-center text-xs text-muted-foreground"
            >
              {m.text}
            </li>
          );
        }
        const outgoing = m.kind !== "incoming";
        const buttons = m.buttons
          ? (JSON.parse(m.buttons) as { label: string; url: string }[])
          : [];
        return (
          <li
            key={m.id}
            data-testid="message"
            data-kind={m.kind}
            className={cn(
              "flex flex-col gap-1",
              outgoing ? "items-end" : "items-start",
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                outgoing
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              {m.text}
            </div>
            {buttons.length > 0 ? (
              <div className="flex max-w-[85%] flex-col gap-1">
                {buttons.map((b, i) => (
                  <a
                    key={i}
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-border px-3 py-1.5 text-center text-sm text-primary hover:bg-muted"
                  >
                    {b.label}
                  </a>
                ))}
              </div>
            ) : null}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {KIND_LABELS[m.kind] ? (
                <span>
                  {m.kind === "manual" && m.author
                    ? m.author
                    : KIND_LABELS[m.kind]}
                </span>
              ) : null}
              <span>{formatWhen(m.createdAt)}</span>
              {showStatus && outgoing ? (
                <Badge
                  variant={m.status === "failed" ? "destructive" : "outline"}
                  data-testid="message-status"
                  title={m.error ?? undefined}
                >
                  {m.status === "failed" ? "Failed" : "Sent"}
                </Badge>
              ) : null}
            </div>
            {m.status === "failed" && m.error ? (
              <div className="text-xs text-destructive">{m.error}</div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
