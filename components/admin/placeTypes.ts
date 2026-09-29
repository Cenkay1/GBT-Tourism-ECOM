// Tur yerlerinin form temsili. Üç ayrı bölümde düzenlenir:
//   BINIS → Biniş Noktaları (fiyat + saat)
//   GEZI  → Gezilecek Yerler (harita, sıralı, işaretlenebilir)
//   OTEL  → Konaklama (gece sayısı)
export interface PlaceRow {
  type: "BINIS" | "GEZI" | "OTEL";
  name: string;
  address?: string;
  mapQuery?: string;
  nights?: number; // OTEL için gece sayısı
  price?: number; // BINIS için biniş noktası bazlı kişi başı fiyat
  boardingTime?: string; // BINIS için otobüsün orada olacağı saat, "HH:MM"
  showOnMap?: boolean; // GEZI için haritada gösterilsin mi
}
