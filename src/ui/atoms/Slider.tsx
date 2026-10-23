import type { InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "min" | "max"> & {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Track colour: paper on a surface field (default), surface on paper. */
  onPaper?: boolean;
};

/** Native range: 6px track filled with the accent up to the value, 14px graphite knob. */
export function Slider({ value, onChange, min = 0, max = 100, onPaper, className = "", style, ...rest }: Props) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      type="range" min={min} max={max} value={value} onChange={(e) => onChange(e.currentTarget.valueAsNumber)}
      style={{ ...style, background: `linear-gradient(to right, var(--acc) ${fill}%, var(${onPaper ? "--surface" : "--paper"}) ${fill}%)` }}
      className={`h-1.5 w-full cursor-pointer appearance-none rounded-full outline-offset-4 disabled:opacity-50 [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink ${className}`}
      {...rest}
    />
  );
}
