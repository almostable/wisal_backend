DROP INDEX "idx_media_purged";--> statement-breakpoint
ALTER TABLE "media_uploads" DROP COLUMN "purged_at";