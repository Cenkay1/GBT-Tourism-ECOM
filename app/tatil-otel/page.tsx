import type { Metadata } from "next";
import Link from "next/link";
import HotelInquiryForm from "@/components/HotelInquiryForm";
import { COMPANY, telHref } from "@/lib/company";

export const metadata: Metadata = {
  title: "Tatil & Otel — " + COMPANY.name,
  description:
    "Yurt içi ve yurt dışı otel, her şey dahil tatil köyü ve erken rezervasyon fırsatları için bilgilerinizi bırakın; size uygun seçenekleri biz arayıp anlatalım.",
};

export default function HotelPage() {
  return (
    <div>
      <div className="bg-brand">
        <div className="mx-auto max-w-5xl px-4 py-12 text-center">
          <h1 className="text-3xl font-extrabold text-white">Tatil &amp; Otel</h1>
          <p className="mx-auto mt-2 max-w-xl text-white/80">
            Otel, tatil köyü ve uçak + konaklama paketlerinde size uygun seçeneği
            birlikte bulalım.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(320px,420px)]">
          <div className="space-y-5">
            <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <h2 className="text-lg font-extrabold text-brand">Nasıl çalışıyor?</h2>
              <ol className="mt-4 space-y-4">
                <Step
                  no={1}
                  title="Bilgilerinizi bırakın"
                  text="Ad, soyad ve telefon numaranızı yazmanız yeterli. Dilerseniz tarih, kişi sayısı ve bütçe gibi notlarınızı da ekleyin."
                />
                <Step
                  no={2}
                  title="Sizi arayalım"
                  text="Ekibimiz en kısa sürede sizi arar; tarihlerinize ve bütçenize uygun otel ve tatil alternatiflerini anlatır."
                />
                <Step
                  no={3}
                  title="Rezervasyonu tamamlayalım"
                  text="Seçiminizi yaptıktan sonra rezervasyon ve ödeme adımlarını birlikte tamamlarız."
                />
              </ol>
            </div>

            <div className="rounded-2xl bg-slate-50 p-6">
              <h2 className="text-lg font-extrabold text-brand">Neler planlıyoruz?</h2>
              <ul className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <Perk text="Yurt içi ve yurt dışı oteller" />
                <Perk text="Her şey dahil tatil köyleri" />
                <Perk text="Uçak + otel paketleri" />
                <Perk text="Erken rezervasyon fırsatları" />
                <Perk text="Aile ve grup konaklamaları" />
                <Perk text="Balayı ve özel gün planlaması" />
              </ul>
              <p className="mt-5 text-sm text-slate-500">
                Otobüslü tur programlarımıza{" "}
                <Link href="/turlar" className="font-semibold text-accent hover:underline">
                  Tüm Turlar
                </Link>{" "}
                sayfasından ulaşabilirsiniz.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 p-6">
              <p className="text-sm text-slate-600">
                Hemen görüşmek isterseniz bizi{" "}
                <a
                  href={telHref(COMPANY.phones[0])}
                  className="font-bold text-brand hover:text-accent"
                >
                  {COMPANY.phones[0]}
                </a>{" "}
                numaradan arayabilir ya da{" "}
                <a
                  href={`mailto:${COMPANY.emails[0]}`}
                  className="font-bold text-brand hover:text-accent"
                >
                  {COMPANY.emails[0]}
                </a>{" "}
                adresine yazabilirsiniz.
              </p>
            </div>
          </div>

          <div className="lg:sticky lg:top-24 lg:h-fit">
            <HotelInquiryForm />
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ no, title, text }: { no: number; title: string; text: string }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
        {no}
      </span>
      <div>
        <p className="font-bold text-slate-800">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-slate-500">{text}</p>
      </div>
    </li>
  );
}

function Perk({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden className="mt-0.5 font-bold text-accent">
        ✓
      </span>
      <span>{text}</span>
    </li>
  );
}
