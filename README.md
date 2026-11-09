# PrairieWatch 🔥

**Finalist, Firewatch 2026** (Wichita State University College of Innovation & Design × Lockheed Martin Skunk Works)

PrairieWatch is an interactive mission-control simulator. It shows how a small, rural Kansas fire district could detect a grass fire within minutes, verify that it's real without driving out, and get a dispatcher the evidence needed to send help early.

🔗 **Live demo:** https://prairie-fire-response-simulator.lovable.app/

> ⚠️ This is a **fictional demonstration**. Incidents, sensors, satellites, drone flights, notifications, and responder updates are all simulated. Fire shapes are scripted visualizations, not a validated spread forecast.

---

## The problem

In the competition scenario, a gust snaps a 40-year-old power line on a red-flag afternoon, and the line drops into dry grass miles from the only fire station. Nobody knows about the fire for **27 minutes**, and the first truck arrives **62 minutes** after ignition.

The district runs on volunteers, a few trucks, weak cell coverage, and a small rural budget. Any solution also has to avoid false alarms. A system that pages the chief for every permitted pasture burn gets switched off by April.

## How it works

Each incident moves through four stages: **Detect → Confirm → Decide → Respond.**

### Evidence index
Every observation adds points to a **prototype evidence index (0–100)**. It is a weight of evidence, **not a probability**. The points come from three source classes:

| Source class | Examples | Group cap |
|---|---|---|
| Human | 911 calls, SMS reports (deduplicated across both) | 911: 75 · SMS: 30 |
| Orbital | GOES and VIIRS satellite hotspots (one class) | GOES: 30 · VIIRS: 35 |
| Ground optical | Tower cameras (confidence, plume growth, crossing bearings) | 40 |

- When separate classes agree on the same incident, they earn a bonus: **+10 for two classes, +15 for three.**
- **Utility faults add 0 points.** They open a search area but aren't treated as evidence of fire.
- **Weather changes the threshold, not the score.**

### Incident states
| Evidence index | State |
|---|---|
| Below 30 | Log |
| 30 to Verify threshold | Watch |
| Verify threshold (50 normally, 45 in very high fire danger, 40 under a red flag warning) | Verify |
| 80 and above | Ready for dispatcher review |

### Built-in safeguards
- **Humans make the call.** Dispatcher approval is never automated, and no score or drone check can block an appropriate human response.
- **Human-only reports can't confirm a fire on their own.** Reaching 80 from 911 and SMS alone still requires non-human corroboration or explicit verification.
- **Fire verification is kept separate from response authorization.**
- **Thermal drone verification** is shown as its own flag with its basis, instead of quietly adding made-up points.
- Every dispatcher action creates an **audit log entry**, and a closed incident requires a reason.

## Scenarios

| | Scenario | What it shows |
|---|---|---|
| **A** | Downed power line ignites dry grass | Utility fault → camera smoke → satellite hotspot → drone thermal check → dispatcher authorizes response |
| **B** | Transformer failure without fire | An outage that is *not* a fire, so the system avoids a false alarm |
| **C** | Suspected lightning ignition | A drone mission confirms a possible fire before resources commit |

### Scenario A walkthrough (scripted)
| Time | Event | Evidence index |
|---|---|---|
| 1:50:00 | Ignition | 0 |
| 1:50:20 | Utility fault opens a search area | 0 |
| 1:51:00 | Camera: medium-confidence smoke | 15 |
| 1:52:00 | Camera: high-confidence growing plume → **Watch** | 30 |
| 1:53:00 | GOES high-category hotspot + two-class bonus → **Verify** | 60 |
| 1:53:15 | Automated drone verification mission launches | 60 |
| 1:56:00 | Thermal observation verifies fire → paused for dispatcher | 60 |

After the dispatcher authorizes a response, the app generates a response packet, shows a simulated notification and responder acceptance, animates the resource route, and builds a results timeline from the actual clock timestamps.

## Features
- One shared simulation clock drives the map, events, evidence, drone, and activity log
- Play/Pause, Next Event, Reset, and 1×/2×/4× speed
- Pan-and-zoom map with camera coverage, a drone dock, the search area, an animated fire perimeter, and response routes
- Click any event, score, camera, or drone to see how it works
- Optional "Inject independent 911 call" control to demo the caller-scoring rules

## Not implemented yet
- Time decay of evidence
- Negative-evidence scoring
- Automatic burn-permit registry matching

## Data
- Geography: U.S. Census Bureau TIGER/Line and Cartographic Boundary files (2023)
- Terrain and proposed equipment placements are **illustrative**

## Built with
- [Lovable](https://lovable.dev) (React + TypeScript), built by prompt engineering from our team's design spec. The full build prompt is in [`docs/BUILD_PROMPT.md`](docs/BUILD_PROMPT.md).

Run locally:
```sh
git clone https://github.com/shevchenko2006/prairiewatch.git
cd prairiewatch
npm i
npm run dev
```

## Team
**PrairieWatch**, Firewatch 2026
- Shevchenko Okafor: research, system and demo design, and prompt engineering
  
