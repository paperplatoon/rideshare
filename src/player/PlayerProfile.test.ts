import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../game/config";
import { PassengerType, type RideResult } from "../game/types";
import { ProgressionStore, type KeyValueStorage } from "../progression/ProgressionStore";
import { getUpgradeCost } from "../progression/UpgradeSystem";
import { PlayerProfile } from "./PlayerProfile";

describe("PlayerProfile", () => {
  it("starts a new save with the starter vehicle and configured budget", () => {
    const profile = createProfile();

    expect(profile.money).toBe(GAME_CONFIG.progression.startingMoney);
    expect(profile.completedRides).toBe(0);
    expect(profile.ownedVehicleIds).toEqual(["starter"]);
    expect(profile.equippedVehicleId).toBe("starter");
    expect(profile.ownedMissionLicenseIds).toEqual(["rideshare"]);
    expect(profile.upgrades).toEqual({ acceleration: 0, topSpeed: 0, turning: 0, braking: 0 });
  });

  it("owns earnings and completed ride progression", () => {
    const profile = createProfile();

    profile.completeRide(rideResult(18.5, "First Rider"));
    profile.completeRide(rideResult(7.25, "Second Rider"));

    expect(profile.money).toBe(GAME_CONFIG.progression.startingMoney + 25.75);
    expect(profile.completedRides).toBe(2);
    expect(profile.rideHistory.map((ride) => ride.passengerName)).toEqual(["Second Rider", "First Rider"]);

    expect(profile.spend(8)).toBe(8);
    expect(profile.money).toBe(GAME_CONFIG.progression.startingMoney + 17.75);
    expect(profile.spend(30_000)).toBe(GAME_CONFIG.progression.startingMoney + 17.75);
    expect(profile.money).toBe(0);
  });

  it("persists purchased vehicles, equipped vehicle, and upgrades", () => {
    const storage = new MemoryStorage();
    const profile = createProfile(storage);
    profile.money = 25_000;

    expect(profile.purchaseVehicle("used-compact", true)).toBe(true);
    expect(profile.purchaseUpgrade("topSpeed")).toBe(true);

    const reloaded = createProfile(storage);
    expect(reloaded.money).toBe(
      25_000 - GAME_CONFIG.progression.vehiclePrices["used-compact"] - getUpgradeCost(1),
    );
    expect(reloaded.ownedVehicleIds).toEqual(["starter", "used-compact"]);
    expect(reloaded.equippedVehicleId).toBe("used-compact");
    expect(reloaded.upgrades.topSpeed).toBe(1);
  });

  it("keeps debug money temporary while persisting purchases made with it", () => {
    const storage = new MemoryStorage();
    const profile = createProfile(storage);

    profile.addTemporaryDebugMoney(25_000);
    expect(profile.money).toBe(GAME_CONFIG.progression.startingMoney + 25_000);
    expect(profile.purchaseMissionLicense("taxi")).toBe(true);
    expect(profile.money).toBe(
      GAME_CONFIG.progression.startingMoney + 25_000
      - GAME_CONFIG.progression.missionLicenseUnlockCosts.taxi,
    );

    const reloaded = createProfile(storage);
    expect(reloaded.money).toBe(GAME_CONFIG.progression.startingMoney);
    expect(reloaded.ownedMissionLicenseIds).toContain("taxi");
  });

  it("does not save unused temporary debug money on page exit", () => {
    const storage = new MemoryStorage();
    const profile = createProfile(storage);

    profile.addTemporaryDebugMoney(25_000);
    profile.dispose();

    expect(createProfile(storage).money).toBe(GAME_CONFIG.progression.startingMoney);
  });

  it("can reset persisted cash without clearing other progression", () => {
    const storage = new MemoryStorage();
    const profile = createProfile(storage);
    profile.money = 25_030;
    profile.unlockAllVehicles();

    profile.resetMoneyToStartingAmount();

    const reloaded = createProfile(storage);
    expect(reloaded.money).toBe(GAME_CONFIG.progression.startingMoney);
    expect(reloaded.ownedVehicleIds).toContain("elite-sports-car");
  });

  it("purchases mission licenses independently and persists ownership", () => {
    const storage = new MemoryStorage();
    const profile = createProfile(storage);
    const expectedRemainder = 500;
    profile.money = GAME_CONFIG.progression.missionLicenseUnlockCosts.rideshare_silver
      + GAME_CONFIG.progression.missionLicenseUnlockCosts.taxi
      + GAME_CONFIG.progression.missionLicenseUnlockCosts.package_delivery
      + expectedRemainder;

    expect(profile.purchaseMissionLicense("rideshare_silver")).toBe(true);
    expect(profile.purchaseMissionLicense("taxi")).toBe(true);
    expect(profile.purchaseMissionLicense("package_delivery")).toBe(true);
    expect(profile.purchaseMissionLicense("taxi")).toBe(false);
    expect(profile.money).toBe(expectedRemainder);

    const reloaded = createProfile(storage);
    expect(reloaded.ownedMissionLicenseIds).toEqual([
      "rideshare",
      "rideshare_silver",
      "taxi",
      "package_delivery",
    ]);
  });

  it("rejects duplicate, unknown, and unaffordable purchases", () => {
    const profile = createProfile();

    expect(profile.purchaseVehicle("starter", true)).toBe(false);
    expect(profile.purchaseVehicle("unknown", true)).toBe(false);
    expect(profile.purchaseVehicle("sport-compact", true)).toBe(false);
    expect(profile.equipVehicle("used-compact")).toBe(false);
    expect(profile.money).toBe(GAME_CONFIG.progression.startingMoney);
  });

  it("debounces continuous spending and writes it after the autosave interval", () => {
    const storage = new MemoryStorage();
    const profile = createProfile(storage);

    profile.money = 100;
    profile.spend(50);
    profile.updateAutosave(GAME_CONFIG.progression.autosaveSeconds - 0.01);
    expect(storage.getItem(GAME_CONFIG.progression.saveKey)).toBeNull();

    profile.updateAutosave(0.02);
    const reloaded = createProfile(storage);
    expect(reloaded.money).toBe(50);
  });

  it("sanitizes known-version data and rejects unknown save versions", () => {
    const storage = new MemoryStorage();
    storage.setItem(GAME_CONFIG.progression.saveKey, JSON.stringify({
      version: GAME_CONFIG.progression.saveVersion,
      money: -10,
      completedRides: 3.9,
      ownedVehicleIds: ["starter", "used-compact", "bogus", "used-compact"],
      equippedVehicleId: "bogus",
      upgrades: { acceleration: 99, topSpeed: -2, turning: 4.8, braking: "bad" },
    }));

    const sanitized = createProfile(storage);
    expect(sanitized.money).toBe(GAME_CONFIG.progression.startingMoney);
    expect(sanitized.completedRides).toBe(3);
    expect(sanitized.ownedVehicleIds).toEqual(["starter", "used-compact"]);
    expect(sanitized.equippedVehicleId).toBe("starter");
    expect(sanitized.upgrades).toEqual({ acceleration: 50, topSpeed: 0, turning: 4, braking: 0 });

    storage.setItem(GAME_CONFIG.progression.saveKey, JSON.stringify({
      version: GAME_CONFIG.progression.saveVersion + 1,
      money: 999_999,
    }));
    const unknownVersion = createProfile(storage);
    expect(unknownVersion.money).toBe(GAME_CONFIG.progression.startingMoney);
    expect(unknownVersion.ownedVehicleIds).toEqual(["starter"]);
  });

  it("migrates version-one progression without discarding existing unlocks or money", () => {
    const storage = new MemoryStorage();
    storage.setItem(GAME_CONFIG.progression.saveKey, JSON.stringify({
      version: 1,
      money: 12_345,
      completedRides: 8,
      ownedVehicleIds: ["starter", "used-compact"],
      equippedVehicleId: "used-compact",
      upgrades: { acceleration: 2, topSpeed: 3, turning: 4, braking: 5 },
    }));

    const migrated = createProfile(storage);
    expect(migrated.money).toBe(12_345);
    expect(migrated.completedRides).toBe(8);
    expect(migrated.equippedVehicleId).toBe("used-compact");
    expect(migrated.upgrades).toEqual({ acceleration: 2, topSpeed: 3, turning: 4, braking: 5 });
    expect(migrated.rideHistory).toEqual([]);
  });

  it("migrates version-two scorecards and classifies them as rideshare", () => {
    const storage = new MemoryStorage();
    const { missionCategoryId: _legacyCategory, ...legacyResult } = rideResult(14, "Legacy Rider");
    const legacyRide = { ...legacyResult, id: "legacy-ride", completedAt: 12345 };
    storage.setItem(GAME_CONFIG.progression.saveKey, JSON.stringify({
      version: 2,
      money: 90,
      completedRides: 1,
      ownedVehicleIds: ["starter"],
      equippedVehicleId: "starter",
      upgrades: { acceleration: 0, topSpeed: 0, turning: 0, braking: 0 },
      rideHistory: [legacyRide],
    }));

    const migrated = createProfile(storage);
    expect(migrated.ownedMissionLicenseIds).toEqual(["rideshare"]);
    expect(migrated.rideHistory[0].missionCategoryId).toBe("rideshare");
  });

  it("bounds persisted scorecards while retaining the lifetime ride count", () => {
    const profile = createProfile();
    for (let index = 0; index < GAME_CONFIG.progression.rideHistoryLimit + 3; index++) {
      profile.completeRide(rideResult(1, `Rider ${index}`));
    }

    expect(profile.completedRides).toBe(GAME_CONFIG.progression.rideHistoryLimit + 3);
    expect(profile.rideHistory).toHaveLength(GAME_CONFIG.progression.rideHistoryLimit);
    expect(profile.rideHistory[0].passengerName).toBe(`Rider ${GAME_CONFIG.progression.rideHistoryLimit + 2}`);
  });

  it("persists complete scorecard details across reloads", () => {
    const storage = new MemoryStorage();
    const profile = createProfile(storage);
    const result = rideResult(22.5, "Persistent Rider");

    profile.completeRide(result);
    const reloaded = createProfile(storage);

    expect(reloaded.rideHistory).toHaveLength(1);
    expect(reloaded.rideHistory[0]).toMatchObject(result);
    expect(reloaded.rideHistory[0].id).toMatch(/^ride-/);
    expect(reloaded.rideHistory[0].completedAt).toBeGreaterThan(0);
  });

  it("does not recreate a cleared save during disposal", () => {
    const storage = new MemoryStorage();
    const profile = createProfile(storage);
    profile.money = 10_000;
    profile.purchaseMissionLicense("taxi");
    profile.purchaseVehicle("used-compact", true);
    profile.purchaseUpgrade("acceleration");
    profile.completeRide(rideResult(10, "Reset Rider"));
    expect(storage.getItem(GAME_CONFIG.progression.saveKey)).not.toBeNull();

    profile.clearSave();
    profile.dispose();

    expect(storage.getItem(GAME_CONFIG.progression.saveKey)).toBeNull();
    const reset = createProfile(storage);
    expect(reset.money).toBe(GAME_CONFIG.progression.startingMoney);
    expect(reset.ownedVehicleIds).toEqual(["starter"]);
    expect(reset.equippedVehicleId).toBe("starter");
    expect(reset.ownedMissionLicenseIds).toEqual(["rideshare"]);
    expect(reset.upgrades).toEqual({ acceleration: 0, topSpeed: 0, turning: 0, braking: 0 });
    expect(reset.rideHistory).toEqual([]);
  });
});

function rideResult(total: number, passengerName: string): RideResult {
  return {
    passengerName,
    passengerType: PassengerType.Normal,
    missionCategoryId: "rideshare",
    rideTier: "SHORT",
    pickupDistance: 120,
    tripDistance: 300,
    durationSeconds: 45,
    collisionCount: 0,
    stars: 5,
    baseFare: total * 0.75,
    tip: total * 0.25,
    timeTipPercentRemaining: 90,
    violationPoints: 0,
    violationTipPenaltyPercent: 0,
    total,
  };
}

function createProfile(storage: KeyValueStorage = new MemoryStorage()): PlayerProfile {
  return new PlayerProfile(new ProgressionStore(storage));
}

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}
