import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { GAME_CONFIG } from "../game/config";
import type { DeliveryPoint, PoliceCitation } from "../game/types";
import type { PlayerCar } from "../player/PlayerCar";
import type { PlayerProfile } from "../player/PlayerProfile";
import { clamp, distanceXZ, seededRandom } from "../utils/math";

export enum PackageDeliveryState {
  Idle = "IDLE",
  DrivingToPickup = "DRIVING_TO_PICKUP",
  CarryingPackage = "CARRYING_PACKAGE",
}

export interface PackageDeliveryOffer {
  id: string;
  pickupPoint: DeliveryPoint;
  destinationPoint: DeliveryPoint;
  pickupDistance: number;
  tripDistance: number;
  initialPayout: number;
}

export interface PackageDeliveryResult {
  initialPayout: number;
  payout: number;
  pickupDistance: number;
  tripDistance: number;
  durationSeconds: number;
}

export class PackageDeliveryManager {
  state = PackageDeliveryState.Idle;
  offer: PackageDeliveryOffer;
  activeOffer: PackageDeliveryOffer | null = null;
  elapsedSeconds = 0;
  lastResult: PackageDeliveryResult | null = null;
  resultTimeRemaining = 0;
  private readonly rng = seededRandom(GAME_CONFIG.packageDelivery.offerSeed);
  private nextId = 1;
  private marker: Mesh | null = null;
  private markerMaterial: StandardMaterial | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly points: readonly DeliveryPoint[],
    private readonly player: PlayerCar,
    private readonly profile: PlayerProfile,
  ) {
    this.offer = this.generateOffer();
  }

  get isActive(): boolean {
    return this.activeOffer !== null;
  }

  get payoutMultiplier(): number {
    return clamp(1 - this.elapsedSeconds * GAME_CONFIG.packageDelivery.fareDecayPercentPerSecond, 0, 1);
  }

  get currentRatePerMeter(): number {
    return GAME_CONFIG.packageDelivery.ratePerMeter * this.payoutMultiplier;
  }

  get currentPayout(): number {
    return (this.activeOffer?.initialPayout ?? this.offer.initialPayout) * this.payoutMultiplier;
  }

  acceptOffer(id: string): boolean {
    if (this.isActive || this.offer.id !== id) return false;
    this.activeOffer = this.offer;
    this.state = PackageDeliveryState.DrivingToPickup;
    this.elapsedSeconds = 0;
    this.lastResult = null;
    this.resultTimeRemaining = 0;
    this.showMarker(this.offer.pickupPoint.position, new Color3(1, 0.62, 0.12), "package-pickup-marker");
    return true;
  }

  update(deltaTime: number): void {
    this.resultTimeRemaining = Math.max(0, this.resultTimeRemaining - deltaTime);
    if (!this.activeOffer) {
      this.offer.pickupDistance = this.distanceInMeters(this.player.root.position, this.offer.pickupPoint.position);
      if (this.offer.pickupDistance > GAME_CONFIG.packageDelivery.maxPickupDistance
        && this.points.some((point) => this.distanceInMeters(this.player.root.position, point.position)
          <= GAME_CONFIG.packageDelivery.maxPickupDistance)) {
        this.offer = this.generateOffer();
      }
      return;
    }

    this.elapsedSeconds += deltaTime;
    if (this.state === PackageDeliveryState.DrivingToPickup
      && distanceXZ(this.player.root.position, this.activeOffer.pickupPoint.position) <= GAME_CONFIG.packageDelivery.pickupRadius) {
      this.state = PackageDeliveryState.CarryingPackage;
      this.showMarker(this.activeOffer.destinationPoint.position, new Color3(0.72, 0.35, 1), "package-dropoff-marker");
      return;
    }
    if (this.state === PackageDeliveryState.CarryingPackage
      && distanceXZ(this.player.root.position, this.activeOffer.destinationPoint.position) <= GAME_CONFIG.packageDelivery.dropoffRadius) {
      this.completeDelivery();
    }
  }

  getObjectivePosition(): Vector3 | null {
    if (!this.activeOffer) return null;
    return this.state === PackageDeliveryState.DrivingToPickup
      ? this.activeOffer.pickupPoint.position
      : this.activeOffer.destinationPoint.position;
  }

  confiscateForPolice(citation: PoliceCitation): boolean {
    if (!this.activeOffer) return false;
    this.finishActivity();
    const possessionFine = GAME_CONFIG.packageDelivery.possessionFine;
    const possessionAmountPaid = this.profile.spend(possessionFine);
    this.profile.saveNow();
    citation.packageConfiscated = true;
    citation.possessionFine = possessionFine;
    citation.possessionAmountPaid = possessionAmountPaid;
    citation.remainingBalance = this.profile.money;
    return true;
  }

  dispose(): void {
    this.marker?.dispose();
    this.markerMaterial?.dispose();
    this.marker = null;
    this.markerMaterial = null;
  }

  private completeDelivery(): void {
    if (!this.activeOffer) return;
    const payout = this.currentPayout;
    this.lastResult = {
      initialPayout: this.activeOffer.initialPayout,
      payout,
      pickupDistance: this.activeOffer.pickupDistance,
      tripDistance: this.activeOffer.tripDistance,
      durationSeconds: this.elapsedSeconds,
    };
    this.profile.addMoney(payout);
    this.resultTimeRemaining = GAME_CONFIG.packageDelivery.resultSeconds;
    this.finishActivity();
  }

  private finishActivity(): void {
    this.marker?.setEnabled(false);
    this.activeOffer = null;
    this.state = PackageDeliveryState.Idle;
    this.elapsedSeconds = 0;
    this.offer = this.generateOffer();
  }

  private generateOffer(): PackageDeliveryOffer {
    const pickupPoint = this.pickPickupPoint();
    const destinationPoint = this.pickDestination(pickupPoint);
    const pickupDistance = this.distanceInMeters(this.player.root.position, pickupPoint.position);
    const tripDistance = this.distanceInMeters(pickupPoint.position, destinationPoint.position);
    return {
      id: `package-delivery-${this.nextId++}`,
      pickupPoint,
      destinationPoint,
      pickupDistance,
      tripDistance,
      initialPayout: tripDistance * GAME_CONFIG.packageDelivery.ratePerMeter,
    };
  }

  private pickPickupPoint(): DeliveryPoint {
    const candidates = this.points.filter((point) => {
      return this.distanceInMeters(this.player.root.position, point.position)
        <= GAME_CONFIG.packageDelivery.maxPickupDistance;
    });
    if (candidates.length > 0) return candidates[Math.floor(this.rng() * candidates.length)];
    return this.points.reduce((nearest, point) => {
      return distanceXZ(this.player.root.position, point.position) < distanceXZ(this.player.root.position, nearest.position)
        ? point
        : nearest;
    });
  }

  private pickDestination(pickup: DeliveryPoint): DeliveryPoint {
    const config = GAME_CONFIG.packageDelivery;
    const candidates = this.points.filter((point) => {
      const distance = this.distanceInMeters(pickup.position, point.position);
      return point !== pickup && distance >= config.minDropoffDistance && distance <= config.maxDropoffDistance;
    });
    if (candidates.length > 0) return candidates[Math.floor(this.rng() * candidates.length)];
    const targetDistance = (config.minDropoffDistance + config.maxDropoffDistance) / 2;
    return this.points.filter((point) => point !== pickup).reduce((nearest, point) => {
      const nearestDelta = Math.abs(this.distanceInMeters(pickup.position, nearest.position) - targetDistance);
      const pointDelta = Math.abs(this.distanceInMeters(pickup.position, point.position) - targetDistance);
      return pointDelta < nearestDelta ? point : nearest;
    });
  }

  private distanceInMeters(a: Vector3, b: Vector3): number {
    return distanceXZ(a, b) * GAME_CONFIG.ride.metersPerWorldUnit;
  }

  private showMarker(position: Vector3, color: Color3, name: string): void {
    if (!this.marker || !this.markerMaterial) {
      this.markerMaterial = new StandardMaterial("package-marker-material", this.scene);
      this.markerMaterial.alpha = 0.62;
      const marker = MeshBuilder.CreateCylinder("package-marker", {
        diameter: GAME_CONFIG.packageDelivery.pickupRadius * 2,
        height: 0.18,
        tessellation: 32,
      }, this.scene);
      const beam = MeshBuilder.CreateCylinder("package-marker-beam", {
        diameter: 2.2,
        height: 24,
        tessellation: 16,
      }, this.scene);
      beam.parent = marker;
      beam.position.set(0, 12, 0);
      beam.material = this.markerMaterial;
      marker.material = this.markerMaterial;
      this.marker = marker;
    }
    this.marker.name = name;
    this.marker.position.set(position.x, 0.14, position.z);
    this.markerMaterial.diffuseColor.copyFrom(color);
    this.markerMaterial.emissiveColor.copyFrom(color).scaleInPlace(0.65);
    this.marker.setEnabled(true);
  }
}
