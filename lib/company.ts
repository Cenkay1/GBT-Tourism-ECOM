// Şirket iletişim ve kurumsal bilgileri (tek kaynak).
export const COMPANY = {
  name: "Gözdem Burak Turizm",
  tagline: "Karadeniz Ereğli'nin En Büyük Seyahat Acentası",
  phones: ["+90 536 612 67 35"],
  emails: ["info@gozdemburakturizm.com"],
  address: "Müftü, Yazar İlhami Sosyal Sk. No:42/1, 67300 Ereğli/Zonguldak",
  mapQuery: "Gözdem Burak Turizm, Yazar İlhami Sosyal Sk. No:42, Ereğli, Zonguldak",
  social: {
    instagram: "https://www.instagram.com/gozdemburakturizm",
    facebook: "https://www.facebook.com/kdzeregliburakturizm",
    youtube: "https://www.youtube.com/@gozdemburakturizm5657",
  },
  instagramHandle: "@gozdemburakturizm",
  google: {
    rating: 4.8, // Google puanı — gerçek değeri girin
    reviewCount: 501,
    reviewsUrl:
      "https://www.google.com/search?q=G%C3%B6zdem+Burak+Turizm+Yorumlar",
    // Google İşletme Profili "yorum yaz" deep-link'i (müşteri kendi hesabıyla gönderir).
    placeId: "ChIJ8-A1fTdbnEARbSdJWSPCb0M",
    writeReviewUrl:
      "https://search.google.com/local/writereview?placeid=ChIJ8-A1fTdbnEARbSdJWSPCb0M",
  },
};

// tel: bağlantısı için sadeleştirilmiş numara
export function telHref(phone: string): string {
  return "tel:" + phone.replace(/\s/g, "");
}
