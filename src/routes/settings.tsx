import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Page } from "@/client/components/AppNav";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { PageHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/client/components/ui/native-select";
import { useAction } from "@/client/lib/format";
import { FIELD_TYPE_LABELS } from "@/client/lib/labels";
import {
  createField,
  createTag,
  deleteField,
  deleteTag,
  getSettings,
  registerWebhook,
} from "@/serverFunctions/app";

export const Route = createFileRoute("/settings")({
  loader: () => getSettings(),
  head: () => ({ meta: [{ title: "Settings · Message Automations" }] }),
  component: Settings,
});

function Settings() {
  const { viewer, channel, tags, fields } = Route.useLoaderData();
  const { run, pending } = useAction();
  const [tagName, setTagName] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] =
    useState<keyof typeof FIELD_TYPE_LABELS>("text");
  const [deleting, setDeleting] = useState<{
    kind: "tag" | "field";
    id: string;
    name: string;
  } | null>(null);

  return (
    <Page>
      <PageHeader title="Settings" />

      <Card>
        <CardHeader>
          <CardTitle>Telegram</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Bot</dt>
            <dd data-testid="channel-status">
              {channel.connected ? (
                <Badge variant="success">
                  Connected as @{channel.username}
                </Badge>
              ) : (
                <Badge variant="outline">Off</Badge>
              )}
            </dd>
            {channel.connected ? (
              <>
                <dt className="text-muted-foreground">Webhook</dt>
                <dd data-testid="webhook-status">
                  {channel.webhookRegistered ? (
                    <Badge variant="success">Registered</Badge>
                  ) : (
                    <Badge variant="warning">Not registered</Badge>
                  )}
                </dd>
              </>
            ) : null}
          </dl>
          {!channel.connected ? (
            <p className="text-sm text-muted-foreground">
              {channel.error
                ? `Telegram refused the bot token: ${channel.error}`
                : "Set TELEGRAM_BOT_TOKEN to receive and send Telegram messages."}
            </p>
          ) : null}
          {channel.connected && channel.webhookError ? (
            <p className="text-sm text-destructive">
              Last delivery error: {channel.webhookError}
            </p>
          ) : null}
          {channel.connected && viewer.admin ? (
            <Button
              variant={channel.webhookRegistered ? "outline" : "default"}
              data-testid="register-webhook"
              disabled={pending}
              onClick={() => run(() => registerWebhook(), "Webhook registered")}
            >
              {channel.webhookRegistered
                ? "Register webhook again"
                : "Register webhook"}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(async () => {
                await createTag({ data: { name: tagName } });
                return true;
              });
              if (ok) setTagName("");
            }}
          >
            <Input
              aria-label="New tag"
              placeholder="New tag"
              data-testid="new-tag-name"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
            />
            <Button
              type="submit"
              data-testid="add-tag"
              disabled={pending || !tagName.trim()}
            >
              Add
            </Button>
          </form>
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tags yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {tags.map((tag) => (
                <li
                  key={tag.id}
                  data-testid="tag-row"
                  className="flex h-10 items-center justify-between"
                >
                  <span className="text-sm">{tag.name}</span>
                  {viewer.admin ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${tag.name}`}
                      data-testid="delete-tag"
                      onClick={() => setDeleting({ kind: "tag", ...tag })}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom fields</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-wrap gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(async () => {
                await createField({
                  data: { name: fieldName, type: fieldType },
                });
                return true;
              });
              if (ok) setFieldName("");
            }}
          >
            <Input
              aria-label="New field"
              placeholder="New field"
              className="min-w-40 flex-1"
              data-testid="new-field-name"
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
            />
            <NativeSelect
              aria-label="Type"
              data-testid="new-field-type"
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value as typeof fieldType)}
            >
              {Object.entries(FIELD_TYPE_LABELS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button
              type="submit"
              data-testid="add-field"
              disabled={pending || !fieldName.trim()}
            >
              Add
            </Button>
          </form>
          {fields.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No custom fields yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {fields.map((field) => (
                <li
                  key={field.id}
                  data-testid="field-row"
                  className="flex h-10 items-center justify-between gap-3"
                >
                  <span className="text-sm">
                    {field.name}{" "}
                    <span className="text-muted-foreground">
                      · {FIELD_TYPE_LABELS[field.type]}
                    </span>
                  </span>
                  {viewer.admin ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${field.name}`}
                      data-testid="delete-field"
                      onClick={() => setDeleting({ kind: "field", ...field })}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await run(() =>
              deleting.kind === "tag"
                ? deleteTag({ data: { id: deleting.id } })
                : deleteField({ data: { id: deleting.id } }),
            );
            setDeleting(null);
          }}
        >
          {deleting.kind === "tag"
            ? "It comes off every contact that has it."
            : "Every contact's value for it is deleted."}
        </ConfirmDialog>
      ) : null}
    </Page>
  );
}
