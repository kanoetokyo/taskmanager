CREATE TABLE `gray_cell_status` (
	`id` int AUTO_INCREMENT NOT NULL,
	`confirmedUntil` varchar(16) NOT NULL DEFAULT '',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gray_cell_status_id` PRIMARY KEY(`id`)
);
