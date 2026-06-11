import { LoadingOverlay } from "@/components/ui/loading-overlay";

export default function Loading() {
  return (
    <LoadingOverlay
      open
      message="Loading backstop.ai..."
      subtitle="Pulling scouting, game, and research context from the live public-data pipeline."
    />
  );
}
