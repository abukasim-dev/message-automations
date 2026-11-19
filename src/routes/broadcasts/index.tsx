import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Page } from "@/client/components/AppNav";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { BROADCAST_STATUS } from "@/client/lib/broadcast";
import { formatDateTime, useAction } from "@/client/lib/format";
import { createBroadcast, listBroadcasts } from "@/serverFunctions/app";

export const Route = createFileRoute("/broadcasts/")({
  loader: () => listBroadcasts(),
  head: () => ({ meta: [{ title: "Broadcasts · Message Automations" }] }),
  component: Broadcasts,
});

function Broadcasts() {
  const broadcasts = Route.useLoaderData();
  const navigate = useNavigate();
  const { run, pending } = useAction();
  const create = async () => {
    const created = await run(() => createBroadcast());
    if (created)
      await navigate({ to: "/broadcasts/$id", params: { id: created.id } });
  };
  return (
    <Page>
      <PageHeader
        title="Broadcasts"
        actions={
          <Button
            data-testid="new-broadcast"
            disabled={pending}
            onClick={create}
          >
            <Plus />
            New broadcast
          </Button>
        }
      />
      {broadcasts.length === 0 ? (
        <EmptyState
          title="No broadcasts yet"
          description="Send one message to many subscribed contacts at once."
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>When</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broadcasts.map((b) => {
                const status = BROADCAST_STATUS[b.status];
                return (
                  <TableRow key={b.id} data-testid="broadcast-row">
                    <TableCell className="max-w-72">
                      <Link
                        to="/broadcasts/$id"
                        params={{ id: b.id }}
                        className="block truncate font-medium hover:underline"
                      >
                        {b.text || "Untitled draft"}
                      </Link>
                      <div className="truncate text-xs text-muted-foreground">
                        {b.ownerEmail}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={status.variant}
                        data-testid="broadcast-status"
                      >
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(
                        b.status === "sent"
                          ? b.sentAt
                          : b.status === "draft"
                            ? null
                            : b.sendAt,
                      )}
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums"
                      data-testid="broadcast-counts"
                    >
                      {b.status === "sent" || b.status === "sending"
                        ? `${b.sentCount} sent · ${b.failedCount} failed`
                        : ""}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </Page>
  );
}
