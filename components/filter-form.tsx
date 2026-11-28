"use client";

import Form from "next/form";

// Form GET untuk filter di URL. Select dan tanggal langsung menerapkan
// filter; kolom teks diterapkan dengan Enter atau tombol submit. Tetap
// berfungsi tanpa JavaScript (form GET biasa).
export function FilterForm({
  action,
  className,
  children,
}: {
  action: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Form
      action={action}
      replace
      scroll={false}
      className={className}
      onChange={(e) => {
        const target = e.target as HTMLElement;
        if (target instanceof HTMLSelectElement || (target instanceof HTMLInputElement && target.type === "date")) {
          target.form?.requestSubmit();
        }
      }}
    >
      {children}
    </Form>
  );
}
