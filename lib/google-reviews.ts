import "server-only";
import { COMPANY } from "@/lib/company";
import type { Review } from "@/lib/tours";

export interface GoogleBusiness {
  rating: number;
  reviewCount: number;
  reviews: Review[];
}

// Google Places API (New) — canlı puan, toplam yorum sayısı ve (en fazla 5) yorum.
// GOOGLE_PLACES_API_KEY ortam değişkeni yoksa null döner; çağıran taraf mevcut
// (elle girilen) yorumlara ve sabit puana düşer.
// Not: Google resmî API'si bir işletme için en fazla 5 yorum döndürür.
export async function getGoogleBusiness(): Promise<GoogleBusiness | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  const placeId = COMPANY.google.placeId;
  if (!key || !placeId) return null;

  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${placeId}?languageCode=tr`,
      {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "rating,userRatingCount,reviews",
        },
        // Google API'sini her istekte çağırma; saatte bir tazele (maliyet + quota).
        next: { revalidate: 3600 },
      }
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      rating?: number;
      userRatingCount?: number;
      reviews?: Array<{
        name?: string;
        rating?: number;
        text?: { text?: string };
        originalText?: { text?: string };
        relativePublishTimeDescription?: string;
        authorAttribution?: { displayName?: string };
      }>;
    };

    const reviews: Review[] = (data.reviews ?? [])
      .map((r, i) => {
        const text = r.text?.text ?? r.originalText?.text ?? "";
        const author = r.authorAttribution?.displayName ?? "Google kullanıcısı";
        return {
          id: r.name ?? `google-${i}`,
          author,
          rating: r.rating ?? 5,
          text,
          location: r.relativePublishTimeDescription || undefined,
        };
      })
      .filter((r) => r.text.trim().length > 0);

    return {
      rating: data.rating ?? COMPANY.google.rating,
      reviewCount: data.userRatingCount ?? COMPANY.google.reviewCount,
      reviews,
    };
  } catch {
    return null;
  }
}
