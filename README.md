# Ride-Share Driver

A small open-world browser-based 3D ride-share driving game built with TypeScript, Vite, and Babylon.js.

## Requirements

- Node.js 20 or newer is recommended.
- A modern desktop browser.

## Commands

```bash
npm install
npm run dev
npm run build
npm test
```

## Controls

- `W` / `ArrowUp`: accelerate
- `S` / `ArrowDown`: brake and reverse
- `A` / `ArrowLeft`: steer left
- `D` / `ArrowRight`: steer right
- `P`: open or close the ride app
- `M`: open or close the map
- `Escape`: pause or resume; the pause menu can reset all saved progression
- `R`: reset the car to a nearby road

## Gameplay

Click Start and press `P` to use the phone. Rideshare begins unlocked; permanent Taxi and Rideshare Silver licenses add independent job pools paying 2× and 3× standard base fares. Drive to the yellow pickup marker, then to the green destination marker. Licenses, garage vehicles, permanent upgrades, and detailed scorecards for the latest 100 completed rides persist between sessions.

## Architecture

The game is split into small systems under `src/`:

- `game`: lifecycle, fixed-step simulation, config, orchestration, and optional performance metrics
- `world`: chunked procedural geometry and spatially indexed static collision data
- `player`: simcade car handling, profile/progression, smoothed input, fuel, driving violations, and chase camera
- `progression`: versioned local-storage saves and permanent upgrade calculations
- `vehicles`: the vehicle catalog, base stats, dimensions, and appearance data
- `activity`: ownership of the currently active job or game mode
- `ride`: phone offers, passenger rules, pickup/dropoff markers, tips, ratings, and scoring
- `missions`: configuration-driven mission licenses, unlock prices, and fare multipliers
- `player/FuelManager`: fuel drain and refueling state
- `traffic`: pooled waypoint traffic and police vehicle roles
- `police`: officer visibility, suspicion, fines, and citation state
- `ui`: HTML/CSS start screen, HUD, direction indicator, and results screen

Major tuning values live in `src/game/config.ts`, including upgrade costs, mission-license unlock costs, vehicle prices, package-delivery payouts, distance bands, decay, and possession fines.

Append `?debug=1` to the local URL to show performance metrics and progression controls for money, car ownership, equipped vehicle, upgrade levels, and save reset.

Police cars observe speeding, wrong-way driving, and sidewalk use through configurable forward and rear vision cones. Sustained observed violations trigger an immediate fine and a citation that must be acknowledged before driving resumes. Police vision cones are visible by default in debug mode and can be toggled from the progression panel.

## Known Limitations

- Vehicle movement uses a lightweight tire-grip model rather than full rigid-body wheel physics.
- Controller input is not implemented yet; the driving input values are analog-ready.
- Traffic uses waypoint following with minimal avoidance.
- Police issue citations immediately; pursuit, chase, and pull-over behavior is not implemented yet.
- Visuals are prototype geometry and flat colors.
- No mobile controls, audio, controller support, or multiplayer.
