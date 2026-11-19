import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { z } from "zod";
import { Page } from "@/client/components/AppNav";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/client/components/ui/native-select";
import { formatWhen } from "@/client/lib/format";
import { listConversations } from "@/serverFunctions/app";

const FILTERS = {
  open: "Open",
  done: "Done",
  starred: "Starred",
  mine: "Assigned to me",
  all: "All",
} as const;

export const Route = createFileRoute("/inbox/")({
  validateSearch: z.object({
    filter: z
      .enum(["open", "done", "starred", "mine", "all"])
      .catch("open")
      .default("open"),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listConversations({ data: deps }),
  head: () => ({ meta: [{ title: "Inbox · Message Automations" }] }),
  component: Inbox,
});

function Inbox() {
  const conversations = Route.useLoaderData();
  const { filter } = Route.useSearch();
  const navigate = useNavigate({ from: "/inbox/" });
  return (
    <Page>
      <PageHeader
        title="Inbox"
        actions={
          <NativeSelect
            aria-label="Show"
            data-testid="inbox-filter"
            value={filter}
            onChange={(e) =>
              navigate({
                search: { filter: e.target.value as typeof filter },
                replace: true,
              })
            }
          >
            {Object.entries(FILTERS).map(([value, label]) => (
              <NativeSelectOption key={value} value={value}>
                {label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        }
      />
      {conversations.length === 0 ? (
        filter === "open" || filter === "all" ? (
          <EmptyState
            title="No conversations"
            description="Messages to your bot land here."
          />
        ) : (
          <EmptyState
            kind="filtered"
            title={`Nothing in ${FILTERS[filter].toLowerCase()}`}
          />
        )
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                to="/inbox/$contactId"
                params={{ contactId: c.id }}
                data-testid="conversation-row"
                className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{c.name}</span>
                    {c.starred ? (
                      <Star
                        className="size-3.5 shrink-0 fill-current text-warning"
                        aria-label="Starred"
                      />
                    ) : null}
                    {c.status === "done" ? (
                      <Badge variant="outline">Done</Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {c.lastMessageText}
                  </p>
                </div>
                <div className="shrink-0 space-y-0.5 text-right text-xs text-muted-foreground">
                  <div>{formatWhen(c.lastMessageAt)}</div>
                  {c.assignee ? (
                    <div className="max-w-32 truncate">{c.assignee}</div>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
