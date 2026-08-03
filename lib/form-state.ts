// Server action'lar ile useActionState arasında paylaşılan form durumu tipi.
// Not: "use server" dosyaları yalnızca async fonksiyon export edebildiği için
// bu tip ayrı bir modülde tutulur.
export type FormState = {
  ok?: boolean;
  error?: string;
  message?: string;
  fieldErrors?: Record<string, string>;
};
