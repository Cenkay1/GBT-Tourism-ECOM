"use client";

// Yazdırma penceresini açar. Müşteri oradan "PDF olarak kaydet" diyerek
// rezervasyon bilgilerini indirir — e-postayı beklemesine gerek kalmaz.
// Hangi bölümün basılacağını globals.css'teki @media print kuralı belirler
// (.print-area görünür, gerisi gizlenir).
export default function PrintButton({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      {children}
    </button>
  );
}
