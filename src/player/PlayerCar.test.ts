import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../game/config";
import { applyPermanentUpgrades } from "../progression/UpgradeSystem";
import { ELITE_VEHICLE, STARTER_VEHICLE } from "../vehicles/VehicleCatalog";
import { PlayerCar, damageStatMultiplier } from "./PlayerCar";

describe("damageStatMultiplier", () => {
  it("scales tunable car stats down as damage increases", () => {
    expect(damageStatMultiplier(0, 0.35)).toBe(1);
    expect(damageStatMultiplier(0.5, 0.35)).toBeCloseTo(0.675);
    expect(damageStatMultiplier(1, 0.35)).toBe(0.35);
  });
});

describe("PlayerCar vehicle configuration", () => {
  it("updates physical dimensions and effective performance when equipped", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const spawnPoints = [{ position: Vector3.Zero(), ix: 0, iz: 0, axis: "x" as const, direction: 1 as const }];
    const car = new PlayerCar(scene, spawnPoints);

    expect(car.equippedVehicleId).toBe("starter");
    expect(car.getMaxForwardSpeed()).toBe(STARTER_VEHICLE.stats.topSpeed);
    expect(car.vehicleWidth).toBe(STARTER_VEHICLE.appearance.bodyWidth);

    const upgraded = applyPermanentUpgrades(ELITE_VEHICLE.stats, {
      acceleration: 50,
      topSpeed: 50,
      turning: 50,
      braking: 50,
    });
    car.equipVehicle(ELITE_VEHICLE, upgraded);

    expect(car.equippedVehicleId).toBe("elite-sports-car");
    expect(car.getMaxForwardSpeed()).toBe(
      ELITE_VEHICLE.stats.topSpeed
        * (1 + 50 * GAME_CONFIG.progression.upgradePercentPerLevel),
    );
    expect(car.vehicleWidth).toBe(ELITE_VEHICLE.appearance.bodyWidth);
    expect(car.vehicleLength).toBe(ELITE_VEHICLE.appearance.bodyLength);
    expect(car.colliderRadius).toBeGreaterThan(STARTER_VEHICLE.appearance.bodyWidth / 2);

    scene.dispose();
    engine.dispose();
  });
});
