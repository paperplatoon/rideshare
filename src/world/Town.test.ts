import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { describe, expect, it } from "vitest";
import { TownGenerator } from "./Town";

describe("TownGenerator", () => {
  it("merges static geometry by chunk and registers solid world props", () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);

    const town = new TownGenerator(scene).generate();

    expect(town.meshes.length).toBeLessThan(160);
    expect(town.staticColliders.length).toBeGreaterThan(300);
    expect(town.gasStations).toHaveLength(7);
    expect(town.autoBodyShops).toHaveLength(3);
    expect(scene.meshes.length).toBe(town.meshes.length);
    scene.dispose();
    engine.dispose();
  });
});
