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

    for (const car of traffic.cars) {
      const roadX = town.roadPositionsX[car.waypoint.ix];
      const roadZ = town.roadPositionsZ[car.waypoint.iz];
      if (car.direction === "north") expect(car.mesh.position.x).toBeCloseTo(roadX - GAME_CONFIG.traffic.laneOffset);
      if (car.direction === "south") expect(car.mesh.position.x).toBeCloseTo(roadX + GAME_CONFIG.traffic.laneOffset);
      if (car.direction === "east") expect(car.mesh.position.z).toBeCloseTo(roadZ - GAME_CONFIG.traffic.laneOffset);
      if (car.direction === "west") expect(car.mesh.position.z).toBeCloseTo(roadZ + GAME_CONFIG.traffic.laneOffset);
    }

    traffic.update(1 / 60, player);

    expect(traffic.cars).toHaveLength(120);
    expect(traffic.policeCars).toHaveLength(GAME_CONFIG.police.vehicleCount);
    expect(traffic.cars.filter((car) => car.role === "civilian")).toHaveLength(120 - GAME_CONFIG.police.vehicleCount);
    expect(traffic.activeCarCount).toBeGreaterThan(0);
    expect(traffic.activeCarCount).toBeLessThan(traffic.cars.length);
    expect(traffic.cars[0].mesh.geometry).toBe(traffic.cars[4].mesh.geometry);
    expect(traffic.cars[10].mesh.geometry).toBe(traffic.cars[14].mesh.geometry);
    expect(traffic.cars[0].mesh.isVerticesDataPresent("color")).toBe(true);

    traffic.cars[0].mesh.position.set(10000, 0.75, 10000);
    traffic.update(1 / 60, player);
    const recycledDistance = Math.hypot(
      traffic.cars[0].mesh.position.x - player.root.position.x,
      traffic.cars[0].mesh.position.z - player.root.position.z,
    );
    expect(recycledDistance).toBeLessThanOrEqual(GAME_CONFIG.traffic.respawnMaxRadius);
    expect(traffic.cars[0].role).toBe("police");
    traffic.dispose();
    scene.dispose();
    engine.dispose();
  });
});
