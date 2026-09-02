import type { DeliveryPoint, RideOffer } from "../game/types";
import {
  getMissionLicense,
  type MissionLicenseId,
} from "../missions/MissionLicenseCatalog";
import type { PlayerCar } from "../player/PlayerCar";
import { RideOfferManager } from "./RideOfferManager";

export class RideOfferBoard {
  private readonly pools = new Map<MissionLicenseId, RideOfferManager>();

  constructor(private readonly points: DeliveryPoint[], private readonly player: PlayerCar) {}

  ensurePool(categoryId: MissionLicenseId): RideOfferManager | null {
    const existing = this.pools.get(categoryId);
    if (existing) return existing;
    const category = getMissionLicense(categoryId);
    if (!category || category.activityType !== "passengerRide") return null;
    const pool = new RideOfferManager(this.points, this.player, category);
    this.pools.set(categoryId, pool);
    return pool;
  }

  getOffers(categoryId: MissionLicenseId): readonly RideOffer[] {
    return this.pools.get(categoryId)?.offers ?? [];
  }

  update(deltaTime: number, canUpdate: boolean, ownedCategoryIds: readonly MissionLicenseId[]): void {
    for (const categoryId of ownedCategoryIds) {
      this.ensurePool(categoryId)?.update(deltaTime, canUpdate);
    }
  }

  acceptOffer(categoryId: MissionLicenseId, offerId: string): RideOffer | null {
    return this.pools.get(categoryId)?.acceptOffer(offerId) ?? null;
  }

  refillOffers(categoryId: MissionLicenseId): void {
    this.pools.get(categoryId)?.refillOffers();
  }
}
