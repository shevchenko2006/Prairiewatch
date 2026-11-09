# PraireWatch

Build PrairieWatch, an interactive wildfire-response simulation for a hackathon presentation lasting less than six minutes.

Create a working application, not a landing page or a collection of static dashboard mockups.

PRIORITIES
1. One reliable utility-line ignition scenario.
2. A synchronized clock controlling the map, events, evidence, drone, and activity log.
3. Smooth geographic animation.
4. Functional dispatcher decisions and simulated response acknowledgment.
5. Clear explanations of what is simulated.

Use the attached proposal as reference. Where it conflicts with the explicit instructions below, follow these instructions. Keep rules configurable.

SCOPE
Build a single-browser, frontend-first MVP using typed local scenario data. Do not add authentication, payments, live APIs, real messaging, or a database in this first build. No API keys should be required to run the demonstration.

Do not implement additional scenarios yet. Do not add lightning, failure toggles, cost calculators, or unrelated analytics.

VISUAL DESIGN
Minimalist, futuristic mission-control interface:
- Background: midnight navy #08111F.
- Panels: dark slate #111E30.
- Main accent: cyan #38D9F5.
- Text: ice white #EAF2FA.
- Secondary text and terrain: muted blue-gray.
- Amber: warnings.
- Red: immediate danger and active fire perimeter.
- Small prairie-gold accent in the brand.
- Restrained glow, thin borders, readable labels, generous spacing.
- No excessive neon, decorative gauges, or unnecessary cards.

Use the attached screenshots for map-led composition, not their orange-and-cream palette or surrounding browser interface.

DESKTOP LAYOUT
Optimize for a 1440 × 900 laptop/projector display:
- Compact header: PrairieWatch, Greenwood County KS, SIMULATION badge, scenario clock.
- Map occupies most of the screen.
- Compact right panel: incident details, score breakdown, latest evidence, dispatcher actions.
- Bottom: timeline with event markers and playback controls.
- Small event explanation showing:
  “What happened”
  “What PrairieWatch did”
  “What needs human judgment”

Keep the main demonstration usable without scrolling.

MAP
Provide a working pan-and-zoom map scene with:
- County/context boundary.
- Subtle roads and contour-like terrain.
- Proposed camera positions and coverage areas.
- Proposed automated drone dock.
- Incident search area and uncertainty.
- Scripted fire perimeter.
- Animated drone and response-resource markers.
- Clickable labels.

Use bundled GeoJSON or local vector data so the demo does not depend on a paid map service. Only call geography accurate if it is sourced accurately. Clearly label schematic terrain and proposed equipment placements as illustrative.

Keep one persistent map scene throughout playback.

ANIMATION
Recreate the reference’s continuous feel:
- Fire perimeter changes shape smoothly between geographic keyframes.
- Fire growth and camera zoom are separate animations.
- Gradually zoom out as the incident expands.
- Keep geography and markers anchored consistently.
- Drone moves continuously along a predefined route.
- Labels follow their geographic anchors.
- Panels transition subtly without flickering.
- Do not recreate the map component on each event.
- Respect reduced-motion preferences.

Fire shapes are scripted visualization, not a validated spread forecast.
For this first build, omit acreage rather than display numbers inconsistent with geometry.

SIMULATION ENGINE
Use one source of truth for simulation time.
Do not create independent timers for each component.

Controls:
- Play / Pause.
- Next Event.
- Speed: 1×, 2×, 4×.
- Reset.

Default playback is accelerated and should allow a presenter to complete the entire demonstration in about four minutes, leaving time to explain it.

Pause automatically at required dispatcher decisions.
Next Event must correctly advance all relevant state.
Reset must cancel pending playback, clear actions and logs, and restore the starting state.
Repeated clicks must not duplicate events or notifications.
Keep an always-visible distinction between scenario time and presentation/playback speed.

DATA AND RULES
Separate:
- Scenario configuration.
- Evidence scoring.
- Incident state.
- Drone mission state.
- Dispatcher actions.
- Map rendering.

Store scoring weights and thresholds in one configuration module.

Score is a prototype evidence index, not a probability.

Source classes:
- Human: 911 and SMS.
- Orbital: GOES and VIIRS.
- Ground optical: tower cameras.

Implement these rules for the MVP:

911:
- First qualifying caller: 40.
- Second independent caller: +15.
- Third independent caller: +10.
- Fourth and later independent callers: +5 each.
- Content modifier applied once using the strongest description:
  flames or a specific road/landmark: +10;
  smoke column: 0;
  smell only: -15.
- Converging observations from distinct vantage points more than 1 km apart: +5 once.
- Cap the 911 group at 75.
- Repeat callers add zero.
- Use explicit fictional witness identities and independence metadata; do not pretend the app derives household identity from phone location.
- Close but otherwise independent witnesses within 200 m receive half the additional-caller points.
- Existing emergency procedures never wait for the score.

SMS:
- First report: 15.
- GPS pin: +5.
- Enrolled trusted reporter: +5.
- Second independent resident: +10.
- Group cap: 30.
- Deduplicate witnesses across SMS and 911.
- Unchecked photos do not automatically add confirmation points.

GOES:
- Low category: 5.
- Medium: 12.
- High or saturated: 20.
- Persistence across at least two consecutive scans: +10 once.
- Group cap: 30.

VIIRS:
- Low: 10.
- Nominal: 25.
- High: 35.
- These are upgrades, not cumulative additions.
- Group cap: 35.

Camera:
- Model confidence below 0.5: 0.
- 0.5 to below 0.8: 15.
- At least 0.8: 25.
- High confidence with growing plume: 30 instead of 25.
- Second camera with a corroborating crossing bearing: +10.
- Camera group cap: 40.
- Repeated frames do not stack.

Cross-class agreement:
- Two agreeing classes: +10 total.
- Three agreeing classes: +15 total.
- GOES and VIIRS remain one class.
- Only apply bonuses when observations are marked relevant to the same incident.

Overall score capped at 100.
Utility faults and outage context add zero evidence points.
Weather changes the Verify threshold, not the evidence score.

States:
- Below 30: Log.
- 30 to below Verify threshold: Watch.
- Verify threshold: 50 normally, 45 in very high danger, 40 under a red flag warning.
- Score 80 or above: high-evidence review candidate.

Prevent human-only SMS plus 911 from automatically establishing confirmed fire solely by crossing 80. Require relevant non-human corroboration or explicit verification.

Keep fire presence verification separate from response authorization.
Use the UI phrase “Ready for dispatcher review” rather than implying the score proves an uncontrolled wildfire.

The PDF does not define thermal-confirmation point values:
do not invent them or silently set the score to 100.
Use a separate simulated thermal-verification flag and show its basis.

Do not implement time decay, negative-evidence scoring, or automatic burn-registry matching in this first build. List them as not implemented in a small limitations panel.

SCENARIO
One fictional utility-line ignition, starting at 1:50 PM.
All times and observations are scripted assumptions.

1:50:00 — Ignition occurs.
1:50:20 — Simulated direct utility fault arrives.
Create watch/search area with uncertainty; evidence score remains 0.
Label this as direct utility telemetry simulation, not OutagePro.

1:51:00 — Camera reports medium-confidence smoke.
Camera contribution becomes 15.

1:52:00 — Camera reports high-confidence growing plume.
Replace camera contribution with 30.
State becomes Watch.
Show proposed camera selection based on coverage, not simply proximity.

1:53:00 — Scripted high-category GOES observation arrives.
GOES 20 + camera 30 + cross-class bonus 10 = 60.
State becomes Verify.
Show that satellite observation timing is assumed for this replay.

1:53:15 — Automated drone verification mission requested.
Show battery, communications, weather, and mission authorization checks.
All are simulated.
Docked thermal drone follows an automated route under assumed approved remote-operation procedures.
Do not claim real flight authorization or connection to an aircraft.

1:56:00 — Simulated thermal observation verifies fire presence.
Do not add undefined points.
Update the incident and pause for dispatcher action.

Dispatcher can:
- Acknowledge review.
- Authorize simulated response.
- Continue monitoring.
The incident is visible before this decision pause, and review is available throughout.
No drone or score gate may prevent an appropriate human response.

After authorization:
- Generate an inspectable response packet.
- Show simulated notification sent.
- After a short scenario-clock delay, show responder acceptance.
- Animate the resource along a scripted route.
- Record a simulated arrival/update.
- Continue monitoring.
- Allow closure with a required reason.

Also provide an optional “Inject independent 911 call” control with fictional witness profiles so the updated caller scoring can be demonstrated without making calls necessary to advance the main story.

INTERACTION
Clicking an event reveals the evidence and system action.
Clicking the score expands the calculation.
Clicking the camera shows a clearly labeled synthetic or illustrative observation.
Clicking the drone shows mission status.
Dispatcher buttons produce real application state changes and audit entries.
Disabled actions explain why they are unavailable.

No pretend live video, fabricated API connection indicators, real SMS, or real emergency notifications.

RESULTS
End with a compact timeline of:
- Warning received.
- First fire evidence.
- Verification requested.
- Fire presence verified.
- Response authorized.
- Assignment acknowledged.
- Simulated arrival/update.

Use actual action timestamps from the scenario clock.
Do not hard-code a successful response time.
Label comparisons as simulated and only compare matching milestones.
Do not claim acres saved or guaranteed containment.

Include:
“Working: scenario engine, rules, map interaction, dispatcher actions, audit timeline.”
“Simulated: utility, cameras, satellites, drone flight, notifications, responder updates.”

ACCEPTANCE CHECKS
Verify:
1. Initial fault produces zero evidence points.
2. Camera upgrade replaces its previous contribution.
3. Camera 30 + GOES 20 + two-class bonus 10 equals 60.
4. A duplicate event changes neither score nor log.
5. Pause freezes clock-driven movement and events.
6. Next Event keeps map, scores, and timeline synchronized.
7. Dispatcher decisions are required; approval is never fabricated.
8. Response acceptance cannot occur before authorization.
9. Reset removes all prior-run state.
10. No API key is needed to complete the demo.

Implement this focused MVP now. Preserve these scope limits.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2971f0d2-e1ff-4778-a10e-cb48bae9794a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
