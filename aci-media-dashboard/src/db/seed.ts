import { businesses, channels, settings } from "./schema";
import type { Db } from "./types";
import { DEFAULT_THRESHOLDS } from "@/lib/rules";

export const BUSINESS_NAMES = ["Toiletries", "Hygiene", "Salt", "Electrolyte"] as const;

export const CHANNELS: { code: string; name: string; parentCode: string | null }[] = [
  { code: "TV", name: "TV", parentCode: null },
  { code: "PRESS", name: "Press", parentCode: null },
  { code: "RADIO", name: "Radio", parentCode: null },
  { code: "OOH", name: "OOH", parentCode: null },
  { code: "DIGITAL", name: "Digital", parentCode: null },
  { code: "META", name: "Meta", parentCode: "DIGITAL" },
  { code: "YOUTUBE", name: "YouTube", parentCode: "DIGITAL" },
  { code: "TIKTOK", name: "TikTok", parentCode: "DIGITAL" },
];

export async function seedReferenceData(db: Db): Promise<void> {
  await db.insert(businesses).values(BUSINESS_NAMES.map((name) => ({ name }))).onConflictDoNothing();
  await db.insert(channels).values(CHANNELS).onConflictDoNothing();
  await db.insert(settings).values({ key: "thresholds", value: DEFAULT_THRESHOLDS }).onConflictDoNothing();
}
