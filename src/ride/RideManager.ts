import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { GAME_CONFIG } from "../game/config";
import { PassengerType, RideState, type RideOffer, type RideResult } from "../game/types";
import { clamp, distanceXZ } from "../utils/math";
import type { PlayerCar } from "../player/PlayerCar";
import type { RideOfferManager } from "./RideOfferManager";
import type { PlayerProfile } from "../player/PlayerProfile";

interface PassengerRules {
  collisionPenalty: number;
  speedPenaltyPerSecond: number;
  maxSafeSpeedMph?: number;
  minRequiredSpeedMph?: number;
  gracePeriodSeconds?: number;
}

export class RideManager {
  state = RideState.Idle;
  activeRide: RideOffer | null = null;
  satisfaction: number = GAME_CONFIG.ride.satisfaction.startingScore;
  lastResult: RideResult | null = null;
  resultTimeRemaining = 0;
  collisionFlashText = "";
  collisionFlashSeconds = 0;
  private passengerElapsed = 0;
  private tipTimeMultiplier = 1;
  private collisionCooldown = 0;
  private marker: Mesh | null = null;
  private markerMaterial: StandardMaterial | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly offers: RideOfferManager,
    private readonly profile: PlayerProfile,
  ) {}

  get isActive(): boolean {
    return this.activeRide !== null;
  }

  get completedRides(): number {
    return this.profile.completedRides;
  }

  get totalMoney(): number {
    return this.profile.money;
  }

  acceptRide(id: string): boolean {
    if (this.state !== RideState.Idle) {
      return false;
    }
    const offer = this.offers.acceptOffer(id);
    if (!offer) {
      return false;
    }
    this.activeRide = offer;
    this.state = RideState.DrivingToPickup;
    this.showMarker(offer.pickupPoint.position, new Color3(1, 0.78, 0.1), "ride-pickup-marker");
    return true;
  }

  update(deltaTime: number, player: PlayerCar, active: boolean): void {
    this.resultTimeRemaining = Math.max(0, this.resultTimeRemaining - deltaTime);
    this.collisionFlashSeconds = Math.max(0, this.collisionFlashSeconds - deltaTime);
    if (this.collisionFlashSeconds <= 0) {
      this.collisionFlashText = "";
    }

    if (!active || !this.activeRide) {
      return;
    }

    if (this.state === RideState.DrivingToPickup) {
      if (distanceXZ(player.root.position, this.activeRide.pickupPoint.position) <= GAME_CONFIG.ride.pickupRadius) {
        this.pickUpPassenger();
      }
      return;
    }

    if (this.state === RideState.PassengerOnboard) {
      this.passengerElapsed += deltaTime;
      this.tipTimeMultiplier = clamp(
        this.tipTimeMultiplier - GAME_CONFIG.ride.fare.tipDecayPercentPerSecond * deltaTime,
        0,
        1,
      );
      this.collisionCooldown = Math.max(0, this.collisionCooldown - deltaTime);
      this.applySpeedRule(deltaTime, player.getSpeedMph());
      if (distanceXZ(player.root.position, this.activeRide.destinationPoint.position) <= GAME_CONFIG.ride.destinationRadius) {
        this.completeRide();
      }
    }
  }

  registerTrafficCollision(speedMph: number): void {
    if (this.state !== RideState.PassengerOnboard || !this.activeRide || this.collisionCooldown > 0) {
      return;
    }
    if (speedMph < GAME_CONFIG.ride.satisfaction.collisionSpeedThresholdMph) {
      return;
    }
    const penalty = this.rulesFor(this.activeRide.passengerType).collisionPenalty;
    this.satisfaction = clamp(this.satisfaction - penalty, 0, 100);
    this.collisionCooldown = GAME_CONFIG.ride.satisfaction.collisionCooldownSeconds;
    this.collisionFlashText = `COLLISION -${penalty}`;
    this.collisionFlashSeconds = 1.2;
  }

  getObjectivePosition(): Vector3 | null {
    if (!this.activeRide) {
      return null;
    }
    if (this.state === RideState.DrivingToPickup) {
      return this.activeRide.pickupPoint.position;
    }
    if (this.state === RideState.PassengerOnboard) {
      return this.activeRide.destinationPoint.position;
    }
    return null;
  }

  getCurrentTip(): number {
    if (!this.activeRide) {
      return 0;
    }
    return this.calculateTip(this.activeRide.baseFare, this.satisfaction, this.tipTimeMultiplier);
  }

  getStars(): number {
    return RideManager.satisfactionToStars(this.satisfaction);
  }

  isSpeedWarning(speedMph: number): boolean {
    if (this.state !== RideState.PassengerOnboard || !this.activeRide) {
      return false;
    }
    const rules = this.rulesFor(this.activeRide.passengerType);
    if (rules.maxSafeSpeedMph !== undefined) {
      return speedMph > rules.maxSafeSpeedMph;
    }
    if (rules.minRequiredSpeedMph !== undefined) {
      const grace = rules.gracePeriodSeconds ?? 0;
      return this.passengerElapsed > grace && speedMph < rules.minRequiredSpeedMph;
    }
    return false;
  }

  getSpeedWarningLabel(speedMph: number): string {
    if (!this.isSpeedWarning(speedMph) || !this.activeRide) {
      return `${Math.round(speedMph)} MPH`;
    }
    if (this.activeRide.passengerType === PassengerType.SpeedDemon) {
      return `${Math.round(speedMph)} MPH - TOO SLOW`;
    }
    return `${Math.round(speedMph)} MPH - TOO FAST`;
  }

  dispose(): void {
    this.marker?.dispose();
    this.markerMaterial?.dispose();
    this.marker = null;
    this.markerMaterial = null;
  }

  static satisfactionToStars(score: number): number {
    if (score <= 0) {
      return 0;
    }
    return Math.ceil(score / 20);
  }

  private pickUpPassenger(): void {
    if (!this.activeRide) {
      return;
    }
    this.state = RideState.PassengerOnboard;
    this.satisfaction = GAME_CONFIG.ride.satisfaction.startingScore;
    this.passengerElapsed = 0;
    this.tipTimeMultiplier = 1;
    this.collisionCooldown = 0;
    this.showMarker(this.activeRide.destinationPoint.position, new Color3(0.2, 0.95, 0.4), "ride-destination-marker");
  }

  private applySpeedRule(deltaTime: number, speedMph: number): void {
    if (!this.activeRide) {
      return;
    }
    const rules = this.rulesFor(this.activeRide.passengerType);
    let penalized = false;
    if (rules.maxSafeSpeedMph !== undefined && speedMph > rules.maxSafeSpeedMph) {
      penalized = true;
    }
    if (rules.minRequiredSpeedMph !== undefined) {
      const grace = rules.gracePeriodSeconds ?? 0;
      penalized = this.passengerElapsed > grace && speedMph < rules.minRequiredSpeedMph;
    }
    if (penalized) {
      this.satisfaction = clamp(this.satisfaction - rules.speedPenaltyPerSecond * deltaTime, 0, 100);
    }
  }

  private completeRide(): void {
    if (!this.activeRide) {
      return;
    }
    const baseFare = this.activeRide.baseFare;
    const tip = this.calculateTip(baseFare, this.satisfaction, this.tipTimeMultiplier);
    const total = baseFare + tip;
    this.profile.completeRide(total);
    this.lastResult = {
      passengerName: this.activeRide.passengerName,
      passengerType: this.activeRide.passengerType,
      stars: this.getStars(),
      baseFare,
      tip,
      total,
    };
    this.resultTimeRemaining = GAME_CONFIG.ride.rideResultSeconds;
    this.marker?.setEnabled(false);
    this.activeRide = null;
    this.state = RideState.Idle;
    this.satisfaction = GAME_CONFIG.ride.satisfaction.startingScore;
    this.passengerElapsed = 0;
    this.tipTimeMultiplier = 1;
    this.collisionCooldown = 0;
    this.offers.refillOffers();
  }

  private calculateTip(baseFare: number, satisfaction: number, timeMultiplier: number): number {
    return baseFare * GAME_CONFIG.ride.fare.maxTipPercent * (satisfaction / 100) * timeMultiplier;
  }

  private rulesFor(type: PassengerType): PassengerRules {
    if (type === PassengerType.ScaredyCat) {
      return GAME_CONFIG.ride.satisfaction.scaredyCat;
    }
    if (type === PassengerType.SpeedDemon) {
      return GAME_CONFIG.ride.satisfaction.speedDemon;
    }
    return GAME_CONFIG.ride.satisfaction.normal;
  }

  private showMarker(position: Vector3, color: Color3, name: string): void {
    if (!this.marker || !this.markerMaterial) {
      this.markerMaterial = new StandardMaterial("ride-marker-mat", this.scene);
      this.markerMaterial.alpha = 0.55;

      const disc = MeshBuilder.CreateCylinder("ride-marker", {
        diameter: GAME_CONFIG.ride.pickupRadius * 2,
        height: 0.18,
        tessellation: 32,
      }, this.scene);
      disc.material = this.markerMaterial;

      const beam = MeshBuilder.CreateCylinder("ride-marker-beam", {
        diameter: 2.2,
        height: 22,
        tessellation: 16,
      }, this.scene);
      beam.parent = disc;
      beam.position.set(0, 11, 0);
      beam.material = this.markerMaterial;
      this.marker = disc;
    }

    this.marker.name = name;
    this.marker.position.set(position.x, 0.14, position.z);
    this.markerMaterial.diffuseColor.copyFrom(color);
    this.markerMaterial.emissiveColor.copyFrom(color).scaleInPlace(0.65);
    this.marker.setEnabled(true);
  }
}
