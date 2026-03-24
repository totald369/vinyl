"use client";

type Props = {
  label: string;
  active?: boolean;
  onClick?: () => void;
};

export default function FilterChip({ label, active = false, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm ${
        active
          ? "border-brand-500 bg-brand-500 text-white"
          : "border-slate-300 bg-white text-slate-700"
      }`}
    >
      {label}
    </button>
  );
}
