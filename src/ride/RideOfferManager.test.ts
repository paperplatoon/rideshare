import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../game/config";
import { PlayerCar } from "../player/PlayerCar";
import { TownGenerator } from "../world/Town";
import { RideOfferManager } from "./RideOfferManager";

describe("RideOfferManager", () => {
  it("maintains distinct trip tiers and rotates the oldest offer", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const town = new TownGenerator(scene).generate();
    const player = new PlayerCar(scene, town.roadSpawnPoints);
    const offers = new RideOfferManager(town.deliveryPoints, player);

    expect(offers.offers.map((offer) => offer.tier)).toEqual(["SHORT", "MEDIUM", "LONG"]);
    for (const offer of offers.offers) {
      const config = offer.tier === "SHORT"
        ? GAME_CONFIG.ride.tripTiers.short
        : offer.tier === "MEDIUM"
          ? GAME_CONFIG.ride.tripTiers.medium
          : GAME_CONFIG.ride.tripTiers.long;
      expect(offer.tripDistance).toBeGreaterThanOrEqual(config.minDistance);
      expect(offer.tripDistance).toBeLessThanOrEqual(config.maxDistance);
      expect(offer.pickupDistance).toBeLessThanOrEqual(GAME_CONFIG.ride.maxPickupDistance);
    }

    const oldestId = offers.offers[2].id;
    offers.update(GAME_CONFIG.ride.offerLifetimeSeconds, true);
    expect(offers.offers[0].id).not.toBe(oldestId);
    expect(offers.offers).toHaveLength(3);
    scene.dispose();
    engine.dispose();
  });
});
