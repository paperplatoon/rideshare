import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../game/config";
import { PlayerCar } from "../player/PlayerCar";
import { TownGenerator } from "../world/Town";
import { RideOfferBoard } from "./RideOfferBoard";

describe("RideOfferBoard", () => {
  it("keeps category pools isolated when one pool rotates or accepts an offer", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const town = new TownGenerator(scene).generate();
    const player = new PlayerCar(scene, town.roadSpawnPoints);
    const board = new RideOfferBoard(town.deliveryPoints, player);
    const rideshare = board.ensurePool("rideshare")!;
    const taxi = board.ensurePool("taxi")!;
    const silver = board.ensurePool("rideshare_silver")!;
    const rideshareIds = rideshare.offers.map((offer) => offer.id);
    const silverIds = silver.offers.map((offer) => offer.id);

    taxi.update(GAME_CONFIG.ride.offerLifetimeSeconds, true);
    expect(rideshare.offers.map((offer) => offer.id)).toEqual(rideshareIds);
    expect(silver.offers.map((offer) => offer.id)).toEqual(silverIds);

    const accepted = board.acceptOffer("taxi", taxi.offers[0].id);
    expect(accepted?.missionCategoryId).toBe("taxi");
    expect(taxi.offers).toHaveLength(0);
    expect(rideshare.offers).toHaveLength(3);
    expect(silver.offers).toHaveLength(3);
    scene.dispose();
    engine.dispose();
  });
});
