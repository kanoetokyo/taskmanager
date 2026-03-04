ALTER TABLE `customer_handovers` MODIFY COLUMN `dateKey` varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE `handover_items` MODIFY COLUMN `dateKey` varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE `individual_handovers` MODIFY COLUMN `dateKey` varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE `store_check_states` MODIFY COLUMN `dateKey` varchar(10) NOT NULL;--> statement-breakpoint
ALTER TABLE `task_states` MODIFY COLUMN `dateKey` varchar(10) NOT NULL;