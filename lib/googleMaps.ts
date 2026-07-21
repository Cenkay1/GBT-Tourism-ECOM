"use client";

import * as jsApiLoader from "@googlemaps/js-api-loader";

export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

let configured = false;

// Maps JS API seçeneklerini yalnızca bir kez ayarla, sonra kütüphaneyi içe aktar.
export function loadGoogleLib<T extends Parameters<typeof jsApiLoader.importLibrary>[0]>(
  name: T,
): ReturnType<typeof jsApiLoader.importLibrary<T>> {
  if (!configured) {
    jsApiLoader.setOptions({ key: GOOGLE_MAPS_KEY, v: "weekly", language: "tr", region: "TR" });
    configured = true;
  }
  return jsApiLoader.importLibrary(name);
}
