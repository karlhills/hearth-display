import type { ButtonHTMLAttributes } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
};

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  const base = "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition";
  const styles =
    variant === "primary"
      ? "bg-accent hover:opacity-90"
      : "bg-surface2 border border-border hover:opacity-90";

  const style =
    variant === "primary"
      ? { color: "var(--button-text-on-accent)", ...(props.style ?? {}) }
      : { color: "var(--button-text)", ...(props.style ?? {}) };

  const isDisabled = Boolean(props.disabled);
  const disabledStyles = isDisabled ? "opacity-60 cursor-not-allowed" : "";

  return (
    <button
      className={[base, styles, disabledStyles, className].filter(Boolean).join(" ")}
      style={style}
      {...props}
    />
  );
}
