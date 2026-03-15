"use client";

import type { ComponentPropsWithoutRef } from "react";

import { useGlobalLoading } from "@/components/ui/loading-provider";

type LoadingFormProps = ComponentPropsWithoutRef<"form"> & {
  loadingMessage?: string;
  loadingSubtitle?: string;
};

export function LoadingForm({
  loadingMessage,
  loadingSubtitle,
  onSubmit,
  children,
  ...props
}: LoadingFormProps) {
  const { startLoading } = useGlobalLoading();

  return (
    <form
      {...props}
      onSubmit={(event) => {
        onSubmit?.(event);
        if (event.defaultPrevented) {
          return;
        }
        startLoading({
          message: loadingMessage,
          subtitle: loadingSubtitle,
        });
      }}
    >
      {children}
    </form>
  );
}
