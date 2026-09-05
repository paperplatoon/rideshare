import { afterEach, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PassengerType, RideState, type RideOffer } from "../game/types";
import { PlayerProfile } from "../player/PlayerProfile";
import type { PlayerCar } from "../player/PlayerCar";
import { DamageManager } from "../player/DamageManager";
import { FuelManager } from "../player/FuelManager";
import type { RideOfferBoard } from "./RideOfferBoard";
import { RideManager } from "./RideManager";

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); });
function fixture(type: PassengerType, category: RideOffer["missionCategoryId"] = "rideshare", pickup = true) {
  const engine = new NullEngine(), scene = new Scene(engine), profile = new PlayerProfile();
  const offer: RideOffer = {
    id: "test", passengerName: "Test Rider", passengerType: type, missionCategoryId: category,
    categoryFareMultiplier: 1, tier: "SHORT", pickupDistance: 0, tripDistance: 100, fareMultiplier: 1,
    baseFare: 100, ageSeconds: 0, pickupPoint: { position: Vector3.Zero(), roadId: "x" },
    destinationPoint: { position: new Vector3(0, 0, 100), roadId: "x" },
  };
  const board = { acceptOffer: () => offer, refillOffers: () => {} } as unknown as RideOfferBoard;
  let mph = 0;
  const player = {
    root: { position: Vector3.Zero() }, getSpeedMph: () => mph, getMaxForwardSpeed: () => 100,
  } as unknown as PlayerCar;
  const ride = new RideManager(scene, board, profile);
  ride.acceptRide(category, offer.id);
  if (pickup) ride.update(0, player, true);
  cleanups.push(() => { ride.dispose(); profile.dispose(); scene.dispose(); engine.dispose(); });
  return { ride, player, profile, speed: (value: number) => { mph = value; }, finish: () => {
    mph = 0;
    player.root.position.copyFrom(offer.destinationPoint.position);
    ride.update(0, player, true);
    return ride.lastResult!;
  } };
}

describe("passenger mechanics", () => {
  it("uses strict speed thresholds, normal collision penalties and partial grace intervals", () => {
    const timid = fixture(PassengerType.Timid);
    timid.speed(50); timid.ride.update(1, timid.player, true);
    expect(timid.ride.satisfaction).toBe(100);
    timid.speed(51); timid.ride.update(1, timid.player, true);
    expect(timid.ride.satisfaction).toBe(98);
    timid.ride.registerTrafficCollision(20);
    expect(timid.ride.satisfaction).toBe(58);
    const hurried = fixture(PassengerType.Hurried);
    hurried.ride.update(4.5, hurried.player, true);
    expect(hurried.ride.satisfaction).toBe(100);
    hurried.ride.update(1, hurried.player, true);
    expect(hurried.ride.satisfaction).toBe(99);
    expect(hurried.ride.getSpeedWarningLabel(24)).toContain("TOO SLOW");
    hurried.speed(25); hurried.ride.update(2, hurried.player, true);
    expect(hurried.ride.satisfaction).toBe(99);
    hurried.ride.registerTrafficCollision(20);
    expect(hurried.ride.satisfaction).toBe(59);
  });

  it.each([[PassengerType.Lawful, "redLight", 5], [PassengerType.Careful, "opposingLane", 10]] as const)(
    "%s subtracts starting-tip dollars, not a compounded percentage", (type, event, loss) => {
      const f = fixture(type);
      f.ride.update(20, f.player, true); // ordinary tip is now $45
      f.ride.registerDrivingEvent(event); f.ride.registerDrivingEvent(event);
      expect(f.ride.getCurrentTip()).toBeCloseTo(45 - loss * 2);
      for (let i = 0; i < 20; i++) f.ride.registerDrivingEvent(event);
      expect(f.ride.getCurrentTip()).toBe(0);
      expect(f.ride.getStars()).toBe(5);
    },
  );

  it("keeps bonuses fixed through time, violations, and satisfaction loss", () => {
    const f = fixture(PassengerType.ThrillSeeker);
    f.ride.registerDrivingEvent("yellowIntersection"); f.ride.registerDrivingEvent("yellowIntersection");
    f.ride.registerTrafficCollision(20);
    f.ride.update(210, f.player, true, 100);
    expect(f.ride.getCurrentTip()).toBe(40);
    expect(f.finish()).toMatchObject({ bonusTip: 40, tip: 40, total: 140 });
  });

  it("zeros Shady tips permanently after pursuit and ignores observation/escape", () => {
    const f = fixture(PassengerType.Shady);
    f.ride.registerPursuit(false); expect(f.ride.getCurrentTip()).toBe(50);
    f.ride.registerPursuit(true); f.ride.registerPursuit(false);
    expect(f.finish()).toMatchObject({ tip: 0, baseFare: 100 });
  });

  it("activates the mechanic trade only on actual repair, even with no money", () => {
    const f = fixture(PassengerType.Mechanic), damage = new DamageManager();
    const shops = [{ position: Vector3.Zero(), radius: 16 }];
    f.profile.money = 0;
    damage.update(1, f.player, shops, f.profile, true, true);
    f.ride.registerMechanicRepair(damage.lastRepairAmount);
    expect(f.ride.fareWaived).toBe(false);
    damage.applyDamage(0.8);
    damage.update(1, f.player, shops, f.profile, false, true);
    expect(damage.damagePercent).toBe(0.8);
    damage.update(1, f.player, shops, f.profile, true, true);
    f.ride.registerMechanicRepair(damage.lastRepairAmount);
    expect(damage.damagePercent).toBeCloseTo(0.6);
    expect(f.ride.fareWaived).toBe(true);
    expect(f.ride.state).toBe(RideState.PassengerOnboard);
    expect(f.profile.money).toBe(0);
    damage.update(5, f.player, shops, f.profile, true, true);
    expect(damage.isRepaired).toBe(true);
    expect(f.finish()).toMatchObject({ fareWaived: true, baseFare: 0, tip: 0, total: 0 });
  });

  it("pays Off-grid once for a stopped full-tank visit with no fuel purchase", () => {
    const f = fixture(PassengerType.OffGrid), fuel = new FuelManager();
    fuel.update(0, f.player, [{ position: Vector3.Zero(), radius: 16 }], f.profile);
    f.ride.registerStationStop(fuel.canUsePump);
    f.ride.registerStationStop(false); f.ride.registerStationStop(true);
    expect(f.finish()).toMatchObject({ bonusTip: 20, tip: 70 });
  });

  it.each([[PassengerType.Millionaire, 150, 0], [PassengerType.ServiceWorker, 25, 80]] as const)(
    "%s scales tips and satisfaction, including collision cooldown", (type, initialTip, afterCollision) => {
      const f = fixture(type);
      expect(f.ride.getCurrentTip()).toBe(initialTip);
      f.ride.registerTrafficCollision(11); expect(f.ride.satisfaction).toBe(100);
      f.ride.registerTrafficCollision(20); f.ride.registerTrafficCollision(20);
      expect(f.ride.satisfaction).toBe(afterCollision);
    },
  );

  it("layers generosity over Silver without multiplying illegal-driving penalties", () => {
    const f = fixture(PassengerType.Millionaire, "rideshare_silver");
    expect(f.ride.getCurrentTip()).toBe(195);
    f.speed(61); f.ride.update(1, f.player, true, 1);
    expect(f.ride.satisfaction).toBe(97);
    expect(f.ride.getCurrentTip()).toBeCloseTo(195 * 0.97 * 0.995 * 0.92);
  });

  it("grants completion rewards once and uses five displayed stars", () => {
    const cop = fixture(PassengerType.OffDutyCop);
    cop.ride.satisfaction = 81;
    expect(cop.profile.jailFreeCards).toBe(0);
    expect(cop.finish().cardsEarned).toBe(1);
    cop.finish(); expect(cop.profile.jailFreeCards).toBe(1);
    const poorCop = fixture(PassengerType.OffDutyCop);
    poorCop.ride.satisfaction = 80;
    expect(poorCop.finish().cardsEarned).toBe(0);
    const salesman = fixture(PassengerType.CarSalesman);
    expect(salesman.profile.vehicleCoupons).toBe(0);
    expect(salesman.finish().couponsEarned).toBe(1);
    expect(salesman.profile.vehicleCoupons).toBe(1);
  });

  it("ignores events before pickup and while paused, and resets state on the next ride", () => {
    const f = fixture(PassengerType.OffGrid, "rideshare", false);
    f.ride.registerStationStop(true); expect(f.ride.bonusTip).toBe(0);
    f.ride.update(100, f.player, false);
    expect(f.ride.state).toBe(RideState.DrivingToPickup);
    f.ride.update(0, f.player, true); f.ride.registerStationStop(true); f.finish();
    expect(f.ride.bonusTip).toBe(0);
    f.ride.acceptRide("rideshare", "test"); f.player.root.position.setAll(0);
    f.ride.update(0, f.player, true); f.ride.registerStationStop(true);
    expect(f.ride.bonusTip).toBe(20);
  });
});
