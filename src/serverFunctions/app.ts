import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { waitUntil } from "cloudflare:workers";
import { ensureUserMiddleware } from "@every-app/sdk/tanstack-start";
import { z } from "zod";
import * as automations from "@/server/automations";
import * as broadcasts from "@/server/broadcasts";
import * as contacts from "@/server/contacts";
import * as inbox from "@/server/inbox";
import * as preview from "@/server/preview";
import * as settings from "@/server/settings";
import { me } from "@/server/users";

// Every server function runs behind ensureUserMiddleware: `context.user` is
// the member the Gateway signed in; `me()` records them and derives admin.
const idParam = z.object({ id: z.string() });

// Settings: the channel, tags and custom fields.
export const getSettings = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => {
    const viewer = await me(context.user);
    const [channel, tags, fields] = await Promise.all([
      settings.channelStatus(getRequest().url),
      settings.listTags(),
      settings.listFields(),
    ]);
    return { viewer, channel, tags, fields };
  });
export const registerWebhook = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) =>
    settings.registerWebhook(await me(context.user), getRequest().url),
  );
export const createTag = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => settings.nameInput.parse(d))
  .handler(async ({ data, context }) => {
    await me(context.user);
    await settings.createTag(data);
  });
export const createField = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => settings.fieldInput.parse(d))
  .handler(async ({ data, context }) => {
    await me(context.user);
    await settings.createField(data);
  });
export const deleteTag = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => settings.idInput.parse(d))
  .handler(async ({ data, context }) =>
    settings.deleteTag(await me(context.user), data),
  );
export const deleteField = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => settings.idInput.parse(d))
  .handler(async ({ data, context }) =>
    settings.deleteField(await me(context.user), data),
  );

// Automations.
export const listAutomations = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) =>
    automations.listAutomations(await me(context.user)),
  );
export const getAutomation = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => idParam.parse(d))
  .handler(async ({ data, context }) => {
    const viewer = await me(context.user);
    const [automation, tags, fields] = await Promise.all([
      automations.getAutomation(viewer, data.id),
      settings.listTags(),
      settings.listFields(),
    ]);
    return { automation, tags, fields };
  });
export const createAutomation = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => automations.createAutomationInput.parse(d))
  .handler(async ({ data, context }) =>
    automations.createAutomation(await me(context.user), data),
  );
export const saveAutomation = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => automations.saveAutomationInput.parse(d))
  .handler(async ({ data, context }) =>
    automations.saveAutomation(await me(context.user), data),
  );
export const setAutomationStatus = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => automations.setStatusInput.parse(d))
  .handler(async ({ data, context }) =>
    automations.setStatus(await me(context.user), data),
  );
export const deleteAutomation = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => automations.idInput.parse(d))
  .handler(async ({ data, context }) =>
    automations.deleteAutomation(await me(context.user), data),
  );

// Contacts.
export const listContacts = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => contacts.listContactsInput.parse(d))
  .handler(async ({ data, context }) => {
    await me(context.user);
    const [page, tags] = await Promise.all([
      contacts.listContacts(data),
      settings.listTags(),
    ]);
    return { ...page, tags };
  });
export const getContact = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => idParam.parse(d))
  .handler(async ({ data, context }) => {
    const viewer = await me(context.user);
    const [contact, tags] = await Promise.all([
      contacts.getContact(viewer, data.id),
      settings.listTags(),
    ]);
    return { viewer, contact, tags };
  });
export const addContactTag = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => contacts.contactTagInput.parse(d))
  .handler(async ({ data, context }) =>
    contacts.addTag(await me(context.user), data),
  );
export const removeContactTag = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => contacts.contactTagInput.parse(d))
  .handler(async ({ data, context }) =>
    contacts.removeTag(await me(context.user), data),
  );
export const saveContactFields = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => contacts.saveFieldsInput.parse(d))
  .handler(async ({ data, context }) =>
    contacts.saveFields(await me(context.user), data),
  );
export const setContactSubscribed = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => contacts.setSubscribedInput.parse(d))
  .handler(async ({ data, context }) =>
    contacts.setSubscribed(await me(context.user), data),
  );
export const deleteContact = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => contacts.contactIdInput.parse(d))
  .handler(async ({ data, context }) =>
    contacts.deleteContact(await me(context.user), data),
  );

// Inbox.
export const listConversations = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => inbox.listInput.parse(d))
  .handler(async ({ data, context }) =>
    inbox.listConversations(await me(context.user), data),
  );
export const getConversation = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => idParam.parse(d))
  .handler(async ({ data, context }) => {
    const viewer = await me(context.user);
    return {
      viewer,
      conversation: await inbox.getConversation(viewer, data.id),
    };
  });
export const sendReply = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => inbox.replyInput.parse(d))
  .handler(async ({ data, context }) =>
    inbox.reply(await me(context.user), data),
  );
export const updateConversation = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => inbox.updateInput.parse(d))
  .handler(async ({ data, context }) =>
    inbox.updateConversation(await me(context.user), data),
  );

// Broadcasts.
export const listBroadcasts = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) =>
    broadcasts.listBroadcasts(await me(context.user)),
  );
export const getBroadcast = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => idParam.parse(d))
  .handler(async ({ data, context }) => {
    const viewer = await me(context.user);
    const [broadcast, tags] = await Promise.all([
      broadcasts.getBroadcast(viewer, data.id),
      settings.listTags(),
    ]);
    return { broadcast, tags };
  });
export const createBroadcast = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) =>
    broadcasts.createBroadcast(await me(context.user)),
  );
export const countAudience = createServerFn()
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => broadcasts.audienceInput.parse(d))
  .handler(async ({ data, context }) => {
    await me(context.user);
    return broadcasts.countAudience(data);
  });
export const saveBroadcast = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => broadcasts.saveBroadcastInput.parse(d))
  .handler(async ({ data, context }) => {
    const saved = await broadcasts.saveBroadcast(await me(context.user), data);
    if (saved.status === "sending")
      waitUntil(broadcasts.deliverBroadcast(saved));
    return { status: saved.status };
  });
export const cancelBroadcast = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => broadcasts.idInput.parse(d))
  .handler(async ({ data, context }) =>
    broadcasts.cancelBroadcast(await me(context.user), data),
  );

// Preview.
export const getPreview = createServerFn()
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => preview.getPreview(await me(context.user)));
export const sendPreview = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .validator((d: unknown) => preview.previewInput.parse(d))
  .handler(async ({ data, context }) =>
    preview.sendPreview(await me(context.user), data),
  );
export const resetPreview = createServerFn({ method: "POST" })
  .middleware([ensureUserMiddleware])
  .handler(async ({ context }) => preview.resetPreview(await me(context.user)));
