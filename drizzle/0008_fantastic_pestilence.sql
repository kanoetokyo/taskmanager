CREATE TABLE `stores_shift_status` (
	`id` int AUTO_INCREMENT NOT NULL,
	`confirmedUntil` varchar(16) NOT NULL DEFAULT '',
	`updatedBy` varchar(64) NOT NULL DEFAULT '',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `stores_shift_status_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `gray_cell_status` ADD `updatedBy` varchar(64) DEFAULT '' NOT NULL;