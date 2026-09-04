import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import type { Scene } from "@babylonjs/core/scene";
import { GAME_CONFIG } from "../game/config";
import type {
  DrivingViolationRates,
  DrivingViolationSeverity,
  PoliceCitation,
  PoliceOffense,
} from "../game/types";
import type { PlayerProfile } from "../player/PlayerProfile";
import type { TrafficCar } from "../traffic/TrafficCar";

interface ObservationState {
  meter: number;
  speeding: number;
  wrongSide: number;
  sidewalk: number;
  collision: number;
  peakSeverity: number;
  respawnGeneration: number;
}

export interface PoliceWarningState {
  progress: number;
  activelyObserving: boolean;
  phase: "idle" | "observing" | "pursuit" | "busting";
}

export interface PoliceViewTarget {
  x: number;
  z: number;
}

interface ActivePursuit {
  officerId: number;
  offense: PoliceOffense;
  peakSeverity: number;
  bustSeconds: number;
  escapeSeconds: number;
}

export class PoliceManager {
  readonly warning: PoliceWarningState = { progress: 0, activelyObserving: false, phase: "idle" };
  private readonly observations = new Map<number, ObservationState>();
  private activePursuit: ActivePursuit | null = null;
  private updateAccumulator = 0;
  private citationCooldown = 0;
  private debugVisionEnabled = false;
  private debugVisionSource: Mesh | null = null;
  private debugVisionMaterial: StandardMaterial | null = null;
  private readonly debugVisionMeshes: Mesh[] = [];

  constructor(
    private readonly officers: readonly TrafficCar[],
    scene?: Scene,
    enableDebugVision = false,
  ) {
    for (const officer of officers) {
      this.observations.set(officer.id, emptyObservation(officer.respawnGeneration));
    }
    if (scene && enableDebugVision) this.createDebugVision(scene);
  }

  update(
    deltaTime: number,
    player: PoliceViewTarget,
    rates: DrivingViolationRates,
    severity: DrivingViolationSeverity,
    profile: PlayerProfile,
  ): PoliceCitation | null {
    this.citationCooldown = Math.max(0, this.citationCooldown - deltaTime);
    this.updateAccumulator += deltaTime;
    if (this.updateAccumulator < GAME_CONFIG.police.updateIntervalSeconds) return null;
    const updateDelta = this.updateAccumulator;
    this.updateAccumulator = 0;

    if (this.activePursuit) {
      return this.updatePursuit(updateDelta, player, profile);
    }

    this.warning.progress = 0;
    this.warning.activelyObserving = false;
    this.warning.phase = "idle";
    for (const officer of this.officers) {
      const state = this.stateFor(officer);
      const inView = officer.mesh.isEnabled() && isPlayerInPoliceView(
        officer.mesh.position,
        officer.mesh.rotation.y,
        player,
      );
      const activelyObserving = this.citationCooldown <= 0 && inView && rates.total > 0;
      if (activelyObserving) {
        state.meter += rates.total * updateDelta;
        state.speeding += rates.speeding * updateDelta;
        state.wrongSide += rates.wrongSide * updateDelta;
        state.sidewalk += rates.sidewalk * updateDelta;
        state.peakSeverity = Math.max(state.peakSeverity, severity.combined);
      } else {
        this.decayObservation(state, updateDelta);
      }

      const progress = state.meter / GAME_CONFIG.police.citationThreshold;
      if (progress > this.warning.progress) {
        this.warning.progress = Math.min(1, progress);
        this.warning.activelyObserving = activelyObserving;
        this.warning.phase = activelyObserving || progress > 0 ? "observing" : "idle";
      } else if (activelyObserving && progress === this.warning.progress) {
        this.warning.activelyObserving = true;
        this.warning.phase = "observing";
      }

      if (activelyObserving && state.meter >= GAME_CONFIG.police.citationThreshold) {
        this.startPursuit(officer, state, player);
        return null;
      }
    }
    return null;
  }

  registerTrafficCollision(
    player: PoliceViewTarget,
    severity: number,
  ): boolean {
    if (this.activePursuit || this.citationCooldown > 0 || severity <= 0) return false;
    for (const officer of this.officers) {
      const state = this.stateFor(officer);
      if (!officer.mesh.isEnabled() || !isPlayerInPoliceView(
        officer.mesh.position,
        officer.mesh.rotation.y,
        player,
      )) {
        continue;
      }
      const points = GAME_CONFIG.police.collisionViolationPoints;
      state.meter += points;
      state.collision += points;
      state.peakSeverity = Math.max(state.peakSeverity, Math.max(0, Math.min(1, severity)));
      this.warning.progress = Math.min(1, state.meter / GAME_CONFIG.police.citationThreshold);
      this.warning.activelyObserving = true;
      this.warning.phase = "observing";
      if (state.meter >= GAME_CONFIG.police.citationThreshold) {
        this.startPursuit(officer, state, player);
        return true;
      }
    }
    return false;
  }

  registerPoliceCollision(
    officerId: number,
    severity: number,
    profile: PlayerProfile,
  ): PoliceCitation | null {
    if (this.citationCooldown > 0) return null;
    const officer = this.officers.find((candidate) => candidate.id === officerId);
    if (!officer) return null;
    const state = this.stateFor(officer);
    state.meter = Math.max(state.meter, GAME_CONFIG.police.citationThreshold);
    state.collision = Math.max(state.collision, GAME_CONFIG.police.citationThreshold);
    state.peakSeverity = Math.max(state.peakSeverity, Math.max(0, Math.min(1, severity)));
    return this.issueCitation(officer, state, profile, "COLLISION WITH POLICE");
  }

  get isDebugVisionEnabled(): boolean {
    return this.debugVisionEnabled;
  }

  get isPursuitActive(): boolean {
    return this.activePursuit !== null;
  }

  get activePursuerId(): number | null {
    return this.activePursuit?.officerId ?? null;
  }

  toggleDebugVision(): boolean {
    if (!this.debugVisionSource) return false;
    this.setDebugVisionEnabled(!this.debugVisionEnabled);
    return this.debugVisionEnabled;
  }

  dispose(): void {
    this.clearPursuit();
    for (const mesh of this.debugVisionMeshes) mesh.dispose();
    this.debugVisionMeshes.length = 0;
    this.debugVisionSource?.dispose();
    this.debugVisionMaterial?.dispose();
    this.debugVisionSource = null;
    this.debugVisionMaterial = null;
  }

  private stateFor(officer: TrafficCar): ObservationState {
    let state = this.observations.get(officer.id);
    if (!state || state.respawnGeneration !== officer.respawnGeneration) {
      state = emptyObservation(officer.respawnGeneration);
      this.observations.set(officer.id, state);
    }
    return state;
  }

  private decayObservation(state: ObservationState, deltaTime: number): void {
    if (state.meter <= 0) return;
    const previousMeter = state.meter;
    state.meter = Math.max(0, state.meter - GAME_CONFIG.police.suspicionDecayPerSecond * deltaTime);
    const retained = state.meter / previousMeter;
    state.speeding *= retained;
    state.wrongSide *= retained;
    state.sidewalk *= retained;
    state.collision *= retained;
    state.peakSeverity *= retained;
  }

  private startPursuit(officer: TrafficCar, state: ObservationState, player: PoliceViewTarget): void {
    this.activePursuit = {
      officerId: officer.id,
      offense: dominantOffense(state),
      peakSeverity: state.peakSeverity,
      bustSeconds: 0,
      escapeSeconds: 0,
    };
    for (const [officerId, observation] of this.observations) {
      if (officerId !== officer.id) resetObservation(observation);
    }
    officer.setPursuitTarget(player);
    this.warning.progress = 0;
    this.warning.activelyObserving = false;
    this.warning.phase = "pursuit";
  }

  private updatePursuit(
    deltaTime: number,
    player: PoliceViewTarget,
    profile: PlayerProfile,
  ): PoliceCitation | null {
    const pursuit = this.activePursuit;
    if (!pursuit) return null;
    const officer = this.officers.find((candidate) => candidate.id === pursuit.officerId);
    if (!officer) {
      this.clearPursuit();
      return null;
    }

    officer.setPursuitTarget(player);
    const distanceMeters = Math.hypot(
      officer.mesh.position.x - player.x,
      officer.mesh.position.z - player.z,
    ) * GAME_CONFIG.ride.metersPerWorldUnit;
    if (distanceMeters <= GAME_CONFIG.police.bustRadiusMeters) {
      pursuit.bustSeconds += deltaTime;
      pursuit.escapeSeconds = 0;
      this.warning.phase = "busting";
      this.warning.activelyObserving = true;
    } else {
      pursuit.bustSeconds = Math.max(
        0,
        pursuit.bustSeconds - GAME_CONFIG.police.bustDecaySecondsPerSecond * deltaTime,
      );
      pursuit.escapeSeconds = distanceMeters >= GAME_CONFIG.police.escapeDistanceMeters
        ? pursuit.escapeSeconds + deltaTime
        : 0;
      this.warning.phase = "pursuit";
      this.warning.activelyObserving = false;
    }
    this.warning.progress = Math.min(1, pursuit.bustSeconds / GAME_CONFIG.police.bustDurationSeconds);

    if (pursuit.bustSeconds >= GAME_CONFIG.police.bustDurationSeconds - 1e-6) {
      const state = this.stateFor(officer);
      state.peakSeverity = pursuit.peakSeverity;
      return this.issueCitation(officer, state, profile, pursuit.offense);
    }
    if (pursuit.escapeSeconds >= GAME_CONFIG.police.escapeDurationSeconds - 1e-6) {
      this.clearPursuit();
    }
    return null;
  }

  private clearPursuit(): void {
    if (this.activePursuit) {
      this.officers.find((officer) => officer.id === this.activePursuit?.officerId)?.clearPursuit();
    }
    this.activePursuit = null;
    for (const observation of this.observations.values()) resetObservation(observation);
    this.warning.progress = 0;
    this.warning.activelyObserving = false;
    this.warning.phase = "idle";
  }

  private issueCitation(
    officer: TrafficCar,
    state: ObservationState,
    profile: PlayerProfile,
    offense: PoliceOffense = dominantOffense(state),
  ): PoliceCitation {
    const assessedFine = calculatePoliceFine(state.peakSeverity);
    this.clearPursuit();
    const amountPaid = profile.spend(assessedFine);
    profile.saveNow();
    const citation: PoliceCitation = {
      officerId: officer.id,
      offense,
      assessedFine,
      amountPaid,
      remainingBalance: profile.money,
    };
    this.citationCooldown = GAME_CONFIG.police.citationCooldownSeconds;
    return citation;
  }

  private createDebugVision(scene: Scene): void {
    this.debugVisionMaterial = new StandardMaterial("police-vision-material", scene);
    this.debugVisionMaterial.diffuseColor = new Color3(0.15, 0.78, 1);
    this.debugVisionMaterial.emissiveColor = new Color3(0.05, 0.28, 0.38);
    this.debugVisionMaterial.alpha = 0.2;
    this.debugVisionMaterial.backFaceCulling = false;
    this.debugVisionMaterial.disableDepthWrite = true;

    this.debugVisionSource = createVisionMesh(scene);
    this.debugVisionSource.material = this.debugVisionMaterial;
    this.debugVisionSource.position.y = -10000;
    this.debugVisionSource.setEnabled(false);
    for (const officer of this.officers) {
      const mesh = this.debugVisionSource.clone(`police-vision-${officer.id}`, officer.mesh, false)!;
      mesh.position.set(0, -0.9, 0);
      mesh.isPickable = false;
      this.debugVisionMeshes.push(mesh);
    }
    this.setDebugVisionEnabled(true);
  }

  private setDebugVisionEnabled(enabled: boolean): void {
    this.debugVisionEnabled = enabled;
    for (const mesh of this.debugVisionMeshes) mesh.setEnabled(enabled);
  }
}

export function isPlayerInPoliceView(
  officer: PoliceViewTarget,
  officerHeading: number,
  player: PoliceViewTarget,
): boolean {
  const dx = player.x - officer.x;
  const dz = player.z - officer.z;
  const police = GAME_CONFIG.police;
  if (dx * dx + dz * dz <= police.visionRadius * police.visionRadius) return true;

  const forward = Math.sin(officerHeading) * dx + Math.cos(officerHeading) * dz;
  const right = Math.cos(officerHeading) * dx - Math.sin(officerHeading) * dz;
  const halfWidth = police.visionCrossWidth / 2;
  const inLongitudinalSightline = Math.abs(right) <= halfWidth
    && forward >= -police.visionRearLength
    && forward <= police.visionForwardLength;
  const inSideSightline = Math.abs(forward) <= halfWidth
    && Math.abs(right) <= police.visionSideLength;
  return inLongitudinalSightline || inSideSightline;
}

export function calculatePoliceFine(peakSeverity: number): number {
  const police = GAME_CONFIG.police;
  const severity = Math.max(0, Math.min(1, peakSeverity));
  const unrounded = police.minimumFine + (police.maximumFine - police.minimumFine) * severity;
  return Math.max(police.minimumFine, Math.min(police.maximumFine, Math.round(unrounded / 5) * 5));
}

function emptyObservation(respawnGeneration: number): ObservationState {
  return {
    meter: 0,
    speeding: 0,
    wrongSide: 0,
    sidewalk: 0,
    collision: 0,
    peakSeverity: 0,
    respawnGeneration,
  };
}

function resetObservation(state: ObservationState): void {
  state.meter = 0;
  state.speeding = 0;
  state.wrongSide = 0;
  state.sidewalk = 0;
  state.collision = 0;
  state.peakSeverity = 0;
}

function dominantOffense(state: ObservationState): PoliceOffense {
  if (state.collision >= state.wrongSide
    && state.collision >= state.speeding
    && state.collision >= state.sidewalk) return "RECKLESS DRIVING";
  if (state.wrongSide >= state.speeding && state.wrongSide >= state.sidewalk) return "WRONG WAY";
  if (state.sidewalk >= state.speeding) return "SIDEWALK DRIVING";
  return "SPEEDING";
}

function createVisionMesh(scene: Scene): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  appendCircle(
    positions,
    indices,
    GAME_CONFIG.police.visionRadius,
  );
  const halfWidth = GAME_CONFIG.police.visionCrossWidth / 2;
  appendRectangle(
    positions,
    indices,
    -halfWidth,
    halfWidth,
    -GAME_CONFIG.police.visionRearLength,
    GAME_CONFIG.police.visionForwardLength,
  );
  appendRectangle(
    positions,
    indices,
    -GAME_CONFIG.police.visionSideLength,
    GAME_CONFIG.police.visionSideLength,
    -halfWidth,
    halfWidth,
  );
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  const mesh = new Mesh("police-vision-source", scene);
  vertexData.applyToMesh(mesh);
  return mesh;
}

function appendCircle(
  positions: number[],
  indices: number[],
  range: number,
): void {
  const segments = 24;
  const firstVertex = positions.length / 3;
  positions.push(0, 0, 0);
  for (let index = 0; index <= segments; index++) {
    const angle = Math.PI * 2 * index / segments;
    positions.push(Math.sin(angle) * range, 0, Math.cos(angle) * range);
    if (index > 0) indices.push(firstVertex, firstVertex + index, firstVertex + index + 1);
  }
}

function appendRectangle(
  positions: number[],
  indices: number[],
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
): void {
  const firstVertex = positions.length / 3;
  positions.push(
    minX, 0, minZ,
    maxX, 0, minZ,
    maxX, 0, maxZ,
    minX, 0, maxZ,
  );
  indices.push(
    firstVertex, firstVertex + 1, firstVertex + 2,
    firstVertex, firstVertex + 2, firstVertex + 3,
  );
}
