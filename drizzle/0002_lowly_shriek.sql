CREATE TABLE `admin_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('late','absent','outside_zone','system') NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`employeeId` int,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `admin_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `work_zones` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`latitude` decimal(10,8) NOT NULL,
	`longitude` decimal(11,8) NOT NULL,
	`radiusMeters` int NOT NULL DEFAULT 100,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `work_zones_id` PRIMARY KEY(`id`)
);
