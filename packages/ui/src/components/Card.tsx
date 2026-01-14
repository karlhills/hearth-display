import type { CSSProperties, ReactNode } from "react";

export type CardProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

export function Card({ children, className, style }: CardProps) {
  return (
    <div
      className={[
        "rounded-2xl bg-surface border border-border shadow-[0_10px_30px_rgba(0,0,0,0.18)]",
        "p-6 md:p-8",
        className
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      {children}
    </div>
  );
}
