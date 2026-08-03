"use client";

import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/Icons";

// Şifre alanı + göster/gizle düğmesi. Hem müşteri auth formlarında (AuthField)
// hem de admin girişinde kullanılır. `className` dıştan verilir (mevcut stil korunur).
export default function PasswordInput({
  name,
  className,
  placeholder,
  autoComplete,
  required,
  defaultValue,
  hasError,
}: {
  name: string;
  className: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
  hasError?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        name={name}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        data-error={hasError ? "1" : undefined}
        className={`${className} pr-11 ${hasError ? "border-red-400" : ""}`}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Şifreyi gizle" : "Şifreyi göster"}
        aria-pressed={show}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 transition hover:text-slate-600"
      >
        {show ? <EyeOffIcon width={18} height={18} /> : <EyeIcon width={18} height={18} />}
      </button>
    </div>
  );
}
