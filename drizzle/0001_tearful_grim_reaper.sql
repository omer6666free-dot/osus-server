CREATE TABLE `attendance_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`checkInTime` timestamp,
	`checkOutTime` timestamp,
	`checkInLatitude` decimal(10,8),
	`checkInLongitude` decimal(11,8),
	`checkOutLatitude` decimal(10,8),
	`checkOutLongitude` decimal(11,8),
	`checkInMethod` enum('face','fingerprint','eye'),
	`checkOutMethod` enum('face','fingerprint','eye'),
	`status` enum('present','late','absent','half_day') NOT NULL DEFAULT 'present',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`employeeCode` varchar(50) NOT NULL,
	`fullName` varchar(255) NOT NULL,
	`phone` varchar(20),
	`department` varchar(100),
	`position` varchar(100),
	`status` enum('active','inactive','suspended') NOT NULL DEFAULT 'active',
	`faceDataId` varchar(255),
	`fingerprintEnabled` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`),
	CONSTRAINT `employees_employeeCode_unique` UNIQUE(`employeeCode`)
);
--> statement-breakpoint
CREATE TABLE `location_tracking` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`latitude` decimal(10,8) NOT NULL,
	`longitude` decimal(11,8) NOT NULL,
	`accuracy` decimal(10,2),
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `location_tracking_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `work_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`workStartTime` varchar(5) NOT NULL DEFAULT '08:00',
	`workEndTime` varchar(5) NOT NULL DEFAULT '17:00',
	`lateThresholdMinutes` int NOT NULL DEFAULT 15,
	`workDays` varchar(20) NOT NULL DEFAULT '1,2,3,4,5',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `work_settings_id` PRIMARY KEY(`id`)
);
