"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleLib, GOOGLE_MAPS_KEY } from "@/lib/googleMaps";

export type PlaceSelection = {
  name: string;
  address: string;
  mapQuery: string; // "lat,lng"
};

export default function PlaceAutocomplete({
  value,
  onTextChange,
  onSelect,
  placeholder,
  inputClassName,
  className,
}: {
  value: string;
  onTextChange: (text: string) => void;
  onSelect: (sel: PlaceSelection) => void;
  placeholder?: string;
  inputClassName?: string;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<google.maps.places.PlacePrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const placesRef = useRef<google.maps.PlacesLibrary | null>(null);
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const boxRef = useRef<HTMLDivElement>(null);

  // Places kütüphanesini bir kez yükle.
  useEffect(() => {
    if (!GOOGLE_MAPS_KEY) return;
    let cancelled = false;
    (async () => {
      try {
        const lib = (await loadGoogleLib("places")) as google.maps.PlacesLibrary;
        if (!cancelled) placesRef.current = lib;
      } catch {
        /* API yüklenemedi — sessizce düz metin girişine düş */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Dışarı tıklayınca menüyü kapat.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function handleInput(text: string) {
    onTextChange(text);
    window.clearTimeout(debounceRef.current);
    const places = placesRef.current;
    if (!text.trim() || !places) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      if (!tokenRef.current) tokenRef.current = new places.AutocompleteSessionToken();
      setLoading(true);
      try {
        const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: text,
          sessionToken: tokenRef.current,
          language: "tr",
          region: "TR",
        });
        const preds = suggestions
          .map((s) => s.placePrediction)
          .filter((p): p is google.maps.places.PlacePrediction => p != null);
        setSuggestions(preds);
        setOpen(preds.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 250);
  }

  async function choose(pred: google.maps.places.PlacePrediction) {
    setOpen(false);
    setSuggestions([]);
    const place = pred.toPlace();
    try {
      await place.fetchFields({ fields: ["location", "formattedAddress", "displayName"] });
    } catch {
      /* alan çekilemezse tahmin metnine düş */
    }
    const loc = place.location;
    const name = pred.mainText?.text ?? pred.text.text;
    const address = place.formattedAddress ?? pred.secondaryText?.text ?? "";
    const mapQuery = loc ? `${loc.lat()},${loc.lng()}` : place.formattedAddress ?? name;
    tokenRef.current = null; // oturum fetchFields ile biter
    onSelect({ name, address, mapQuery });
  }

  return (
    <div ref={boxRef} className={`relative ${className ?? ""}`}>
      <input
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        className={inputClassName}
      />
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
          …
        </span>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-brand/5"
              >
                <span className="text-sm font-medium text-slate-800">
                  {s.mainText?.text ?? s.text.text}
                </span>
                {s.secondaryText?.text && (
                  <span className="text-xs text-slate-500">{s.secondaryText.text}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
