ALTER TABLE `projects` ADD `public_status` text DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD `published_at` text;
--> statement-breakpoint
ALTER TABLE `projects` ADD `publish_version` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `project_domains` (
  `host` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL,
  `kind` text NOT NULL,
  `public_primary` integer DEFAULT 0 NOT NULL,
  `admin_primary` integer DEFAULT 0 NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_project_domains_project_kind` ON `project_domains` (`project_id`,`kind`,`status`);
--> statement-breakpoint
INSERT OR IGNORE INTO `project_domains` (`host`,`project_id`,`kind`,`public_primary`,`admin_primary`,`status`,`created_at`,`updated_at`)
SELECT lower(`public_host`),`id`,'public',1,0,'active',datetime('now'),datetime('now')
FROM `projects`
WHERE `public_host` IS NOT NULL AND trim(`public_host`)!='';
--> statement-breakpoint
INSERT OR IGNORE INTO `project_domains` (`host`,`project_id`,`kind`,`public_primary`,`admin_primary`,`status`,`created_at`,`updated_at`)
SELECT lower(`admin_host`),`id`,'admin',0,1,'active',datetime('now'),datetime('now')
FROM `projects`
WHERE `admin_host` IS NOT NULL AND trim(`admin_host`)!='';
--> statement-breakpoint
UPDATE `project_domains`
SET `kind`='both',`admin_primary`=1,`updated_at`=datetime('now')
WHERE `host` IN (
  SELECT lower(p.`admin_host`) FROM `projects` p
  WHERE p.`admin_host` IS NOT NULL
    AND lower(p.`admin_host`)=lower(p.`public_host`)
);
--> statement-breakpoint
UPDATE `projects`
SET `public_status`='published',
    `published_at`=COALESCE(`published_at`,datetime('now')),
    `publish_version`=CASE WHEN `publish_version`<1 THEN 1 ELSE `publish_version` END
WHERE `id`='tiyansh-prime-square';
