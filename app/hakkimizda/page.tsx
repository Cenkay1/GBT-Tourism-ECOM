import type { Metadata } from "next";
import Link from "next/link";
import { COMPANY } from "@/lib/company";
import { TicketIcon, ShieldIcon, HeadsetIcon, BusIcon } from "@/components/Icons";

export const metadata: Metadata = {
  title: "Hakkımızda — Gözdem Burak Turizm",
  description: COMPANY.tagline,
};

export default function AboutPage() {
  return (
    <div>
      {/* Başlık bandı */}
      <div className="bg-brand">
        <div className="mx-auto max-w-4xl px-4 py-12 text-center">
          <h1 className="text-3xl font-extrabold text-white">Hakkımızda</h1>
          <p className="mt-2 text-white/80">{COMPANY.tagline}</p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="space-y-4 leading-relaxed text-slate-600">
          <p>
            <strong>{COMPANY.name}</strong>, Karadeniz Ereğli merkezli, bölgenin köklü ve en büyük
            seyahat acentalarından biridir. Yurt içi ve yurt dışı tur organizasyonlarından otel
            rezervasyonlarına, araç kiralamadan etkinlik yönetimine kadar geniş bir hizmet
            yelpazesiyle misafirlerimize güvenli ve konforlu bir seyahat deneyimi sunuyoruz.
          </p>
          <p>
            Yılların verdiği tecrübe ve müşteri memnuniyetini önceleyen anlayışımızla; her bütçeye
            uygun, özenle planlanmış tur programları hazırlıyoruz. Deneyimli rehber kadromuz ve
            titizlikle seçilmiş konaklama seçeneklerimizle, seyahatinizin her anında yanınızdayız.
          </p>
          <p>
            Amacımız, sadece bir tur satmak değil; unutulmaz anılar biriktirmenize aracı olmaktır.
            Bu yüzden ulaşımdan konaklamaya, güzergâhtan rehberliğe kadar her detayı sizin için
            planlıyoruz.
          </p>
        </div>

        {/* Değerler */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <Value
            icon={<BusIcon width={22} height={22} />}
            title="Geniş Tur Ağı"
            text="Yurt içi ve yurt dışı, her mevsime uygun zengin tur seçenekleri."
          />
          <Value
            icon={<ShieldIcon width={22} height={22} />}
            title="Güvenli Rezervasyon"
            text="Online koltuk seçimi ve güvenli ödeme altyapısı."
          />
          <Value
            icon={<TicketIcon width={22} height={22} />}
            title="Şeffaf Fiyatlandırma"
            text="Sürpriz maliyet yok; ne ödediğinizi baştan bilirsiniz."
          />
          <Value
            icon={<HeadsetIcon width={22} height={22} />}
            title="7/24 Destek"
            text="Tur öncesi ve tur boyunca kesintisiz iletişim."
          />
        </div>

        <div className="mt-10 rounded-2xl bg-brand p-8 text-center text-white">
          <h2 className="text-xl font-bold">Bir sonraki tatilinizi birlikte planlayalım</h2>
          <p className="mt-1 text-sm text-white/80">
            Turlarımızı inceleyin veya bize ulaşın.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/turlar"
              className="rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark"
            >
              Turları İncele
            </Link>
            <Link
              href="/iletisim"
              className="rounded-lg bg-white/10 px-6 py-2.5 text-sm font-semibold text-white hover:bg-white/20"
            >
              İletişim
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Value({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-brand">{title}</h3>
        <p className="text-sm text-slate-500">{text}</p>
      </div>
    </div>
  );
}
