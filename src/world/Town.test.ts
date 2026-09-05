import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../game/config";
import { TownGenerator } from "./Town";

describe("TownGenerator", () => {
  it("merges static geometry by chunk and registers solid world props", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);

    const town = new TownGenerator(scene).generate();

    // Scattered service locations occupy more render chunks, but remain a small static workload.
    expect(town.meshes.length).toBeLessThan(210);
    expect(town.staticColliders.length).toBeGreaterThan(300);
    expect(town.gasStations).toHaveLength(14);
    expect(town.autoBodyShops).toHaveLength(6);
    expect(town.legalDrivingAreas).toHaveLength(20);
    const services = [...town.gasStations, ...town.autoBodyShops];
    expect(new Set(services.map(({ position }) => `${position.x},${position.z}`)).size).toBe(20);
    for (let first = 0; first < services.length; first++) {
      for (let second = first + 1; second < services.length; second++) {
        expect(Vector3.Distance(services[first].position, services[second].position))
          .toBeGreaterThanOrEqual(GAME_CONFIG.world.servicePlacement.minimumSpacing);
      }
    }
    expect(Math.max(...services.map(({ position }) => position.x))
      - Math.min(...services.map(({ position }) => position.x))).toBeGreaterThan((town.maxX - town.minX) * 0.7);
    expect(Math.max(...services.map(({ position }) => position.z))
      - Math.min(...services.map(({ position }) => position.z))).toBeGreaterThan((town.maxZ - town.minZ) * 0.7);
    expect(town.meshes.some((mesh) => mesh.name === "center-lines")).toBe(true);
    const highwayRoads = town.roads.filter((road) => road.type === "highway");
    expect(highwayRoads.map((road) => road.id).sort()).toEqual(["ew-0", "ew-10", "ns-0", "ns-10"]);
    expect(highwayRoads.every((road) => road.speedLimitMph === 70 && !road.allowsMissionStops)).toBe(true);
    const roadsById = new Map(town.roads.map((road) => [road.id, road]));
    expect(town.deliveryPoints.length).toBeGreaterThan(0);
    expect(town.deliveryPoints.every((point) => roadsById.get(point.roadId)?.allowsMissionStops)).toBe(true);
    expect(scene.textures.length).toBeGreaterThanOrEqual(6);
    expect(scene.meshes.length).toBe(town.meshes.length);
    scene.dispose();
    engine.dispose();
  });
});
