"use client";

import PasswordInput from "@/components/PasswordInput";

// Auth formları için ortak, etiketli input + hata gösterimi.
export const inputCls =
  "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-brand";
export const labelCls = "block text-sm font-medium text-slate-600";

export default function AuthField({
  name,
  label,
  type = "text",
  error,
  defaultValue,
  placeholder,
  autoComplete,
  required,
  inputMode,
}: {
  name: string;
  label: string;
  type?: string;
  error?: string;
  defaultValue?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  inputMode?: "text" | "email" | "tel" | "numeric";
}) {
  return (
    <label className={labelCls}>
      {label}
      {type === "password" ? (
        <PasswordInput
          name={name}
          className={inputCls}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          defaultValue={defaultValue}
          hasError={Boolean(error)}
        />
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          inputMode={inputMode}
          className={`${inputCls} ${error ? "border-red-400" : ""}`}
        />
      )}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
