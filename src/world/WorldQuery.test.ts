import { describe, expect, it } from "vitest";
import type { BoxCollider } from "../game/types";
import { WorldQuery } from "./WorldQuery";

function createQuery(colliders: BoxCollider[] = []): WorldQuery {
  return new WorldQuery(colliders, [0, 120, 240], [0, 120, 240], 20, 22, 64);
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
});
