import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Page } from "@/client/components/AppNav";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
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
import { errorMessage, formatDateTime } from "@/client/lib/format";
import { TRIGGER_LABELS, TRIGGER_OPTIONS } from "@/client/lib/labels";
import { createAutomation, listAutomations } from "@/serverFunctions/app";

export const Route = createFileRoute("/")({
  loader: () => listAutomations(),
  head: () => ({ meta: [{ title: "Automations · Message Automations" }] }),
  component: Automations,
});

function Automations() {
  const automations = Route.useLoaderData();
  const [creating, setCreating] = useState(false);
  const newButton = (
    <Button data-testid="new-automation" onClick={() => setCreating(true)}>
      <Plus />
      New automation
    </Button>
  );
  return (
    <Page>
      <PageHeader title="Automations" actions={newButton} />
      {automations.length === 0 ? (
        <EmptyState
          title="No automations yet"
          description="Create one to greet new contacts, answer keywords or reply when nothing else matches."
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Runs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {automations.map((a) => (
                <TableRow key={a.id} data-testid="automation-row">
                  <TableCell>
                    <Link
                      to="/automations/$id"
                      params={{ id: a.id }}
                      className="font-medium hover:underline"
                    >
                      {a.name}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {a.stepCount} {a.stepCount === 1 ? "step" : "steps"}
                      {a.lastRunAt
                        ? ` · last ran ${formatDateTime(a.lastRunAt)}`
                        : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    {TRIGGER_LABELS[a.trigger]}
                    {a.trigger === "keyword" && a.keywords.length > 0 ? (
                      <div className="max-w-48 truncate text-xs text-muted-foreground">
                        {a.keywords.join(", ")}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={a.status === "active" ? "success" : "outline"}
                    >
                      {a.status === "active" ? "Active" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className="text-right tabular-nums"
                    data-testid="run-count"
                  >
                    {a.runCount}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
      {creating ? (
        <NewAutomationDialog onClose={() => setCreating(false)} />
      ) : null}
    </Page>
  );
}

function NewAutomationDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState<"welcome" | "keyword" | "default">(
    "keyword",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { id } = await createAutomation({ data: { name, trigger } });
      await navigate({ to: "/automations/$id", params: { id } });
    } catch (cause) {
      setError(errorMessage(cause));
      setPending(false);
    }
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New automation</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="automation-name">Name</Label>
            <Input
              id="automation-name"
              data-testid="automation-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="automation-trigger">Starts when</Label>
            <NativeSelect
              id="automation-trigger"
              data-testid="automation-trigger"
              className="w-full"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as typeof trigger)}
            >
              <NativeSelectOption value="welcome">
                {TRIGGER_OPTIONS.welcome}
              </NativeSelectOption>
              <NativeSelectOption value="keyword">
                {TRIGGER_OPTIONS.keyword}
              </NativeSelectOption>
              <NativeSelectOption value="default">
                {TRIGGER_OPTIONS.default}
              </NativeSelectOption>
            </NativeSelect>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button
              type="submit"
              data-testid="create-automation"
              disabled={pending || !name.trim()}
            >
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
