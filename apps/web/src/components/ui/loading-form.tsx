"use client";

import { useEffect, useRef } from "react";
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
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    const form = formRef.current;
    if (!form) {
      return;
    }

    let submitTimer: number | undefined;
    const handleChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (target.dataset.autoSubmit !== "true") {
        return;
      }

      if (submitTimer) {
        window.clearTimeout(submitTimer);
      }
      submitTimer = window.setTimeout(() => {
        form.requestSubmit();
      }, 0);
    };

    form.addEventListener("change", handleChange);
    return () => {
      form.removeEventListener("change", handleChange);
      if (submitTimer) {
        window.clearTimeout(submitTimer);
      }
    };
  }, []);

  return (
    <form
      ref={formRef}
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
