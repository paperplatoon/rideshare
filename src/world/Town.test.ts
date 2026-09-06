import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../game/config";
import { WorldQuery } from "./WorldQuery";
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
    expect(highwayRoads.map((road) => road.id).sort()).toEqual([
      "ew-0",
      `ew-${GAME_CONFIG.world.blocksZ}`,
      "ns-0",
      `ns-${GAME_CONFIG.world.blocksX}`,
    ]);
    expect(highwayRoads.every((road) => road.speedLimitMph === 70 && !road.allowsMissionStops)).toBe(true);
    const roadsById = new Map(town.roads.map((road) => [road.id, road]));
    expect(town.deliveryPoints.length).toBeGreaterThan(0);
    expect(town.deliveryPoints.every((point) => roadsById.get(point.roadId)?.allowsMissionStops)).toBe(true);
    expect(scene.textures.length).toBeGreaterThanOrEqual(6);
    expect(scene.meshes.length).toBe(town.meshes.length);
    scene.dispose();
    engine.dispose();
  });

  it("places gas stations mid-block with road-colored entrance inlets", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const town = new TownGenerator(scene).generate();
    const { roadPositionsX, roadPositionsZ } = town;
    const roadOffset = GAME_CONFIG.world.roadWidth / 2 + GAME_CONFIG.world.sidewalkWidth + 14;
    const corridorHalfWidth = GAME_CONFIG.world.roadWidth / 2
      + GAME_CONFIG.world.sidewalkWidth
      + 17
      + GAME_CONFIG.drivingRules.serviceAreaPadding;
    const gasHalfWidth = GAME_CONFIG.world.servicePlacement.gasStationLegalHalfWidth
      + GAME_CONFIG.drivingRules.serviceAreaPadding;

    for (const station of town.gasStations) {
      const nearestX = roadPositionsX.reduce((best, road) => Math.abs(road - station.position.x) < Math.abs(best - station.position.x) ? road : best);
      const nearestZ = roadPositionsZ.reduce((best, road) => Math.abs(road - station.position.z) < Math.abs(best - station.position.z) ? road : best);
      if (station.roadAxis === "northSouth") {
        expect(Math.abs(station.position.x - nearestX)).toBeCloseTo(roadOffset);
        const segment = roadPositionsZ.findIndex((road, index) => (
          index < roadPositionsZ.length - 1
          && Math.abs(station.position.z - (road + roadPositionsZ[index + 1]) / 2) < 0.01
        ));
        expect(segment).toBeGreaterThanOrEqual(0);
      } else {
        expect(Math.abs(station.position.z - nearestZ)).toBeCloseTo(roadOffset);
        const segment = roadPositionsX.findIndex((road, index) => (
          index < roadPositionsX.length - 1
          && Math.abs(station.position.x - (road + roadPositionsX[index + 1]) / 2) < 0.01
        ));
        expect(segment).toBeGreaterThanOrEqual(0);
      }
    }

    expect(town.legalDrivingAreas).toHaveLength(GAME_CONFIG.fuel.stationCount + GAME_CONFIG.repair.shopCount);
    for (let index = 0; index < town.gasStations.length; index++) {
      const area = town.legalDrivingAreas[index];
      if (town.gasStations[index].roadAxis === "northSouth") {
        expect(area.halfX).toBeCloseTo(corridorHalfWidth);
        expect(area.halfZ).toBeCloseTo(gasHalfWidth);
      } else {
        expect(area.halfX).toBeCloseTo(gasHalfWidth);
        expect(area.halfZ).toBeCloseTo(corridorHalfWidth);
      }
    }

    expect(town.meshes.length).toBeLessThan(210);
    const query = new WorldQuery(
      town.staticColliders,
      town.roads,
      GAME_CONFIG.world.roadWidth / 2,
      GAME_CONFIG.world.roadWidth / 2 + GAME_CONFIG.world.sidewalkWidth,
      GAME_CONFIG.world.spatialCellSize,
      town.legalDrivingAreas,
    );
    for (const station of town.gasStations) {
      const side = station.roadSide ?? 1;
      const inlet = station.roadAxis === "northSouth"
        ? { x: station.position.x - side * 20, z: station.position.z + 40 }
        : { x: station.position.x + 40, z: station.position.z - side * 20 };
      expect(query.isInLegalDrivingArea(inlet.x, inlet.z)).toBe(true);
    }
    scene.dispose();
    engine.dispose();
  });
});
