"use client";

export default function DeleteButton({
  action,
  label = "Sil",
  confirmText = "Silmek istediğinize emin misiniz?",
}: {
  action: () => void;
  label?: string;
  confirmText?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
      className="inline"
    >
      <button className="rounded-md px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50">
        {label}
      </button>
    </form>
  );
}
