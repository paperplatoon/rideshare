import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../game/config";
import type { DrivingViolationRates, DrivingViolationSeverity } from "../game/types";
import { PlayerProfile } from "../player/PlayerProfile";
import type { TrafficCar } from "../traffic/TrafficCar";
import { PoliceManager, calculatePoliceFine, isPlayerInPoliceView } from "./PoliceManager";

const legalRates: DrivingViolationRates = { speeding: 0, wrongSide: 0, sidewalk: 0, total: 0 };
const legalSeverity: DrivingViolationSeverity = { speeding: 0, wrongSide: 0, sidewalk: 0, combined: 0 };

describe("PoliceManager", () => {
  it("uses the configured forward and rear cones without side vision", () => {
    const officer = { x: 0, z: 0 };

    expect(isPlayerInPoliceView(officer, 0, { x: 0, z: GAME_CONFIG.police.forwardRange })).toBe(true);
    expect(isPlayerInPoliceView(officer, 0, { x: 0, z: -GAME_CONFIG.police.rearRange })).toBe(true);
    expect(isPlayerInPoliceView(officer, 0, { x: GAME_CONFIG.police.forwardRange, z: 0 })).toBe(false);
    expect(isPlayerInPoliceView(officer, 0, { x: 0, z: GAME_CONFIG.police.forwardRange + 0.1 })).toBe(false);
    expect(isPlayerInPoliceView(officer, Math.PI / 2, { x: 100, z: 0 })).toBe(true);
  });

  it("scales and rounds fines between the configured bounds", () => {
    expect(calculatePoliceFine(0)).toBe(40);
    expect(calculatePoliceFine(0.5)).toBe(95);
    expect(calculatePoliceFine(1)).toBe(150);
    expect(calculatePoliceFine(4)).toBe(150);
  });

  it("issues a strict wrong-way citation and takes all available funds", () => {
    const manager = new PoliceManager([officer(1)]);
    const profile = new PlayerProfile();
    profile.money = 50.25;
    const rates: DrivingViolationRates = { speeding: 0, wrongSide: 5, sidewalk: 0, total: 5 };
    const severity: DrivingViolationSeverity = { speeding: 0, wrongSide: 1, sidewalk: 0, combined: 1 };
    let citation = null;

    for (let step = 0; step < 10 && !citation; step++) {
      citation = manager.update(0.1, { x: 0, z: 40 }, rates, severity, profile);
    }

    expect(citation).toMatchObject({
      officerId: 1,
      offense: "WRONG WAY",
      assessedFine: 150,
      amountPaid: 50.25,
      remainingBalance: 0,
    });
    expect(profile.money).toBe(0);
    expect(manager.warning.progress).toBe(0);
  });

  it("decays suspicion and clears it when an officer is recycled", () => {
    const policeCar = officer(2);
    const manager = new PoliceManager([policeCar]);
    const profile = new PlayerProfile();
    const rates: DrivingViolationRates = { speeding: 2, wrongSide: 0, sidewalk: 0, total: 2 };
    const severity: DrivingViolationSeverity = { speeding: 1, wrongSide: 0, sidewalk: 0, combined: 1 };

    manager.update(0.1, { x: 0, z: 40 }, rates, severity, profile);
    expect(manager.warning.progress).toBeCloseTo(0.05);
    expect(manager.warning.activelyObserving).toBe(true);

    manager.update(0.1, { x: 0, z: 40 }, legalRates, legalSeverity, profile);
    expect(manager.warning.progress).toBe(0);

    manager.update(0.2, { x: 0, z: 40 }, rates, severity, profile);
    expect(manager.warning.progress).toBeGreaterThan(0);
    policeCar.respawnGeneration += 1;
    manager.update(0.1, { x: 0, z: 40 }, legalRates, legalSeverity, profile);
    expect(manager.warning.progress).toBe(0);
  });

  it("applies a global cooldown after one officer cites", () => {
    const manager = new PoliceManager([officer(3), officer(4, 5)]);
    const profile = new PlayerProfile();
    profile.money = 500;
    const rates: DrivingViolationRates = { speeding: 0, wrongSide: 5, sidewalk: 0, total: 5 };
    const severity: DrivingViolationSeverity = { speeding: 0, wrongSide: 1, sidewalk: 0, combined: 1 };
    let firstCitation = null;
    for (let step = 0; step < 10 && !firstCitation; step++) {
      firstCitation = manager.update(0.1, { x: 0, z: 40 }, rates, severity, profile);
    }
    expect(firstCitation).not.toBeNull();

    let repeatedCitation = null;
    for (let step = 0; step < 50; step++) {
      repeatedCitation = manager.update(0.1, { x: 0, z: 40 }, rates, severity, profile);
    }
    expect(repeatedCitation).toBeNull();
    expect(profile.money).toBe(350);
  });
});

function officer(id: number, x = 0): TrafficCar {
  return {
    id,
    role: "police",
    respawnGeneration: 1,
    mesh: {
      position: { x, z: 0 },
      rotation: { y: 0 },
      isEnabled: () => true,
    },
  } as unknown as TrafficCar;
}
