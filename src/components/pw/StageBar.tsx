import { Check } from "lucide-react";
import type { SimState } from "@/sim/engine";
import { STAGES, presentationStage } from "@/sim/stages";
import { cn } from "@/lib/utils";

/** Persistent DETECT → CONFIRM → DECIDE → RESPOND bar. Presentation labels only. */
export function StageBar({ s }: { s: SimState }) {
  const st = presentationStage(s);
  return (
    <section aria-label="Presentation stage" className="border-b border-border bg-card px-5 py-2">
      <ol className="flex items-center gap-1 sm:gap-2" data-testid="stage-bar">
        {STAGES.map((stage, i) => {
          const done = st.completed.includes(stage.id);
          const active = st.current === stage.id;
          return (
            <li key={stage.id} className="flex min-w-0 items-center gap-1 sm:gap-2">
              {i > 0 && <span aria-hidden className="text-muted-foreground">→</span>}
              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2 py-1 font-mono text-[11px] uppercase tracking-wide sm:text-xs",
                  active && "bg-primary/15 text-primary",
                  done && "text-primary",
                  !done && !active && "text-muted-foreground",
                )}
              >
                {done && <Check className="size-3" aria-label="completed" />}
                {stage.label}
              </span>
            </li>
          );
        })}
        {st.checksComplete && <span className="ml-2 hidden text-xs text-muted-foreground md:inline">· Checks complete — no escalation.</span>}
      </ol>
      <p className="mt-1 hidden text-xs text-muted-foreground sm:block" data-testid="stage-note">{st.note}</p>
    </section>
  );
}
