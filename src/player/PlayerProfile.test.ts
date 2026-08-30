import { describe, expect, it } from "vitest";
import { PlayerProfile } from "./PlayerProfile";

describe("PlayerProfile", () => {
  it("owns earnings and completed ride progression", () => {
    const profile = new PlayerProfile();

    profile.completeRide(18.5);
    profile.completeRide(7.25);

    expect(profile.money).toBe(25.75);
    expect(profile.completedRides).toBe(2);

    expect(profile.spend(8)).toBe(8);
    expect(profile.money).toBe(17.75);
    expect(profile.spend(30)).toBe(17.75);
    expect(profile.money).toBe(0);
  });
});
