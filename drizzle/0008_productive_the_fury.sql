CREATE TABLE `branches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`code` varchar(20) NOT NULL,
	`address` varchar(255),
	`managerId` int,
	`managerCode` varchar(50),
	`latitude` decimal(10,8),
	`longitude` decimal(11,8),
	`radiusMeters` int DEFAULT 100,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `branches_id` PRIMARY KEY(`id`),
	CONSTRAINT `branches_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
ALTER TABLE `employees` MODIFY COLUMN `role` enum('employee','branch_manager','admin') NOT NULL DEFAULT 'employee';--> statement-breakpoint
ALTER TABLE `employees` ADD `branchId` int;