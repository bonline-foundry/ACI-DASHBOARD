"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { addRival, createBrand, createTvStation, createVendor, removeRival, setThresholds } from "@/server/master-data";
import { toActionError, type ActionState } from "@/server/action-state";

const done = (): ActionState => {
  revalidatePath("/settings");
  return { error: null, ok: true };
};

export async function createBrandAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await createBrand(getDb(), { name: String(fd.get("name") ?? ""), businessId: Number(fd.get("businessId")) });
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function addRivalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await addRival(getDb(), { brandId: Number(fd.get("brandId")), name: String(fd.get("name") ?? "") });
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function removeRivalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await removeRival(getDb(), Number(fd.get("id")));
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function createVendorAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const kind = String(fd.get("kind")) as "agency" | "media" | "other";
    await createVendor(getDb(), { name: String(fd.get("name") ?? ""), kind });
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function createTvStationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await createTvStation(getDb(), String(fd.get("name") ?? ""));
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function setThresholdsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await setThresholds(getDb(), {
      billYellowDays: Number(fd.get("billYellowDays")),
      billRedDays: Number(fd.get("billRedDays")),
      budgetOrangePct: Number(fd.get("budgetOrangePct")),
      budgetRedPct: Number(fd.get("budgetRedPct")),
    });
    return done();
  } catch (e) {
    return toActionError(e);
  }
}
