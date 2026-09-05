import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../game/config";
import { PassengerType } from "../game/types";
import { seededRandom } from "../utils/math";
import { PASSENGER_ARCHETYPES, passengerArchetype, pickPassengerType } from "./PassengerArchetypes";

describe("exclusive passenger archetypes", () => {
  it("covers all weighted intervals with exactly 100 percent including 30 percent no trait", () => {
    let lower = 0;
    for (const [key, weight] of Object.entries(GAME_CONFIG.ride.archetypes.weights)) {
      const type = PASSENGER_ARCHETYPES[key as keyof typeof PASSENGER_ARCHETYPES].type;
      expect(pickPassengerType(() => (lower + 0.00001) / 100)).toBe(type);
      expect(pickPassengerType(() => (lower + weight - 0.00001) / 100)).toBe(type);
      lower += weight;
    }
    expect(lower).toBe(100);
    expect(Object.keys(PASSENGER_ARCHETYPES)).toHaveLength(14);
    expect(GAME_CONFIG.ride.archetypes.weights.normal).toBe(30);
  });

  it("is deterministic and never generates retired traits", () => {
    const a = seededRandom(7419), b = seededRandom(7419);
    const types = Array.from({ length: 1000 }, () => pickPassengerType(a));
    expect(types).toEqual(Array.from({ length: 1000 }, () => pickPassengerType(b)));
    expect(types).not.toContain(PassengerType.ScaredyCat);
    expect(types).not.toContain(PassengerType.SpeedDemon);
    expect(new Set(types).size).toBe(14);
    expect(passengerArchetype(PassengerType.Normal).text).toBe("");
    expect(passengerArchetype(PassengerType.OffDutyCop).text).toBe("Get Out of Jail Free card if you earn five stars");
  });
});
