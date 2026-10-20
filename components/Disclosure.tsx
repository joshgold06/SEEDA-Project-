"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
  /** Stable id so the open or closed choice is remembered between visits. */
  id: string;
  title: string;
  icon?: React.ReactNode;
  /** Short text beside the title that stays visible while the section is folded. */
  summary?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}

/** A card whose body folds away, so heavy tools stay one click away without crowding the page. */
export function Disclosure({ id, title, icon, summary, defaultOpen = false, className = "", children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const storageKey = `epcmst-disclosure:${id}`;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "open") setOpen(true);
      else if (saved === "closed") setOpen(false);
    } catch {
      // storage unavailable: use the default
    }
  }, [storageKey]);

  const toggle = () => {
    setOpen((o) => {
      try {
        window.localStorage.setItem(storageKey, o ? "closed" : "open");
      } catch {
        // choice just isn't remembered
      }
      return !o;
    });
  };

  return (
    <section className={`rounded-xl border border-line bg-surface ${className}`}>
      <button onClick={toggle} aria-expanded={open} aria-controls={bodyId} className="flex w-full items-center gap-3 px-5 py-3.5 text-left">
        {icon && <span className="text-brand">{icon}</span>}
        <span className="text-[13.5px] font-semibold">{title}</span>
        {summary && <span className="min-w-0 flex-1 truncate text-[12px] text-neutral-500">{summary}</span>}
        <ChevronDown className={`ml-auto size-4 shrink-0 text-neutral-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div id={bodyId} className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="border-t border-line px-5 pt-4 pb-5">{children}</div>
        </div>
      </div>
    </section>
  );
}
