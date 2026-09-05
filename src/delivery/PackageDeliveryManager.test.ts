import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../game/config";
import type { PoliceCitation } from "../game/types";
import { PlayerCar } from "../player/PlayerCar";
import { PlayerProfile } from "../player/PlayerProfile";
import { TownGenerator } from "../world/Town";
import { PackageDeliveryManager, PackageDeliveryState } from "./PackageDeliveryManager";

describe("PackageDeliveryManager", () => {
  it("maintains one offer within the configured pickup and delivery ranges", () => {
    const fixture = createFixture();
    const offer = fixture.manager.offer;

    expect(offer.pickupDistance).toBeLessThanOrEqual(GAME_CONFIG.packageDelivery.maxPickupDistance);
    expect(offer.tripDistance).toBeGreaterThanOrEqual(GAME_CONFIG.packageDelivery.minDropoffDistance);
    expect(offer.tripDistance).toBeLessThanOrEqual(GAME_CONFIG.packageDelivery.maxDropoffDistance);
    expect(offer.initialPayout).toBeCloseTo(offer.tripDistance * GAME_CONFIG.packageDelivery.ratePerMeter);
    const roadsById = new Map(fixture.town.roads.map((road) => [road.id, road]));
    expect(roadsById.get(offer.pickupPoint.roadId)?.allowsMissionStops).toBe(true);
    expect(roadsById.get(offer.destinationPoint.roadId)?.allowsMissionStops).toBe(true);
    fixture.manager.update(30);
    expect(fixture.manager.offer.id).toBe(offer.id);
    fixture.dispose();
  });

  it("decays payout from acceptance through pickup and pays the remainder at dropoff", () => {
    const fixture = createFixture();
    const offer = fixture.manager.offer;
    const startingMoney = fixture.profile.money;
    expect(fixture.manager.acceptOffer(offer.id)).toBe(true);

    fixture.manager.update(20);
    expect(fixture.manager.payoutMultiplier).toBeCloseTo(
      1 - 20 * GAME_CONFIG.packageDelivery.fareDecayPercentPerSecond,
    );

    fixture.player.root.position.copyFrom(offer.pickupPoint.position);
    fixture.manager.update(0);
    expect(fixture.manager.state).toBe(PackageDeliveryState.CarryingPackage);
    fixture.player.root.position.copyFrom(offer.destinationPoint.position);
    fixture.manager.update(0);

    const expectedPayout = offer.initialPayout
      * (1 - 20 * GAME_CONFIG.packageDelivery.fareDecayPercentPerSecond);
    expect(fixture.manager.state).toBe(PackageDeliveryState.Idle);
    expect(fixture.manager.lastResult?.payout).toBeCloseTo(expectedPayout);
    expect(fixture.profile.money).toBeCloseTo(startingMoney + expectedPayout);
    expect(fixture.manager.offer.id).not.toBe(offer.id);
    fixture.dispose();
  });

  it("confiscates an active package and applies the configured possession fine", () => {
    const fixture = createFixture();
    fixture.profile.money = GAME_CONFIG.packageDelivery.possessionFine / 2;
    expect(fixture.manager.acceptOffer(fixture.manager.offer.id)).toBe(true);
    const citation: PoliceCitation = {
      officerId: 1,
      offense: "SPEEDING",
      assessedFine: 40,
      amountPaid: 0,
      resistingArrestFine: 0,
      resistingArrestAmountPaid: 0,
      remainingBalance: fixture.profile.money,
    };

    expect(fixture.manager.confiscateForPolice(citation)).toBe(true);
    expect(fixture.manager.isActive).toBe(false);
    expect(fixture.manager.lastResult).toBeNull();
    expect(fixture.profile.money).toBe(GAME_CONFIG.packageDelivery.possessionFine / 2);
    fixture.profile.settlePoliceCitation(citation);
    expect(citation).toMatchObject({
      packageConfiscated: true,
      possessionFine: GAME_CONFIG.packageDelivery.possessionFine,
      possessionAmountPaid: GAME_CONFIG.packageDelivery.possessionFine / 2 - 40,
      remainingBalance: 0,
    });
    expect(fixture.profile.money).toBe(0);
    fixture.dispose();
  });
});

function createFixture() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const town = new TownGenerator(scene).generate();
  const player = new PlayerCar(scene, town.roadSpawnPoints);
  const profile = new PlayerProfile();
  const manager = new PackageDeliveryManager(scene, town.deliveryPoints, player, profile);
  return {
    engine,
    scene,
    player,
    profile,
    town,
    manager,
    dispose: () => {
      manager.dispose();
      profile.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
