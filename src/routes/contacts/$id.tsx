import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MessagesSquare, X } from "lucide-react";
import { useState } from "react";
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
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/client/components/ui/native-select";
import { Switch } from "@/client/components/ui/switch";
import { formatDateTime, useAction } from "@/client/lib/format";
import {
  addContactTag,
  deleteContact,
  getContact,
  removeContactTag,
  saveContactFields,
  setContactSubscribed,
} from "@/serverFunctions/app";

export const Route = createFileRoute("/contacts/$id")({
  loader: ({ params }) => getContact({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${loaderData?.contact?.name ?? "Contact"} · Message Automations`,
      },
    ],
  }),
  component: ContactPage,
});

type Data = Awaited<ReturnType<typeof getContact>>;

function ContactPage() {
  const { contact, tags, viewer } = Route.useLoaderData();
  const back = <BackLink to="/contacts">Contacts</BackLink>;
  if (!contact) {
    return (
      <Page>
        <PageHeader title="Contact" backLink={back} />
        <NotFound what="contact" />
      </Page>
    );
  }
  return (
    <ContactView
      key={contact.id}
      contact={contact}
      tags={tags}
      admin={viewer.admin}
      back={back}
    />
  );
}

function ContactView({
  contact,
  tags,
  admin,
  back,
}: {
  contact: NonNullable<Data["contact"]>;
  tags: Data["tags"];
  admin: boolean;
  back: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { run, pending } = useAction();
  const [tagToAdd, setTagToAdd] = useState("");
  const [values, setValues] = useState(() =>
    Object.fromEntries(contact.fields.map((f) => [f.id, f.value])),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const available = tags.filter(
    (t) => !contact.tags.some((c) => c.id === t.id),
  );
  const contactId = contact.id;

  return (
    <Page>
      <PageHeader
        title={contact.name}
        backLink={back}
        actions={
          <Button
            variant="outline"
            data-testid="open-conversation"
            render={<Link to="/inbox/$contactId" params={{ contactId }} />}
            nativeButton={false}
          >
            <MessagesSquare />
            Conversation
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Telegram</dt>
            <dd data-testid="contact-username">
              {contact.username
                ? `@${contact.username}`
                : `Chat ${contact.chatId}`}
            </dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd data-testid="contact-email">{contact.email ?? "—"}</dd>
            <dt className="text-muted-foreground">Phone</dt>
            <dd data-testid="contact-phone">{contact.phone ?? "—"}</dd>
            <dt className="text-muted-foreground">First seen</dt>
            <dd>{formatDateTime(contact.firstSeenAt)}</dd>
            <dt className="text-muted-foreground">Last message</dt>
            <dd>{formatDateTime(contact.lastInteractionAt)}</dd>
            <dt className="text-muted-foreground">Subscription</dt>
            <dd className="flex items-center gap-2">
              <Switch
                aria-label="Subscribed"
                data-testid="subscribed-switch"
                checked={contact.subscribed}
                disabled={pending}
                onCheckedChange={(subscribed) =>
                  run(() =>
                    setContactSubscribed({ data: { contactId, subscribed } }),
                  )
                }
              />
              <span data-testid="subscription-status">
                {contact.subscribed ? "Subscribed" : "Unsubscribed"}
              </span>
            </dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="flex min-h-6 flex-wrap gap-2"
            data-testid="contact-tags"
          >
            {contact.tags.length === 0 ? (
              <span className="text-sm text-muted-foreground">No tags</span>
            ) : null}
            {contact.tags.map((tag) => (
              <Badge key={tag.id} variant="secondary" className="gap-1 pr-1">
                {tag.name}
                <button
                  type="button"
                  aria-label={`Remove ${tag.name}`}
                  className="rounded-sm text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    run(() =>
                      removeContactTag({ data: { contactId, tagId: tag.id } }),
                    )
                  }
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          </div>
          {available.length > 0 ? (
            <div className="flex gap-2">
              <NativeSelect
                aria-label="Tag to add"
                data-testid="add-tag-select"
                value={tagToAdd}
                onChange={(e) => setTagToAdd(e.target.value)}
              >
                <NativeSelectOption value="">Choose a tag</NativeSelectOption>
                {available.map((t) => (
                  <NativeSelectOption key={t.id} value={t.id}>
                    {t.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button
                variant="outline"
                data-testid="add-tag-button"
                disabled={!tagToAdd || pending}
                onClick={async () => {
                  await run(() =>
                    addContactTag({ data: { contactId, tagId: tagToAdd } }),
                  );
                  setTagToAdd("");
                }}
              >
                Add tag
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {contact.fields.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Custom fields</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  () => saveContactFields({ data: { contactId, values } }),
                  "Fields saved",
                );
              }}
            >
              {contact.fields.map((field) => (
                <div key={field.id} className="space-y-2">
                  <Label htmlFor={`field-${field.id}`}>{field.name}</Label>
                  <Input
                    id={`field-${field.id}`}
                    type={
                      field.type === "number"
                        ? "number"
                        : field.type === "email"
                          ? "email"
                          : field.type === "phone"
                            ? "tel"
                            : "text"
                    }
                    value={values[field.id] ?? ""}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [field.id]: e.target.value }))
                    }
                  />
                </div>
              ))}
              <Button
                type="submit"
                data-testid="save-fields"
                disabled={pending}
              >
                Save fields
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {admin ? (
        <section>
          <Button
            variant="destructive"
            data-testid="delete-contact"
            onClick={() => setConfirmDelete(true)}
          >
            Delete contact
          </Button>
        </section>
      ) : null}
      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete ${contact.name}?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            const ok = await run(async () => {
              await deleteContact({ data: { contactId } });
              return true;
            });
            if (ok) await navigate({ to: "/contacts" });
          }}
        >
          Their conversation, tags and field values are deleted too.
        </ConfirmDialog>
      ) : null}
    </Page>
  );
}
