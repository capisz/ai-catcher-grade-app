"use client";

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
  Suspense,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { LoadingOverlay } from "@/components/ui/loading-overlay";

type LoadingStartOptions = {
  message?: string;
  subtitle?: string;
};

type LoadingContextValue = {
  isLoading: boolean;
  startLoading: (options?: LoadingStartOptions) => void;
  stopLoading: () => void;
};

const DEFAULT_MESSAGE = "Loading catcher intelligence...";
const DEFAULT_SUBTITLE = "Preparing the live scouting view.";

const LoadingContext = createContext<LoadingContextValue | null>(null);

function RouteLoadingWatcher({ onRouteSettled }: { onRouteSettled: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      onRouteSettled();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [onRouteSettled, routeKey]);

  return null;
}

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({
    open: true,
    message: DEFAULT_MESSAGE,
    subtitle: DEFAULT_SUBTITLE,
    phase: "boot" as "boot" | "manual" | "idle",
  });
  const hydratedRef = useRef(false);

  const stopLoading = useCallback(() => {
    setState((current) => ({ ...current, open: false, phase: "idle" }));
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      hydratedRef.current = true;
      stopLoading();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [stopLoading]);

  const value: LoadingContextValue = {
    isLoading: state.open,
    startLoading(options) {
      setState({
        open: true,
        message: options?.message ?? DEFAULT_MESSAGE,
        subtitle: options?.subtitle ?? DEFAULT_SUBTITLE,
        phase: "manual",
      });
    },
    stopLoading,
  };

  return (
    <LoadingContext.Provider value={value}>
      <div aria-busy={state.open}>{children}</div>
      <Suspense fallback={null}>
        <RouteLoadingWatcher
          onRouteSettled={() => {
            if (!hydratedRef.current) {
              return;
            }
            stopLoading();
          }}
        />
      </Suspense>
      <LoadingOverlay open={state.open} message={state.message} subtitle={state.subtitle} />
    </LoadingContext.Provider>
  );
}

export function useGlobalLoading() {
  const context = useContext(LoadingContext);

  if (!context) {
    throw new Error("useGlobalLoading must be used within LoadingProvider.");
  }

  return context;
}
