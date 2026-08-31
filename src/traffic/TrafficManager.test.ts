import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../game/config";
import { PlayerCar } from "../player/PlayerCar";
import { TownGenerator } from "../world/Town";
import { TrafficManager } from "./TrafficManager";

describe("TrafficManager", () => {
  it("shares car geometry and activates only traffic near the player", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const town = new TownGenerator(scene).generate();
    const player = new PlayerCar(scene, town.roadSpawnPoints);
    const traffic = new TrafficManager(
      scene,
      town.roadSpawnPoints,
      town.roadPositionsX,
      town.roadPositionsZ,
    );

    traffic.update(1 / 60, player);

    expect(traffic.cars).toHaveLength(120);
    expect(traffic.activeCarCount).toBeGreaterThan(0);
    expect(traffic.activeCarCount).toBeLessThan(traffic.cars.length);
    expect(traffic.cars[0].mesh.geometry).toBe(traffic.cars[4].mesh.geometry);

    traffic.cars[0].mesh.position.set(10000, 0.75, 10000);
    traffic.update(1 / 60, player);
    const recycledDistance = Math.hypot(
      traffic.cars[0].mesh.position.x - player.root.position.x,
      traffic.cars[0].mesh.position.z - player.root.position.z,
    );
    expect(recycledDistance).toBeLessThanOrEqual(GAME_CONFIG.traffic.respawnMaxRadius);
    traffic.dispose();
    scene.dispose();
    engine.dispose();
  });
});
