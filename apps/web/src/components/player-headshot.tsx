"use client";

import Image from "next/image";
import { useState } from "react";

type PlayerHeadshotProps = {
  playerId: number | null | undefined;
  name: string | null | undefined;
  src?: string | null;
  size?: number;
  className?: string;
};

function Portrait({ name, sources, size, className }: {
  name: string; sources: string[]; size: number; className: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const src = sources[attempt];
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("");
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-line bg-white/[0.06] ${className}`} style={{ width: size, height: size }}>
      {src ? <Image
        src={src}
        alt={`${name} headshot`}
        width={size * 2}
        height={size * 2}
        sizes={`${size}px`}
        className="h-full w-full object-cover"
        onError={() => setAttempt(current => current + 1)}
      /> : <span role="img" aria-label={`${name} — photo unavailable`} className="font-semibold text-muted-strong" style={{ fontSize: Math.max(12, size / 3) }}>{initials || "?"}</span>}
    </span>
  );
}

export function PlayerHeadshot({ playerId, name, src, size = 56, className = "rounded-xl" }: PlayerHeadshotProps) {
  const canonical = Number.isInteger(playerId) && Number(playerId) > 0
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/w_213,q_auto:best/v1/people/${playerId}/headshot/67/current`
    : null;
  const sources = [...new Set([src, canonical].filter((value): value is string => Boolean(value)))];
  // A new player gets a fresh fallback sequence, even when a prior image failed.
  return <Portrait key={sources.join("|")} name={name || "Player"} sources={sources} size={size} className={className} />;
}
