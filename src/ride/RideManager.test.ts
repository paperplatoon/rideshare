import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { PassengerType, RideState } from "../game/types";
import { PlayerCar } from "../player/PlayerCar";
import { PlayerProfile } from "../player/PlayerProfile";
import { TownGenerator } from "../world/Town";
import { RideManager } from "./RideManager";
import { RideOfferBoard } from "./RideOfferBoard";

describe("RideManager", () => {
  it("completes pickup and dropoff while reusing marker resources", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const town = new TownGenerator(scene).generate();
    const player = new PlayerCar(scene, town.roadSpawnPoints);
    const board = new RideOfferBoard(town.deliveryPoints, player);
    const offers = board.ensurePool("rideshare")!;
    const profile = new PlayerProfile();
    const rides = new RideManager(scene, board, profile);
    const offer = offers.offers[0];

    expect(rides.acceptRide("rideshare", offer.id)).toBe(true);
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
    expect(profile.rideHistory).toHaveLength(1);
    expect(profile.rideHistory[0].passengerName).toBe(offer.passengerName);
    expect(profile.rideHistory[0].rideTier).toBe(offer.tier);
    expect(profile.rideHistory[0].missionCategoryId).toBe("rideshare");
    expect(profile.rideHistory[0].tripDistance).toBe(offer.tripDistance);
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
    const board = new RideOfferBoard(town.deliveryPoints, player);
    const offers = board.ensurePool("rideshare")!;
    const profile = new PlayerProfile();
    const rides = new RideManager(scene, board, profile);
    const offer = offers.offers[0];

    expect(rides.acceptRide("rideshare", offer.id)).toBe(true);
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

  it("reduces tip by two percent per violation point accumulated with the passenger onboard", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const town = new TownGenerator(scene).generate();
    const player = new PlayerCar(scene, town.roadSpawnPoints);
    const board = new RideOfferBoard(town.deliveryPoints, player);
    const offers = board.ensurePool("rideshare")!;
    const profile = new PlayerProfile();
    const rides = new RideManager(scene, board, profile);
    const offer = offers.offers[0];

    expect(rides.acceptRide("rideshare", offer.id)).toBe(true);
    player.root.position.copyFrom(offer.pickupPoint.position);
    rides.update(0, player, true, 10);
    const startingTip = rides.getCurrentTip();
    const startingStars = rides.getStars();

    rides.update(0, player, true, 12.5);
    expect(rides.currentViolationPoints).toBe(2.5);
    expect(rides.violationTipPenaltyPercent).toBeCloseTo(5);
    expect(rides.getCurrentTip()).toBeCloseTo(startingTip * 0.95);
    expect(rides.getStars()).toBe(startingStars);

    rides.update(0, player, true, 100);
    expect(rides.violationTipPenaltyPercent).toBe(100);
    expect(rides.getCurrentTip()).toBe(0);

    player.root.position.copyFrom(offer.destinationPoint.position);
    rides.update(0, player, true, 100);
    expect(rides.lastResult?.violationTipPenaltyPercent).toBe(100);
    expect(rides.lastResult?.tip).toBe(0);
    rides.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("gives Silver rides a 65 percent maximum tip with four times the violation penalty", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const town = new TownGenerator(scene).generate();
    const player = new PlayerCar(scene, town.roadSpawnPoints);
    const board = new RideOfferBoard(town.deliveryPoints, player);
    const offers = board.ensurePool("rideshare_silver")!;
    const profile = new PlayerProfile();
    const rides = new RideManager(scene, board, profile);
    const offer = offers.offers[0];

    expect(rides.acceptRide("rideshare_silver", offer.id)).toBe(true);
    player.root.position.copyFrom(offer.pickupPoint.position);
    rides.update(0, player, true, 5);
    const maximumTip = offer.baseFare * 0.65;
    expect(rides.getCurrentTip()).toBeCloseTo(maximumTip);

    rides.update(0, player, true, 7);
    expect(rides.currentViolationPoints).toBe(2);
    expect(rides.violationTipPenaltyPercent).toBeCloseTo(16);
    expect(rides.getCurrentTip()).toBeCloseTo(maximumTip * 0.84);

    rides.dispose();
    scene.dispose();
    engine.dispose();
  });
});
