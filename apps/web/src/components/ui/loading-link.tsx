"use client";

import Link, { type LinkProps } from "next/link";
import type { AnchorHTMLAttributes, MouseEvent } from "react";

import { useGlobalLoading } from "@/components/ui/loading-provider";

type LoadingLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps> & {
    loadingMessage?: string;
    loadingSubtitle?: string;
    disableLoading?: boolean;
  };

function isPlainLeftClick(event: MouseEvent<HTMLAnchorElement>) {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

export function LoadingLink({
  loadingMessage,
  loadingSubtitle,
  disableLoading = false,
  onClick,
  href,
  children,
  target,
  ...props
}: LoadingLinkProps) {
  const { startLoading } = useGlobalLoading();

  return (
    <Link
      {...props}
      href={href}
      target={target}
      onClick={(event) => {
        onClick?.(event);
        if (
          disableLoading ||
          target === "_blank" ||
          !isPlainLeftClick(event) ||
          event.defaultPrevented
        ) {
          return;
        }

        startLoading({
          message: loadingMessage,
          subtitle: loadingSubtitle,
        });
      }}
    >
      {children}
    </Link>
  );
}
