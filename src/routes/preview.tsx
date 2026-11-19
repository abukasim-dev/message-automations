import { createFileRoute, useRouter } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Page } from "@/client/components/AppNav";
import { ConfirmDialog } from "@/client/components/ConfirmDialog";
import { MessageList } from "@/client/components/MessageList";
import { PageHeader } from "@/client/components/PageHeader";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { errorMessage, useAction } from "@/client/lib/format";
import { getPreview, resetPreview, sendPreview } from "@/serverFunctions/app";

export const Route = createFileRoute("/preview")({
  loader: () => getPreview(),
  head: () => ({ meta: [{ title: "Preview · Message Automations" }] }),
  component: Preview,
});

function Preview() {
  const { messages, subscribed } = Route.useLoaderData();
  const router = useRouter();
  const { run, pending } = useAction();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await sendPreview({ data: { text } });
      setText("");
      await router.invalidate();
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setSending(false);
    }
  }

  return (
    <Page>
      <PageHeader
        title="Preview"
        description="Your active automations answer here. Only you see this conversation."
        actions={
          <Button
            variant="outline"
            data-testid="preview-reset"
            onClick={() => setConfirmReset(true)}
          >
            <RotateCcw />
            Start over
          </Button>
        }
      />
      <Card>
        <CardContent className="space-y-4">
          {messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Send a first message to see your welcome automation.
            </p>
          ) : (
            <MessageList messages={messages} showStatus={false} />
          )}
          {!subscribed ? (
            <p className="text-center text-xs text-muted-foreground">
              Unsubscribed. Send start to subscribe again.
            </p>
          ) : null}
          <div ref={end} />
          <form className="flex gap-2" onSubmit={send}>
            <Input
              aria-label="Message"
              placeholder="Type a message"
              data-testid="preview-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoComplete="off"
            />
            <Button
              type="submit"
              data-testid="preview-send"
              disabled={sending || !text.trim()}
            >
              Send
            </Button>
          </form>
        </CardContent>
      </Card>
      {confirmReset ? (
        <ConfirmDialog
          title="Start the preview over?"
          confirmLabel="Reset"
          pending={pending}
          onClose={() => setConfirmReset(false)}
          onConfirm={async () => {
            await run(() => resetPreview());
            setConfirmReset(false);
          }}
        >
          You'll be a new contact again, with no messages, tags or answers.
        </ConfirmDialog>
      ) : null}
    </Page>
  );
}
