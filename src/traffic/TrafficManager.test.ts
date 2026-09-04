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
    const civilianBounds = traffic.cars[10].mesh.getBoundingInfo().boundingBox.extendSize;
    expect(civilianBounds.x * 2).toBeCloseTo(GAME_CONFIG.traffic.vehicleWidth);
    expect(civilianBounds.z * 2).toBeCloseTo(GAME_CONFIG.traffic.vehicleLength);

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

  it("uses configured oriented hitbox dimensions for player-to-traffic collisions", () => {
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
    player.heading = 0;
    player.root.rotation.y = 0;
    for (const car of traffic.cars) {
      car.mesh.position.set(player.root.position.x + 100, 1, player.root.position.z + 100);
      car.mesh.rotation.y = 0;
    }
    const target = traffic.cars[0];
    const touchingOffset = player.vehicleWidth / 2 + GAME_CONFIG.traffic.hitboxWidth / 2;
    target.mesh.position.set(player.root.position.x + touchingOffset + 0.1, 1, player.root.position.z);
    const originalX = player.root.position.x;

    traffic.update(0, player);
    expect(player.root.position.x).toBeCloseTo(originalX);

    target.mesh.position.x = player.root.position.x + touchingOffset - 0.5;
    traffic.update(0, player);
    expect(player.root.position.x).toBeLessThan(originalX);

    traffic.dispose();
    scene.dispose();
    engine.dispose();
  });
});
