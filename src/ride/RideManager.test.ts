import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { PassengerType, RideState } from "../game/types";
import { PlayerCar } from "../player/PlayerCar";
import { PlayerProfile } from "../player/PlayerProfile";
import { TownGenerator } from "../world/Town";
import { RideManager } from "./RideManager";
import { RideOfferManager } from "./RideOfferManager";

describe("RideManager", () => {
  it("completes pickup and dropoff while reusing marker resources", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const town = new TownGenerator(scene).generate();
    const player = new PlayerCar(scene, town.roadSpawnPoints);
    const offers = new RideOfferManager(town.deliveryPoints, player);
    const profile = new PlayerProfile();
    const rides = new RideManager(scene, offers, profile);
    const offer = offers.offers[0];

    expect(rides.acceptRide(offer.id)).toBe(true);
    const materialCount = scene.materials.length;
    player.root.position.copyFrom(offer.pickupPoint.position);
    rides.update(1 / 60, player, true);
    expect(rides.state).toBe(RideState.PassengerOnboard);
    expect(scene.materials.length).toBe(materialCount);

    player.root.position.copyFrom(offer.destinationPoint.position);
    rides.update(1 / 60, player, true);
    expect(rides.state).toBe(RideState.Idle);
    expect(profile.completedRides).toBe(1);
    expect(profile.money).toBeGreaterThan(0);
    expect(Object.values(PassengerType)).toContain(rides.lastResult?.passengerType);
    rides.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("decays tip dollars over passenger time without changing safety stars", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const town = new TownGenerator(scene).generate();
    const player = new PlayerCar(scene, town.roadSpawnPoints);
    const offers = new RideOfferManager(town.deliveryPoints, player);
    const profile = new PlayerProfile();
    const rides = new RideManager(scene, offers, profile);
    const offer = offers.offers[0];

    expect(rides.acceptRide(offer.id)).toBe(true);
    player.root.position.copyFrom(offer.pickupPoint.position);
    rides.update(1 / 60, player, true);

    const startingTip = rides.getCurrentTip();
    const startingStars = rides.getStars();
    rides.update(2, player, true);

    expect(rides.getCurrentTip()).toBeCloseTo(startingTip * 0.99, 4);
    expect(rides.getStars()).toBe(startingStars);
    rides.dispose();
    scene.dispose();
    engine.dispose();
  });
});
