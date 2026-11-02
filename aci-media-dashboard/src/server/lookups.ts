import { brands, channels, rivals, tvStations, vendors } from "@/db/schema";
import type { Db } from "@/db/types";

export const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

const CHANNEL_ALIASES: Record<string, string> = {
  facebook: "META",
  instagram: "META",
  fb: "META",
  "meta (facebook, instagram)": "META",
  newspaper: "PRESS",
  print: "PRESS",
  outdoor: "OOH",
  yt: "YOUTUBE",
  television: "TV",
};

export type Lookups = {
  brand(name: string): number | undefined;
  channel(name: string): number | undefined;
  vendor(name: string): number | undefined;
  tvStation(name: string): number | undefined;
  rival(brandId: number, name: string): number | undefined;
};

export async function loadLookups(db: Db): Promise<Lookups> {
  const [b, c, v, t, r] = await Promise.all([
    db.select({ id: brands.id, name: brands.name }).from(brands),
    db.select({ id: channels.id, name: channels.name, code: channels.code }).from(channels),
    db.select({ id: vendors.id, name: vendors.name }).from(vendors),
    db.select({ id: tvStations.id, name: tvStations.name }).from(tvStations),
    db.select({ id: rivals.id, name: rivals.name, brandId: rivals.brandId }).from(rivals),
  ]);
  const map = (rows: { id: number; name: string }[]) => new Map(rows.map((x) => [normName(x.name), x.id]));
  const brandMap = map(b);
  const vendorMap = map(v);
  const stationMap = map(t);
  const channelMap = new Map<string, number>();
  for (const ch of c) {
    channelMap.set(normName(ch.name), ch.id);
    channelMap.set(normName(ch.code), ch.id);
  }
  const codeToId = new Map(c.map((ch) => [ch.code, ch.id]));
  return {
    brand: (n) => brandMap.get(normName(n)),
    channel: (n) => {
      const key = normName(n);
      return channelMap.get(key) ?? (CHANNEL_ALIASES[key] ? codeToId.get(CHANNEL_ALIASES[key]) : undefined);
    },
    vendor: (n) => vendorMap.get(normName(n)),
    tvStation: (n) => stationMap.get(normName(n)),
    rival: (brandId, n) => r.find((x) => x.brandId === brandId && normName(x.name) === normName(n))?.id,
  };
}
