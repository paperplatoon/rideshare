import { describe, expect, it } from "vitest";
import { MISSION_LICENSES, getMissionLicense } from "./MissionLicenseCatalog";

describe("MissionLicenseCatalog", () => {
  it("defines the initial license prices and fare multipliers", () => {
    expect(MISSION_LICENSES.map(({ id, unlockCost, fareMultiplier }) => ({ id, unlockCost, fareMultiplier }))).toEqual([
      { id: "rideshare", unlockCost: 0, fareMultiplier: 1 },
      { id: "taxi", unlockCost: 500, fareMultiplier: 2 },
      { id: "rideshare_silver", unlockCost: 3000, fareMultiplier: 3 },
    ]);
    expect(getMissionLicense("rideshare_silver")).toMatchObject({
      maxTipPercent: 0.65,
      violationTipPenaltyMultiplier: 4,
    });
    expect(getMissionLicense("rideshare")?.maxTipPercent).toBeUndefined();
    expect(getMissionLicense("unknown")).toBeNull();
  });
});
