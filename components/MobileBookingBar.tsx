import { Tour } from "@/lib/shared";
import { formatPrice } from "@/lib/tours";
import BookingLauncher from "@/components/BookingLauncher";

// Mobilde ekranın altına sabitlenen satın alma şeridi.
//
// Neden: tur sayfasındaki fiyat kartı masaüstünde yapışkan (md:sticky), ama
// mobilde normal akışta — galeri, açıklama, program ve harita arasında çok
// aşağıda kalıyordu. Müşteri satın almak için sayfanın sonuna kadar inmek
// zorunda kalmasın diye buton her zaman parmağın altında duruyor.
//
// z-40: BookingLauncher'ın modalı body'ye portal ile z-50'de açılıyor, şerit
// onun ALTINDA kalmalı. Sayfaya ayrıca alt boşluk veriliyor ki şerit son
// içeriği örtmesin.
export default function MobileBookingBar({ tour }: { tour: Tour }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur md:hidden">
      <div className="flex items-center gap-3">
        <div className="min-w-0">
          <span className="block text-[11px] leading-none text-slate-400">
            Kişi başı
          </span>
          <p className="truncate text-lg font-extrabold text-brand">
            {formatPrice(tour.price, tour.currency)}
          </p>
        </div>
        <BookingLauncher
          tour={tour}
          className="flex-1 rounded-xl bg-accent py-3 text-center text-sm font-bold text-white transition hover:bg-accent-dark"
        />
      </div>
    </div>
  );
}
