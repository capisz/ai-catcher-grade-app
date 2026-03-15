import { useId, type SVGProps } from "react";

export type BaseballLogoProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  title?: string;
  ballColorStart?: string;
  ballColorEnd?: string;
  outlineColor?: string;
  seamColor?: string;
  stitchColor?: string;
  ringColor?: string;
};

export function BaseballLogo({
  size = 64,
  className,
  title,
  ballColorStart = "var(--surface-elevated)",
  ballColorEnd = "var(--surface-soft)",
  outlineColor = "var(--brand-primary)",
  seamColor = "var(--brand-secondary)",
  stitchColor = "var(--accent)",
  ringColor = "var(--highlight)",
  ...props
}: BaseballLogoProps) {
  const logoId = useId().replace(/:/g, "");
  const titleId = title ? `baseball-logo-title-${logoId}` : undefined;
  const gradientId = `baseball-logo-gradient-${logoId}`;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-labelledby={titleId}
      {...props}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <defs>
        <radialGradient id={gradientId} cx="34%" cy="28%" r="72%">
          <stop offset="0%" stopColor={ballColorStart} />
          <stop offset="72%" stopColor={ballColorStart} />
          <stop offset="100%" stopColor={ballColorEnd} />
        </radialGradient>
      </defs>
      <circle
        cx="32"
        cy="32"
        r="23"
        fill={`url(#${gradientId})`}
        stroke={outlineColor}
        strokeWidth="2.4"
      />
      <circle
        cx="32"
        cy="32"
        r="18.75"
        stroke={ringColor}
        strokeOpacity="0.42"
        strokeWidth="1.2"
      />
      <path
        d="M22.25 15.75C18.4 20.33 16.35 26.04 16.35 32C16.35 37.96 18.4 43.67 22.25 48.25"
        stroke={seamColor}
        strokeWidth="2.45"
        strokeLinecap="round"
      />
      <path
        d="M41.75 15.75C45.6 20.33 47.65 26.04 47.65 32C47.65 37.96 45.6 43.67 41.75 48.25"
        stroke={seamColor}
        strokeWidth="2.45"
        strokeLinecap="round"
      />
      <path
        d="M20.65 21.1L24.25 23.15M19.6 27.05L23.85 28.9M19.6 36.95L23.85 35.1M20.65 42.9L24.25 40.85"
        stroke={stitchColor}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M43.35 21.1L39.75 23.15M44.4 27.05L40.15 28.9M44.4 36.95L40.15 35.1M43.35 42.9L39.75 40.85"
        stroke={stitchColor}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
