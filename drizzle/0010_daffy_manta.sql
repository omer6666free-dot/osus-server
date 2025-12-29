CREATE TABLE `branch_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`branchId` int NOT NULL,
	`type` enum('employee_added','employee_check_in','employee_check_out','employee_late','employee_absent','employee_early_checkout','employee_outside_zone','general') NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text NOT NULL,
	`employeeId` int,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `branch_notifications_id` PRIMARY KEY(`id`)
);
