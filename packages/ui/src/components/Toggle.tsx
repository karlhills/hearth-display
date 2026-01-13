import type { ChangeEvent } from "react";

export type ToggleProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
};

export function Toggle({ checked, onChange, label, className }: ToggleProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.checked);
  };

  return (
    <label
      className={[
        "flex items-center justify-between gap-4 rounded-xl border border-border bg-surface2 px-4 py-3",
        className
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="text-sm text-text">{label}</span>
      <span
        className={[
          "relative inline-flex h-6 w-11 items-center rounded-full transition",
          checked ? "bg-accent" : "bg-border"
        ].join(" ")}
      >
        <span
          className={[
            "inline-block h-5 w-5 transform rounded-full bg-surface shadow transition",
            checked ? "translate-x-5" : "translate-x-1"
          ].join(" ")}
        />
      </span>
      <input type="checkbox" className="hidden" checked={checked} onChange={handleChange} />
    </label>
  );
}
