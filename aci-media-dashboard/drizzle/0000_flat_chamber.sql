CREATE TYPE "public"."ad_platform" AS ENUM('Meta', 'TikTok');--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('unpaid', 'payment_done', 'cheque_in_hand', 'cheque_in_counter', 'finance_audit', 'bill_error');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('planned', 'live', 'done');--> statement-breakpoint
CREATE TYPE "public"."competitor_media_type" AS ENUM('TV', 'Press', 'Radio');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('upload', 'manual');--> statement-breakpoint
CREATE TYPE "public"."upload_kind" AS ENUM('plan', 'spend', 'performance', 'digital', 'competitor_media', 'bills');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('confirmed', 'superseded', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."vendor_kind" AS ENUM('agency', 'media', 'other');--> statement-breakpoint
CREATE TABLE "bills" (
	"id" serial PRIMARY KEY NOT NULL,
	"bill_no" text NOT NULL,
	"po_no" text,
	"vendor_id" integer,
	"brand_id" integer,
	"month" text NOT NULL,
	"bill_date" date NOT NULL,
	"amount" bigint NOT NULL,
	"vat_amount" bigint,
	"status" "bill_status" DEFAULT 'unpaid' NOT NULL,
	"paid_at" date,
	"note" text,
	"source" "source" DEFAULT 'manual' NOT NULL,
	"upload_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bills_bill_no_unique" UNIQUE("bill_no")
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_id" integer NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"month" text NOT NULL,
	"amount" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "businesses_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "campaign_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"planned_amount" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" "campaign_status" DEFAULT 'planned' NOT NULL,
	"notes" text,
	"source" "source" DEFAULT 'manual' NOT NULL,
	"upload_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"parent_code" text,
	CONSTRAINT "channels_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "competitor_ads" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"rival_id" integer NOT NULL,
	"platform" "ad_platform" NOT NULL,
	"ad_url" text,
	"started_on" date,
	"hook" text,
	"cta" text,
	"visual_style" text,
	"tone" text,
	"notes" text,
	"source" "source" DEFAULT 'manual' NOT NULL,
	"upload_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_media" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"month" text NOT NULL,
	"rival_id" integer,
	"media" "competitor_media_type" NOT NULL,
	"spend" bigint,
	"spots" integer,
	"share_of_voice" double precision,
	"source" "source" DEFAULT 'manual' NOT NULL,
	"upload_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_youtube" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"month" text NOT NULL,
	"rival_id" integer,
	"subscribers" bigint,
	"total_views" bigint,
	"videos" integer,
	"latest_upload_on" date,
	"source" "source" DEFAULT 'manual' NOT NULL,
	"upload_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "digital_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"month" text NOT NULL,
	"platform_id" integer NOT NULL,
	"spend" bigint,
	"reach" bigint,
	"impressions" bigint,
	"cpm" double precision,
	"thruplays" bigint,
	"cost_per_view" double precision,
	"engagement" bigint,
	"source" "source" DEFAULT 'manual' NOT NULL,
	"upload_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "history_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "performance_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"month" text NOT NULL,
	"channel_id" integer NOT NULL,
	"spend" bigint NOT NULL,
	"people_reached" bigint,
	"grp" double precision,
	"share_of_voice" double precision,
	"share_of_spend" double precision,
	"reach_1plus" double precision,
	"cprp" double precision,
	"source" "source" DEFAULT 'manual' NOT NULL,
	"upload_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"bill_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rivals" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_owners" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_key" text NOT NULL,
	"owner_name" text,
	"last_updated_at" timestamp with time zone,
	CONSTRAINT "source_owners_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "spend_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"month" text NOT NULL,
	"entry_date" date,
	"channel_id" integer NOT NULL,
	"tv_station_id" integer,
	"vendor_id" integer,
	"amount" bigint NOT NULL,
	"note" text,
	"source" "source" DEFAULT 'manual' NOT NULL,
	"upload_id" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tv_stations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "tv_stations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "upload_kind" NOT NULL,
	"file_name" text NOT NULL,
	"file_hash" text NOT NULL,
	"periods" jsonb NOT NULL,
	"row_count" integer NOT NULL,
	"control_total" bigint,
	"rows_total" bigint NOT NULL,
	"rows" jsonb NOT NULL,
	"status" "upload_status" DEFAULT 'confirmed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "vendor_kind" DEFAULT 'agency' NOT NULL,
	CONSTRAINT "vendors_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_lines" ADD CONSTRAINT "campaign_lines_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_lines" ADD CONSTRAINT "campaign_lines_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_ads" ADD CONSTRAINT "competitor_ads_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_ads" ADD CONSTRAINT "competitor_ads_rival_id_rivals_id_fk" FOREIGN KEY ("rival_id") REFERENCES "public"."rivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_ads" ADD CONSTRAINT "competitor_ads_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_media" ADD CONSTRAINT "competitor_media_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_media" ADD CONSTRAINT "competitor_media_rival_id_rivals_id_fk" FOREIGN KEY ("rival_id") REFERENCES "public"."rivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_media" ADD CONSTRAINT "competitor_media_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_youtube" ADD CONSTRAINT "competitor_youtube_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_youtube" ADD CONSTRAINT "competitor_youtube_rival_id_rivals_id_fk" FOREIGN KEY ("rival_id") REFERENCES "public"."rivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_youtube" ADD CONSTRAINT "competitor_youtube_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_entries" ADD CONSTRAINT "digital_entries_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_entries" ADD CONSTRAINT "digital_entries_platform_id_channels_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "digital_entries" ADD CONSTRAINT "digital_entries_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_entries" ADD CONSTRAINT "performance_entries_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_entries" ADD CONSTRAINT "performance_entries_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_entries" ADD CONSTRAINT "performance_entries_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rivals" ADD CONSTRAINT "rivals_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_entries" ADD CONSTRAINT "spend_entries_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_entries" ADD CONSTRAINT "spend_entries_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_entries" ADD CONSTRAINT "spend_entries_tv_station_id_tv_stations_id_fk" FOREIGN KEY ("tv_station_id") REFERENCES "public"."tv_stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_entries" ADD CONSTRAINT "spend_entries_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_entries" ADD CONSTRAINT "spend_entries_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_brand_month_uq" ON "budgets" USING btree ("brand_id","month");--> statement-breakpoint
CREATE INDEX "campaigns_dates_idx" ON "campaigns" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "digital_brand_month_platform_uq" ON "digital_entries" USING btree ("brand_id","month","platform_id");--> statement-breakpoint
CREATE INDEX "history_entity_idx" ON "history_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "perf_brand_month_channel_uq" ON "performance_entries" USING btree ("brand_id","month","channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rivals_brand_name_uq" ON "rivals" USING btree ("brand_id","name");--> statement-breakpoint
CREATE INDEX "spend_brand_month_idx" ON "spend_entries" USING btree ("brand_id","month");--> statement-breakpoint
CREATE INDEX "uploads_hash_idx" ON "uploads" USING btree ("file_hash");