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
- `Escape`: pause or resume
- `R`: reset the car to a nearby road

## Gameplay

Click Start, press `P`, choose one of three ride offers, drive to the yellow pickup marker, then drive to the green destination marker. Passengers rate the ride based on collisions and speed preferences. Base fare is guaranteed, while the tip depends on passenger satisfaction. Keep an eye on gas and refuel at large roadside stations.

## Architecture

The game is split into small systems under `src/`:

- `game`: lifecycle, fixed-step simulation, config, orchestration, and optional performance metrics
- `world`: chunked procedural geometry and spatially indexed static collision data
- `player`: simcade car handling, profile/progression, smoothed input, fuel, and chase camera
- `activity`: ownership of the currently active job or game mode
- `ride`: phone offers, passenger rules, pickup/dropoff markers, tips, ratings, and scoring
- `player/FuelManager`: fuel drain and refueling state
- `traffic`: simple waypoint traffic
- `ui`: HTML/CSS start screen, HUD, direction indicator, and results screen

Major tuning values live in `src/game/config.ts`.

Append `?debug=1` to the local URL to show FPS, update/render time, draw calls, mesh counts, active AI, and collision candidates.

## Known Limitations

- Vehicle movement uses a lightweight tire-grip model rather than full rigid-body wheel physics.
- Controller input is not implemented yet; the driving input values are analog-ready.
- Traffic uses waypoint following with minimal avoidance.
- Passenger satisfaction currently reacts to traffic collisions and speed only.
- Visuals are prototype geometry and flat colors.
- No mobile controls, audio, minimap, persistence, or multiplayer.
