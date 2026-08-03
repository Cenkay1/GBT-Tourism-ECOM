import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import HeaderAccount from "@/components/HeaderAccount";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import HideOnAdmin from "@/components/HideOnAdmin";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Sitenin genel adresi — paylaşım (OpenGraph) görselleri mutlak URL'e bu adresle
// çözümlenir. Farklı bir alan adı için NEXT_PUBLIC_SITE_URL ayarlayın.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gozdemburakturizm.com";

const TITLE = "Gözdem Burak Turizm — Yurt İçi ve Yurt Dışı Turlar";
const DESCRIPTION =
  "Gözdem Burak Turizm ile yurt içi ve yurt dışı turlar. Online koltuk seçimi ve güvenli ödeme.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s — Gözdem Burak Turizm",
  },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Gözdem Burak Turizm",
    title: TITLE,
    description: DESCRIPTION,
    locale: "tr_TR",
    images: [{ url: "/logo.png", width: 1200, height: 630, alt: "Gözdem Burak Turizm" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <HideOnAdmin>
          <Header account={<HeaderAccount />} />
        </HideOnAdmin>
        <main className="flex-1">{children}</main>
        <HideOnAdmin>
          <Footer />
          <WhatsAppButton />
        </HideOnAdmin>
      </body>
    </html>
  );
}
