import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { TownGenerator } from "../world/Town";
import { DamageManager, collisionDamagePercent } from "./DamageManager";
import { PlayerCar } from "./PlayerCar";
import { PlayerProfile } from "./PlayerProfile";

describe("DamageManager", () => {
  it("scales crash damage by closing speed and directness", () => {
    expect(collisionDamagePercent(30, 0.35)).toBeCloseTo(0.03, 1);
    expect(collisionDamagePercent(55, 1)).toBeCloseTo(0.1, 1);
    expect(collisionDamagePercent(130, 1)).toBeCloseTo(0.26, 2);
  });

  it("repairs only while held at a shop and spends money", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const town = new TownGenerator(scene).generate();
    const player = new PlayerCar(scene, town.roadSpawnPoints);
    const damage = new DamageManager();
    const profile = new PlayerProfile();

    damage.damagePercent = 0.5;
    profile.money = 300;
    player.root.position.copyFrom(town.autoBodyShops[0].position);

    damage.update(0.5, player, town.autoBodyShops, profile);
    expect(damage.canUseRepair).toBe(true);
    expect(damage.damagePercent).toBe(0.5);

    damage.update(0.5, player, town.autoBodyShops, profile, true);
    expect(damage.isRepairing).toBe(true);
    expect(damage.damagePercent).toBeLessThan(0.5);
    expect(profile.money).toBeLessThan(300);

    profile.money = 0;
    const previousDamage = damage.damagePercent;
    damage.update(1, player, town.autoBodyShops, profile, true);
    expect(damage.isRepairing).toBe(false);
    expect(damage.damagePercent).toBe(previousDamage);

    scene.dispose();
    engine.dispose();
  });
});
