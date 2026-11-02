import {
  pgTable, pgEnum, serial, text, integer, bigint, date, timestamp, jsonb,
  doublePrecision, boolean, uniqueIndex, index,
} from "drizzle-orm/pg-core";

export const sourceEnum = pgEnum("source", ["upload", "manual"]);
export const campaignStatusEnum = pgEnum("campaign_status", ["planned", "live", "done"]);
export const billStatusEnum = pgEnum("bill_status", [
  "unpaid", "payment_done", "cheque_in_hand", "cheque_in_counter", "finance_audit", "bill_error",
]);
export const uploadKindEnum = pgEnum("upload_kind", ["plan", "spend", "performance", "digital", "competitor_media", "bills"]);
export const uploadStatusEnum = pgEnum("upload_status", ["confirmed", "superseded", "rolled_back"]);
export const vendorKindEnum = pgEnum("vendor_kind", ["agency", "media", "other"]);
export const competitorMediaEnum = pgEnum("competitor_media_type", ["TV", "Press", "Radio"]);
export const adPlatformEnum = pgEnum("ad_platform", ["Meta", "TikTok"]);

const money = (name: string) => bigint(name, { mode: "number" });
const stamp = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });

export const uploads = pgTable("uploads", {
  id: serial("id").primaryKey(),
  kind: uploadKindEnum("kind").notNull(),
  fileName: text("file_name").notNull(),
  fileHash: text("file_hash").notNull(),
  periods: jsonb("periods").$type<string[]>().notNull(),
  rowCount: integer("row_count").notNull(),
  controlTotal: money("control_total"),
  rowsTotal: money("rows_total").notNull(),
  rows: jsonb("rows").$type<Record<string, string | number | null>[]>().notNull(),
  status: uploadStatusEnum("status").notNull().default("confirmed"),
  createdAt: stamp("created_at").notNull().defaultNow(),
}, (t) => [index("uploads_hash_idx").on(t.fileHash)]);

const tracked = () => ({
  source: sourceEnum("source").notNull().default("manual"),
  uploadId: integer("upload_id").references(() => uploads.id, { onDelete: "set null" }),
  updatedAt: stamp("updated_at").notNull().defaultNow(),
});

export const businesses = pgTable("businesses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const brands = pgTable("brands", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id),
  name: text("name").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: stamp("created_at").notNull().defaultNow(),
});

export const rivals = pgTable("rivals", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
}, (t) => [uniqueIndex("rivals_brand_name_uq").on(t.brandId, t.name)]);

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  parentCode: text("parent_code"),
});

export const tvStations = pgTable("tv_stations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  kind: vendorKindEnum("kind").notNull().default("agency"),
});

export const budgets = pgTable("budgets", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  amount: money("amount").notNull(),
  updatedAt: stamp("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("budgets_brand_month_uq").on(t.brandId, t.month)]);

export const campaigns = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  status: campaignStatusEnum("status").notNull().default("planned"),
  notes: text("notes"),
  ...tracked(),
}, (t) => [index("campaigns_dates_idx").on(t.startDate, t.endDate)]);

export const campaignLines = pgTable("campaign_lines", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  channelId: integer("channel_id").notNull().references(() => channels.id),
  plannedAmount: money("planned_amount").notNull(),
});

export const spendEntries = pgTable("spend_entries", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  entryDate: date("entry_date", { mode: "string" }),
  channelId: integer("channel_id").notNull().references(() => channels.id),
  tvStationId: integer("tv_station_id").references(() => tvStations.id),
  vendorId: integer("vendor_id").references(() => vendors.id),
  amount: money("amount").notNull(),
  note: text("note"),
  ...tracked(),
}, (t) => [index("spend_brand_month_idx").on(t.brandId, t.month)]);

export const performanceEntries = pgTable("performance_entries", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  channelId: integer("channel_id").notNull().references(() => channels.id),
  spend: money("spend").notNull(),
  peopleReached: money("people_reached"),
  grp: doublePrecision("grp"),
  shareOfVoice: doublePrecision("share_of_voice"),
  shareOfSpend: doublePrecision("share_of_spend"),
  reach1Plus: doublePrecision("reach_1plus"),
  cprp: doublePrecision("cprp"),
  ...tracked(),
}, (t) => [uniqueIndex("perf_brand_month_channel_uq").on(t.brandId, t.month, t.channelId)]);

export const digitalEntries = pgTable("digital_entries", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  platformId: integer("platform_id").notNull().references(() => channels.id),
  spend: money("spend"),
  reach: money("reach"),
  impressions: money("impressions"),
  cpm: doublePrecision("cpm"),
  thruplays: money("thruplays"),
  costPerView: doublePrecision("cost_per_view"),
  engagement: money("engagement"),
  ...tracked(),
}, (t) => [uniqueIndex("digital_brand_month_platform_uq").on(t.brandId, t.month, t.platformId)]);

export const competitorMedia = pgTable("competitor_media", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  rivalId: integer("rival_id").references(() => rivals.id, { onDelete: "cascade" }),
  media: competitorMediaEnum("media").notNull(),
  spend: money("spend"),
  spots: integer("spots"),
  shareOfVoice: doublePrecision("share_of_voice"),
  ...tracked(),
});

export const competitorAds = pgTable("competitor_ads", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  rivalId: integer("rival_id").notNull().references(() => rivals.id, { onDelete: "cascade" }),
  platform: adPlatformEnum("platform").notNull(),
  adUrl: text("ad_url"),
  startedOn: date("started_on", { mode: "string" }),
  hook: text("hook"),
  cta: text("cta"),
  visualStyle: text("visual_style"),
  tone: text("tone"),
  notes: text("notes"),
  ...tracked(),
});

export const competitorYoutube = pgTable("competitor_youtube", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  rivalId: integer("rival_id").references(() => rivals.id, { onDelete: "cascade" }),
  subscribers: money("subscribers"),
  totalViews: money("total_views"),
  videos: integer("videos"),
  latestUploadOn: date("latest_upload_on", { mode: "string" }),
  ...tracked(),
});

export const sourceOwners = pgTable("source_owners", {
  id: serial("id").primaryKey(),
  sourceKey: text("source_key").notNull().unique(),
  ownerName: text("owner_name"),
  lastUpdatedAt: stamp("last_updated_at"),
});

export const bills = pgTable("bills", {
  id: serial("id").primaryKey(),
  billNo: text("bill_no").notNull().unique(),
  poNo: text("po_no"),
  vendorId: integer("vendor_id").references(() => vendors.id),
  brandId: integer("brand_id").references(() => brands.id, { onDelete: "set null" }),
  month: text("month").notNull(),
  billDate: date("bill_date", { mode: "string" }).notNull(),
  amount: money("amount").notNull(),
  vatAmount: money("vat_amount"),
  status: billStatusEnum("status").notNull().default("unpaid"),
  paidAt: date("paid_at", { mode: "string" }),
  note: text("note"),
  ...tracked(),
});

export const reminders = pgTable("reminders", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull().references(() => bills.id, { onDelete: "cascade" }),
  createdAt: stamp("created_at").notNull().defaultNow(),
  resolvedAt: stamp("resolved_at"),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const historyLog = pgTable("history_log", {
  id: serial("id").primaryKey(),
  at: stamp("at").notNull().defaultNow(),
  actor: text("actor").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  reason: text("reason"),
}, (t) => [index("history_entity_idx").on(t.entity, t.entityId)]);
