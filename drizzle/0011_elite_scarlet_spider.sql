CREATE TABLE `attendance_modifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attendanceId` int NOT NULL,
	`modifiedBy` int NOT NULL,
	`modificationType` enum('edit','add','delete','reset') NOT NULL,
	`previousCheckIn` timestamp,
	`previousCheckOut` timestamp,
	`newCheckIn` timestamp,
	`newCheckOut` timestamp,
	`reason` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_modifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `field_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`taskType` enum('field_leave','field_return') NOT NULL,
	`taskDescription` text,
	`latitude` decimal(10,8),
	`longitude` decimal(11,8),
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	`verificationMethod` enum('face','fingerprint','eye'),
	`status` enum('active','completed','cancelled') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `field_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `employees` ADD `employeeType` enum('office','field') DEFAULT 'office' NOT NULL;