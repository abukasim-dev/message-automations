import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Page } from "@/client/components/AppNav";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { NotFound } from "@/client/components/NotFound";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/client/components/ui/native-select";
import { Textarea } from "@/client/components/ui/textarea";
import { BROADCAST_STATUS } from "@/client/lib/broadcast";
import { formatDateTime, toLocalInput, useAction } from "@/client/lib/format";
import {
  cancelBroadcast,
  countAudience,
  getBroadcast,
  saveBroadcast,
} from "@/serverFunctions/app";

export const Route = createFileRoute("/broadcasts/$id")({
  loader: ({ params }) => getBroadcast({ data: { id: params.id } }),
  head: () => ({ meta: [{ title: "Broadcast · Message Automations" }] }),
  component: BroadcastPage,
});

type Data = Awaited<ReturnType<typeof getBroadcast>>;

function BroadcastPage() {
  const { broadcast, tags } = Route.useLoaderData();
  const back = <BackLink to="/broadcasts">Broadcasts</BackLink>;
  if (!broadcast) {
    return (
      <Page>
        <PageHeader title="Broadcast" backLink={back} />
        <NotFound what="broadcast" />
      </Page>
    );
  }
  return (
    <Editor
      key={`${broadcast.id}-${broadcast.status}`}
      broadcast={broadcast}
      tags={tags}
      back={back}
    />
  );
}

function Editor({
  broadcast,
  tags,
  back,
}: {
  broadcast: NonNullable<Data["broadcast"]>;
  tags: Data["tags"];
  back: React.ReactNode;
}) {
  const { run, pending } = useAction();
  const [text, setText] = useState(broadcast.text);
  const [buttonLabel, setButtonLabel] = useState(broadcast.buttonLabel);
  const [buttonUrl, setButtonUrl] = useState(broadcast.buttonUrl);
  const [audience, setAudience] = useState(broadcast.audience);
  const [tagIds, setTagIds] = useState<string[]>(broadcast.tagIds);
  const [sendAt, setSendAt] = useState(
    broadcast.sendAt && broadcast.status === "scheduled"
      ? toLocalInput(broadcast.sendAt)
      : "",
  );
  const [count, setCount] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<"send" | "cancel" | null>(null);
  const readOnly = !broadcast.canEdit;
  const status = BROADCAST_STATUS[broadcast.status];

  useEffect(() => {
    let current = true;
    countAudience({ data: { audience, tagIds } })
      .then((n) => current && setCount(n))
      .catch(() => current && setCount(null));
    return () => {
      current = false;
    };
  }, [audience, tagIds.join(",")]);

  const save = (action: "save" | "schedule" | "send", done?: string) =>
    run(
      () =>
        saveBroadcast({
          data: {
            id: broadcast.id,
            text,
            buttonLabel,
            buttonUrl,
            audience,
            tagIds: audience === "everyone" ? [] : tagIds,
            action,
            sendAt: sendAt ? new Date(sendAt).getTime() : null,
          },
        }),
      done,
    );

  return (
    <Page>
      <PageHeader
        title={broadcast.status === "draft" ? "New broadcast" : "Broadcast"}
        backLink={back}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={status.variant} data-testid="broadcast-status">
              {status.label}
            </Badge>
            <span>
              {broadcast.status === "scheduled"
                ? `Sends ${formatDateTime(broadcast.sendAt)}`
                : null}
              {broadcast.status === "sent"
                ? `Sent ${formatDateTime(broadcast.sentAt)} · ${broadcast.sentCount} sent · ${broadcast.failedCount} failed`
                : null}
            </span>
          </span>
        }
      />
      <fieldset disabled={readOnly} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Message</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              aria-label="Message"
              data-testid="broadcast-text"
              className="min-h-28"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <div className="space-y-2">
                <Label htmlFor="button-label">Button label</Label>
                <Input
                  id="button-label"
                  data-testid="broadcast-button-label"
                  placeholder="Optional"
                  value={buttonLabel}
                  onChange={(e) => setButtonLabel(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="button-url">Button link</Label>
                <Input
                  id="button-url"
                  type="url"
                  placeholder="https://"
                  data-testid="broadcast-button-url"
                  value={buttonUrl}
                  onChange={(e) => setButtonUrl(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Audience</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <NativeSelect
              aria-label="Audience"
              data-testid="audience-select"
              value={audience}
              onChange={(e) => setAudience(e.target.value as typeof audience)}
            >
              <NativeSelectOption value="everyone">
                Every subscribed contact
              </NativeSelectOption>
              <NativeSelectOption value="any">
                Contacts with any of these tags
              </NativeSelectOption>
              <NativeSelectOption value="all">
                Contacts with all of these tags
              </NativeSelectOption>
            </NativeSelect>
            {audience !== "everyone" ? (
              tags.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tags yet.</p>
              ) : (
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {tags.map((tag) => (
                    <label
                      key={tag.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={tagIds.includes(tag.id)}
                        onCheckedChange={(checked) =>
                          setTagIds((ids) =>
                            checked
                              ? [...ids, tag.id]
                              : ids.filter((id) => id !== tag.id),
                          )
                        }
                      />
                      {tag.name}
                    </label>
                  ))}
                </div>
              )
            ) : null}
            {broadcast.status !== "sent" && broadcast.status !== "canceled" ? (
              <p className="text-sm font-medium" data-testid="audience-count">
                {count === null
                  ? "…"
                  : `${count} subscribed ${count === 1 ? "contact" : "contacts"}`}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {readOnly ? null : (
          <Card>
            <CardHeader>
              <CardTitle>Send</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-2">
                  <Label htmlFor="send-at">Send at</Label>
                  <Input
                    id="send-at"
                    type="datetime-local"
                    data-testid="schedule-at"
                    value={sendAt}
                    min={toLocalInput(Date.now())}
                    onChange={(e) => setSendAt(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  data-testid="schedule-broadcast"
                  disabled={pending || !sendAt}
                  onClick={() => save("schedule", "Broadcast scheduled")}
                >
                  {broadcast.status === "scheduled"
                    ? "Update schedule"
                    : "Schedule"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  data-testid="send-broadcast"
                  disabled={pending}
                  onClick={() => setConfirm("send")}
                >
                  Send now
                </Button>
                {broadcast.status === "draft" ? (
                  <Button
                    variant="outline"
                    data-testid="save-broadcast"
                    disabled={pending}
                    onClick={() => save("save", "Draft saved")}
                  >
                    Save draft
                  </Button>
                ) : null}
                {broadcast.status === "scheduled" ? (
                  <Button
                    variant="outline"
                    data-testid="cancel-broadcast"
                    disabled={pending}
                    onClick={() => setConfirm("cancel")}
                  >
                    Cancel broadcast
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        )}
      </fieldset>

      {confirm === "send" ? (
        <ConfirmDialog
          title="Send this broadcast now?"
          confirmLabel="Send now"
          pending={pending}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const result = await save("send");
            setConfirm(null);
            if (result) toast.success("Sending");
          }}
        >
          {count === null
            ? null
            : `It goes to ${count} subscribed ${count === 1 ? "contact" : "contacts"} and can't be undone.`}
        </ConfirmDialog>
      ) : null}
      {confirm === "cancel" ? (
        <ConfirmDialog
          title="Cancel this broadcast?"
          confirmLabel="Cancel broadcast"
          destructive
          pending={pending}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await run(() => cancelBroadcast({ data: { id: broadcast.id } }));
            setConfirm(null);
          }}
        />
      ) : null}
    </Page>
  );
}
