import { EmptyState } from "@/client/components/EmptyState";

export function NotFound({ what = "page" }: { what?: string }) {
  return (
    <div data-testid="not-found">
      <EmptyState kind="filtered" title={`This ${what} doesn't exist`} />
    </div>
  );
}
