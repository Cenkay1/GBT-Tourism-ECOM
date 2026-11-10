import { prisma } from "@/lib/db";
import { setInquiryStatus, deleteInquiry } from "@/lib/admin-actions";
import DeleteButton from "@/components/admin/DeleteButton";
import { formatPhone, whatsappNumber } from "@/lib/shared";
import { COMPANY } from "@/lib/company";

export const dynamic = "force-dynamic";

// "Tatil & Otel" formundan gelen talepler. Acenteye e-posta da gidiyor; bu
// liste e-posta kaybolsa bile talebin takip edilebilmesi için tutulur.
export default async function AdminInquiries() {
  const inquiries = await prisma.hotelInquiry.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  const newCount = inquiries.filter((q) => q.status === "YENI").length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand">Tatil &amp; Otel Talepleri</h1>
          <p className="mt-1 text-sm text-slate-500">
            Ana sayfadaki &quot;Tatil &amp; Otel&quot; sekmesinden gelen iletişim
            talepleri. Her talep {COMPANY.emails[0]} adresine de bildirilir.
          </p>
        </div>
        {newCount > 0 && (
          <span className="rounded-full bg-amber-100 px-4 py-2 text-sm font-bold text-amber-800">
            {newCount} yeni talep
          </span>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3">Ad Soyad</th>
                <th className="px-4 py-3">Telefon</th>
                <th className="px-4 py-3">Not</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inquiries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    Henüz talep yok. Ana sayfadaki &quot;Tatil &amp; Otel&quot;
                    sekmesinden gelen talepler burada listelenir.
                  </td>
                </tr>
              ) : (
                inquiries.map((q) => (
                  <tr
                    key={q.id}
                    className={q.status === "YENI" ? "bg-amber-50/40" : "hover:bg-slate-50"}
                  >
                    <td className="px-4 py-3 text-slate-500">
                      {q.createdAt.toLocaleString("tr-TR", {
                        timeZone: "Europe/Istanbul",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {q.firstName} {q.lastName}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`tel:${q.phone}`}
                        className="font-semibold text-brand hover:text-accent"
                      >
                        {formatPhone(q.phone)}
                      </a>
                      <a
                        href={`https://wa.me/${whatsappNumber(q.phone)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block text-xs text-emerald-700 hover:underline"
                      >
                        WhatsApp ile yaz
                      </a>
                    </td>
                    <td className="max-w-[260px] px-4 py-3 text-slate-600">
                      {q.note ? (
                        <span className="block whitespace-pre-wrap">{q.note}</span>
                      ) : (
                        "—"
                      )}
                      {!q.emailSent && (
                        <span className="mt-1 block text-xs font-semibold text-red-600">
                          ⚠ Bildirim e-postası gönderilemedi
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-semibold ${
                          q.status === "ARANDI"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {q.status === "ARANDI" ? "Arandı" : "Yeni"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <form
                          action={async () => {
                            "use server";
                            await setInquiryStatus(
                              q.id,
                              q.status === "ARANDI" ? "YENI" : "ARANDI"
                            );
                          }}
                        >
                          <button className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                            {q.status === "ARANDI" ? "Yeniye al" : "Arandı işaretle"}
                          </button>
                        </form>
                        <DeleteButton
                          action={async () => {
                            "use server";
                            await deleteInquiry(q.id);
                          }}
                          label="Sil"
                          confirmText="Bu talebi silmek istediğinize emin misiniz?"
                        />
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
