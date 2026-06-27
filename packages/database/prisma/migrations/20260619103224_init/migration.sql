-- CreateTable
CREATE TABLE `factories` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `address` VARCHAR(500) NOT NULL,
    `description` TEXT NULL,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `zones` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `factory_id` BIGINT NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `floor_level` INTEGER NOT NULL,
    `description` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `twin_models` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `zone_id` BIGINT NOT NULL,
    `model_type` ENUM('3D_MODEL', 'PHOTO_360') NOT NULL,
    `file_url` VARCHAR(500) NOT NULL,
    `format` VARCHAR(50) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `uploaded_by` BIGINT NOT NULL,
    `uploaded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `navigation_points` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `source_model_id` BIGINT NOT NULL,
    `target_model_id` BIGINT NULL,
    `machine_id` BIGINT NULL,
    `position_x` DOUBLE NOT NULL,
    `position_y` DOUBLE NOT NULL,
    `position_z` DOUBLE NOT NULL,
    `label` VARCHAR(255) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `machines` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `zone_id` BIGINT NOT NULL,
    `code` VARCHAR(100) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `type` VARCHAR(100) NOT NULL,
    `manufacturer` VARCHAR(255) NOT NULL,
    `install_date` DATE NOT NULL,
    `status` ENUM('RUNNING', 'STOPPED', 'MAINTENANCE', 'ERROR') NOT NULL DEFAULT 'STOPPED',
    `position_x` DOUBLE NOT NULL,
    `position_y` DOUBLE NOT NULL,
    `position_z` DOUBLE NOT NULL,
    `qr_code` VARCHAR(255) NULL,

    UNIQUE INDEX `machines_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sensors` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `machine_id` BIGINT NOT NULL,
    `sensor_type` ENUM('TEMPERATURE', 'VIBRATION', 'SPEED', 'POWER', 'ONOFF', 'OUTPUT') NOT NULL,
    `unit` VARCHAR(50) NOT NULL,
    `min_threshold` DECIMAL(10, 2) NULL,
    `max_threshold` DECIMAL(10, 2) NULL,
    `mqtt_topic` VARCHAR(255) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sensor_readings` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `sensor_id` BIGINT NOT NULL,
    `value` DECIMAL(15, 4) NOT NULL,
    `recorded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `quality_flag` TINYINT NOT NULL DEFAULT 1,

    INDEX `sensor_readings_sensor_id_recorded_at_idx`(`sensor_id`, `recorded_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sensor_readings_hourly` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `sensor_id` BIGINT NOT NULL,
    `period_start` DATETIME(3) NOT NULL,
    `avg_value` DECIMAL(15, 4) NOT NULL,
    `min_value` DECIMAL(15, 4) NOT NULL,
    `max_value` DECIMAL(15, 4) NOT NULL,

    INDEX `sensor_readings_hourly_sensor_id_period_start_idx`(`sensor_id`, `period_start`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `alerts` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `machine_id` BIGINT NOT NULL,
    `sensor_id` BIGINT NULL,
    `alert_type` VARCHAR(100) NOT NULL,
    `severity` ENUM('CRITICAL', 'WARNING', 'INFO') NOT NULL,
    `message` VARCHAR(500) NOT NULL,
    `threshold_value` DECIMAL(15, 4) NULL,
    `actual_value` DECIMAL(15, 4) NULL,
    `status` ENUM('OPEN', 'ACKNOWLEDGED', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
    `acknowledged_by` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolved_at` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `maintenance_schedules` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `machine_id` BIGINT NOT NULL,
    `maintenance_type` ENUM('PREVENTIVE', 'CORRECTIVE') NOT NULL,
    `frequency_days` INTEGER NOT NULL,
    `next_due_date` DATE NOT NULL,
    `assigned_technician_id` BIGINT NOT NULL,
    `status` VARCHAR(50) NOT NULL,
    `description` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `maintenance_tickets` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `machine_id` BIGINT NOT NULL,
    `reported_by` BIGINT NOT NULL,
    `assigned_to` BIGINT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolved_at` DATETIME(3) NULL,
    `resolution_notes` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `machine_activity_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `machine_id` BIGINT NOT NULL,
    `related_ticket_id` BIGINT NULL,
    `event_type` ENUM('START', 'STOP', 'STATUS_CHANGE', 'MAINTENANCE', 'ALERT') NOT NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `production_records` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `machine_id` BIGINT NOT NULL,
    `period_start` DATETIME(3) NOT NULL,
    `period_end` DATETIME(3) NOT NULL,
    `output_quantity` DECIMAL(15, 2) NOT NULL,
    `target_quantity` DECIMAL(15, 2) NOT NULL,
    `unit` VARCHAR(50) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `energy_consumption` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `machine_id` BIGINT NOT NULL,
    `period_start` DATETIME(3) NOT NULL,
    `period_end` DATETIME(3) NOT NULL,
    `consumption_kwh` DECIMAL(15, 4) NOT NULL,
    `cost` DECIMAL(15, 2) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `factory_id` BIGINT NULL,
    `full_name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'TECHNICIAN', 'OPERATOR', 'VIEWER') NOT NULL,
    `phone` VARCHAR(50) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `alert_id` BIGINT NULL,
    `ticket_id` BIGINT NULL,
    `title` VARCHAR(255) NOT NULL,
    `content` TEXT NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `channel` ENUM('IN_APP', 'EMAIL', 'SMS') NOT NULL DEFAULT 'IN_APP',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attachments` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `related_type` ENUM('TICKET', 'MAINTENANCE', 'MACHINE') NOT NULL,
    `related_id` BIGINT NOT NULL,
    `file_url` VARCHAR(500) NOT NULL,
    `file_type` VARCHAR(50) NULL,
    `uploaded_by` BIGINT NOT NULL,
    `uploaded_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reports` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `report_type` ENUM('PERFORMANCE', 'ENERGY', 'MAINTENANCE') NOT NULL,
    `factory_id` BIGINT NOT NULL,
    `generated_by` BIGINT NOT NULL,
    `date_range_start` DATE NOT NULL,
    `date_range_end` DATE NOT NULL,
    `file_url` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `entity_type` VARCHAR(100) NOT NULL,
    `entity_id` BIGINT NOT NULL,
    `ip_address` VARCHAR(50) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `zones` ADD CONSTRAINT `zones_factory_id_fkey` FOREIGN KEY (`factory_id`) REFERENCES `factories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `twin_models` ADD CONSTRAINT `twin_models_zone_id_fkey` FOREIGN KEY (`zone_id`) REFERENCES `zones`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `twin_models` ADD CONSTRAINT `twin_models_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `navigation_points` ADD CONSTRAINT `navigation_points_source_model_id_fkey` FOREIGN KEY (`source_model_id`) REFERENCES `twin_models`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `navigation_points` ADD CONSTRAINT `navigation_points_target_model_id_fkey` FOREIGN KEY (`target_model_id`) REFERENCES `twin_models`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `navigation_points` ADD CONSTRAINT `navigation_points_machine_id_fkey` FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `machines` ADD CONSTRAINT `machines_zone_id_fkey` FOREIGN KEY (`zone_id`) REFERENCES `zones`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sensors` ADD CONSTRAINT `sensors_machine_id_fkey` FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sensor_readings` ADD CONSTRAINT `sensor_readings_sensor_id_fkey` FOREIGN KEY (`sensor_id`) REFERENCES `sensors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sensor_readings_hourly` ADD CONSTRAINT `sensor_readings_hourly_sensor_id_fkey` FOREIGN KEY (`sensor_id`) REFERENCES `sensors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_machine_id_fkey` FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_sensor_id_fkey` FOREIGN KEY (`sensor_id`) REFERENCES `sensors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_acknowledged_by_fkey` FOREIGN KEY (`acknowledged_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance_schedules` ADD CONSTRAINT `maintenance_schedules_machine_id_fkey` FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance_schedules` ADD CONSTRAINT `maintenance_schedules_assigned_technician_id_fkey` FOREIGN KEY (`assigned_technician_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance_tickets` ADD CONSTRAINT `maintenance_tickets_machine_id_fkey` FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance_tickets` ADD CONSTRAINT `maintenance_tickets_reported_by_fkey` FOREIGN KEY (`reported_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenance_tickets` ADD CONSTRAINT `maintenance_tickets_assigned_to_fkey` FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `machine_activity_logs` ADD CONSTRAINT `machine_activity_logs_machine_id_fkey` FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `machine_activity_logs` ADD CONSTRAINT `machine_activity_logs_related_ticket_id_fkey` FOREIGN KEY (`related_ticket_id`) REFERENCES `maintenance_tickets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `production_records` ADD CONSTRAINT `production_records_machine_id_fkey` FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `energy_consumption` ADD CONSTRAINT `energy_consumption_machine_id_fkey` FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_factory_id_fkey` FOREIGN KEY (`factory_id`) REFERENCES `factories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_alert_id_fkey` FOREIGN KEY (`alert_id`) REFERENCES `alerts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `maintenance_tickets`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attachments` ADD CONSTRAINT `attachments_uploaded_by_fkey` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_factory_id_fkey` FOREIGN KEY (`factory_id`) REFERENCES `factories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reports` ADD CONSTRAINT `reports_generated_by_fkey` FOREIGN KEY (`generated_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
