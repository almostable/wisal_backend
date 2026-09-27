CREATE TYPE "public"."admin_role" AS ENUM('admin', 'moderator');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" bigint PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"banned_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" bigint PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identities" (
	"id" bigint PRIMARY KEY NOT NULL,
	"identity" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" bigint PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"name" varchar(100),
	"identity" varchar(32),
	"is_male" boolean,
	"avatar_key" text,
	"description" text,
	"links" jsonb,
	"identity_id" bigint,
	"readers_count" integer DEFAULT 0 NOT NULL,
	"verified_at" timestamp with time zone,
	"notifications_read_at" timestamp with time zone,
	"search_text" text GENERATED ALWAYS AS (lower(coalesce(identity, '') || ' ' || coalesce(name, '') || ' ' || coalesce(description, ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_account_id_unique" UNIQUE("account_id"),
	CONSTRAINT "profiles_identity_id_unique" UNIQUE("identity_id")
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" bigint PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"role" "admin_role" DEFAULT 'moderator' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" bigint PRIMARY KEY NOT NULL,
	"admin_id" bigint NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" bigint PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by_id" bigint,
	"inviter_id" bigint,
	"used_by_id" bigint,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "readers" (
	"reader_profile_id" bigint NOT NULL,
	"author_profile_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_at" timestamp with time zone,
	"last_read_post_id" bigint,
	CONSTRAINT "readers_reader_profile_id_author_profile_id_pk" PRIMARY KEY("reader_profile_id","author_profile_id"),
	CONSTRAINT "readers_prevent_self_read_check" CHECK ("readers"."reader_profile_id" != "readers"."author_profile_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" bigint PRIMARY KEY NOT NULL,
	"author_id" bigint NOT NULL,
	"author_gender" boolean NOT NULL,
	"type" varchar(32) DEFAULT 'text' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"gender_scope" varchar(32) DEFAULT 'all' NOT NULL,
	"is_feed" boolean DEFAULT false NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"saves_count" integer DEFAULT 0 NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"comments_count" integer DEFAULT 0 NOT NULL,
	"views_count" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "post_saves" (
	"post_id" bigint NOT NULL,
	"profile_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_saves_post_id_profile_id_pk" PRIMARY KEY("post_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" bigint PRIMARY KEY NOT NULL,
	"post_id" bigint NOT NULL,
	"author_id" bigint NOT NULL,
	"parent_id" bigint,
	"reply_to_comment_id" bigint,
	"reply_to_profile_id" bigint,
	"type" varchar(32) DEFAULT 'text' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"replies_count" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "profile_blocks" (
	"blocker_profile_id" bigint NOT NULL,
	"blocked_profile_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_blocks_blocker_profile_id_blocked_profile_id_pk" PRIMARY KEY("blocker_profile_id","blocked_profile_id"),
	CONSTRAINT "profile_blocks_prevent_self_block_check" CHECK ("profile_blocks"."blocker_profile_id" != "profile_blocks"."blocked_profile_id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" bigint PRIMARY KEY NOT NULL,
	"reporter_profile_id" bigint NOT NULL,
	"reported_profile_id" bigint NOT NULL,
	"target_type" varchar(32) NOT NULL,
	"target_id" bigint NOT NULL,
	"reason" varchar(64) NOT NULL,
	"details" text,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"resolved_by_id" bigint,
	"mod_note" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_reporter_target_reason" UNIQUE("reporter_profile_id","target_type","target_id","reason"),
	CONSTRAINT "reports_prevent_self_report_check" CHECK ("reports"."reporter_profile_id" != "reports"."reported_profile_id")
);
--> statement-breakpoint
CREATE TABLE "media_uploads" (
	"file_key" varchar(512) PRIMARY KEY NOT NULL,
	"profile_id" bigint NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"entity_type" varchar(32),
	"entity_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "post_views" (
	"post_id" bigint NOT NULL,
	"profile_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_views_post_id_profile_id_pk" PRIMARY KEY("post_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"post_id" bigint NOT NULL,
	"profile_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_likes_post_id_profile_id_pk" PRIMARY KEY("post_id","profile_id")
);
--> statement-breakpoint
CREATE TABLE "user_restrictions" (
	"id" bigint PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"admin_id" bigint NOT NULL,
	"type" varchar(32) DEFAULT 'ban' NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" bigint,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigint PRIMARY KEY NOT NULL,
	"recipient_profile_id" bigint NOT NULL,
	"actor_profile_id" bigint,
	"type" varchar(32) NOT NULL,
	"target_type" varchar(32) NOT NULL,
	"target_id" bigint,
	"post_id" bigint,
	"comment_id" bigint,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_applications" (
	"id" bigint PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"about" text NOT NULL,
	"reason" text NOT NULL,
	"contact" varchar(255) NOT NULL,
	"contact_normalized" varchar(255) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"reviewed_by_id" bigint,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"invite_id" bigint,
	"ip" varchar(64),
	"user_agent" varchar(512),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_id_admins_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_inviter_id_accounts_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_used_by_id_accounts_id_fk" FOREIGN KEY ("used_by_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readers" ADD CONSTRAINT "readers_reader_profile_id_profiles_id_fk" FOREIGN KEY ("reader_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "readers" ADD CONSTRAINT "readers_author_profile_id_profiles_id_fk" FOREIGN KEY ("author_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_saves" ADD CONSTRAINT "post_saves_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_saves" ADD CONSTRAINT "post_saves_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_profiles_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_reply_to_comment_id_comments_id_fk" FOREIGN KEY ("reply_to_comment_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_reply_to_profile_id_profiles_id_fk" FOREIGN KEY ("reply_to_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_blocks" ADD CONSTRAINT "profile_blocks_blocker_profile_id_profiles_id_fk" FOREIGN KEY ("blocker_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_blocks" ADD CONSTRAINT "profile_blocks_blocked_profile_id_profiles_id_fk" FOREIGN KEY ("blocked_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_profile_id_profiles_id_fk" FOREIGN KEY ("reporter_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_profile_id_profiles_id_fk" FOREIGN KEY ("reported_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_id_admins_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_restrictions" ADD CONSTRAINT "user_restrictions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_restrictions" ADD CONSTRAINT "user_restrictions_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_restrictions" ADD CONSTRAINT "user_restrictions_revoked_by_id_admins_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_profile_id_profiles_id_fk" FOREIGN KEY ("recipient_profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_profile_id_profiles_id_fk" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_applications" ADD CONSTRAINT "invite_applications_reviewed_by_id_admins_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_applications" ADD CONSTRAINT "invite_applications_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_email_unique_idx" ON "accounts" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "accounts_created_at_idx" ON "accounts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "accounts_deleted_at_idx" ON "accounts" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "accounts_banned_at_idx" ON "accounts" USING btree ("banned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_hash_unique_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_account_id_idx" ON "sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "identities_identity_unique_idx" ON "identities" USING btree (lower("identity"));--> statement-breakpoint
CREATE INDEX "profiles_search_text_trgm_idx" ON "profiles" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "admins_email_unique_idx" ON "admins" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "admins_created_at_idx" ON "admins" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_hash_unique_idx" ON "admin_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_sessions_admin_id_idx" ON "admin_sessions" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_code_unique_idx" ON "invites" USING btree ("code");--> statement-breakpoint
CREATE INDEX "invites_created_by_id_idx" ON "invites" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "invites_inviter_id_idx" ON "invites" USING btree ("inviter_id");--> statement-breakpoint
CREATE INDEX "invites_used_by_id_idx" ON "invites" USING btree ("used_by_id");--> statement-breakpoint
CREATE INDEX "invites_used_at_idx" ON "invites" USING btree ("used_at");--> statement-breakpoint
CREATE INDEX "invites_created_at_idx" ON "invites" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invites_expires_at_idx" ON "invites" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "readers_author_profile_id_idx" ON "readers" USING btree ("author_profile_id");--> statement-breakpoint
CREATE INDEX "readers_created_at_idx" ON "readers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "readers_author_profile_id_last_read_at_idx" ON "readers" USING btree ("author_profile_id","last_read_at");--> statement-breakpoint
CREATE INDEX "posts_author_id_idx" ON "posts" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "posts_created_at_idx" ON "posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "posts_deleted_at_idx" ON "posts" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "posts_gender_scope_idx" ON "posts" USING btree ("gender_scope");--> statement-breakpoint
CREATE INDEX "posts_is_pinned_idx" ON "posts" USING btree ("is_pinned");--> statement-breakpoint
CREATE INDEX "posts_saves_count_idx" ON "posts" USING btree ("saves_count");--> statement-breakpoint
CREATE INDEX "posts_likes_count_idx" ON "posts" USING btree ("likes_count");--> statement-breakpoint
CREATE INDEX "posts_comments_count_idx" ON "posts" USING btree ("comments_count");--> statement-breakpoint
CREATE INDEX "posts_views_count_idx" ON "posts" USING btree ("views_count");--> statement-breakpoint
CREATE UNIQUE INDEX "posts_author_pinned_unique_idx" ON "posts" USING btree ("author_id") WHERE "posts"."is_pinned" = true AND "posts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_posts_author_unread_scan" ON "posts" USING btree ("author_id","id","gender_scope","author_gender") WHERE "posts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "posts_feed_idx" ON "posts" USING btree ("created_at") WHERE "posts"."is_feed" = true AND "posts"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "post_saves_profile_id_idx" ON "post_saves" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "post_saves_created_at_idx" ON "post_saves" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "comments_post_id_idx" ON "comments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "comments_author_id_idx" ON "comments" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "comments_parent_id_idx" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "comments_reply_to_comment_id_idx" ON "comments" USING btree ("reply_to_comment_id");--> statement-breakpoint
CREATE INDEX "comments_reply_to_profile_id_idx" ON "comments" USING btree ("reply_to_profile_id");--> statement-breakpoint
CREATE INDEX "comments_replies_count_idx" ON "comments" USING btree ("replies_count");--> statement-breakpoint
CREATE INDEX "comments_created_at_idx" ON "comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "comments_deleted_at_idx" ON "comments" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "profile_blocks_blocked_profile_id_idx" ON "profile_blocks" USING btree ("blocked_profile_id");--> statement-breakpoint
CREATE INDEX "profile_blocks_created_at_idx" ON "profile_blocks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_reports_reported_profile" ON "reports" USING btree ("reported_profile_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "reports_created_at_idx" ON "reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reports_target_idx" ON "reports" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_media_gc" ON "media_uploads" USING btree ("status","created_at") WHERE "media_uploads"."status" IN ('pending', 'deleted', 'gc_failed');--> statement-breakpoint
CREATE INDEX "idx_media_purged" ON "media_uploads" USING btree ("purged_at") WHERE "media_uploads"."status" = 'purged';--> statement-breakpoint
CREATE INDEX "idx_media_entity" ON "media_uploads" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_media_profile_id" ON "media_uploads" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "post_views_profile_id_idx" ON "post_views" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "post_views_created_at_idx" ON "post_views" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "post_likes_profile_id_idx" ON "post_likes" USING btree ("profile_id");--> statement-breakpoint
CREATE INDEX "post_likes_created_at_idx" ON "post_likes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "user_restrictions_account_active_idx" ON "user_restrictions" USING btree ("account_id","is_active");--> statement-breakpoint
CREATE INDEX "user_restrictions_is_active_expires_idx" ON "user_restrictions" USING btree ("is_active","expires_at");--> statement-breakpoint
CREATE INDEX "user_restrictions_created_at_idx" ON "user_restrictions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_at_idx" ON "notifications" USING btree ("recipient_profile_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_id_idx" ON "notifications" USING btree ("recipient_profile_id","id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_read_at_idx" ON "notifications" USING btree ("recipient_profile_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_actor_profile_id_idx" ON "notifications" USING btree ("actor_profile_id");--> statement-breakpoint
CREATE INDEX "notifications_target_idx" ON "notifications" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "notifications_post_id_idx" ON "notifications" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "notifications_comment_id_idx" ON "notifications" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "invite_applications_status_idx" ON "invite_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "invite_applications_created_at_idx" ON "invite_applications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "invite_applications_contact_norm_idx" ON "invite_applications" USING btree ("contact_normalized");--> statement-breakpoint
CREATE INDEX "invite_applications_invite_id_idx" ON "invite_applications" USING btree ("invite_id");--> statement-breakpoint
CREATE INDEX "invite_applications_reviewed_by_id_idx" ON "invite_applications" USING btree ("reviewed_by_id");