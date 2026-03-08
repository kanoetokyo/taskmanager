CREATE TABLE `task_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `task_categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_definitions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryId` int NOT NULL,
	`label` varchar(512) NOT NULL,
	`defaultPlanned` varchar(64) NOT NULL DEFAULT '当日事務担当',
	`deadline` varchar(64) NOT NULL DEFAULT '',
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `task_definitions_id` PRIMARY KEY(`id`)
);
