"use client";

import { ReactNode, useMemo, useState } from "react";

type Props = {
  header?: ReactNode;
  children: ReactNode;
};

export default function BottomSheet({ header, children }: Props) {
  const [expanded, setExpanded] = useState(false);
  const heightClass = useMemo(() => (expanded ? "h-[78vh]" : "h-[36vh]"), [expanded]);

  return (
    <section
      className={`absolute bottom-0 left-0 right-0 z-sheet rounded-t-3xl border-t border-border-subtle bg-bg-surface shadow-floating transition-all ${heightClass}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full justify-center py-3"
      >
        <span className="h-1 w-11 rounded-full bg-border-strong" />
      </button>
      {header ? <div className="px-4 pb-3">{header}</div> : null}
      <div className="h-[calc(100%-56px)] overflow-y-auto px-2 pb-4">{children}</div>
    </section>
  );
}
