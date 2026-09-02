import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../game/config";
import { PlayerCar } from "../player/PlayerCar";
import { TownGenerator } from "../world/Town";
import { getMissionLicense } from "../missions/MissionLicenseCatalog";
import { RideOfferManager } from "./RideOfferManager";

describe("RideOfferManager", () => {
  it("generates random trip tiers without allowing all three to match", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const town = new TownGenerator(scene).generate();
    const player = new PlayerCar(scene, town.roadSpawnPoints);
    const rideshare = getMissionLicense("rideshare")!;
    const offers = new RideOfferManager(town.deliveryPoints, player, rideshare);

    expect(offers.offers).toHaveLength(3);
    expect(new Set(offers.offers.map((offer) => offer.tier)).size).toBeGreaterThan(1);
    for (const offer of offers.offers) {
      const config = offer.tier === "SHORT"
        ? GAME_CONFIG.ride.tripTiers.short
        : offer.tier === "MEDIUM"
          ? GAME_CONFIG.ride.tripTiers.medium
          : GAME_CONFIG.ride.tripTiers.long;
      expect(offer.tripDistance).toBeGreaterThanOrEqual(config.minDistance);
      expect(offer.tripDistance).toBeLessThanOrEqual(config.maxDistance);
      expect(offer.pickupDistance).toBeLessThanOrEqual(GAME_CONFIG.ride.maxPickupDistance);
      expect(offer.missionCategoryId).toBe("rideshare");
    }

    const oldestId = offers.offers[2].id;
    offers.update(GAME_CONFIG.ride.offerLifetimeSeconds, true);
    expect(offers.offers[0].id).not.toBe(oldestId);
    expect(offers.offers).toHaveLength(3);
    expect(new Set(offers.offers.map((offer) => offer.tier)).size).toBeGreaterThan(1);
    for (let index = 0; index < 25; index++) {
      offers.refillOffers();
      expect(new Set(offers.offers.map((offer) => offer.tier)).size).toBeGreaterThan(1);
    }
    scene.dispose();
    engine.dispose();
  });

  it("applies each category multiplier after the standard fare calculation", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const town = new TownGenerator(scene).generate();
    const player = new PlayerCar(scene, town.roadSpawnPoints);

    for (const id of ["rideshare", "taxi", "rideshare_silver"] as const) {
      const category = getMissionLicense(id)!;
      const manager = new RideOfferManager(town.deliveryPoints, player, category);
      for (const offer of manager.offers) {
        const effectiveDistance = offer.tripDistance
          + offer.pickupDistance * GAME_CONFIG.ride.fare.pickupDistanceWeight;
        const standardFare = (GAME_CONFIG.ride.fare.baseFare
          + effectiveDistance * GAME_CONFIG.ride.fare.ratePerMeter)
          * offer.fareMultiplier;
        expect(offer.baseFare).toBeCloseTo(standardFare * category.fareMultiplier);
      }
    }
    scene.dispose();
    engine.dispose();
  });
});
