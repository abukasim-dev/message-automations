// Persistence: what arrives and what members write survives a restart.
import { start, expect, incoming, rows } from "./lib.mjs";

const { runtime, telegram } = await start();
try {
  const rider = {
    id: 7001,
    first_name: "Mia",
    last_name: "Chen",
    username: "miachen",
  };
  expect(
    (await incoming(runtime, rider, "Do you service e-bikes?")).status,
  ).toBe(200);
  let page = await (await runtime.context("owner")).newPage();
  await page.goto("/settings");
  await page.getByTestId("new-tag-name").fill("E-bike owner");
  await page.getByTestId("add-tag").click();
  await expect(
    page.getByTestId("tag-row").filter({ hasText: "E-bike owner" }),
  ).toHaveCount(1);
  await page.goto("/");
  await page.getByTestId("new-automation").click();
  await page.getByTestId("automation-name").fill("E-bike questions");
  await page.getByTestId("automation-trigger").selectOption("keyword");
  await Promise.all([
    page.waitForURL(/\/automations\/[^/]+$/),
    page.getByTestId("create-automation").click(),
  ]);
  await page.getByTestId("keywords-input").fill("e-bike");
  await page.getByTestId("add-step-text").click();
  await page
    .getByTestId("step")
    .nth(0)
    .getByTestId("step-text")
    .fill("Yes, we service every e-bike brand.");
  await page.getByTestId("save-automation").click();
  await expect(page.getByText("Automation saved")).toBeVisible();
  const automationPath = new URL(page.url()).pathname;

  await runtime.restart();

  expect(
    await rows(
      runtime,
      "select first_name from contacts where channel = 'telegram'",
    ),
  ).toEqual([{ first_name: "Mia" }]);
  page = await (await runtime.context("member")).newPage();
  await page.goto("/contacts");
  await expect(
    page.getByTestId("contact-row").filter({ hasText: "Mia Chen" }),
  ).toHaveCount(1);
  await page.goto("/inbox");
  await page
    .getByTestId("conversation-row")
    .filter({ hasText: "Mia Chen" })
    .click();
  await expect(
    page.getByTestId("message").filter({ hasText: "Do you service e-bikes?" }),
  ).toBeVisible();
  await page.goto("/settings");
  await expect(
    page.getByTestId("tag-row").filter({ hasText: "E-bike owner" }),
  ).toHaveCount(1);
  await page.goto(automationPath);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "E-bike questions",
  );
  await expect(
    page.getByTestId("step").nth(0).getByTestId("step-text"),
  ).toHaveValue("Yes, we service every e-bike brand.");
  console.log("persistence: ok");
} finally {
  await runtime.close();
  await telegram.close();
}
