import { describe, expect, it, vi } from "vitest";
import { GAME_CONFIG } from "../game/config";
import type { DrivingViolationRates, DrivingViolationSeverity } from "../game/types";
import { PlayerProfile } from "../player/PlayerProfile";
import type { TrafficCar } from "../traffic/TrafficCar";
import { PoliceManager, calculatePoliceFine, isPlayerInPoliceView } from "./PoliceManager";

const legalRates: DrivingViolationRates = { speeding: 0, wrongSide: 0, sidewalk: 0, total: 0 };
const legalSeverity: DrivingViolationSeverity = { speeding: 0, wrongSide: 0, sidewalk: 0, combined: 0 };

describe("PoliceManager", () => {
  it("combines close circular vision with configurable front, rear, and side sightlines", () => {
    const officer = { x: 0, z: 0 };
    const police = GAME_CONFIG.police;
    const halfWidth = police.visionCrossWidth / 2;

    expect(isPlayerInPoliceView(officer, 0, { x: police.visionRadius * 0.6, z: police.visionRadius * 0.6 })).toBe(true);
    expect(isPlayerInPoliceView(officer, 0, { x: halfWidth, z: police.visionForwardLength })).toBe(true);
    expect(isPlayerInPoliceView(officer, 0, { x: 0, z: -police.visionRearLength })).toBe(true);
    expect(isPlayerInPoliceView(officer, 0, { x: police.visionSideLength, z: halfWidth })).toBe(true);
    expect(isPlayerInPoliceView(officer, 0, { x: -police.visionSideLength, z: 0 })).toBe(true);
    expect(isPlayerInPoliceView(officer, 0, { x: halfWidth + 0.1, z: police.visionForwardLength })).toBe(false);
    expect(isPlayerInPoliceView(officer, 0, { x: 0, z: -police.visionRearLength - 0.1 })).toBe(false);
    expect(isPlayerInPoliceView(officer, 0, { x: police.visionSideLength + 0.1, z: 0 })).toBe(false);
    expect(isPlayerInPoliceView(officer, Math.PI / 2, { x: police.visionForwardLength, z: 0 })).toBe(true);
  });

  it("scales and rounds fines between the configured bounds", () => {
    expect(calculatePoliceFine(0)).toBe(40);
    expect(calculatePoliceFine(0.5)).toBe(95);
    expect(calculatePoliceFine(1)).toBe(150);
    expect(calculatePoliceFine(4)).toBe(150);
  });

  it("starts pursuit at the evidence threshold and cites after four seconds in bust range", () => {
    const policeCar = officer(1);
    const manager = new PoliceManager([policeCar]);
    const profile = new PlayerProfile();
    profile.money = 50.25;
    const rates: DrivingViolationRates = { speeding: 0, wrongSide: 5, sidewalk: 0, total: 5 };
    const severity: DrivingViolationSeverity = { speeding: 0, wrongSide: 1, sidewalk: 0, combined: 1 };
    let citation = null;

    for (let step = 0; step < 10 && !manager.isPursuitActive; step++) {
      citation = manager.update(0.1, { x: 0, z: 40 }, rates, severity, profile);
    }

    expect(citation).toBeNull();
    expect(manager.isPursuitActive).toBe(true);
    expect(manager.activePursuerId).toBe(1);
    expect(profile.money).toBe(50.25);
    expect(manager.warning.phase).toBe("pursuit");

    for (let step = 0; step < 50 && !citation; step++) {
      citation = manager.update(0.1, { x: 0, z: 5 }, legalRates, legalSeverity, profile);
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
    expect(manager.warning.phase).toBe("idle");
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

  it("uses only the confirming officer and applies a global cooldown after the bust", () => {
    const firstOfficer = officer(3);
    const secondOfficer = officer(4, 5);
    const manager = new PoliceManager([firstOfficer, secondOfficer]);
    const profile = new PlayerProfile();
    profile.money = 500;
    const rates: DrivingViolationRates = { speeding: 0, wrongSide: 5, sidewalk: 0, total: 5 };
    const severity: DrivingViolationSeverity = { speeding: 0, wrongSide: 1, sidewalk: 0, combined: 1 };
    let firstCitation = null;
    for (let step = 0; step < 10 && !manager.isPursuitActive; step++) {
      manager.update(0.1, { x: 0, z: 40 }, rates, severity, profile);
    }
    expect(manager.activePursuerId).toBe(3);
    expect(firstOfficer.setPursuitTarget).toHaveBeenCalled();
    expect(secondOfficer.setPursuitTarget).not.toHaveBeenCalled();

    for (let step = 0; step < 50 && !firstCitation; step++) {
      firstCitation = manager.update(0.1, { x: 0, z: 5 }, legalRates, legalSeverity, profile);
    }
    expect(firstCitation).not.toBeNull();

    let repeatedCitation = null;
    for (let step = 0; step < 50; step++) {
      repeatedCitation = manager.update(0.1, { x: 0, z: 40 }, rates, severity, profile);
    }
    expect(repeatedCitation).toBeNull();
    expect(profile.money).toBe(350);
  });

  it("starts pursuit rather than immediately citing a witnessed traffic collision", () => {
    const policeCar = officer(5);
    const manager = new PoliceManager([policeCar]);
    const profile = new PlayerProfile();
    profile.money = 500;

    const started = manager.registerTrafficCollision({ x: 0, z: 40 }, 0.5);

    expect(started).toBe(true);
    expect(manager.isPursuitActive).toBe(true);
    expect(manager.activePursuerId).toBe(5);
    expect(profile.money).toBe(500);
    expect(manager.warning.progress).toBe(0);
  });

  it("does not cite a collision outside every officer's view", () => {
    const manager = new PoliceManager([officer(6)]);
    const profile = new PlayerProfile();
    profile.money = 500;

    const started = manager.registerTrafficCollision(
      { x: GAME_CONFIG.police.visionSideLength + 1, z: 0 },
      1,
    );

    expect(started).toBe(false);
    expect(profile.money).toBe(500);
    expect(manager.warning.progress).toBe(0);
  });

  it("cites any direct collision with a police vehicle regardless of fault or view", () => {
    const manager = new PoliceManager([officer(7)]);
    const profile = new PlayerProfile();
    profile.money = 100;

    const citation = manager.registerPoliceCollision(7, 0, profile);

    expect(citation).toMatchObject({
      officerId: 7,
      offense: "COLLISION WITH POLICE",
      assessedFine: GAME_CONFIG.police.minimumFine,
      amountPaid: GAME_CONFIG.police.minimumFine,
      remainingBalance: 100 - GAME_CONFIG.police.minimumFine,
    });
  });

  it("decays bust progress at one-times speed outside the bust radius", () => {
    const manager = new PoliceManager([officer(8)]);
    const profile = new PlayerProfile();
    profile.money = 500;
    expect(manager.registerTrafficCollision({ x: 0, z: 40 }, 0.5)).toBe(true);

    for (let step = 0; step < 20; step++) {
      manager.update(0.1, { x: 0, z: 5 }, legalRates, legalSeverity, profile);
    }
    expect(manager.warning.phase).toBe("busting");
    expect(manager.warning.progress).toBeCloseTo(0.5);

    for (let step = 0; step < 10; step++) {
      manager.update(0.1, { x: 0, z: 20 }, legalRates, legalSeverity, profile);
    }
    expect(manager.warning.phase).toBe("pursuit");
    expect(manager.warning.progress).toBeCloseTo(0.25);
    expect(manager.isPursuitActive).toBe(true);
  });

  it("ends pursuit after eight continuous seconds beyond the escape distance", () => {
    const policeCar = officer(9);
    const manager = new PoliceManager([policeCar]);
    const profile = new PlayerProfile();
    const escapedPlayer = {
      x: GAME_CONFIG.police.escapeDistanceMeters / GAME_CONFIG.ride.metersPerWorldUnit + 1,
      z: 0,
    };
    expect(manager.registerTrafficCollision({ x: 0, z: 40 }, 0.5)).toBe(true);

    for (let step = 0; step < 40; step++) {
      manager.update(0.1, escapedPlayer, legalRates, legalSeverity, profile);
    }
    manager.update(0.1, { x: 0, z: 20 }, legalRates, legalSeverity, profile);
    for (let step = 0; step < 79; step++) {
      manager.update(0.1, escapedPlayer, legalRates, legalSeverity, profile);
    }
    expect(manager.isPursuitActive).toBe(true);

    manager.update(0.1, escapedPlayer, legalRates, legalSeverity, profile);
    expect(manager.isPursuitActive).toBe(false);
    expect(manager.warning.phase).toBe("idle");
    expect(policeCar.clearPursuit).toHaveBeenCalled();
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
    setPursuitTarget: vi.fn(),
    clearPursuit: vi.fn(),
  } as unknown as TrafficCar;
}
