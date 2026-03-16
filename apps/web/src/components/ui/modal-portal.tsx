"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

type ModalPortalProps = {
  children: React.ReactNode;
};

export function ModalPortal({ children }: ModalPortalProps) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(children, document.body);
}
