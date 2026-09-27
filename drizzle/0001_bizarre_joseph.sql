ALTER TABLE "media_uploads" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
UPDATE "media_uploads" SET "deleted_at" = NOW() WHERE "status" = 'deleted' AND "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invite_applications_pending_contact_unique_idx" ON "invite_applications" USING btree ("contact_normalized") WHERE "invite_applications"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "invite_applications_ip_status_idx" ON "invite_applications" USING btree ("ip","status");--> statement-breakpoint
CREATE INDEX "invite_applications_ip_created_at_idx" ON "invite_applications" USING btree ("ip","created_at");
