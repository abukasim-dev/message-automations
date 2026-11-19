import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Page } from "@/client/components/AppNav";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/client/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { formatWhen } from "@/client/lib/format";
import { listContacts } from "@/serverFunctions/app";

const search = z.object({
  q: z.string().catch("").default(""),
  tag: z.string().catch("").default(""),
  subscription: z
    .enum(["all", "subscribed", "unsubscribed"])
    .catch("all")
    .default("all"),
  sort: z
    .enum(["recent", "first_seen", "name"])
    .catch("recent")
    .default("recent"),
  page: z.number().int().min(1).catch(1).default(1),
});

export const Route = createFileRoute("/contacts/")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listContacts({ data: deps }),
  head: () => ({ meta: [{ title: "Contacts · Message Automations" }] }),
  component: Contacts,
});

function Contacts() {
  const data = Route.useLoaderData();
  const params = Route.useSearch();
  const navigate = useNavigate({ from: "/contacts/" });
  const [q, setQ] = useState(params.q);
  const set = (change: Partial<typeof params>) =>
    navigate({
      search: (prev) => ({ ...prev, page: 1, ...change }),
      replace: true,
    });

  useEffect(() => {
    if (q === params.q) return;
    const timer = setTimeout(() => set({ q }), 250);
    return () => clearTimeout(timer);
  }, [q]);

  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const filtered = params.q || params.tag || params.subscription !== "all";

  return (
    <Page>
      <PageHeader
        title="Contacts"
        description={`${data.total} ${data.total === 1 ? "contact" : "contacts"}`}
      />
      <div className="flex flex-wrap gap-2">
        <Input
          type="search"
          aria-label="Search contacts"
          placeholder="Search by name, username or email"
          className="min-w-48 flex-1"
          data-testid="contact-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <NativeSelect
          aria-label="Tag"
          data-testid="tag-filter"
          value={params.tag}
          onChange={(e) => set({ tag: e.target.value })}
        >
          <NativeSelectOption value="">Any tag</NativeSelectOption>
          {data.tags.map((t) => (
            <NativeSelectOption key={t.id} value={t.id}>
              {t.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Subscription"
          data-testid="subscription-filter"
          value={params.subscription}
          onChange={(e) =>
            set({ subscription: e.target.value as typeof params.subscription })
          }
        >
          <NativeSelectOption value="all">Subscribed or not</NativeSelectOption>
          <NativeSelectOption value="subscribed">Subscribed</NativeSelectOption>
          <NativeSelectOption value="unsubscribed">
            Unsubscribed
          </NativeSelectOption>
        </NativeSelect>
        <NativeSelect
          aria-label="Sort"
          data-testid="sort-select"
          value={params.sort}
          onChange={(e) => set({ sort: e.target.value as typeof params.sort })}
        >
          <NativeSelectOption value="recent">Last message</NativeSelectOption>
          <NativeSelectOption value="first_seen">Newest</NativeSelectOption>
          <NativeSelectOption value="name">Name</NativeSelectOption>
        </NativeSelect>
      </div>
      {data.contacts.length === 0 ? (
        filtered ? (
          <EmptyState kind="filtered" title="No contacts match" />
        ) : (
          <EmptyState
            title="No contacts yet"
            description="Everyone who messages your bot shows up here."
          />
        )
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>Last message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.contacts.map((c) => (
                <TableRow key={c.id} data-testid="contact-row">
                  <TableCell>
                    <Link
                      to="/contacts/$id"
                      params={{ id: c.id }}
                      className="font-medium hover:underline"
                    >
                      {c.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {c.username ? `@${c.username}` : null}
                      {c.subscribed ? null : (
                        <span>{c.username ? " · " : ""}Unsubscribed</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.tags.map((t) => (
                        <Badge key={t} variant="secondary">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatWhen(c.lastInteractionAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span data-testid="page-info" className="text-muted-foreground">
            Page {params.page} of {pages}
          </span>
          <Button
            size="sm"
            variant="outline"
            data-testid="prev-page"
            disabled={params.page <= 1}
            onClick={() =>
              navigate({
                search: (prev) => ({ ...prev, page: params.page - 1 }),
              })
            }
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            data-testid="next-page"
            disabled={params.page >= pages}
            onClick={() =>
              navigate({
                search: (prev) => ({ ...prev, page: params.page + 1 }),
              })
            }
          >
            Next
          </Button>
        </div>
      ) : null}
    </Page>
  );
}
