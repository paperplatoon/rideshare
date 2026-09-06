export const GAME_CONFIG = {
  simulation: {
    // Smaller steps make physics more stable but cost more CPU; larger steps are cheaper but feel less consistent.
    fixedStepSeconds: 1 / 60,
    // Higher values let the game catch up after a frame drop but can cause a temporary CPU spike; lower values may slow simulation briefly.
    maxSubSteps: 3,
  },
  world: {
    // World-space distances use engine units. Offer distances convert these units to meters below.
    blocksX: 7,
    blocksZ: 7,
    // Increase for larger city blocks and longer drives; decrease for a tighter, more compact street grid.
    blockSize: 360,
    roadWidth: 75,
    sidewalkWidth: 3,
    // Increase to move the invisible city boundary farther from the playable area; decrease to make the boundary tighter.
    boundaryPadding: 30,
    // Increase to make collision lookups cover larger areas with fewer buckets; decrease to use smaller, more precise buckets.
    spatialCellSize: 64,
    roadTypes: {
      city: {
        speedLimitMph: 60,
        allowsMissionStops: true,
      },
      highway: {
        speedLimitMph: 70,
        allowsMissionStops: false,
      },
    },
    interiorRoadType: "city",
    perimeterRoadType: "highway",
    roadMarkings: {
      // Increase for thicker lane markings; decrease for thinner markings.
      lineWidth: 0.35,
      // Increase for more space between dashes; decrease for more continuous-looking markings.
      lineGap: 1.1,
      // Increase to keep markings farther away from intersections; decrease to extend them closer to corners.
      intersectionBuffer: 3,
      // Increase to raise markings above the road; decrease to place them closer to the surface.
      height: 0.05,
    },
    servicePlacement: {
      // Changing this changes the deterministic shuffle, so service locations move while remaining repeatable.
      seed: 7351,
      // Increase to spread gas stations and shops farther apart; decrease to allow them to cluster more closely.
      minimumSpacing: 150,
      // Increase to leave more room between service buildings and nearby buildings; decrease to fit more locations.
      buildingClearance: 2,
      // Increase to widen the colored gas-station approach lane; decrease to keep more of the block built up.
      gasStationDrivewayWidth: 28,
      // Increase to make the curved street aprons easier to enter; decrease for tighter entrances.
      gasStationApronRadius: 24,
      // Increase to extend the legal station corridor farther from the pumps; decrease for stricter boundaries.
      // Covers the station pad plus both rounded inlet ends along the road.
      gasStationLegalHalfWidth: 52,
    },
    buildings: {
      // Increase to make building lots larger and reduce their count; decrease to create more, smaller lots.
      lotTargetSize: 55,
      // Increase for more empty lots and less dense city blocks; decrease for a fuller city.
      emptyLotChance: 0.16,
      // Increase to prevent tiny lots; decrease to allow more lots on smaller blocks.
      minLotsPerSide: 3,
      // Increase to pull buildings farther inward from sidewalks; decrease to build closer to the curb.
      buildableInset: 14,
      // Increase for buildings that fill more of their lots; decrease for smaller buildings and more open space.
      minLotCoverage: 0.46,
      // Increase to allow buildings to fill nearly all of a lot; decrease to cap the largest building footprints.
      maxLotCoverage: 0.74,
      // Increase to scatter buildings farther from their regular lot centers; decrease for straighter rows.
      lotJitter: 0.11,
      // Increase for taller minimum buildings; decrease for shorter ones.
      minHeight: 10,
      // Increase for taller city buildings; decrease for a lower skyline.
      maxHeight: 44,
      // Controls the size of the fallback building when a block has no normal buildings; higher fills more of the block.
      fallbackCoverage: 0.62,
      // Increase for taller fallback buildings; decrease for shorter fallback buildings.
      fallbackHeight: 18,
    },
  },
  player: {
    // Vehicle dimensions and collision radius are in world units.
    length: 10.2,
    width: 5.8,
    // Increase for stronger acceleration from a stop; decrease for slower takeoff.
    acceleration: 18.2,
    // Increase for more acceleration retained at high speed; decrease for a car that runs out of pull sooner.
    highSpeedAcceleration: 4.1,
    // Increase to make acceleration fade more sharply as speed rises; decrease for a flatter, more consistent pull.
    accelerationFalloffPower: 1.45,
    // Increase for faster reverse acceleration; decrease for gentler reversing.
    reverseAcceleration: 7,
    // Increase to stop faster while braking; decrease for longer, softer braking.
    braking: 25,
    // Increase to slow down more while coasting; decrease to roll farther without touching the pedals.
    rollingResistance: 0.75,
    // Increase for more high-speed air drag; decrease to retain speed longer at high speed.
    aerodynamicDrag: 0.00022,
    // This controls physical top speed. Displayed MPH is this value times mphPerWorldUnitPerSecond.
    maxForwardSpeed: 90,
    // Increase for a faster reverse top speed; decrease to limit reversing speed.
    maxReverseSpeed: 18,
    // Increase for sharper low-speed turns; decrease for wider low-speed turns.
    lowSpeedYawRate: 1.45,
    // Increase for sharper high-speed turns; decrease for gentler high-speed turns.
    highSpeedYawRate: 0.68,
    // Increase to reach the requested steering rate faster; decrease for smoother, slower steering response.
    steeringResponse: 5.6,
    // Increase to make countersteering correct a slide more strongly; decrease for weaker correction.
    counterSteerResponseMultiplier: 1.7,
    // Increase so steering starts working only at higher speeds; decrease to allow useful steering at very low speed.
    minimumSteeringSpeed: 0.6,
    // Increase to spread steering authority over a wider speed range; decrease to reach full steering sooner.
    fullSteeringSpeed: 9,
    // Increase to regain sideways grip quickly; decrease for longer, looser slides.
    lateralGrip: 8.5,
    // Increase to recover from an active slide faster; decrease to make an active slide last longer.
    slidingGrip: 1.15,
    // Increase to tolerate harder cornering before sliding; decrease so tires break loose sooner.
    maxLateralAcceleration: 46,
    // Increase for more grip loss while braking and turning; decrease for more stable braking in corners.
    brakeGripLoss: 0.7,
    // Increase for more extra rotation once the car starts slipping; decrease to make spins less likely.
    spinOutTorque: 2.1,
    // Increase for stronger brake-induced oversteer; decrease to keep the car straighter while braking.
    brakeOversteer: 1.3,
    // Increase to straighten the car faster after steering is released; decrease to let rotation persist.
    yawRecovery: 2.8,
    // Increase for a higher maximum turn rate; decrease to cap steering more tightly.
    maxYawRate: 2.35,
    // Increase for more speed lost in a collision; decrease for collisions that preserve more momentum.
    collisionSpeedLoss: 0.45,
    // Increase to retain more steering authority on sidewalks; decrease for weaker sidewalk steering.
    sidewalkHandlingMultiplier: 0.5,
    // Increase to retain more tire grip on sidewalks; decrease for slipperier sidewalks.
    sidewalkGripMultiplier: 0.45,
    // Increase for stronger extra slowing when driving on sidewalks; decrease to coast farther there.
    sidewalkExtraDrag: 12,
    // Increase for a larger collision circle; decrease for a smaller, more forgiving collision circle.
    radius: 3.5,
    damageEffects: {
      // Each value is the percentage of the normal stat left at maximum damage: increase to make damage less punishing, decrease to make it harsher.
      accelerationMultiplierAtMaxDamage: 0.28,
      topSpeedMultiplierAtMaxDamage: 0.35,
      reverseMultiplierAtMaxDamage: 0.45,
      brakingMultiplierAtMaxDamage: 0.55,
      yawRateMultiplierAtMaxDamage: 0.55,
      steeringResponseMultiplierAtMaxDamage: 0.45,
      gripMultiplierAtMaxDamage: 0.45,
      yawRecoveryMultiplierAtMaxDamage: 0.55,
      // Increase for less extra drag from damage; decrease for more slowing when damaged.
      extraDragAtMaxDamage: 2.2,
    },
  },
  input: {
    // Increase for steering that reaches full input faster; decrease for a slower steering ramp.
    steeringRiseRate: 4.2,
    // Increase for steering that snaps back to center faster; decrease for slower return-to-center.
    steeringReturnRate: 6.5,
    // Increase for throttle/brake pedals that reach full input faster; decrease for a softer pedal ramp.
    pedalRiseRate: 5,
    // Increase for throttle/brake input that releases faster; decrease for more gradual release.
    pedalReturnRate: 8,
  },
  camera: {
    // Camera distances and look-ahead are in world units. FOV values are radians.
    // Increase to move the camera farther behind the car; decrease for a closer, more responsive view.
    distance: 30,
    // Increase for a higher camera; decrease for a lower, more ground-level view.
    height: 15,
    // Increase to look farther ahead of the car; decrease to center the view closer to the car.
    lookAhead: 18,
    // Increase to make camera position catch up faster; decrease for heavier, smoother camera movement.
    positionDamping: 7.5,
    // Increase to make camera aim catch up faster; decrease for slower aim movement.
    targetDamping: 9,
    // Increase to make speed pull the camera farther ahead; decrease to reduce speed-based look-ahead.
    velocityInfluence: 0.16,
    // Increase to narrow the slow-speed field of view; decrease for a wider minimum view.
    minFov: 0.82,
    // Increase to widen the high-speed field of view; decrease for less speed-based zooming.
    maxFov: 0.98,
  },
  graphics: {
    // Choose enhanced for improved models and sunlight, or original for the prior rendering.
    defaultMode: "enhanced" as "original" | "enhanced",
    // Increase for finer facade patterns at greater texture memory/startup cost; decrease for cheaper textures.
    facadeTextureSize: 256,
    // Increase for larger floors and windows in world space; decrease for denser facade details.
    facadeTileWorldSize: 16,
    // Increase for rounder body corners; decrease for squarer silhouettes.
    vehicleBodyBevel: 0.22,
    // Increase for smoother hub and wheel-arch curves; decrease for cheaper small details.
    vehicleDetailSegments: 8,
    // Increase to permit more vehicle detail; decrease to enforce simpler generated meshes.
    playerTriangleBudget: 1500,
    trafficTriangleBudget: 1000,
    // Increase to permit more architectural geometry; decrease to enforce simpler buildings.
    buildingTriangleBudget: 120,
    // Increase to keep more ambient illumination; decrease for stronger light/dark separation.
    ambientIntensity: 0.64,
    // Increase for brighter sun-facing surfaces; decrease for gentler sunlight.
    sunlightIntensity: 0.55,
    // X/Z change the sun's compass direction; a more negative Y makes sunlight more overhead.
    sunlightDirection: [-0.6, -1, 0.45] as readonly [number, number, number],
    // Increase for longer debug frame history; decrease for a smaller rolling sample window.
    performanceSampleCount: 3600,
    // Original wheel detail is retained for developer before/after comparisons.
    originalWheelTessellation: 10,
    // Increase for sharper procedural textures at a cost to startup memory/work; decrease for blurrier but cheaper textures.
    surfaceTextureSize: 64,
    // Increase for more detailed roofs; decrease for simpler roofs and faster generation.
    buildingRoofDetailChance: 0.72,
    // Increase for smoother-looking wheels and shadows at a small rendering cost; decrease for cheaper, more angular geometry.
    vehicleWheelTessellation: 16,
    // Increase for smoother vehicle shadows at a small rendering cost; decrease for cheaper, more angular shadows.
    vehicleShadowTessellation: 16,
    // Linear fog starts here: increase to keep more distant scenery clear; decrease to fade it sooner.
    fogStart: 1050,
    // Linear fog ends here: increase to see farther; decrease to hide distant scenery sooner.
    fogEnd: 2200,
  },
  traffic: {
    turnSignals: {
      leadSeconds: 4,
      minimumDistance: 100,
      maximumDistance: 220,
      blinkHalfPeriod: 0.4,
      color: [1, 0.55, 0.015],
    },
    // Increase for more NPC cars and a busier city; decrease for fewer cars and less simulation/rendering work.
    vehicleCount: 90,
    // NPC body and collision dimensions are local width (side-to-side/X) and length (front-to-back/Z).
    vehicleWidth: 5.4,
    vehicleLength: 9.4,
    hitboxWidth: 5.4,
    hitboxLength: 9.4,
    // Increase to raise the slowest NPC cruising speed; decrease for slower traffic.
    minSpeed: 25,
    // Increase to raise the fastest NPC cruising speed; decrease for slower traffic.
    maxSpeed: 50,
    // Increase for NPC speed changes that last longer; decrease for more frequent speed changes.
    minSpeedChangeSeconds: 8,
    maxSpeedChangeSeconds: 12,
    // Increase for NPCs that accelerate faster; decrease for slower acceleration.
    acceleration: 4,
    // Increase for NPCs that stop faster; decrease for longer NPC braking distances.
    braking: 22,
    // Increase for sharper NPC turns; decrease for wider turns.
    turnSpeed: 24,
    // Increase to make NPCs slow down earlier before turns; decrease to brake later.
    turnSlowdownDistance: 75,
    // Increase for gentler, wider turn arcs; decrease for tighter turn arcs.
    turnCurveRadius: 32,
    // Increase for smoother turn curves but more geometry/work; decrease for blockier, cheaper curves.
    turnCurveSegments: 6,
    // Following gaps are bumper-to-bumper world-unit distances. Time headway is in seconds.
    // Increase to leave more bumper-to-bumper space; decrease for tighter following.
    minimumFollowingGap: 8,
    // Increase so NPCs leave more time behind a moving leader; decrease for closer following.
    followingTimeHeadway: 0.9,
    // Increase for NPCs to correct speed gaps more aggressively; decrease for gentler following.
    followingSpeedCorrection: 1.2,
    // Increase to consider cars in nearby lanes as the same lane; decrease to be stricter.
    sameLaneTolerance: 4.5,
    // Increase to require closer alignment before calling two cars parallel; decrease to accept looser alignment.
    sameDirectionAlignment: 0.85,
    // Increase for NPCs to plan farther ahead; decrease for more reactive driving.
    lookAheadDistance: 85,
    // Increase for fewer, larger collision buckets; decrease for more, smaller buckets with tighter candidate lists.
    spatialCellSize: 48,
    // Increase to check for player collisions farther away; decrease to check only very near cars.
    playerCollisionQueryRadius: 24,
    // Increase to require a hit to be closer to the exact front of an NPC before blaming it; decrease to include more front-corner impacts.
    npcFrontImpactAlignment: 0.65,
    // Increase the fully simulated radius around the player; decrease to save CPU with more distant simplification.
    fullSimulationRadius: 520,
    // Increase the reduced-simulation radius; decrease to recycle/simplify distant cars sooner.
    reducedSimulationRadius: 900,
    // Increase for less frequent distant-NPC updates; decrease for smoother but more expensive distant traffic.
    reducedUpdateInterval: 0.1,
    // Increase to keep cars alive farther from the player; decrease to recycle them sooner.
    recycleRadius: 1200,
    // Increase the nearest respawn distance; decrease to allow respawns closer to the player.
    respawnMinRadius: 650,
    // Increase the farthest respawn distance; decrease to keep new cars closer to the player.
    respawnMaxRadius: 900,
    // Increase the delay between repeated damage effects; decrease to allow damage to trigger more often.
    damageCooldownSeconds: 0.6,
    // Increase the impact speed needed for a serious NPC crash; decrease to make smaller impacts serious.
    seriousCollisionSpeedMph: 12,
    // Increase the speed NPCs must reach before accident recovery ends; decrease to let them resume sooner.
    accidentStopSpeed: 0.5,
    // Increase the amount an engaged NPC backs up after a crash; decrease for less reversing.
    accidentReverseSpeed: 5,
    // Increase how far an engaged NPC backs up; decrease for a shorter backup.
    accidentReverseDistance: 3,
    // Increase the speed at which a crashed NPC pulls over; decrease for slower pull-over movement.
    accidentPullOverSpeed: 8,
    // Increase the distance an NPC travels while pulling over; decrease for a shorter pull-over.
    accidentPullOverForwardDistance: 15,
    // Increase the desired distance from the curb; decrease to pull closer to the curb.
    accidentCurbClearance: 1.5,
    // Increase the recovery time after a minor bump; decrease for faster return to normal driving.
    minorCollisionRecoverySeconds: 0.4,
    // Increase how long NPCs wait after an NPC-on-NPC crash; decrease for quicker resumption.
    npcCollisionWaitSeconds: 1.5,
    // Increase how far ahead NPC safety checks predict; decrease for more reactive avoidance.
    predictiveSafetyHorizonSeconds: 1.25,
    // Increase the desired clearance around predicted collisions; decrease to accept tighter gaps.
    predictiveSafetyClearance: 12,
    // Increase the denominator to make the rare intentional NPC crash less likely; decrease to make it more likely.
    intentionalCrashChanceDenominator: 2000,
    // Increase for NPCs that brake less when they intentionally fail to avoid a crash; decrease for a softer near-miss.
    intentionalCrashBraking: 1.5,
    // Distance from each road centerline to the center of its directional lane.
    // Increase to place NPCs farther from the center line; decrease to keep them closer to it.
    laneOffset: 18.75,
  },
  trafficSignals: {
    // Increase for longer green-light periods and longer queues on the crossing road; decrease for more frequent changes.
    greenSeconds: 12,
    // Increase to give nearby cars more time to clear a yellow light; decrease for a quicker change to red.
    yellowSeconds: 2,
    // Increase for a longer safety pause when every direction is red; decrease for faster switching between road directions.
    allRedSeconds: 1,
    // Increase to place stop lines farther back from intersections; decrease to let cars stop closer to the corner.
    stopLineSetback: 3,
    // Increase so cars begin considering red lights from farther away; decrease for later, more abrupt reactions.
    lookAheadDistance: 120,
    // Increase to make cars more likely to stop for yellow; decrease to let more nearby cars continue through.
    yellowStoppingBuffer: 2,
  },
  drivingRules: {
    // Increase to forgive more speeding before counting it; decrease to start speeding penalties sooner.
    speedToleranceMph: 5,
    // Speeding reaches full severity this far above the current road's posted limit.
    // Increase for speeding severity to build more gradually; decrease to reach full severity closer to the limit.
    fullSpeedingOverLimitMph: 10,
    // Increase to ignore more very-low-speed movement; decrease to evaluate violations while creeping.
    minimumEvaluationSpeedMph: 3,
    // Increase the rate at which speeding adds suspicion; decrease it to make speeding less consequential.
    speedingPointsPerSecond: 2,
    // Increase the rate at which wrong-way driving adds suspicion; decrease it to make it less consequential.
    wrongSidePointsPerSecond: 5,
    // Increase the rate at which sidewalk driving adds suspicion; decrease it to make it less consequential.
    sidewalkPointsPerSecond: 5,
    // Increase to allow more room around service areas to count as legal driving; decrease to tighten that area.
    serviceAreaPadding: 1,
  },
  police: {
    // Increase for more police cars; decrease for fewer police cars and less traffic simulation work.
    vehicleCount: 10,
    // Increase for less frequent police logic updates; decrease for more responsive police behavior at a small CPU cost.
    updateIntervalSeconds: 0.1,
    // Vision is the union of a close circle and an oriented cross. Distances are world units.
    // Increase to let police notice nearby players from farther away; decrease for shorter close-range vision.
    visionRadius: 80,
    // Increase to make the side-to-side vision band wider; decrease to make police vision narrower.
    visionCrossWidth: 100,
    // Increase for police to see farther ahead; decrease for a shorter forward sightline.
    visionForwardLength: 340,
    // Increase for police to see farther behind themselves; decrease for less rear vision.
    visionRearLength: 110,
    // Increase for police to see farther to either side; decrease for narrower side vision.
    visionSideLength: 240,
    // Increase so more suspicion is required before pursuit; decrease to start pursuit sooner.
    citationThreshold: 4,
    // Increase for suspicion to disappear faster when the player behaves; decrease for suspicion that lingers.
    suspicionDecayPerSecond: 2,
    // Increase the wait before a police officer can cite again; decrease the cooldown.
    citationCooldownSeconds: 10,
    // A player-caused impact at or above this speed is a discrete moving violation.
    // Increase the impact speed needed to report a collision; decrease to report lighter impacts.
    collisionMinimumImpactSpeedMph: 3,
    // Increase the speed at which collision suspicion reaches its maximum; decrease for harsher scaling.
    collisionFullSeveritySpeedMph: 60,
    // Increase how much police suspicion a witnessed collision creates; decrease it for a smaller bump to the meter.
    collisionViolationPoints: 4,
    // Pursuit movement uses world units/second; the configured speed is about 90 MPH at the current conversion.
    // Increase the officer's cruising speed during pursuit; decrease it to make escape easier.
    pursuitSpeed: 115,
    // Increase for faster police acceleration; decrease for slower catch-up.
    pursuitAcceleration: 26,
    // Increase for harder police braking; decrease for longer police stopping distances.
    pursuitBraking: 42,
    // Increase for sharper police turns; decrease for wider, slower turns.
    pursuitTurnSpeed: 55,
    // Pursuing officers use this inner lane offset to pass normal traffic while staying on the road.
    // Increase the police lane offset used to pass traffic; decrease to keep officers closer to the normal lane.
    pursuitLaneOffset: 8,
    // Increase the minimum following gap police try to maintain; decrease for tighter following.
    pursuitMinimumFollowingGap: 4,
    // Increase the police time gap behind the player; decrease for closer speed matching.
    pursuitFollowingTimeHeadway: 0.5,
    // U-turn distances are world units. Higher penalties/savings requirements make reversals less frequent.
    // Increase the distance needed before a police U-turn is considered; decrease for earlier reversals.
    pursuitUTurnMinimumBehindDistance: 12,
    // Increase the route advantage required to U-turn; decrease for more frequent U-turns.
    pursuitUTurnRequiredRouteSavings: 35,
    // Increase the penalty for choosing the wrong direction; decrease for more willingness to reverse direction.
    pursuitReverseDirectionPenalty: 60,
    // Increase the wait between police U-turns; decrease for quicker repeated U-turns.
    pursuitUTurnCooldownSeconds: 3,
    // Once this close to an intersection, an officer finishes the turn it already selected.
    // Increase for officers to commit to a chosen turn sooner; decrease so they can reconsider closer to intersections.
    pursuitTurnCommitDistance: 35,
    // Increase how far ahead police aim when predicting the player; decrease for more direct/reactive pursuit.
    pursuitPredictionSeconds: 0.5,
    // Increase the range where police steer directly toward the player; decrease to rely on road routing sooner.
    pursuitDirectSteeringDistance: 220,
    // Increase the distance at which police trail behind instead of aiming at the player's center; decrease for closer direct following.
    pursuitTrailingTargetDistance: 60,
    // Increase the preferred gap between police and player; decrease to make police follow more closely.
    pursuitDesiredGapMeters: 1.5,
    // Increase the extra capture tolerance around the vehicles; decrease for a stricter arrest range.
    pursuitCaptureGapMeters: 4,
    // Increase how strongly police speed corrects toward the player's speed; decrease for slower matching.
    pursuitGapSpeedCorrection: 0.45,
    // Increase the maximum police closing speed; decrease to prevent aggressive catch-up.
    pursuitMaximumClosingSpeed: 35,
    // Increase the distance error police ignore; decrease for more constant micro-adjustments.
    pursuitHoldDeadZone: 0.75,
    // Increase how far ahead police look for traffic conflicts; decrease for more reactive avoidance.
    pursuitAvoidancePredictionSeconds: 1,
    // Increase the distance police scan for obstacles; decrease for shorter avoidance look-ahead.
    pursuitAvoidanceLookAheadDistance: 45,
    // Increase the amount police swerve around an obstacle; decrease for smaller lane changes.
    pursuitAvoidanceOffset: 12,
    // Increase how long a police swerve remains committed; decrease for quicker return to the target line.
    pursuitAvoidanceCommitSeconds: 0.75,
    // Increase the clearance police require before accepting a path; decrease to fit through tighter gaps.
    pursuitAvoidanceClearance: 7,
    // Increase the time police spend recovering after a crash; decrease for faster pursuit recovery.
    pursuitRecoverySeconds: 0.6,
    // The bust range is derived from vehicle lengths plus pursuitCaptureGapMeters.
    // Escape distance is in gameplay meters after applying ride.metersPerWorldUnit.
    // Increase the seconds needed in arrest range; decrease for faster arrest.
    bustDurationSeconds: 4,
    // Increase how quickly arrest progress drains outside range; decrease to let progress linger.
    bustDecaySecondsPerSecond: 1,
    // Increase the distance needed to begin the escape timer; decrease to make escape easier.
    escapeDistanceMeters: 600,
    // Increase the time the player must stay escaped; decrease for a quicker getaway.
    escapeDurationSeconds: 8,
    // Increase the initial grace period before the first resisting fine; decrease it to escalate sooner.
    resistingGraceSeconds: 45,
    // Increase the time between later resisting fines; decrease for faster fine escalation.
    resistingIncreaseIntervalSeconds: 60,
    // Increase the added resisting fine; decrease it for a smaller penalty.
    resistingFineIncrement: 100,
    // Increase the smallest possible base police fine; decrease it for a lower minimum fine.
    minimumFine: 40,
    // Increase the largest possible base police fine; decrease it to cap citations lower.
    maximumFine: 150,
  },
  progression: {
    // Change this key to start a separate save slot; normally leave it unchanged.
    saveKey: "delivery-driver-progression-v1",
    // Increase when the saved data format changes so migrations can distinguish old saves.
    saveVersion: 4,
    // Increase for more starting cash; decrease for a harder start.
    startingMoney: 30,
    // Increase to save less often; decrease for more frequent crash protection.
    autosaveSeconds: 1,
    // Increase to keep more ride history; decrease to use less save data.
    rideHistoryLimit: 100,
    // Increase for a longer upgrade path; decrease for fewer upgrade levels.
    maxUpgradeLevel: 50,
    // Increase the benefit of each upgrade; decrease for weaker upgrades.
    upgradePercentPerLevel: 0.02,
    // Increase to make the first upgrade more expensive; decrease to make it cheaper.
    upgradeCostBase: 100,
    // Increase to make later upgrades become expensive faster; decrease for flatter pricing.
    additionalCostPerUpgradeLevel: 100,
    // Increase to require a faster stop before changing cars; decrease to allow slower swaps.
    equipMaxSpeedMph: 1,
    missionLicenseUnlockCosts: {
      rideshare: 0,
      taxi: 50,
      rideshare_silver: 1000,
      package_delivery: 300,
    },
    vehiclePrices: {
      starter: 0,
      "used-compact": 2000,
      "old-sedan": 5000,
      hatchback: 11000,
      "modern-sedan": 18000,
      "sport-compact": 27000,
      "touring-sedan": 38000,
      "hot-hatch": 52000,
      coupe: 70000,
      "muscle-car": 90000,
      "sport-sedan": 115000,
      "performance-coupe": 140000,
      "grand-tourer": 165000,
      "exotic-coupe": 195000,
      supercar: 220000,
      "elite-sports-car": 250000,
    },
    eliteVehicleStats: {
      // Increase a stat to make the elite vehicle stronger in that area; decrease it to make it weaker.
      acceleration: 24,
      topSpeed: 157.5,
      turning: 1.3,
      braking: 28,
    },
  },
  fuel: {
    // Increase for longer range; decrease to make refueling necessary sooner.
    capacitySecondsAtCruise: 500,
    // Increase to show the low-fuel warning earlier; decrease to wait longer.
    lowFuelThreshold: 0.2,
    // Increase to refuel from farther away; decrease to require being closer.
    refuelRadius: 16,
    // Increase for faster refueling; decrease for slower refueling.
    refuelRatePerSecond: 0.2,
    // Increase the full-tank price; decrease it for cheaper refueling.
    fullTankCost: 30,
    // Increase the speed allowed at the pump; decrease to require a more complete stop.
    refuelStopSpeedMph: 1,
    // Increase idle fuel drain; decrease it to make waiting cheaper.
    idleDrainMultiplier: 0.08,
    // Increase baseline moving drain; decrease for better fuel economy.
    minMovingDrainMultiplier: 0.35,
    // Increase the extra drain caused by speed; decrease it so high speed costs less.
    speedDrainMultiplier: 1.35,
    stationCount: 14,
  },
  repair: {
    shopCount: 6,
    // Increase to repair from farther away; decrease to require being closer to the shop.
    repairRadius: 16,
    // Increase repair speed; decrease for slower repairs.
    repairRatePerSecond: 0.2,
    // Increase the full repair price; decrease it for cheaper repairs.
    fullRepairCost: 200,
    // Increase the speed allowed during repair; decrease to require a more complete stop.
    repairStopSpeedMph: 1,
    // Increase the impact speed needed for serious damage; decrease to make impacts damage more easily.
    damageScaleSpeedMph: 60,
    // Increase the maximum damage per collision; decrease for gentler collision damage.
    maxCollisionDamage: 0.26,
  },
  packageDelivery: {
    // Change this to change the repeatable sequence of generated package offers.
    offerSeed: 31991,
    // Increase payout per meter; decrease package-job earnings.
    ratePerMeter: 0.16,
    // Increase to make payout decay more slowly; decrease for harsher time pressure.
    fareDecayPercentPerSecond: 0.005,
    // These offer distances are meters: increase maxPickupDistance for farther offers; decrease it to keep offers closer.
    maxPickupDistance: 1200,
    // Increase to require longer package trips; decrease to allow shorter trips.
    minDropoffDistance: 1400,
    // Increase to allow longer package trips; decrease to keep the maximum trip shorter.
    maxDropoffDistance: 2400,
    // Increase to make package pickup easier; decrease for more precise stopping.
    pickupRadius: 12,
    // Increase to make package dropoff easier; decrease for more precise delivery.
    dropoffRadius: 12,
    // Increase the fine for being arrested while carrying a package; decrease the penalty.
    possessionFine: 200,
    // Increase how long the delivery result remains visible; decrease it to dismiss sooner.
    resultSeconds: 3,
  },
  ride: {
    // Increase the number of offers shown at once; decrease for a smaller offer list.
    offerCount: 3,
    // Increase how long an unaccepted offer remains available; decrease for faster rotation.
    offerLifetimeSeconds: 60,
    // Increase the delay between displayed distance updates; decrease for more frequent updates.
    offerDistanceRefreshSeconds: 1,
    // Increase to allow accepting rides farther from their pickup; decrease to keep offers local.
    maxPickupDistance: 400,
    // Increase to prevent very short rides; decrease to allow shorter trips.
    minTripDistance: 350,
    // Trip-tier distances are meters after applying metersPerWorldUnit.
    tripTiers: {
      short: {
        // Increase these bounds to make short rides longer; decrease them to make short rides shorter.
        minDistance: 350,
        maxDistance: 650,
      },
      medium: {
        // Increase these bounds to make medium rides longer; decrease them to make medium rides shorter.
        minDistance: 660,
        maxDistance: 1100,
      },
      long: {
        // Increase these bounds to make long rides longer; decrease them to make long rides shorter.
        minDistance: 1101,
        maxDistance: 2200,
      },
    },
    // Increase to make the same physical drives display as longer distances; decrease to make them display shorter.
    metersPerWorldUnit: 1,
    // Increase to show higher MPH for the same physical speed; decrease to show lower MPH. This also changes speed-based rules and damage.
    mphPerWorldUnitPerSecond: 0.78,
    // Arrival radii remain physical world units.
    // Increase to make pickup easier; decrease for more precise arrival.
    pickupRadius: 7,
    // Increase the destination radius to make arrival easier; decrease it for more precise parking.
    destinationRadius: 7,
    // Increase the allowed arrival speed; decrease it to demand a slower stop.
    maximumArrivalSpeedMph: 5,
    // Increase how long the completed-ride result remains visible; decrease it to dismiss sooner.
    rideResultSeconds: 2,
    fare: {
      // Increase the base fare paid on every ride; decrease it for lower starting pay.
      baseFare: 9.75,
      // Increase the fare earned per meter; decrease distance-based pay.
      ratePerMeter: 0.02,
      // Increase the share of pickup distance included in fare; decrease its contribution.
      pickupDistanceWeight: 0.35,
      // Increase the low end of fare randomness; decrease it for cheaper unlucky offers.
      randomMultiplierMin: 0.7,
      // Increase the high end of fare randomness; decrease it to reduce unusually generous offers.
      randomMultiplierMax: 1.3,
      // Increase the maximum tip percentage; decrease the tip ceiling.
      maxTipPercent: 0.5,
      // Increase how quickly tips shrink over time; decrease for slower tip decay.
      tipDecayPercentPerSecond: 0.005,
      // Increase the tip reduction per violation point; decrease the illegal-driving penalty.
      violationTipPenaltyPerPoint: 0.02,
    },
    archetypes: {
      // Increase a weight to make that exclusive trait more common; decrease to make it rarer.
      weights: {
        timid: 8, hurried: 8, lawful: 8, careful: 4, shady: 4, thrillSeeker: 2,
        mechanic: 4, lawyer: 4, offDutyCop: 4, carSalesman: 4, millionaire: 4,
        serviceWorker: 8, offGrid: 8, normal: 30,
      },
      // Increase to allow Timid passengers faster driving; decrease for a stricter limit.
      timidMaxMph: 50,
      // Increase to demand faster driving for Hurried passengers; decrease to relax it.
      hurriedMinMph: 25,
      // Increase to allow more time to accelerate after pickup; decrease for earlier penalties.
      hurriedGraceSeconds: 5,
      // Increase satisfaction loss for unmet trait speed requirements; decrease for gentler penalties.
      speedPenaltyPerSecond: 2,
      // Increase the fraction of starting tip lost per red light; decrease for a smaller deduction.
      redLightDeduction: 0.1,
      // Increase the fraction lost per opposing-lane maneuver; decrease for a smaller deduction.
      opposingLaneDeduction: 0.2,
      // Increase the reward per yellow intersection visit; decrease for a smaller bonus.
      yellowBonus: 20,
      // Increase the reward for the first gas station stop; decrease for a smaller bonus.
      stationBonus: 20,
      // Increase Millionaire starting tips; decrease to reduce generosity.
      millionaireTipMultiplier: 3,
      // Increase Millionaire satisfaction penalties; decrease for more forgiving ratings.
      millionairePenaltyMultiplier: 3,
      // Increase service worker starting tips; decrease to reduce generosity.
      serviceWorkerTipMultiplier: 0.5,
      // Increase service worker satisfaction penalties; decrease for more forgiving ratings.
      serviceWorkerPenaltyMultiplier: 0.5,
      // Increase the discount per saved coupon; decrease for smaller discounts.
      vehicleCouponValue: 100,
      // Increase the crossing dead band to suppress jitter; decrease for more sensitive detection.
      centerLineTolerance: 0.5,
    },
    satisfaction: {
      // Increase starting score for happier passengers; decrease it for less initial goodwill.
      startingScore: 100,
      // Increase the delay before another collision penalty; decrease to penalize collisions more often.
      collisionCooldownSeconds: 5,
      // Increase the speed needed for a collision to hurt satisfaction; decrease to make gentler impacts matter.
      collisionSpeedThresholdMph: 12,
      normal: {
        // Increase the collision penalty; decrease it for a more forgiving passenger.
        collisionPenalty: 40,
        // Increase the safe-speed ceiling; decrease it for a more cautious passenger.
        maxSafeSpeedMph: 60,
        // Increase the satisfaction loss per second above the limit; decrease the loss.
        speedPenaltyPerSecond: 1,
      },
      scaredyCat: {
        // Increase the collision penalty; decrease it for a more forgiving scaredy-cat passenger.
        collisionPenalty: 60,
        // Increase the safe-speed ceiling; decrease it for a more cautious passenger.
        maxSafeSpeedMph: 50,
        // Increase the satisfaction loss per second above the limit; decrease the loss.
        speedPenaltyPerSecond: 1,
      },
      speedDemon: {
        // Increase the collision penalty; decrease it for a more forgiving speed demon.
        collisionPenalty: 10,
        // Increase the required speed; decrease it to satisfy the passenger at lower speeds.
        minRequiredSpeedMph: 25,
        // Increase the satisfaction loss per second when too slow; decrease the loss.
        speedPenaltyPerSecond: 1,
        // Increase the grace period before slow driving matters; decrease it for stricter timing.
        gracePeriodSeconds: 5,
      },
    },
  },
} as const;
