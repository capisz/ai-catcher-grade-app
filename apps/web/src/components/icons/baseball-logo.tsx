import { useId, type SVGProps } from "react";

export type BaseballLogoProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  title?: string;
};

/**
 * Crisp baseball mark: white sphere with two bold seams and classic
 * V-stitches, tuned to stay legible from 20px (header) to 64px (loader).
 * Designed to be rotated — the seams read clearly mid-spin.
 */
export function BaseballLogo({ size = 64, className, title, ...props }: BaseballLogoProps) {
  const logoId = useId().replace(/:/g, "");
  const titleId = title ? `baseball-logo-title-${logoId}` : undefined;
  const sphereId = `baseball-sphere-${logoId}`;

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
        <radialGradient id={sphereId} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="62%" stopColor="#f2f5fb" />
          <stop offset="100%" stopColor="#c8d4ea" />
        </radialGradient>
      </defs>

      <circle cx="32" cy="32" r="26" fill={`url(#${sphereId})`} />
      <circle cx="32" cy="32" r="26" stroke="#1d3a6e" strokeOpacity="0.35" strokeWidth="1.5" />

      {/* Seams */}
      <path
        d="M19.5 9.5C13.4 15 9.5 23 9.5 32C9.5 41 13.4 49 19.5 54.5"
        stroke="#2563eb"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M44.5 9.5C50.6 15 54.5 23 54.5 32C54.5 41 50.6 49 44.5 54.5"
        stroke="#2563eb"
        strokeWidth="3"
        strokeLinecap="round"
      />

      {/* Stitches — left seam */}
      <path
        d="M16.2 16.6L21.6 19.2M13.4 23.4L19.4 25.2M12.3 30.6L18.6 31.4M12.6 38L18.8 37.3M14.8 45.2L20.6 42.9M19 51.2L23.8 47.7"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Stitches — right seam */}
      <path
        d="M47.8 16.6L42.4 19.2M50.6 23.4L44.6 25.2M51.7 30.6L45.4 31.4M51.4 38L45.2 37.3M49.2 45.2L43.4 42.9M45 51.2L40.2 47.7"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
