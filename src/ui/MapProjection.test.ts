import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../game/config";
import { projectMapHeight, projectMapPoint, projectMapWidth } from "./MapProjection";

describe("MapProjection", () => {
  const totalX = GAME_CONFIG.world.blocksX * GAME_CONFIG.world.blockSize
    + (GAME_CONFIG.world.blocksX + 1) * GAME_CONFIG.world.roadWidth;
  const totalZ = GAME_CONFIG.world.blocksZ * GAME_CONFIG.world.blockSize
    + (GAME_CONFIG.world.blocksZ + 1) * GAME_CONFIG.world.roadWidth;
  const bounds = {
    minX: -totalX / 2,
    maxX: totalX / 2,
    minZ: -totalZ / 2,
    maxZ: totalZ / 2,
  };

  it("maps all four world corners without distorting edge coordinates", () => {
    expect(projectMapPoint(bounds.minX, bounds.maxZ, bounds)).toEqual({ x: 0, y: 0 });
    expect(projectMapPoint(bounds.maxX, bounds.minZ, bounds)).toEqual({ x: 100, y: 100 });
    expect(projectMapPoint(0, 0, bounds)).toEqual({ x: 50, y: 50 });
  });

  it("projects every generated road center at the town's real spacing", () => {
    const roadCenters = Array.from(
      { length: GAME_CONFIG.world.blocksX + 1 },
      (_, index) => bounds.minX
        + GAME_CONFIG.world.roadWidth / 2
        + index * (GAME_CONFIG.world.blockSize + GAME_CONFIG.world.roadWidth),
    );
    const projected = roadCenters.map((center) => projectMapPoint(center, 0, bounds).x);

    expect(projected).toHaveLength(11);
    expect(projected[0]).toBeCloseTo(1.1628, 3);
    expect(projected[1] - projected[0]).toBeCloseTo(9.7674, 3);
    expect(projected.at(-1)).toBeCloseTo(98.8372, 3);
  });

  it("scales road width independently on each map axis", () => {
    expect(projectMapWidth(GAME_CONFIG.world.roadWidth, bounds)).toBeCloseTo(2.3256, 3);
    expect(projectMapHeight(GAME_CONFIG.world.roadWidth, bounds)).toBeCloseTo(2.3256, 3);
  });
});
