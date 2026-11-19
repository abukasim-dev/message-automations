import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, RotateCcw, Star } from "lucide-react";
import { useState } from "react";
import { Page } from "@/client/components/AppNav";
import { MessageList } from "@/client/components/MessageList";
import { NotFound } from "@/client/components/NotFound";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/client/components/ui/native-select";
import { Textarea } from "@/client/components/ui/textarea";
import { formatWhen, useAction } from "@/client/lib/format";
import {
  getConversation,
  sendReply,
  updateConversation,
} from "@/serverFunctions/app";

export const Route = createFileRoute("/inbox/$contactId")({
  loader: ({ params }) => getConversation({ data: { id: params.contactId } }),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${loaderData?.conversation?.contact.name ?? "Conversation"} · Message Automations`,
      },
    ],
  }),
  component: Conversation,
});

function Conversation() {
  const { conversation } = Route.useLoaderData();
  const { run, pending } = useAction();
  const [text, setText] = useState("");
  const back = <BackLink to="/inbox">Inbox</BackLink>;
  if (!conversation) {
    return (
      <Page>
        <PageHeader title="Conversation" backLink={back} />
        <NotFound what="conversation" />
      </Page>
    );
  }
  const { contact, messages, members, channelConnected } = conversation;
  const contactId = contact.id;
  const update = (change: {
    starred?: boolean;
    status?: "open" | "done";
    assigneeId?: string | null;
    resume?: true;
  }) => run(() => updateConversation({ data: { contactId, ...change } }));
  const canSend = channelConnected && contact.subscribed;

  return (
    <Page>
      <PageHeader
        title={contact.name}
        backLink={back}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge
              variant={contact.status === "open" ? "soft" : "outline"}
              data-testid="conversation-status"
            >
              {contact.status === "open" ? "Open" : "Done"}
            </Badge>
            <Link
              to="/contacts/$id"
              params={{ id: contactId }}
              className="hover:underline"
            >
              {contact.username ? `@${contact.username}` : "Contact"}
            </Link>
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label={contact.starred ? "Unstar" : "Star"}
              aria-pressed={contact.starred}
              data-testid="star-toggle"
              disabled={pending}
              onClick={() => update({ starred: !contact.starred })}
            >
              <Star
                className={
                  contact.starred ? "fill-current text-warning" : undefined
                }
              />
            </Button>
            <NativeSelect
              aria-label="Assignee"
              data-testid="assignee-select"
              value={contact.assigneeId ?? ""}
              disabled={pending}
              onChange={(e) => update({ assigneeId: e.target.value || null })}
            >
              <NativeSelectOption value="">Unassigned</NativeSelectOption>
              {members.map((m) => (
                <NativeSelectOption key={m.id} value={m.id}>
                  {m.email}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {contact.status === "open" ? (
              <Button
                variant="outline"
                data-testid="mark-done"
                disabled={pending}
                onClick={() => update({ status: "done" })}
              >
                <Check />
                Done
              </Button>
            ) : (
              <Button
                variant="outline"
                data-testid="reopen"
                disabled={pending}
                onClick={() => update({ status: "open" })}
              >
                <RotateCcw />
                Reopen
              </Button>
            )}
          </>
        }
      />

      {contact.pausedUntil ? (
        <Alert data-testid="paused-banner">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Automations are paused for this contact until{" "}
              {formatWhen(contact.pausedUntil)}.
            </span>
            <Button
              size="sm"
              variant="outline"
              data-testid="resume-automations"
              disabled={pending}
              onClick={() => update({ resume: true })}
            >
              Resume now
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <MessageList messages={messages} />

      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await run(() =>
            sendReply({ data: { contactId, text } }),
          );
          if (result) setText("");
        }}
      >
        {!channelConnected ? (
          <Alert data-testid="channel-off">
            <AlertDescription>
              Telegram isn't connected, so replies can't be sent.
            </AlertDescription>
          </Alert>
        ) : !contact.subscribed ? (
          <p className="text-sm text-muted-foreground">
            This contact unsubscribed.
          </p>
        ) : null}
        <Textarea
          aria-label="Reply"
          placeholder="Write a reply"
          data-testid="reply-input"
          value={text}
          disabled={!canSend}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
              e.currentTarget.form?.requestSubmit();
          }}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            data-testid="send-reply"
            disabled={!canSend || pending || !text.trim()}
          >
            Send
          </Button>
        </div>
      </form>
    </Page>
  );
}
