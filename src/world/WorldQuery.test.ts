import { describe, expect, it } from "vitest";
import type { BoxCollider } from "../game/types";
import { WorldQuery } from "./WorldQuery";

function createQuery(colliders: BoxCollider[] = [], legalDrivingAreas: BoxCollider[] = []): WorldQuery {
  return new WorldQuery(colliders, [0, 120, 240], [0, 120, 240], 20, 22, 64, legalDrivingAreas);
}

describe("WorldQuery", () => {
  it("returns nearby and oversized colliders without scanning distant cells", () => {
    const nearby = { x: 15, z: 10, halfX: 5, halfZ: 5 };
    const distant = { x: 400, z: 400, halfX: 5, halfZ: 5 };
    const boundary = { x: 0, z: -500, halfX: 600, halfZ: 6 };
    const query = createQuery([nearby, distant, boundary]);
    const results: BoxCollider[] = [];

    query.getNearbyColliders(10, 10, 3, results);

    expect(results).toContain(nearby);
    expect(results).toContain(boundary);
    expect(results).not.toContain(distant);
  });

  it("classifies regular road and sidewalk bands in constant time", () => {
    const query = createQuery();

    expect(query.isOnSidewalk(0, 60)).toBe(false);
    expect(query.isOnSidewalk(21, 60)).toBe(true);
    expect(query.isOnSidewalk(23, 60)).toBe(false);
    expect(query.isOnSidewalk(141, 60)).toBe(true);
  });

  it("reports road orientation, turning gaps, and legal service areas", () => {
    const query = createQuery([], [{ x: 30, z: 60, halfX: 6, halfZ: 6 }]);

    const road = query.getRoadContext(10, 60, 0, -10);
    const turnApproach = query.getRoadContext(10, 30, 0, -10);

    expect(road.axis).toBe("northSouth");
    expect(road.lateralOffset).toBe(10);
    expect(road.inIntersection).toBe(false);
    expect(road.inTurningGap).toBe(false);
    expect(turnApproach.inTurningGap).toBe(true);
    expect(query.isInLegalDrivingArea(30, 60)).toBe(true);
    expect(query.isInLegalDrivingArea(37, 60)).toBe(false);
  });
});
