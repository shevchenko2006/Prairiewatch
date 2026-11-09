<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## PrairieWatch architecture
- Simulation time lives only in `src/sim/engine.ts` state (`t`), advanced by the single `useSimClock` loop in `src/sim/store.ts`; components never own timers that drive scenario time — keeps map, events, drone and log in sync. Playback holds are clock-consumed state, so pause freezes all clock-driven motion.
- All scoring weights/thresholds live in `src/sim/config.ts`; `src/sim/scoring.ts` is pure over observations plus explicit gates (outage unlock, cross-class bonus) set by scripted events — keeps rules configurable and testable (`src/test/prairiewatch.test.ts`).
- `tick` and `nextEvent` fire exactly one event per step; same-timestamp events run in listed order, each with its own observation hold.
- The DETECT → CONFIRM → DECIDE → RESPOND stage bar (`src/sim/stages.ts`) is derived presentation labeling only and must never feed back into scoring or authorization.
- Geography in `src/sim/data/greenwood.json` is bundled Census boundary/roads/places projected to EPSG:26914 local km, rendered as one persistent SVG; simulated assets remain separate.
- Scenario selection resets active state through the shared store; session-only completed outcome snapshots are separate from live simulation state, so comparison never schedules old events.
- Response coordination milestones are generated relative to actual dispatcher authorization, not fixed wall-clock targets, to prevent impossible delayed arrivals.
- Presentation framing and effects are pure functions in `src/sim/presentation.ts`; presentation seconds advance in the sole store clock without advancing scenario time during Next Event camera seeks. Explicit pause freezes seeks; `settledAt` suppresses skipped evidence effects, and reset clears all motion state.
- Camera follows shared resourceRoute/resourcePos after engine start; C ends at C_TARGET via an illustrative connector. A/C rings use the shared motion clock. Only deliberate geography gestures suspend follow.
- Decorative map depth uses one shared oblique SVG projection; labels counter-project to stay crisp and pointer deltas use its inverse — no invented elevation. Decorative interface contours are a shared non-interactive SVG outside the map, masked behind content.
- Satellite view is a lazy client-only overlay over the still-mounted county map; its UTC clock and validated browser-cached CelesTrak elements are isolated from the fictional simulation, and demo positions never enter the live cache or evidence engine. Unread/read state resets with the simulation; scan presentation never writes scenario time or evidence.
- Keep satellite.js pinned to the JavaScript-only 6.0.2 release; version 7's root exports pull unsupported WASM pthread workers into the Vite build.
- Engine gates normal confirmation via canAuthorize and reviewed overrides via canDispatchEarly/dispatchEarly; store syncs notifications and audit so all views share authority and prevent duplicate response.
- Map fire geometry and footprint readouts share visibleFireFootprint at exact scenario time; calibrate growth vertices using the shared polygonAreaKm2 shoelace function and FIRE_PRESENTATION config, so chosen size targets affect geometry while visual transforms never change area or response timing.
- The proposed drone dock uses the area-weighted Census polygon centroid in local UTM coordinates, converted through proj4 for geographic readouts; one DOCK constant anchors all distances and demonstration flights.
- Scenario C mission and coverage rules are documented in `src/sim/AGENTS.md`; preserve A/B and the shared clock.


