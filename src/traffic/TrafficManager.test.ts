import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it, vi } from "vitest";
import { GAME_CONFIG } from "../game/config";
import { PlayerCar } from "../player/PlayerCar";
import { TownGenerator } from "../world/Town";
import {
  TrafficManager,
  shouldAllowIntentionalCrash,
  willVehiclesConflict,
} from "./TrafficManager";
import type { TrafficCar } from "./TrafficCar";

describe("TrafficManager", () => {
  it("predicts local crossing conflicts and rolls the intentional-crash chance at the boundary", () => {
    const eastbound = predictiveCar(1, -10, 0, 10, 0);
    const southbound = predictiveCar(2, 0, -10, 0, 10);
    const escaping = predictiveCar(3, 10, 0, 20, 0);

    expect(willVehiclesConflict(eastbound, southbound, 1.25, 12)).toBe(true);
    expect(willVehiclesConflict(eastbound, escaping, 1.25, 12)).toBe(false);
    expect(shouldAllowIntentionalCrash(() => 0, 2000)).toBe(true);
    expect(shouldAllowIntentionalCrash(() => 1 / 2000, 2000)).toBe(false);
  });

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
    expect(traffic.cars[10].mesh.getTotalVertices()).toBeGreaterThan(200);
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

    const pursuingOfficer = traffic.cars[0];
    pursuingOfficer.setPursuitTarget(player.root.position);
    const pursuitGeneration = pursuingOfficer.respawnGeneration;
    pursuingOfficer.mesh.position.set(10000, 1, 10000);
    traffic.update(1 / 60, player);
    expect(pursuingOfficer.respawnGeneration).toBe(pursuitGeneration);
    expect(pursuingOfficer.mesh.position.x).toBe(10000);
    expect(pursuingOfficer.isPursuing).toBe(true);
    pursuingOfficer.clearPursuit();

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

    const noCollision = traffic.update(0, player);
    expect(player.root.position.x).toBeCloseTo(originalX);
    expect(noCollision.collisionViolationSeverity).toBe(0);

    target.mesh.position.x = player.root.position.x + touchingOffset - 0.5;
    const policeCollision = traffic.update(0, player);
    expect(player.root.position.x).toBeLessThan(originalX);
    expect(policeCollision.collisionViolationSeverity).toBe(0);
    expect(policeCollision.policeCollisionOfficerId).toBe(target.id);

    target.mesh.position.set(player.root.position.x + 100, 1, player.root.position.z + 100);
    vi.spyOn(player, "getVelocityX").mockReturnValue(20);
    vi.spyOn(player, "getVelocityZ").mockReturnValue(0);
    const civilian = traffic.cars[GAME_CONFIG.police.vehicleCount];
    civilian.mesh.position.set(player.root.position.x + touchingOffset - 0.5, 1, player.root.position.z);
    civilian.mesh.rotation.y = 0;
    const collision = traffic.update(0, player);
    expect(collision.collisionViolationSeverity).toBeGreaterThan(0);
    expect(collision.policeCollisionOfficerId).toBeNull();

    traffic.dispose();
    scene.dispose();
    engine.dispose();
  });

  it("creates one serious accident event for sustained NPC-to-NPC contact", () => {
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
    for (let index = 0; index < traffic.cars.length; index++) {
      traffic.cars[index].mesh.position.set(
        player.root.position.x + 260 + (index % 10) * 15,
        1,
        player.root.position.z + 260 + Math.floor(index / 10) * 15,
      );
    }
    const first = traffic.cars[GAME_CONFIG.police.vehicleCount];
    const second = traffic.cars[GAME_CONFIG.police.vehicleCount + 1];
    const firstX = player.root.position.x + 50;
    const firstZ = player.root.position.z + 50;
    first.mesh.position.set(firstX, 1, firstZ);
    second.mesh.position.set(firstX + GAME_CONFIG.traffic.hitboxWidth - 0.5, 1, firstZ);
    first.mesh.rotation.y = 0;
    second.mesh.rotation.y = 0;
    vi.spyOn(first, "getVelocityX").mockReturnValue(20);
    vi.spyOn(first, "getVelocityZ").mockReturnValue(0);
    vi.spyOn(second, "getVelocityX").mockReturnValue(0);
    vi.spyOn(second, "getVelocityZ").mockReturnValue(0);

    traffic.update(0, player);
    expect(first.accidentState).toBe("braking");
    expect(second.accidentState).toBe("braking");
    const firstDamage = first.damagePercent;
    expect(firstDamage).toBeGreaterThan(0);

    first.mesh.position.set(firstX, 1, firstZ);
    second.mesh.position.set(firstX + GAME_CONFIG.traffic.hitboxWidth - 0.5, 1, firstZ);
    traffic.update(0, player);
    expect(first.damagePercent).toBe(firstDamage);
    expect(second.damagePercent).toBe(firstDamage);

    traffic.dispose();
    scene.dispose();
    engine.dispose();
  });
});

function predictiveCar(
  id: number,
  x: number,
  z: number,
  velocityX: number,
  velocityZ: number,
): TrafficCar {
  return {
    id,
    mesh: { position: { x, z }, rotation: { y: 0 } },
    getVelocityX: () => velocityX,
    getVelocityZ: () => velocityZ,
  } as unknown as TrafficCar;
}
