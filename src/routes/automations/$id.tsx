import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
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
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/client/components/ui/native-select";
import { Textarea } from "@/client/components/ui/textarea";
import { errorMessage, useAction } from "@/client/lib/format";
import { TRIGGER_OPTIONS } from "@/client/lib/labels";
import {
  deleteAutomation,
  getAutomation,
  saveAutomation,
  setAutomationStatus,
} from "@/serverFunctions/app";
import type { Step, StepType } from "@/server/steps";
import { parseKeywords } from "@/server/steps";

export const Route = createFileRoute("/automations/$id")({
  loader: ({ params }) => getAutomation({ data: { id: params.id } }),
  head: ({ loaderData }) => ({
    meta: [
      {
        title: `${loaderData?.automation?.name ?? "Automation"} · Message Automations`,
      },
    ],
  }),
  component: AutomationPage,
});

type Data = Awaited<ReturnType<typeof getAutomation>>;
type Automation = NonNullable<Data["automation"]>;

function AutomationPage() {
  const { automation, tags, fields } = Route.useLoaderData();
  const back = <BackLink to="/">Automations</BackLink>;
  if (!automation) {
    return (
      <Page>
        <PageHeader title="Automation" backLink={back} />
        <NotFound what="automation" />
      </Page>
    );
  }
  return (
    <Editor
      key={automation.id}
      automation={automation}
      tags={tags}
      fields={fields}
      back={back}
    />
  );
}

const STEP_BUTTONS: { type: StepType; label: string }[] = [
  { type: "text", label: "Message" },
  { type: "buttons", label: "Message with buttons" },
  { type: "question", label: "Question" },
  { type: "delay", label: "Wait" },
  { type: "add_tag", label: "Add tag" },
  { type: "remove_tag", label: "Remove tag" },
];

function blankStep(type: StepType): Step {
  const id = crypto.randomUUID();
  switch (type) {
    case "text":
      return { id, type, text: "" };
    case "buttons":
      return { id, type, text: "", buttons: [{ label: "", url: "" }] };
    case "question":
      return { id, type, text: "", target: "email", retryText: "" };
    case "delay":
      return { id, type, amount: 1, unit: "hours" };
    default:
      return { id, type, tagId: "" };
  }
}

function Editor({
  automation,
  tags,
  fields,
  back,
}: {
  automation: Automation;
  tags: Data["tags"];
  fields: Data["fields"];
  back: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { run, pending } = useAction();
  const [name, setName] = useState(automation.name);
  const [trigger, setTrigger] = useState(automation.trigger);
  const [keywords, setKeywords] = useState(automation.keywords.join(", "));
  const [match, setMatch] = useState(automation.match);
  const [steps, setSteps] = useState<Step[]>(automation.steps);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const readOnly = !automation.canEdit;

  function update(index: number, step: Step) {
    setSteps((list) => list.map((s, i) => (i === index ? step : s)));
  }
  function move(index: number, by: number) {
    setSteps((list) => {
      const next = [...list];
      const [step] = next.splice(index, 1);
      next.splice(index + by, 0, step!);
      return next;
    });
  }

  async function save() {
    try {
      await saveAutomation({
        data: {
          id: automation.id,
          name,
          trigger,
          keywords: parseKeywords(keywords),
          match,
          steps,
        },
      });
      toast.success("Automation saved");
      return true;
    } catch (cause) {
      toast.error(errorMessage(cause));
      return false;
    }
  }

  const active = automation.status === "active";
  const actions = readOnly ? null : (
    <>
      {active ? (
        <Button
          variant="outline"
          data-testid="deactivate-automation"
          disabled={pending}
          onClick={() =>
            run(() =>
              setAutomationStatus({
                data: { id: automation.id, status: "draft" },
              }),
            )
          }
        >
          Turn off
        </Button>
      ) : (
        <Button
          variant="outline"
          data-testid="activate-automation"
          disabled={pending}
          onClick={() =>
            run(() =>
              setAutomationStatus({
                data: { id: automation.id, status: "active" },
              }),
            )
          }
        >
          Turn on
        </Button>
      )}
      <Button
        data-testid="save-automation"
        disabled={pending}
        onClick={() => run(save)}
      >
        Save
      </Button>
    </>
  );

  return (
    <Page>
      <PageHeader
        title={automation.name}
        backLink={back}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge
              variant={active ? "success" : "outline"}
              data-testid="automation-status"
            >
              {active ? "Active" : "Draft"}
            </Badge>
            <span>
              {automation.runCount} {automation.runCount === 1 ? "run" : "runs"}
              {automation.ownerEmail
                ? ` · created by ${automation.ownerEmail}`
                : ""}
            </span>
          </span>
        }
        actions={actions}
      />
      {readOnly ? (
        <p
          className="text-sm text-muted-foreground"
          data-testid="read-only-note"
        >
          Only its creator or an admin can change this automation.
        </p>
      ) : null}

      <fieldset disabled={readOnly} className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Trigger</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                data-testid="automation-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trigger">Starts when</Label>
              <NativeSelect
                id="trigger"
                data-testid="trigger-select"
                className="w-full"
                value={trigger}
                onChange={(e) => setTrigger(e.target.value as typeof trigger)}
              >
                {(["welcome", "keyword", "default"] as const).map((t) => (
                  <NativeSelectOption key={t} value={t}>
                    {TRIGGER_OPTIONS[t]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            {trigger === "keyword" ? (
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <Label htmlFor="keywords">
                    Keywords, separated by commas
                  </Label>
                  <Input
                    id="keywords"
                    data-testid="keywords-input"
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    placeholder="price, hours"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="match">Match</Label>
                  <NativeSelect
                    id="match"
                    data-testid="match-select"
                    value={match}
                    onChange={(e) => setMatch(e.target.value as typeof match)}
                  >
                    <NativeSelectOption value="exact">
                      The whole message
                    </NativeSelectOption>
                    <NativeSelectOption value="contains">
                      Anywhere in it
                    </NativeSelectOption>
                  </NativeSelect>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Steps</h2>
          {steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No steps yet. Add the first one below.
            </p>
          ) : null}
          <ol className="space-y-3">
            {steps.map((step, index) => (
              <li key={step.id} data-testid="step">
                <Card size="sm">
                  <CardHeader className="flex flex-row items-center justify-between gap-2">
                    <CardTitle className="text-sm">
                      {index + 1}.{" "}
                      {STEP_BUTTONS.find((b) => b.type === step.type)?.label}
                    </CardTitle>
                    {readOnly ? null : (
                      <div className="flex gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Move up"
                          data-testid="step-up"
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Move down"
                          data-testid="step-down"
                          disabled={index === steps.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Remove step"
                          data-testid="step-remove"
                          onClick={() =>
                            setSteps((list) =>
                              list.filter((_, i) => i !== index),
                            )
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    <StepFields
                      step={step}
                      tags={tags}
                      fields={fields}
                      onChange={(s) => update(index, s)}
                    />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
          {readOnly ? null : (
            <div className="flex flex-wrap gap-2">
              {STEP_BUTTONS.map((b) => (
                <Button
                  key={b.type}
                  size="sm"
                  variant="outline"
                  data-testid={`add-step-${b.type}`}
                  onClick={() =>
                    setSteps((list) => [...list, blankStep(b.type)])
                  }
                >
                  <Plus />
                  {b.label}
                </Button>
              ))}
            </div>
          )}
        </section>
      </fieldset>

      {readOnly ? null : (
        <section className="space-y-2">
          <Button
            variant="destructive"
            data-testid="delete-automation"
            onClick={() => setConfirmDelete(true)}
          >
            Delete automation
          </Button>
        </section>
      )}
      {confirmDelete ? (
        <ConfirmDialog
          title={`Delete ${automation.name}?`}
          confirmLabel="Delete"
          destructive
          pending={pending}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            const ok = await run(async () => {
              await deleteAutomation({ data: { id: automation.id } });
              return true;
            });
            if (ok) await navigate({ to: "/" });
          }}
        >
          Contacts waiting on one of its steps won't get the rest.
        </ConfirmDialog>
      ) : null}
    </Page>
  );
}

function StepFields({
  step,
  tags,
  fields,
  onChange,
}: {
  step: Step;
  tags: Data["tags"];
  fields: Data["fields"];
  onChange: (step: Step) => void;
}) {
  const textArea = (label: string) =>
    "text" in step ? (
      <div className="space-y-2">
        <Label htmlFor={`${step.id}-text`}>{label}</Label>
        <Textarea
          id={`${step.id}-text`}
          data-testid="step-text"
          value={step.text}
          onChange={(e) => onChange({ ...step, text: e.target.value })}
        />
      </div>
    ) : null;

  switch (step.type) {
    case "text":
      return textArea("Message");
    case "buttons":
      return (
        <div className="space-y-3">
          {textArea("Message")}
          {step.buttons.map((button, i) => (
            <div
              key={i}
              className="grid items-end gap-2 sm:grid-cols-[1fr_2fr_auto]"
            >
              <div className="space-y-2">
                <Label htmlFor={`${step.id}-label-${i}`}>Button label</Label>
                <Input
                  id={`${step.id}-label-${i}`}
                  data-testid={`button-label-${i}`}
                  value={button.label}
                  onChange={(e) =>
                    onChange({
                      ...step,
                      buttons: step.buttons.map((b, j) =>
                        j === i ? { ...b, label: e.target.value } : b,
                      ),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${step.id}-url-${i}`}>Link</Label>
                <Input
                  id={`${step.id}-url-${i}`}
                  data-testid={`button-url-${i}`}
                  type="url"
                  placeholder="https://"
                  value={button.url}
                  onChange={(e) =>
                    onChange({
                      ...step,
                      buttons: step.buttons.map((b, j) =>
                        j === i ? { ...b, url: e.target.value } : b,
                      ),
                    })
                  }
                />
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remove button"
                disabled={step.buttons.length === 1}
                onClick={() =>
                  onChange({
                    ...step,
                    buttons: step.buttons.filter((_, j) => j !== i),
                  })
                }
              >
                <X />
              </Button>
            </div>
          ))}
          {step.buttons.length < 5 ? (
            <Button
              size="sm"
              variant="outline"
              data-testid="add-button"
              onClick={() =>
                onChange({
                  ...step,
                  buttons: [...step.buttons, { label: "", url: "" }],
                })
              }
            >
              <Plus />
              Button
            </Button>
          ) : null}
        </div>
      );
    case "question":
      return (
        <div className="space-y-3">
          {textArea("Question")}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`${step.id}-target`}>Save the answer to</Label>
              <NativeSelect
                id={`${step.id}-target`}
                data-testid="question-target"
                className="w-full"
                value={step.target}
                onChange={(e) => onChange({ ...step, target: e.target.value })}
              >
                <NativeSelectOption value="email">Email</NativeSelectOption>
                <NativeSelectOption value="phone">Phone</NativeSelectOption>
                {fields.map((f) => (
                  <NativeSelectOption key={f.id} value={`field:${f.id}`}>
                    {f.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${step.id}-retry`}>
                If the answer isn't valid, reply
              </Label>
              <Input
                id={`${step.id}-retry`}
                data-testid="question-retry"
                placeholder="That doesn't look right. Please try again."
                value={step.retryText}
                onChange={(e) =>
                  onChange({ ...step, retryText: e.target.value })
                }
              />
            </div>
          </div>
        </div>
      );
    case "delay":
      return (
        <div className="flex items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor={`${step.id}-amount`}>Wait</Label>
            <Input
              id={`${step.id}-amount`}
              data-testid="delay-amount"
              type="number"
              min={1}
              className="w-24"
              value={step.amount}
              onChange={(e) =>
                onChange({
                  ...step,
                  amount: Math.max(1, Number(e.target.value) || 1),
                })
              }
            />
          </div>
          <NativeSelect
            aria-label="Unit"
            data-testid="delay-unit"
            value={step.unit}
            onChange={(e) =>
              onChange({ ...step, unit: e.target.value as typeof step.unit })
            }
          >
            <NativeSelectOption value="minutes">minutes</NativeSelectOption>
            <NativeSelectOption value="hours">hours</NativeSelectOption>
            <NativeSelectOption value="days">days</NativeSelectOption>
          </NativeSelect>
        </div>
      );
    case "add_tag":
    case "remove_tag":
      return (
        <div className="space-y-2">
          <Label htmlFor={`${step.id}-tag`}>Tag</Label>
          {tags.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tags yet.{" "}
              <Link to="/settings" className="underline">
                Create one in Settings.
              </Link>
            </p>
          ) : (
            <NativeSelect
              id={`${step.id}-tag`}
              data-testid="step-tag"
              value={step.tagId}
              onChange={(e) => onChange({ ...step, tagId: e.target.value })}
            >
              <NativeSelectOption value="">Choose a tag</NativeSelectOption>
              {tags.map((t) => (
                <NativeSelectOption key={t.id} value={t.id}>
                  {t.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </div>
      );
  }
}
