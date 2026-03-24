"use client";

import { ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  actions: ReactNode;
};

export default function Modal({ open, title, description, actions }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-neutral-900/40 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-bg-surface p-5 shadow-floating">
        <h3 className="text-title-sm text-text-primary">{title}</h3>
        <p className="mt-2 text-body-sm text-text-secondary">{description}</p>
        <div className="mt-5 flex gap-2">{actions}</div>
      </div>
    </div>
  );
}
