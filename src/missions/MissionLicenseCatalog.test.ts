import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../game/config";
import { MISSION_LICENSES, getMissionLicense } from "./MissionLicenseCatalog";

describe("MissionLicenseCatalog", () => {
  it("defines the initial license prices and fare multipliers", () => {
    expect(MISSION_LICENSES.map(({ id, unlockCost, fareMultiplier }) => ({ id, unlockCost, fareMultiplier }))).toEqual([
      { id: "rideshare", unlockCost: GAME_CONFIG.progression.missionLicenseUnlockCosts.rideshare, fareMultiplier: 1 },
      { id: "taxi", unlockCost: GAME_CONFIG.progression.missionLicenseUnlockCosts.taxi, fareMultiplier: 2 },
      { id: "rideshare_silver", unlockCost: GAME_CONFIG.progression.missionLicenseUnlockCosts.rideshare_silver, fareMultiplier: 3 },
      { id: "package_delivery", unlockCost: GAME_CONFIG.progression.missionLicenseUnlockCosts.package_delivery, fareMultiplier: 1 },
    ]);
    expect(MISSION_LICENSES.map(({ id, unlockCost }) => [id, unlockCost])).toEqual(
      Object.entries(GAME_CONFIG.progression.missionLicenseUnlockCosts),
    );
    expect(getMissionLicense("rideshare_silver")).toMatchObject({
      maxTipPercent: 0.65,
      violationTipPenaltyMultiplier: 4,
    });
    expect(getMissionLicense("rideshare")?.maxTipPercent).toBeUndefined();
    expect(getMissionLicense("package_delivery")).toMatchObject({
      activityType: "packageDelivery",
      unlockLocation: "pause",
    });
    expect(getMissionLicense("unknown")).toBeNull();
  });
});
