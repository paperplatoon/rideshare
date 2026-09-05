# Ride-Share Driver

A small open-world browser-based 3D ride-share driving game built with TypeScript, Vite, and Babylon.js.

For the product vision, design priorities, and implementation tradeoffs that should guide future work, see [Game Vision and Design Principles](GAME_VISION_AND_DESIGN_PRINCIPLES.md).

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

Police cars observe speeding, wrong-way driving, sidewalk use, and collisions through configurable sightlines. Confirmed violations and direct collisions trigger a pursuit. Pursuing officers route toward the player's predicted position, transition to a stable trailing target at close range, match speed, swerve within the roadway around traffic, and brake when no safe corridor is available. Remaining within capture range builds the arrest meter at any speed. Pursuits lasting more than 45 seconds add a resisting-arrest surcharge that increases every 60 seconds until the player escapes or is caught.

Traffic collisions are tracked as discrete contacts so sustained overlap does not repeatedly apply damage. After serious player-involved crashes, civilian and non-pursuing police traffic brake, back clear when necessary, pull to the right curb, and remain stopped until recycled offscreen. Active pursuing officers instead stabilize and continue with collision damage.

Nearby traffic uses a lightweight closest-approach prediction to yield before rear-end, crossing, and head-on conflicts. One deterministic car yields for each conflict episode. One conflict in every 2,000 on average intentionally uses only light braking, allowing occasional ambient NPC crashes. NPC-only crashes stop briefly and then resume; player-involved crashes retain the full pull-over response.

All intersections use synchronized traffic lights. Civilian traffic and non-pursuing police stop and queue at red lights; active pursuing officers ignore them. Collision fault uses existing contact direction and velocity data, so an NPC that strikes the player with its front does not create passenger or police blame while physical damage remains intact.

## Known Limitations

- Vehicle movement uses a lightweight tire-grip model rather than full rigid-body wheel physics.
- Controller input is not implemented yet; the driving input values are analog-ready.
- Traffic uses waypoint following with lightweight local avoidance.
- Police pursuits use lightweight road-corridor steering rather than a full vehicle path planner.
- Visuals are prototype geometry and flat colors.
- No mobile controls, audio, controller support, or multiplayer.
