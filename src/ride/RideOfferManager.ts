import { GAME_CONFIG } from "../game/config";
import { PassengerType, type DeliveryPoint, type RideOffer, type RideTier } from "../game/types";
import { distanceXZ, pickWeighted, randomBetween, seededRandom } from "../utils/math";
import type { PlayerCar } from "../player/PlayerCar";

const FIRST_NAMES = [
  "Amanda",
  "Marcus",
  "Daniel",
  "Sarah",
  "Chris",
  "Nina",
  "Sophie",
  "Jordan",
  "Priya",
  "Leo",
  "Maya",
  "Ethan",
  "Riley",
  "Taylor",
  "Dante",
  "Mina",
];

const LAST_INITIALS = ["A.", "B.", "C.", "D.", "G.", "K.", "L.", "M.", "R.", "S.", "T.", "V.", "W."];
const OFFER_TIERS: RideTier[] = ["SHORT", "MEDIUM", "LONG"];

export class RideOfferManager {
  readonly offers: RideOffer[] = [];
  private readonly rng = seededRandom(7419);
  private nextId = 1;
  private distanceRefreshElapsed = 0;

  constructor(private readonly points: DeliveryPoint[], private readonly player: PlayerCar) {
    for (let i = 0; i < OFFER_TIERS.length; i++) {
      const stagger = (GAME_CONFIG.ride.offerCount - i - 1) * -GAME_CONFIG.ride.offerLifetimeSeconds;
      this.offers.push(this.generateOffer(OFFER_TIERS[i], stagger));
    }
  }

  update(deltaTime: number, canUpdate: boolean): void {
    if (!canUpdate) {
      return;
    }

    this.distanceRefreshElapsed += deltaTime;
    if (this.distanceRefreshElapsed >= GAME_CONFIG.ride.offerDistanceRefreshSeconds) {
      this.distanceRefreshElapsed = 0;
      this.refreshPickupDistances();
    }

    for (const offer of this.offers) {
      offer.ageSeconds += deltaTime;
    }

    const oldest = this.offers[this.offers.length - 1];
    if (oldest.ageSeconds >= GAME_CONFIG.ride.offerLifetimeSeconds) {
      const expiredTier = oldest.tier;
      this.offers.pop();
      this.offers.unshift(this.generateOffer(expiredTier, -GAME_CONFIG.ride.offerLifetimeSeconds * (GAME_CONFIG.ride.offerCount - 1)));
    }
  }

  acceptOffer(id: string): RideOffer | null {
    const offer = this.offers.find((candidate) => candidate.id === id) ?? null;
    if (!offer) {
      return null;
    }
    this.offers.length = 0;
    return offer;
  }

  refillOffers(): void {
    this.offers.length = 0;
    this.distanceRefreshElapsed = 0;
    for (let i = 0; i < OFFER_TIERS.length; i++) {
      const stagger = (GAME_CONFIG.ride.offerCount - i - 1) * -GAME_CONFIG.ride.offerLifetimeSeconds;
      this.offers.push(this.generateOffer(OFFER_TIERS[i], stagger));
    }
  }

  private generateOffer(tier: RideTier, ageSeconds = 0): RideOffer {
    const pickupPoint = this.pickPickupPoint();
    const destinationPoint = this.pickDestination(pickupPoint, tier);
    const pickupDistance = distanceXZ(this.player.root.position, pickupPoint.position) * GAME_CONFIG.ride.metersPerWorldUnit;
    const tripDistance = distanceXZ(pickupPoint.position, destinationPoint.position) * GAME_CONFIG.ride.metersPerWorldUnit;
    const fareMultiplier = randomBetween(
      this.rng,
      GAME_CONFIG.ride.fare.randomMultiplierMin,
      GAME_CONFIG.ride.fare.randomMultiplierMax,
    );
    const effectiveDistance = tripDistance + pickupDistance * GAME_CONFIG.ride.fare.pickupDistanceWeight;
    const baseFare = (GAME_CONFIG.ride.fare.baseFare + effectiveDistance * GAME_CONFIG.ride.fare.ratePerMeter) * fareMultiplier;

    return {
      id: `ride-${this.nextId++}`,
      tier,
      passengerName: this.generateName(),
      passengerType: this.pickPassengerType(),
      pickupPoint,
      destinationPoint,
      pickupDistance,
      tripDistance,
      fareMultiplier,
      baseFare,
      ageSeconds,
    };
  }

  private pickPickupPoint(): DeliveryPoint {
    const maxDistance = GAME_CONFIG.ride.maxPickupDistance;
    const candidates = this.points.filter((point) => {
      return distanceXZ(this.player.root.position, point.position) * GAME_CONFIG.ride.metersPerWorldUnit <= maxDistance;
    });
    if (candidates.length > 0) {
      return candidates[Math.floor(this.rng() * candidates.length)];
    }
    return this.points.reduce((nearest, point) => {
      const nearestDistance = distanceXZ(this.player.root.position, nearest.position);
      const pointDistance = distanceXZ(this.player.root.position, point.position);
      return pointDistance < nearestDistance ? point : nearest;
    });
  }

  private pickDestination(pickup: DeliveryPoint, tier: RideTier): DeliveryPoint {
    const band = this.bandFor(tier);
    const candidates = this.points.filter((point) => {
      const distance = distanceXZ(point.position, pickup.position) * GAME_CONFIG.ride.metersPerWorldUnit;
      return point !== pickup && distance >= band.minDistance && distance <= band.maxDistance;
    });
    if (candidates.length > 0) {
      return candidates[Math.floor(this.rng() * candidates.length)];
    }

    const targetDistance = (band.minDistance + band.maxDistance) / 2;
    return this.points
      .filter((point) => point !== pickup)
      .reduce((best, point) => {
        const bestDistance = Math.abs(distanceXZ(best.position, pickup.position) * GAME_CONFIG.ride.metersPerWorldUnit - targetDistance);
        const pointDistance = Math.abs(distanceXZ(point.position, pickup.position) * GAME_CONFIG.ride.metersPerWorldUnit - targetDistance);
        return pointDistance < bestDistance ? point : best;
      });
  }

  private generateName(): string {
    const first = FIRST_NAMES[Math.floor(this.rng() * FIRST_NAMES.length)];
    const last = LAST_INITIALS[Math.floor(this.rng() * LAST_INITIALS.length)];
    return `${first} ${last}`;
  }

  private pickPassengerType(): PassengerType {
    const key = pickWeighted(this.rng, GAME_CONFIG.ride.passengerWeights);
    if (key === "scaredyCat") return PassengerType.ScaredyCat;
    if (key === "speedDemon") return PassengerType.SpeedDemon;
    return PassengerType.Normal;
  }

  private refreshPickupDistances(): void {
    for (const offer of this.offers) {
      offer.pickupDistance = distanceXZ(this.player.root.position, offer.pickupPoint.position) * GAME_CONFIG.ride.metersPerWorldUnit;
    }
  }

  private bandFor(tier: RideTier): { minDistance: number; maxDistance: number } {
    if (tier === "SHORT") return GAME_CONFIG.ride.tripTiers.short;
    if (tier === "MEDIUM") return GAME_CONFIG.ride.tripTiers.medium;
    return GAME_CONFIG.ride.tripTiers.long;
  }
}
