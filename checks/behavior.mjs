// Behavior: every frozen feature's main path, against the packaged release.
import {
  start,
  expect,
  incoming,
  rows,
  until,
  BLOCKED_CHAT,
  WEBHOOK_SECRET,
} from "./lib.mjs";

const { runtime, telegram } = await start();
const dana = {
  id: 5001,
  first_name: "Dana",
  last_name: "Reyes",
  username: "danareyes",
};
const sam = {
  id: 5002,
  first_name: "Sam",
  last_name: "Okafor",
  username: "samokafor",
};
const lee = {
  id: BLOCKED_CHAT,
  first_name: "Lee",
  last_name: "Park",
  username: "leepark",
};

async function confirm(page, label) {
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: label, exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
}

try {
  await runtime.assertPrivateAccess([
    "/",
    "/inbox",
    "/contacts",
    "/broadcasts",
    "/preview",
    "/settings",
  ]);
  const page = await (await runtime.context("owner")).newPage();

  // F001: the channel, its webhook, and workspace tags and fields.
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
  await expect(page.getByTestId("channel-status")).toContainText(
    "@northwind_help_bot",
  );
  await expect(page.getByTestId("webhook-status")).toContainText(
    "Not registered",
  );
  await page.getByTestId("register-webhook").click();
  await expect(page.getByTestId("webhook-status")).toContainText("Registered");
  const setWebhook = telegram.calls.find((c) => c.method === "setWebhook");
  expect(setWebhook.params.url).toBe(
    `https://${runtime.hostname}/hooks/telegram`,
  );
  expect(setWebhook.params.secret_token).toBe(WEBHOOK_SECRET);
  for (const tag of ["Newsletter", "Customer"]) {
    await page.getByTestId("new-tag-name").fill(tag);
    await page.getByTestId("add-tag").click();
    await expect(
      page.getByTestId("tag-row").filter({ hasText: tag }),
    ).toHaveCount(1);
  }
  await page.getByTestId("new-field-name").fill("Company");
  await page.getByTestId("new-field-type").selectOption("text");
  await page.getByTestId("add-field").click();
  await expect(
    page.getByTestId("field-row").filter({ hasText: "Company" }),
  ).toHaveCount(1);

  // F002: a welcome automation that asks for an email and tags the contact.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Automations",
  );
  async function newAutomation(name, trigger) {
    await page.getByTestId("new-automation").click();
    await page.getByTestId("automation-name").fill(name);
    await page.getByTestId("automation-trigger").selectOption(trigger);
    await Promise.all([
      page.waitForURL(/\/automations\/[^/]+$/),
      page.getByTestId("create-automation").click(),
    ]);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  }
  await newAutomation("Welcome new riders", "welcome");
  await page.getByTestId("add-step-text").click();
  await page
    .getByTestId("step")
    .nth(0)
    .getByTestId("step-text")
    .fill("Hi! Thanks for messaging Northwind Bikes.");
  await page.getByTestId("add-step-question").click();
  const question = page.getByTestId("step").nth(1);
  await question
    .getByTestId("step-text")
    .fill("What's your email? We'll send this season's price list.");
  await question.getByTestId("question-target").selectOption("email");
  await question
    .getByTestId("question-retry")
    .fill("That doesn't look like an email address. Try again?");
  await page.getByTestId("add-step-add_tag").click();
  await page
    .getByTestId("step")
    .nth(2)
    .getByTestId("step-tag")
    .selectOption({ label: "Newsletter" });
  await page.getByTestId("save-automation").click();
  await expect(page.getByText("Automation saved")).toBeVisible();
  await page.getByTestId("activate-automation").click();
  await expect(page.getByTestId("automation-status")).toHaveText("Active");

  await page.goto("/");
  await newAutomation("Opening hours", "keyword");
  await page.getByTestId("keywords-input").fill("hours, opening");
  await page.getByTestId("match-select").selectOption("contains");
  await page.getByTestId("add-step-buttons").click();
  const buttons = page.getByTestId("step").nth(0);
  await buttons
    .getByTestId("step-text")
    .fill("We're open 9 to 6, Monday to Saturday.");
  await buttons.getByTestId("button-label-0").fill("Find the shop");
  await buttons.getByTestId("button-url-0").fill("https://example.com/shop");
  await page.getByTestId("add-step-delay").click();
  await page.getByTestId("step").nth(1).getByTestId("delay-amount").fill("2");
  await page
    .getByTestId("step")
    .nth(1)
    .getByTestId("delay-unit")
    .selectOption("hours");
  await page.getByTestId("add-step-text").click();
  await page
    .getByTestId("step")
    .nth(2)
    .getByTestId("step-text")
    .fill("Did you find us all right?");
  await page.getByTestId("save-automation").click();
  await expect(page.getByText("Automation saved")).toBeVisible();
  await page.getByTestId("activate-automation").click();
  await expect(page.getByTestId("automation-status")).toHaveText("Active");

  await page.goto("/");
  await newAutomation("Fallback", "default");
  await page.getByTestId("add-step-text").click();
  await page
    .getByTestId("step")
    .nth(0)
    .getByTestId("step-text")
    .fill("A teammate will get back to you soon.");
  await page.getByTestId("save-automation").click();
  await expect(page.getByText("Automation saved")).toBeVisible();
  await expect(page.getByTestId("automation-status")).toHaveText("Draft");

  // F001 + F002: messages arriving at the webhook run the automations.
  expect(
    (await incoming(runtime, dana, "/start", { secret: null })).status,
  ).toBe(401);
  expect(
    (await incoming(runtime, dana, "/start", { secret: "wrong" })).status,
  ).toBe(401);
  const first = await incoming(runtime, dana, "/start", { id: 77 });
  expect(first.status).toBe(200);
  expect(telegram.sent(dana.id).map((c) => c.params.text)).toEqual([
    "Hi! Thanks for messaging Northwind Bikes.",
    "What's your email? We'll send this season's price list.",
  ]);
  expect((await incoming(runtime, dana, "/start", { id: 77 })).status).toBe(
    200,
  ); // a repeated update
  expect(telegram.sent(dana.id)).toHaveLength(2);
  await incoming(runtime, dana, "dana at example");
  expect(telegram.sent(dana.id).at(-1).params.text).toBe(
    "That doesn't look like an email address. Try again?",
  );
  await incoming(runtime, dana, "dana@example.com");
  expect(telegram.sent(dana.id)).toHaveLength(3);
  await incoming(runtime, dana, "What are your opening HOURS?");
  const hours = telegram.sent(dana.id).at(-1).params;
  expect(hours.text).toBe("We're open 9 to 6, Monday to Saturday.");
  expect(hours.reply_markup.inline_keyboard[0][0]).toEqual({
    text: "Find the shop",
    url: "https://example.com/shop",
  });
  await incoming(runtime, dana, "thanks"); // only the draft default reply would match
  expect(telegram.sent(dana.id)).toHaveLength(4);
  const [waiting] = await rows(
    runtime,
    "select status from automation_runs where status = 'waiting'",
  );
  expect(waiting.status).toBe("waiting");
  await (await runtime.database())
    .prepare(
      "update automation_runs set resume_at = 0 where status = 'waiting'",
    )
    .run();
  await runtime.scheduled("* * * * *");
  await until(
    () => telegram.sent(dana.id).length === 5,
    "the message after the delay",
  );
  expect(telegram.sent(dana.id).at(-1).params.text).toBe(
    "Did you find us all right?",
  );
  await incoming(runtime, sam, "hello");
  await incoming(runtime, lee, "hi there");

  await page.goto("/");
  const welcomeRow = page
    .getByTestId("automation-row")
    .filter({ hasText: "Welcome new riders" });
  await expect(welcomeRow).toContainText("Active");
  await expect(welcomeRow.getByTestId("run-count")).toHaveText("3");
  await expect(
    page.getByTestId("automation-row").filter({ hasText: "Fallback" }),
  ).toContainText("Draft");

  // F003: contacts, tags, fields, subscription.
  await page.goto("/contacts");
  await expect(page.getByTestId("contact-row")).toHaveCount(3);
  await page.getByTestId("contact-search").fill("dana");
  await expect(page.getByTestId("contact-row")).toHaveCount(1);
  await page.getByTestId("contact-search").fill("");
  await page.getByTestId("tag-filter").selectOption({ label: "Newsletter" });
  await expect(page.getByTestId("contact-row")).toHaveCount(1);
  await page.getByTestId("tag-filter").selectOption("");
  await page.getByTestId("sort-select").selectOption("name");
  await expect(page.getByTestId("contact-row").first()).toContainText(
    "Dana Reyes",
  );
  await incoming(runtime, sam, "stop");
  await page.getByTestId("subscription-filter").selectOption("unsubscribed");
  await expect(page.getByTestId("contact-row")).toHaveCount(1);
  await expect(page.getByTestId("contact-row")).toContainText("Sam Okafor");
  await incoming(runtime, sam, "start");
  await page.reload();
  await expect(page.getByTestId("contact-row")).toHaveCount(0);
  await page.getByTestId("subscription-filter").selectOption("all");
  await page
    .getByTestId("contact-row")
    .filter({ hasText: "Dana Reyes" })
    .getByRole("link")
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Dana Reyes",
  );
  await expect(page.getByTestId("contact-email")).toHaveText(
    "dana@example.com",
  );
  await expect(page.getByTestId("contact-username")).toContainText("danareyes");
  await expect(page.getByTestId("contact-tags")).toContainText("Newsletter");
  await page.getByTestId("add-tag-select").selectOption({ label: "Customer" });
  await page.getByTestId("add-tag-button").click();
  await expect(page.getByTestId("contact-tags")).toContainText("Customer");
  await page.getByRole("button", { name: "Remove Customer" }).click();
  await expect(page.getByTestId("contact-tags")).not.toContainText("Customer");
  await page.getByLabel("Company").fill("Reyes Cycling");
  await page.getByTestId("save-fields").click();
  await expect(page.getByText("Fields saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Company")).toHaveValue("Reyes Cycling");
  await expect(page.getByTestId("subscription-status")).toHaveText(
    "Subscribed",
  );
  await page.getByTestId("subscribed-switch").click();
  await expect(page.getByTestId("subscription-status")).toHaveText(
    "Unsubscribed",
  );
  await page.getByTestId("subscribed-switch").click();
  await expect(page.getByTestId("subscription-status")).toHaveText(
    "Subscribed",
  );
  await page.goto("/contacts");
  await page
    .getByTestId("contact-row")
    .filter({ hasText: "Sam Okafor" })
    .getByRole("link")
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Sam Okafor",
  );
  await page
    .getByTestId("add-tag-select")
    .selectOption({ label: "Newsletter" });
  await page.getByTestId("add-tag-button").click();
  await expect(page.getByTestId("contact-tags")).toContainText("Newsletter");

  // F005: broadcasts.
  await page.goto("/broadcasts");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Broadcasts",
  );
  await Promise.all([
    page.waitForURL(/\/broadcasts\/[^/]+$/),
    page.getByTestId("new-broadcast").click(),
  ]);
  await page
    .getByTestId("broadcast-text")
    .fill("Spring service week: 20% off every tune-up until Sunday.");
  await page.getByTestId("broadcast-button-label").fill("Book a slot");
  await page
    .getByTestId("broadcast-button-url")
    .fill("https://example.com/book");
  await page.getByTestId("audience-select").selectOption("any");
  await page.getByRole("checkbox", { name: "Newsletter" }).check();
  await expect(page.getByTestId("audience-count")).toHaveText(
    "2 subscribed contacts",
  );
  await page.getByTestId("send-broadcast").click();
  await confirm(page, "Send now");
  await page.goto("/broadcasts");
  const spring = page
    .getByTestId("broadcast-row")
    .filter({ hasText: "Spring service week" });
  await until(async () => {
    await page.reload();
    return (
      (await spring.getByTestId("broadcast-status").textContent()) === "Sent"
    );
  }, "the broadcast to be sent");
  await expect(spring.getByTestId("broadcast-counts")).toHaveText(
    "2 sent · 0 failed",
  );
  const springSends = telegram.calls.filter(
    (c) =>
      c.method === "sendMessage" &&
      c.params.text.startsWith("Spring service week"),
  );
  expect(springSends.map((c) => c.params.chat_id).sort()).toEqual(
    [dana.id, sam.id].map(String).sort(),
  );
  expect(springSends[0].params.reply_markup.inline_keyboard[0][0]).toEqual({
    text: "Book a slot",
    url: "https://example.com/book",
  });

  await Promise.all([
    page.waitForURL(/\/broadcasts\/[^/]+$/),
    page.getByTestId("new-broadcast").click(),
  ]);
  await page
    .getByTestId("broadcast-text")
    .fill("We're closed on Monday for the holiday.");
  await page.getByTestId("audience-select").selectOption("everyone");
  await expect(page.getByTestId("audience-count")).toHaveText(
    "3 subscribed contacts",
  );
  const inAnHour = new Date(Date.now() + 3600_000);
  const local = new Date(
    inAnHour.getTime() - inAnHour.getTimezoneOffset() * 60000,
  )
    .toISOString()
    .slice(0, 16);
  await page.getByTestId("schedule-at").fill(local);
  await page.getByTestId("schedule-broadcast").click();
  await expect(page.getByTestId("broadcast-status")).toHaveText("Scheduled");
  await page.goto("/broadcasts");
  const closed = page
    .getByTestId("broadcast-row")
    .filter({ hasText: "closed on Monday" });
  await expect(closed.getByTestId("broadcast-status")).toHaveText("Scheduled");
  await (await runtime.database())
    .prepare("update broadcasts set send_at = 0 where status = 'scheduled'")
    .run();
  await runtime.scheduled("* * * * *");
  await until(async () => {
    await page.reload();
    return (
      (await closed.getByTestId("broadcast-status").textContent()) === "Sent"
    );
  }, "the scheduled broadcast to be sent");
  await expect(closed.getByTestId("broadcast-counts")).toHaveText(
    "2 sent · 1 failed",
  );
  await runtime.scheduled("* * * * *");
  expect(
    telegram.calls.filter(
      (c) =>
        c.method === "sendMessage" && c.params.text.startsWith("We're closed"),
    ),
  ).toHaveLength(3);

  await Promise.all([
    page.waitForURL(/\/broadcasts\/[^/]+$/),
    page.getByTestId("new-broadcast").click(),
  ]);
  await page
    .getByTestId("broadcast-text")
    .fill("New gravel bikes are in the shop.");
  await page.getByTestId("schedule-at").fill(local);
  await page.getByTestId("schedule-broadcast").click();
  await expect(page.getByTestId("broadcast-status")).toHaveText("Scheduled");
  await page.getByTestId("cancel-broadcast").click();
  await confirm(page, "Cancel broadcast");
  await expect(page.getByTestId("broadcast-status")).toHaveText("Canceled");

  // F006: the preview conversation runs the active automations.
  await page.goto("/preview");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Preview");
  const say = async (text) => {
    await page.getByTestId("preview-input").fill(text);
    await page.getByTestId("preview-send").click();
    await expect(
      page.getByTestId("message").filter({ hasText: text }).last(),
    ).toBeVisible();
  };
  await say("hi");
  await expect(
    page
      .getByTestId("message")
      .filter({ hasText: "Thanks for messaging Northwind Bikes" }),
  ).toBeVisible();
  await say("rider@example.com");
  await say("when are your opening hours");
  await expect(
    page.getByRole("link", { name: "Find the shop" }),
  ).toHaveAttribute("href", "https://example.com/shop");
  await expect(
    page.getByTestId("message").filter({ hasText: "Waiting 2 hours" }),
  ).toBeVisible();
  await page.getByTestId("preview-reset").click();
  await confirm(page, "Reset");
  await expect(page.getByTestId("message")).toHaveCount(0);

  // F004: the shared inbox, ending on a real conversation.
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Inbox");
  await expect(page.getByTestId("conversation-row")).toHaveCount(3);
  await page
    .getByTestId("conversation-row")
    .filter({ hasText: "Dana Reyes" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Dana Reyes",
  );
  await expect(
    page.getByTestId("message").filter({ hasText: "/start" }),
  ).toHaveAttribute("data-kind", "incoming");
  const welcome = page
    .getByTestId("message")
    .filter({ hasText: "Thanks for messaging Northwind Bikes" });
  await expect(welcome).toHaveAttribute("data-kind", "automated");
  await expect(welcome.getByTestId("message-status")).toHaveText("Sent");
  await page
    .getByTestId("reply-input")
    .fill(
      "Hi Dana, the price list is on its way. Want us to hold a tune-up slot for Saturday?",
    );
  await page.getByTestId("send-reply").click();
  await expect(
    page.getByTestId("message").filter({ hasText: "hold a tune-up slot" }),
  ).toHaveAttribute("data-kind", "manual");
  expect(telegram.sent(dana.id).at(-1).params.text).toContain(
    "hold a tune-up slot",
  );
  await expect(page.getByTestId("paused-banner")).toBeVisible();
  const before = telegram.sent(dana.id).length;
  await incoming(runtime, dana, "what are the opening hours on Saturday?");
  expect(telegram.sent(dana.id)).toHaveLength(before);
  await page.getByTestId("resume-automations").click();
  await expect(page.getByTestId("paused-banner")).toHaveCount(0);
  await page.getByTestId("star-toggle").click();
  await expect(page.getByTestId("star-toggle")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page
    .getByTestId("assignee-select")
    .selectOption({ label: "owner@example.test" });
  await page.reload();
  await expect(
    page.getByTestId("assignee-select").locator("option:checked"),
  ).toHaveText("owner@example.test");
  await page.getByTestId("mark-done").click();
  await expect(page.getByTestId("conversation-status")).toHaveText("Done");
  await page.goto("/inbox");
  await expect(
    page.getByTestId("conversation-row").filter({ hasText: "Dana Reyes" }),
  ).toHaveCount(0);
  for (const [filter, count] of [
    ["done", 1],
    ["starred", 1],
    ["mine", 1],
  ]) {
    await page.getByTestId("inbox-filter").selectOption(filter);
    await expect(
      page.getByTestId("conversation-row").filter({ hasText: "Dana Reyes" }),
    ).toHaveCount(count);
  }
  await incoming(runtime, dana, "Yes please, Saturday at 10 works.");
  await page.getByTestId("inbox-filter").selectOption("open");
  await page.reload();
  await page
    .getByTestId("conversation-row")
    .filter({ hasText: "Dana Reyes" })
    .click();
  await expect(page.getByTestId("conversation-status")).toHaveText("Open");
  await page
    .getByTestId("reply-input")
    .fill("Booked you in for Saturday at 10. See you then!");
  await page.getByTestId("send-reply").click();
  await expect(
    page
      .getByTestId("message")
      .filter({ hasText: "Booked you in" })
      .getByTestId("message-status"),
  ).toHaveText("Sent");
  await runtime.assertBackLink(page);
  await runtime.screenshot(page);

  // Phone-sized smoke.
  const phone = await (
    await runtime.context("member", {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
  ).newPage();
  await phone.goto("/inbox");
  await expect(phone.getByRole("heading", { level: 1 })).toHaveText("Inbox");
  await expect(phone.getByTestId("conversation-row").first()).toBeVisible();
  await runtime.assertBackLink(phone);
  console.log("behavior: ok");
} finally {
  await runtime.close();
  await telegram.close();
}
