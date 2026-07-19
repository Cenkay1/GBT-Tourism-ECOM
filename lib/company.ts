// Şirket iletişim ve kurumsal bilgileri (tek kaynak).
export const COMPANY = {
  name: "Gözdem Burak Turizm",
  tagline: "Karadeniz Ereğli'nin En Büyük Seyahat Acentası",
  phones: ["+90 532 412 41 60", "+90 536 612 67 35", "+90 372 322 41 75"],
  emails: ["eregligozdemburaktur@hotmail.com", "hy.67@hotmail.com"],
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
  },
};

// tel: bağlantısı için sadeleştirilmiş numara
export function telHref(phone: string): string {
  return "tel:" + phone.replace(/\s/g, "");
}
