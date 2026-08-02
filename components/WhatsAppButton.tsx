import { whatsappHref } from "@/lib/company";

// Sağ altta sabit duran WhatsApp butonu. Tek tıkla WhatsApp sohbeti açar.
export default function WhatsAppButton() {
  return (
    <a
      href={whatsappHref("Merhaba, turlarınız hakkında bilgi almak istiyorum.")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="WhatsApp'tan yazın"
      className="group fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-white shadow-lg ring-1 ring-black/5 transition hover:bg-[#1ebe57] hover:shadow-xl"
    >
      <svg width="26" height="26" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
        <path d="M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.1 1.6 5.9L4 29l8.3-1.6c1.7.9 3.7 1.4 5.7 1.4 6.6 0 12-5.4 12-12S22.6 3 16 3zm0 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-4.9 1 1-4.8-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.5-10 10-10s10 4.5 10 10-4.5 10-10 10zm5.5-7.5c-.3-.2-1.8-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.4.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5-.1-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.2.2 2.1 3.2 5 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.5.3-.7.3-1.4.2-1.5-.1-.2-.3-.2-.6-.4z" />
      </svg>
      <span className="hidden text-sm font-semibold sm:inline">WhatsApp&apos;tan Yaz</span>
    </a>
  );
}
