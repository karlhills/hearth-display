import type { ReactNode } from "react";

export type SectionHeaderProps = {
  title: string;
  meta?: ReactNode;
  className?: string;
};

export function SectionHeader({ title, meta, className }: SectionHeaderProps) {
  return (
    <div className={["flex items-center justify-between", className].filter(Boolean).join(" ")}>
      <div className="text-xs uppercase tracking-[0.3em] text-muted">{title}</div>
      {meta ? <div className="text-xs text-faint">{meta}</div> : null}
    </div>
  );
}
