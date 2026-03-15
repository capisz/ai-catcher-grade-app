import { LoadingOverlay } from "@/components/ui/loading-overlay";

export default function Loading() {
  return (
    <LoadingOverlay
      open
      message="Loading catcher intelligence..."
      subtitle="Pulling the live scouting dashboard and real battery context."
    />
  );
}
