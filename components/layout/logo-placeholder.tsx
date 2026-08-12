import { cn } from "@/lib/utils";

export function LogoPlaceholder({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn("brand", compact && "brand--compact")}
      aria-label="Jenan BIZ logo placeholder"
    >
      <span className="brand__mark" aria-hidden="true">
        J
      </span>
      {!compact && (
        <span>
          <strong>Jenan</strong>
          <small>BIZ</small>
        </span>
      )}
    </div>
  );
}
