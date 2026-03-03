CREATE TABLE IF NOT EXISTS `customer_handovers` (
	`id` varchar(64) NOT NULL,
	`dateKey` varchar(8) NOT NULL,
	`customerName` varchar(128) NOT NULL DEFAULT '',
	`store` varchar(64) NOT NULL DEFAULT '',
	`content` varchar(2048) NOT NULL DEFAULT '',
	`status` varchar(32) NOT NULL DEFAULT '対応中',
	`assignee` varchar(64) NOT NULL DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_handovers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `handover_items` (
	`id` varchar(64) NOT NULL,
	`dateKey` varchar(8) NOT NULL,
	`author` varchar(64) NOT NULL DEFAULT '',
	`content` varchar(2048) NOT NULL DEFAULT '',
	`checkedMembers` json NOT NULL DEFAULT (JSON_ARRAY()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `handover_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `individual_handovers` (
	`id` varchar(64) NOT NULL,
	`dateKey` varchar(8) NOT NULL,
	`author` varchar(64) NOT NULL DEFAULT '',
	`target` varchar(64) NOT NULL DEFAULT '',
	`tasks` json NOT NULL DEFAULT (JSON_ARRAY()),
	`completed` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `individual_handovers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `misoca_status` (
	`id` int AUTO_INCREMENT NOT NULL,
	`completedUntil` varchar(16) NOT NULL DEFAULT '',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `misoca_status_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `store_check_states` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dateKey` varchar(8) NOT NULL,
	`checkType` varchar(32) NOT NULL,
	`checkedStores` json NOT NULL DEFAULT (JSON_ARRAY()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `store_check_states_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `task_states` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dateKey` varchar(8) NOT NULL,
	`taskId` varchar(128) NOT NULL,
	`done` boolean NOT NULL DEFAULT false,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `task_states_id` PRIMARY KEY(`id`)
);
