// Authorization: who may reach and change what, against the packaged release.
import {
  start,
  expect,
  incoming,
  rows,
  captureServerCall,
  replay,
} from "./lib.mjs";

const { runtime, telegram } = await start();
const ana = {
  id: 6001,
  first_name: "Ana",
  last_name: "Silva",
  username: "anasilva",
};

async function confirmCapture(page, label) {
  return captureServerCall(page, () =>
    page
      .getByRole("alertdialog")
      .getByRole("button", { name: label, exact: true })
      .click(),
  );
}

try {
  const pages = [
    "/",
    "/inbox",
    "/contacts",
    "/broadcasts",
    "/preview",
    "/settings",
  ];
  await runtime.assertPrivateAccess(pages);

  // The app has no sign-in of its own.
  for (const path of ["/login", "/signin", "/sign-in", "/signup", "/logout"]) {
    expect((await runtime.fetch(path, { role: "member" })).status).toBe(404);
    expect((await runtime.fetch(path)).status).not.toBe(200);
  }
  for (const path of pages) {
    const html = await (await runtime.fetch(path, { role: "member" })).text();
    expect(html).not.toContain('type="password"');
  }

  // The only public route is the webhook, and it needs the secret.
  const hookGet = await runtime.fetch("/hooks/telegram");
  expect(hookGet.status).not.toBe(200);
  const forged = await incoming(runtime, ana, "hello", { secret: "guess" });
  expect(forged.status).toBe(401);
  expect(await forged.text()).not.toContain("Ana");
  expect(
    await rows(runtime, "select id from contacts where channel = 'telegram'"),
  ).toHaveLength(0);
  const ok = await incoming(runtime, ana, "hello");
  expect(ok.status).toBe(200);
  expect(await ok.text()).not.toContain("Ana");
  for (const path of [
    "/contacts",
    "/inbox",
    "/automations/x",
    "/broadcasts/x",
  ]) {
    expect((await runtime.fetch(path)).status).not.toBe(200);
    expect((await runtime.fetch(path, { role: "outsider" })).status).not.toBe(
      200,
    );
  }

  const owner = await (await runtime.context("owner")).newPage();
  const member = await (await runtime.context("member")).newPage();
  await member.goto("/"); // the member is known to the app

  // Automations: only the creator or an admin changes one.
  await owner.goto("/");
  await owner.getByTestId("new-automation").click();
  await owner.getByTestId("automation-name").fill("Price list");
  await owner.getByTestId("automation-trigger").selectOption("keyword");
  await Promise.all([
    owner.waitForURL(/\/automations\/[^/]+$/),
    owner.getByTestId("create-automation").click(),
  ]);
  const automationPath = new URL(owner.url()).pathname;
  await owner.getByTestId("delete-automation").click();
  const deleteAutomation = await confirmCapture(owner, "Delete");
  await member.goto(automationPath);
  await expect(member.getByRole("heading", { level: 1 })).toHaveText(
    "Price list",
  );
  await expect(member.getByTestId("delete-automation")).toHaveCount(0);
  await expect(member.getByTestId("save-automation")).toHaveCount(0);
  await replay(runtime, deleteAutomation, "member");
  await replay(runtime, deleteAutomation, "outsider");
  expect(await rows(runtime, "select id from automations")).toHaveLength(1);
  await owner.goto(automationPath);
  await owner.getByTestId("keywords-input").fill("price");
  await owner.getByTestId("add-step-text").click();
  await owner
    .getByTestId("step")
    .nth(0)
    .getByTestId("step-text")
    .fill("Our price list is on the website.");
  await owner.getByTestId("save-automation").click();
  await expect(owner.getByText("Automation saved")).toBeVisible();
  await owner.getByTestId("activate-automation").click();
  await expect(owner.getByTestId("automation-status")).toHaveText("Active");
  const deactivate = await captureServerCall(owner, () =>
    owner.getByTestId("deactivate-automation").click(),
  );
  await replay(runtime, deactivate, "member");
  expect(
    (await rows(runtime, "select status from automations"))[0].status,
  ).toBe("active");
  // The same call from the creator does go through.
  expect((await replay(runtime, deleteAutomation, "owner")).status).toBe(200);
  expect(await rows(runtime, "select id from automations")).toHaveLength(0);

  // Broadcasts: only the creator or an admin cancels a scheduled one.
  await owner.goto("/broadcasts");
  await Promise.all([
    owner.waitForURL(/\/broadcasts\/[^/]+$/),
    owner.getByTestId("new-broadcast").click(),
  ]);
  const broadcastPath = new URL(owner.url()).pathname;
  await owner
    .getByTestId("broadcast-text")
    .fill("Workshop closes early on Friday.");
  const later = new Date(Date.now() + 86400_000);
  await owner
    .getByTestId("schedule-at")
    .fill(
      new Date(later.getTime() - later.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16),
    );
  await owner.getByTestId("schedule-broadcast").click();
  await expect(owner.getByTestId("broadcast-status")).toHaveText("Scheduled");
  await owner.getByTestId("cancel-broadcast").click();
  const cancel = await confirmCapture(owner, "Cancel broadcast");
  await member.goto(broadcastPath);
  await expect(member.getByTestId("broadcast-status")).toHaveText("Scheduled");
  await expect(member.getByTestId("cancel-broadcast")).toHaveCount(0);
  await replay(runtime, cancel, "member");
  expect((await rows(runtime, "select status from broadcasts"))[0].status).toBe(
    "scheduled",
  );

  // Admin only: the channel's webhook, deleting contacts and definitions.
  await owner.goto("/settings");
  const register = await captureServerCall(owner, () =>
    owner.getByTestId("register-webhook").click(),
  );
  await member.goto("/settings");
  await expect(member.getByTestId("channel-status")).toBeVisible();
  await expect(member.getByTestId("register-webhook")).toHaveCount(0);
  await replay(runtime, register, "member");
  expect(telegram.calls.filter((c) => c.method === "setWebhook")).toHaveLength(
    0,
  );

  await owner.getByTestId("new-tag-name").fill("VIP");
  await owner.getByTestId("add-tag").click();
  await expect(
    owner.getByTestId("tag-row").filter({ hasText: "VIP" }),
  ).toHaveCount(1);
  await owner
    .getByTestId("tag-row")
    .filter({ hasText: "VIP" })
    .getByTestId("delete-tag")
    .click();
  const deleteTag = await confirmCapture(owner, "Delete");
  await member.reload();
  await expect(
    member.getByTestId("tag-row").filter({ hasText: "VIP" }),
  ).toHaveCount(1);
  await expect(member.getByTestId("delete-tag")).toHaveCount(0);
  await replay(runtime, deleteTag, "member");
  expect(await rows(runtime, "select id from tags")).toHaveLength(1);

  await owner.getByTestId("new-field-name").fill("Bike model");
  await owner.getByTestId("add-field").click();
  await owner
    .getByTestId("field-row")
    .filter({ hasText: "Bike model" })
    .getByTestId("delete-field")
    .click();
  const deleteField = await confirmCapture(owner, "Delete");
  await replay(runtime, deleteField, "member");
  expect(await rows(runtime, "select id from custom_fields")).toHaveLength(1);

  const [contact] = await rows(
    runtime,
    "select id from contacts where channel = 'telegram'",
  );
  await owner.goto(`/contacts/${contact.id}`);
  await owner.getByTestId("delete-contact").click();
  const deleteContact = await confirmCapture(owner, "Delete");
  await member.goto(`/contacts/${contact.id}`);
  await expect(member.getByRole("heading", { level: 1 })).toHaveText(
    "Ana Silva",
  );
  await expect(member.getByTestId("delete-contact")).toHaveCount(0);
  await replay(runtime, deleteContact, "member");
  expect(
    await rows(runtime, "select id from contacts where channel = 'telegram'"),
  ).toHaveLength(1);

  // Preview conversations are each member's own.
  await owner.goto("/preview");
  await owner.getByTestId("preview-input").fill("owner's private test note");
  await owner.getByTestId("preview-send").click();
  await expect(
    owner
      .getByTestId("message")
      .filter({ hasText: "owner's private test note" }),
  ).toBeVisible();
  const [preview] = await rows(
    runtime,
    "select id from contacts where channel = 'preview' and preview_owner_id = 'owner'",
  );
  await member.goto("/preview");
  await expect(member.getByRole("heading", { level: 1 })).toHaveText("Preview");
  await expect(member.getByText("owner's private test note")).toHaveCount(0);
  for (const path of [`/inbox/${preview.id}`, `/contacts/${preview.id}`]) {
    await member.goto(path);
    await expect(member.getByText("owner's private test note")).toHaveCount(0);
    await expect(member.getByTestId("not-found")).toBeVisible();
  }
  const memberInbox = await (
    await runtime.fetch("/inbox", { role: "member" })
  ).text();
  expect(memberInbox).not.toContain("owner's private test note");
  await member.goto("/contacts");
  await expect(member.getByTestId("contact-row")).toHaveCount(1);

  // Admin actions still work for the admin.
  await owner.goto(`/contacts/${contact.id}`);
  await owner.getByTestId("delete-contact").click();
  await owner
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await owner.waitForURL(/\/contacts(\?|$)/);
  expect(
    await rows(runtime, "select id from contacts where channel = 'telegram'"),
  ).toHaveLength(0);
  console.log("authorization: ok");
} finally {
  await runtime.close();
  await telegram.close();
}
