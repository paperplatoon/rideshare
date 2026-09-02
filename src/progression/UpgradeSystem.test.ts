import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../game/config";
import { applyPermanentUpgrades, getUpgradeCost, getUpgradeMultiplier } from "./UpgradeSystem";

describe("UpgradeSystem", () => {
  it("uses the triangular per-level price curve", () => {
    expect(getUpgradeCost(1)).toBe(100);
    expect(getUpgradeCost(2)).toBe(300);
    expect(getUpgradeCost(10)).toBe(5_500);
    expect(getUpgradeCost(50)).toBe(127_500);
    expect(getUpgradeCost(0)).toBe(0);
    expect(getUpgradeCost(51)).toBe(0);
  });

  it("applies the configured additive percentage to each base stat", () => {
    const base = { acceleration: 20, topSpeed: 100, turning: 2, braking: 30 };
    const upgraded = applyPermanentUpgrades(base, {
      acceleration: 10,
      topSpeed: 50,
      turning: 0,
      braking: 25,
    });

    expect(upgraded).toEqual({
      acceleration: 20 * getUpgradeMultiplier(10),
      topSpeed: 100 * getUpgradeMultiplier(50),
      turning: 2,
      braking: 30 * getUpgradeMultiplier(25),
    });
    const maximumMultiplier = 1
      + GAME_CONFIG.progression.maxUpgradeLevel * GAME_CONFIG.progression.upgradePercentPerLevel;
    expect(getUpgradeMultiplier(50)).toBe(maximumMultiplier);
    expect(getUpgradeMultiplier(500)).toBe(maximumMultiplier);
  });
});
