# PrairieWatch rebuild — outage-check workflow spec
## Scenario C map motion
- [x] Show the assigned engine traveling to Scenario C's incident on the shared clock, preserving dispatch/arrival times.
- [x] Repeat red fading incident rings in C; pause/reset tests and live 887×813 playback verified; all 169 tests pass.
- [x] Brief follow-up: blue lightning strike marker (2:30 PM context) distinct from the fire ping; assigned-station label; solid completed route vs dashed route ahead; arrival card with station/unit/personnel/times; fixed duplicate "C" key on the dispatch dialog; 170 tests, browser-verified travel at 2×/4× to On Scene 3:14 PM with ping visible.
## Clipping and station-specific dispatch tracking
- [x] Reserve playback/timeline rows and audit tabs, notifications, images and dialogs at requested desktop sizes.
- [x] Shared fictional station/apparatus/personnel roster, reviewed proposals, atomic early/normal assignments and explicit lifecycle/release.
- [x] Test count conservation, unavailable/duplicate safeguards, A/B/C and reset; verify dispatch and layouts in browser (166 tests; A early → on scene → return/release, C normal, B reset; requested desktop sizes and 887×813).
## County capacity and manual early-dispatch override
- [x] Integrate user-provided 200 volunteer firefighters / 13 fire stations without invented locations or live availability; blue lightning icons.
- [x] Shared accessible dispatcher controls, review/reason dialog, score revalidation, audit and notifications across A/B/C.
- [x] 148 tests passing, including boundary scores, duplicates, score changes and continuing drone mission; browser-verified override60 → pilot approval → evidence100 → return.

- [x] New rubric in config/scoring: outage index (cap 15, locked until smoke/heat match), 911 first+content, cross-class +10/+5 via scripted events, no VIIRS.
- [x] New Scenario A timeline (0→100 capped, decision at 2:09, arrival ~2:31) and Scenario B (transformer, clear view, window closes 2:20, stays 0).
- [x] Persistent DETECT→CONFIRM→DECIDE→RESPOND stage bar across Map/Satellite/Camera tabs.
- [x] Side panel: 5 source cards + weather card, fusion-engine calculation, gauge with threshold bands, evidence chart, outage-loop steps, log with score changes.
- [x] Interactive dispatcher confirmation dialog with alert package (location, camera image, wind, spread cone, live-line warning).
- [x] Camera tab: Tower A / Tower B / Drone sources, simulated previews, zoom, audited snapshots.
- [x] Update map keyframes, fire growth timing (250 acres at ~2:31), satellite observation text (2:10 PM, 90→100).
- [x] Rewrite/extend tests; run full suite (83 passing); verify both scenarios in browser.
- [x] Update AGENTS.md, memory, SOURCES notes.

# Scenario C — Drone Verification Required
- [x] Add isolated Scenario C evidence, readiness gates, and distance-derived mission events; preserve A/B.
- [x] Add three replayable weather branches, uncertainty map, flight telemetry, and operator Camera review.
- [x] Verify all branches, dispatcher response, replay/reset, and existing regression tests (114 passing).

# Drone tab reorganization
- [x] Drone tab beside Satellites/Camera with sticky authorization area, mission-stage stepper, stage-revealed controls, mission history; main dashboard keeps only a compact status indicator.
- [x] Mission notifications (request, weather-block, arrival, evidence, abort, returned) with bell + unread count, dismiss-preserves-request popup, and Drone tab action badge; dismissal audited.
- [x] Open Drone Camera / Back to Mission shortcut between Drone and Camera tabs; no auto tab switching during playback.
- [x] Full suite (123 passing) and browser verification of request → authorize → arrival → camera → back flow.

# Navigation and camera organization
- [x] Consistent tabs in all scenarios: Map | Satellite | Tower Cameras | Drone; drone visible/thermal viewer moved into the Drone tab.
- [x] Shared 15-tower registry (TW-01…TW-15, TWR-A→TW-03, TWR-B→TW-07) with proposed-deployment labeling, network map, card grid, viewer, planned-vs-online counts.
- [x] Nearest-3 incident highlighting with approximate-distance labels, observing flags, All/Nearby/Online/Offline filters, Scenario C coverage explanations.
- [x] Drone tab scenario states: A blocked by wind with failed checks, B docked with no mission, C full mission; timeline source/action icons with labels and tab-opening clicks.
- [x] Full suite (129 passing) and browser verification of both tabs across scenarios.

# Autonomous Scenario C and overlapping coverage
- [x] Strategic 15-tower placement with 360° rotation and selectable 6–10 mile geometric coverage, measured overlaps and gaps; TW-01=A, TW-02=B.
- [x] Autonomous C readiness → launch → capture → scripted assessment → burn check → dispatcher acknowledgement/response; distance-derived timing, A/B preserved.
- [x] Monitoring tabs preserve playback; notifications, imagery, audit and emergency review remain clearly simulated.
- [x] 130 rule/regression tests; one-start browser flow and coverage slider verified on desktop/tablet/mobile; architecture documented.

# Scenario C — Suspected Lightning Ignition + pilot-supervised mission
- [x] Replace outage trigger with simulated 2:30 PM lightning strike context (zero points, cause unconfirmed); new scoring 15→30→60 (SMS+GPS 20, agreement 10), drone +40 → 100 capped.
- [x] Pilot-supervised automated operation: readiness → pilot-approval pause → one-click Authorize Simulated Mission → automatic flight/capture/assessment/burn check/delivery/return; named simulated pilot, abort/return controls, no FAA/BVLOS claims.
- [x] Lightning-proximity readiness check with "Launch blocked—lightning proximity" branch; strike time vs current weather observation/freshness shown separately.
- [x] Dispatcher bands preserved: <50 disabled, 50–79 early dispatch, 80+ normal workflow after package delivery; evidence updates continue after response.
- [x] Drone imagery layout: object-contain letterboxing, side-by-side wide / switch narrow, Expand Images with fit-to-screen/zoom/close, collapsed secondary details.
- [x] 135 tests passing; browser-verified approval → mission → 100 → return at 1366×768 and 1920×1080.
