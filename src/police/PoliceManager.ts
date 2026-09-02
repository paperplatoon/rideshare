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
  peakSeverity: number;
  respawnGeneration: number;
}

export interface PoliceWarningState {
  progress: number;
  activelyObserving: boolean;
}

export interface PoliceViewTarget {
  x: number;
  z: number;
}

export class PoliceManager {
  readonly warning: PoliceWarningState = { progress: 0, activelyObserving: false };
  private readonly observations = new Map<number, ObservationState>();
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

    this.warning.progress = 0;
    this.warning.activelyObserving = false;
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
      } else if (activelyObserving && progress === this.warning.progress) {
        this.warning.activelyObserving = true;
      }

      if (activelyObserving && state.meter >= GAME_CONFIG.police.citationThreshold) {
        return this.issueCitation(officer, state, profile);
      }
    }
    return null;
  }

  get isDebugVisionEnabled(): boolean {
    return this.debugVisionEnabled;
  }

  toggleDebugVision(): boolean {
    if (!this.debugVisionSource) return false;
    this.setDebugVisionEnabled(!this.debugVisionEnabled);
    return this.debugVisionEnabled;
  }

  dispose(): void {
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
    state.peakSeverity *= retained;
  }

  private issueCitation(officer: TrafficCar, state: ObservationState, profile: PlayerProfile): PoliceCitation {
    const assessedFine = calculatePoliceFine(state.peakSeverity);
    const amountPaid = profile.spend(assessedFine);
    profile.saveNow();
    const citation: PoliceCitation = {
      officerId: officer.id,
      offense: dominantOffense(state),
      assessedFine,
      amountPaid,
      remainingBalance: profile.money,
    };
    for (const observation of this.observations.values()) resetObservation(observation);
    this.warning.progress = 0;
    this.warning.activelyObserving = false;
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
  const distance = Math.hypot(dx, dz);
  if (distance < 0.001) return true;
  const alignment = (Math.sin(officerHeading) * dx + Math.cos(officerHeading) * dz) / distance;
  const police = GAME_CONFIG.police;
  const inFront = distance <= police.forwardRange
    && alignment >= Math.cos(police.forwardHalfAngleDegrees * Math.PI / 180);
  const inRear = distance <= police.rearRange
    && alignment <= -Math.cos(police.rearHalfAngleDegrees * Math.PI / 180);
  return inFront || inRear;
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
    peakSeverity: 0,
    respawnGeneration,
  };
}

function resetObservation(state: ObservationState): void {
  state.meter = 0;
  state.speeding = 0;
  state.wrongSide = 0;
  state.sidewalk = 0;
  state.peakSeverity = 0;
}

function dominantOffense(state: ObservationState): PoliceOffense {
  if (state.wrongSide >= state.speeding && state.wrongSide >= state.sidewalk) return "WRONG WAY";
  if (state.sidewalk >= state.speeding) return "SIDEWALK DRIVING";
  return "SPEEDING";
}

function createVisionMesh(scene: Scene): Mesh {
  const positions: number[] = [];
  const indices: number[] = [];
  appendSector(
    positions,
    indices,
    GAME_CONFIG.police.forwardRange,
    GAME_CONFIG.police.forwardHalfAngleDegrees * Math.PI / 180,
    0,
  );
  appendSector(
    positions,
    indices,
    GAME_CONFIG.police.rearRange,
    GAME_CONFIG.police.rearHalfAngleDegrees * Math.PI / 180,
    Math.PI,
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

function appendSector(
  positions: number[],
  indices: number[],
  range: number,
  halfAngle: number,
  centerAngle: number,
): void {
  const segments = 12;
  const firstVertex = positions.length / 3;
  positions.push(0, 0, 0);
  for (let index = 0; index <= segments; index++) {
    const angle = centerAngle - halfAngle + (halfAngle * 2 * index) / segments;
    positions.push(Math.sin(angle) * range, 0, Math.cos(angle) * range);
    if (index > 0) indices.push(firstVertex, firstVertex + index, firstVertex + index + 1);
  }
}
