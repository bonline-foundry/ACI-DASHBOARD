"use client";

import { useEffect } from "react";

/**
 * Quick actions link to pages with ?new=… so the page opens its "add" dialog at once.
 * After that first open, drop the parameter so a refresh does not open the dialog again.
 */
export function useClearNewParam(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("new");
    window.history.replaceState(null, "", url);
  }, [active]);
}
