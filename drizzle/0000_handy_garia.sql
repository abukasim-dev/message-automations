CREATE TABLE `app_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `automation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`automation_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`status` text NOT NULL,
	`step_index` integer DEFAULT 0 NOT NULL,
	`resume_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `runs_contact` ON `automation_runs` (`contact_id`,`status`);--> statement-breakpoint
CREATE INDEX `runs_resume` ON `automation_runs` (`status`,`resume_at`);--> statement-breakpoint
CREATE TABLE `automations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`trigger` text NOT NULL,
	`keywords` text DEFAULT '[]' NOT NULL,
	`match` text DEFAULT 'exact' NOT NULL,
	`steps` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`run_count` integer DEFAULT 0 NOT NULL,
	`last_run_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `broadcasts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`button_label` text,
	`button_url` text,
	`audience` text DEFAULT 'everyone' NOT NULL,
	`tag_ids` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`send_at` integer,
	`sent_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`sent_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contact_tags` (
	`contact_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`contact_id`, `tag_id`)
);
--> statement-breakpoint
CREATE INDEX `contact_tags_tag` ON `contact_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`chat_id` text NOT NULL,
	`preview_owner_id` text,
	`first_name` text DEFAULT '' NOT NULL,
	`last_name` text DEFAULT '' NOT NULL,
	`username` text,
	`email` text,
	`phone` text,
	`subscribed` integer DEFAULT true NOT NULL,
	`first_seen_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`last_interaction_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`last_message_at` integer,
	`last_message_text` text,
	`status` text DEFAULT 'open' NOT NULL,
	`starred` integer DEFAULT false NOT NULL,
	`assignee_id` text,
	`paused_until` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_channel_chat` ON `contacts` (`channel`,`chat_id`);--> statement-breakpoint
CREATE INDEX `contacts_last_message` ON `contacts` (`last_message_at`);--> statement-breakpoint
CREATE TABLE `custom_fields` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `custom_fields_name_unique` ON `custom_fields` (`name`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`broadcast_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	PRIMARY KEY(`broadcast_id`, `contact_id`)
);
--> statement-breakpoint
CREATE TABLE `field_values` (
	`contact_id` text NOT NULL,
	`field_id` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`contact_id`, `field_id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`buttons` text,
	`status` text NOT NULL,
	`error` text,
	`author_id` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `messages_contact` ON `messages` (`contact_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);--> statement-breakpoint
CREATE TABLE `telegram_updates` (
	`update_id` integer PRIMARY KEY NOT NULL,
	`received_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
