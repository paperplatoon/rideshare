import { GAME_CONFIG } from "../game/config";
import { PassengerType, type PoliceCitation, type RideHistoryEntry, type RideResult, type RideTier } from "../game/types";
import {
  MISSION_LICENSES,
  getMissionLicense,
  type MissionLicenseId,
} from "../missions/MissionLicenseCatalog";
import { ProgressionStore } from "../progression/ProgressionStore";
import { getUpgradeCost } from "../progression/UpgradeSystem";
import { VEHICLE_CATALOG, getVehicleDefinition } from "../vehicles/VehicleCatalog";
import type { PlayerProgression, PlayerUpgradeLevels, VehicleStatKey } from "../vehicles/VehicleTypes";

export class PlayerProfile {
  private moneyValue: number;
  private jailFreeCardsValue: number;
  private vehicleCouponsValue: number;
  private readonly settledCitations = new WeakSet<PoliceCitation>();
  private temporaryDebugMoneyValue = 0;
  private completedRidesValue: number;
  private ownedVehicleIdsValue: string[];
  private equippedVehicleIdValue: string;
  private ownedMissionLicenseIdsValue: MissionLicenseId[];
  private rideHistoryValue: RideHistoryEntry[];
  readonly upgrades: PlayerUpgradeLevels;
  private dirty = false;
  private autosaveElapsed = 0;
  private persistenceDisabled = false;
  private readonly onPageHide = () => this.saveNow();

  constructor(private readonly store = new ProgressionStore()) {
    const progression = sanitizeProgression(store.load());
    this.moneyValue = progression.money;
    this.jailFreeCardsValue = progression.jailFreeCards;
    this.vehicleCouponsValue = progression.vehicleCoupons;
    this.completedRidesValue = progression.completedRides;
    this.ownedVehicleIdsValue = progression.ownedVehicleIds;
    this.equippedVehicleIdValue = progression.equippedVehicleId;
    this.ownedMissionLicenseIdsValue = progression.ownedMissionLicenseIds;
    this.rideHistoryValue = progression.rideHistory;
    this.upgrades = progression.upgrades;
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.onPageHide);
  }

  get money(): number {
    return this.moneyValue;
  }

  set money(value: number) {
    this.moneyValue = Math.max(0, Number.isFinite(value) ? value : 0);
    this.temporaryDebugMoneyValue = 0;
    this.dirty = true;
  }

  get completedRides(): number {
    return this.completedRidesValue;
  }

  get ownedVehicleIds(): readonly string[] {
    return this.ownedVehicleIdsValue;
  }

  get equippedVehicleId(): string {
    return this.equippedVehicleIdValue;
  }

  get rideHistory(): readonly RideHistoryEntry[] {
    return this.rideHistoryValue;
  }

  get ownedMissionLicenseIds(): readonly MissionLicenseId[] {
    return this.ownedMissionLicenseIdsValue;
  }

  get jailFreeCards(): number { return this.jailFreeCardsValue; }
  get vehicleCoupons(): number { return this.vehicleCouponsValue; }

  getVehiclePurchaseQuote(id: string): { price: number; couponsUsed: number; discount: number } | null {
    const vehicle = getVehicleDefinition(id);
    if (!vehicle) return null;
    const couponsUsed = this.ownsVehicle(id) ? 0 : Math.min(
      this.vehicleCouponsValue, Math.ceil(vehicle.price / GAME_CONFIG.ride.archetypes.vehicleCouponValue),
    );
    const discount = Math.min(vehicle.price, couponsUsed * GAME_CONFIG.ride.archetypes.vehicleCouponValue);
    return { price: vehicle.price - discount, couponsUsed, discount };
  }

  settlePoliceCitation(citation: PoliceCitation, lawyerOnboard = false): void {
    if (this.settledCitations.has(citation)) return;
    this.settledCitations.add(citation);
    const waiverReason = lawyerOnboard ? "lawyer" : this.jailFreeCardsValue > 0 ? "card" : undefined;
    if (waiverReason === "card") this.jailFreeCardsValue -= 1;
    citation.waiverReason = waiverReason;
    citation.waivedAmount = waiverReason
      ? citation.assessedFine + citation.resistingArrestFine + (citation.possessionFine ?? 0) : 0;
    citation.amountPaid = waiverReason ? 0 : this.spend(citation.assessedFine);
    citation.resistingArrestAmountPaid = waiverReason ? 0 : this.spend(citation.resistingArrestFine);
    if (citation.possessionFine !== undefined) {
      citation.possessionAmountPaid = waiverReason ? 0 : this.spend(citation.possessionFine);
    }
    citation.remainingBalance = this.money;
    this.saveNow();
  }

  completeRide(result: RideResult): void {
    this.jailFreeCardsValue += Math.floor(finiteNonnegative(result.cardsEarned, 0));
    this.vehicleCouponsValue += Math.floor(finiteNonnegative(result.couponsEarned, 0));
    this.moneyValue += Math.max(0, result.total);
    this.completedRidesValue += 1;
    const completedAt = Date.now();
    const historyEntry: RideHistoryEntry = {
      ...result,
      id: `ride-${completedAt}-${this.completedRidesValue}`,
      completedAt,
    };
    this.rideHistoryValue = [historyEntry, ...this.rideHistoryValue]
      .slice(0, GAME_CONFIG.progression.rideHistoryLimit);
    this.saveNow();
  }

  spend(requestedAmount: number): number {
    const spent = Math.min(Math.max(0, requestedAmount), this.moneyValue);
    if (spent > 0) this.deductMoney(spent);
    return spent;
  }

  ownsVehicle(id: string): boolean {
    return this.ownedVehicleIdsValue.includes(id);
  }

  ownsMissionLicense(id: string): boolean {
    return this.ownedMissionLicenseIdsValue.includes(id as MissionLicenseId);
  }

  purchaseMissionLicense(id: string): boolean {
    const license = getMissionLicense(id);
    if (!license || this.ownsMissionLicense(id) || this.moneyValue < license.unlockCost) return false;
    this.deductMoney(license.unlockCost);
    this.ownedMissionLicenseIdsValue = [...this.ownedMissionLicenseIdsValue, license.id];
    this.saveNow();
    return true;
  }

  purchaseVehicle(id: string, equipImmediately: boolean): boolean {
    const vehicle = getVehicleDefinition(id);
    const quote = this.getVehiclePurchaseQuote(id);
    if (!vehicle || !quote || this.ownsVehicle(id) || this.moneyValue < quote.price) return false;
    this.deductMoney(quote.price);
    this.vehicleCouponsValue -= quote.couponsUsed;
    this.ownedVehicleIdsValue = [...this.ownedVehicleIdsValue, id];
    if (equipImmediately) this.equippedVehicleIdValue = id;
    this.saveNow();
    return true;
  }

  equipVehicle(id: string): boolean {
    if (!this.ownsVehicle(id) || !getVehicleDefinition(id)) return false;
    this.equippedVehicleIdValue = id;
    this.saveNow();
    return true;
  }

  purchaseUpgrade(stat: VehicleStatKey): boolean {
    const nextLevel = this.upgrades[stat] + 1;
    const cost = getUpgradeCost(nextLevel);
    if (cost <= 0 || this.moneyValue < cost) return false;
    this.deductMoney(cost);
    this.upgrades[stat] = nextLevel;
    this.saveNow();
    return true;
  }

  addMoney(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.moneyValue += amount;
    this.saveNow();
  }

  addTemporaryDebugMoney(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.moneyValue += amount;
    this.temporaryDebugMoneyValue += amount;
  }

  resetMoneyToStartingAmount(): void {
    this.moneyValue = GAME_CONFIG.progression.startingMoney;
    this.temporaryDebugMoneyValue = 0;
    this.saveNow();
  }

  unlockAllVehicles(): void {
    this.ownedVehicleIdsValue = VEHICLE_CATALOG.map((vehicle) => vehicle.id);
    this.saveNow();
  }

  setUpgradeLevel(stat: VehicleStatKey, level: number): void {
    this.upgrades[stat] = clampLevel(level);
    this.saveNow();
  }

  resetUpgrades(): void {
    for (const stat of Object.keys(this.upgrades) as VehicleStatKey[]) this.upgrades[stat] = 0;
    this.saveNow();
  }

  updateAutosave(deltaTime: number): void {
    if (!this.dirty) return;
    this.autosaveElapsed += deltaTime;
    if (this.autosaveElapsed >= GAME_CONFIG.progression.autosaveSeconds) this.saveNow();
  }

  saveNow(): void {
    if (this.persistenceDisabled) return;
    this.store.save(this.toProgression());
    this.dirty = false;
    this.autosaveElapsed = 0;
  }

  clearSave(): void {
    this.persistenceDisabled = true;
    this.dirty = false;
    this.store.clear();
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.onPageHide);
  }

  dispose(): void {
    this.saveNow();
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.onPageHide);
  }

  private toProgression(): PlayerProgression {
    return {
      version: GAME_CONFIG.progression.saveVersion,
      jailFreeCards: this.jailFreeCardsValue,
      vehicleCoupons: this.vehicleCouponsValue,
      money: Math.max(0, this.moneyValue - this.temporaryDebugMoneyValue),
      completedRides: this.completedRidesValue,
      ownedVehicleIds: [...this.ownedVehicleIdsValue],
      equippedVehicleId: this.equippedVehicleIdValue,
      upgrades: { ...this.upgrades },
      ownedMissionLicenseIds: [...this.ownedMissionLicenseIdsValue],
      rideHistory: this.rideHistoryValue.map((entry) => ({ ...entry })),
    };
  }

  private deductMoney(amount: number): void {
    this.moneyValue -= amount;
    this.temporaryDebugMoneyValue = Math.max(0, this.temporaryDebugMoneyValue - amount);
    this.dirty = true;
  }
}

export function defaultProgression(): PlayerProgression {
  return {
    version: GAME_CONFIG.progression.saveVersion,
    jailFreeCards: 0,
    vehicleCoupons: 0,
    money: GAME_CONFIG.progression.startingMoney,
    completedRides: 0,
    ownedVehicleIds: ["starter"],
    equippedVehicleId: "starter",
    upgrades: { acceleration: 0, topSpeed: 0, turning: 0, braking: 0 },
    ownedMissionLicenseIds: ["rideshare"],
    rideHistory: [],
  };
}

function sanitizeProgression(value: unknown): PlayerProgression {
  const defaults = defaultProgression();
  if (!value || typeof value !== "object") return defaults;
  const source = value as Partial<PlayerProgression>;
  if (![1, 2, 3, GAME_CONFIG.progression.saveVersion].includes(source.version ?? -1)) return defaults;
  const knownIds = new Set(VEHICLE_CATALOG.map((vehicle) => vehicle.id));
  const owned = Array.isArray(source.ownedVehicleIds)
    ? [...new Set(source.ownedVehicleIds.filter((id): id is string => typeof id === "string" && knownIds.has(id)))]
    : [];
  if (!owned.includes("starter")) owned.unshift("starter");
  const equipped = typeof source.equippedVehicleId === "string" && owned.includes(source.equippedVehicleId)
    ? source.equippedVehicleId
    : "starter";
  const upgrades = source.upgrades && typeof source.upgrades === "object" ? source.upgrades : defaults.upgrades;
  const knownLicenseIds = new Set<MissionLicenseId>(MISSION_LICENSES.map((license) => license.id));
  const ownedMissionLicenseIds = Array.isArray(source.ownedMissionLicenseIds)
    ? [...new Set(source.ownedMissionLicenseIds.filter(
      (id): id is MissionLicenseId => typeof id === "string" && knownLicenseIds.has(id as MissionLicenseId),
    ))]
    : [];
  if (!ownedMissionLicenseIds.includes("rideshare")) ownedMissionLicenseIds.unshift("rideshare");
  return {
    version: GAME_CONFIG.progression.saveVersion,
    jailFreeCards: Math.floor(finiteNonnegative(source.jailFreeCards, 0)),
    vehicleCoupons: Math.floor(finiteNonnegative(source.vehicleCoupons, 0)),
    money: finiteNonnegative(source.money, defaults.money),
    completedRides: Math.floor(finiteNonnegative(source.completedRides, 0)),
    ownedVehicleIds: owned,
    equippedVehicleId: equipped,
    upgrades: {
      acceleration: clampLevel(upgrades.acceleration),
      topSpeed: clampLevel(upgrades.topSpeed),
      turning: clampLevel(upgrades.turning),
      braking: clampLevel(upgrades.braking),
    },
    ownedMissionLicenseIds,
    rideHistory: sanitizeRideHistory(source.rideHistory),
  };
}

function sanitizeRideHistory(value: unknown): RideHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const passengerTypes = new Set<string>(Object.values(PassengerType));
  const rideTiers = new Set<RideTier>(["SHORT", "MEDIUM", "LONG"]);
  const entries: RideHistoryEntry[] = [];
  for (const candidate of value.slice(0, GAME_CONFIG.progression.rideHistoryLimit)) {
    if (!candidate || typeof candidate !== "object") continue;
    const entry = candidate as Partial<RideHistoryEntry>;
    if (
      typeof entry.id !== "string"
      || typeof entry.passengerName !== "string"
      || typeof entry.passengerType !== "string"
      || !passengerTypes.has(entry.passengerType)
      || typeof entry.rideTier !== "string"
      || !rideTiers.has(entry.rideTier as RideTier)
      || typeof entry.completedAt !== "number"
      || !Number.isFinite(entry.completedAt)
      || entry.completedAt < 0
    ) continue;
    entries.push({
      id: entry.id,
      completedAt: finiteNonnegative(entry.completedAt, 0),
      passengerName: entry.passengerName,
      passengerType: entry.passengerType as PassengerType,
      missionCategoryId: getMissionLicense(entry.missionCategoryId ?? "")?.id ?? "rideshare",
      rideTier: entry.rideTier as RideTier,
      pickupDistance: finiteNonnegative(entry.pickupDistance, 0),
      tripDistance: finiteNonnegative(entry.tripDistance, 0),
      durationSeconds: finiteNonnegative(entry.durationSeconds, 0),
      collisionCount: Math.floor(finiteNonnegative(entry.collisionCount, 0)),
      stars: Math.floor(clampNumber(entry.stars, 0, 5)),
      baseFare: finiteNonnegative(entry.baseFare, 0),
      tip: finiteNonnegative(entry.tip, 0),
      bonusTip: finiteNonnegative(entry.bonusTip, 0),
      traitTipDeduction: finiteNonnegative(entry.traitTipDeduction, 0),
      fareWaived: entry.fareWaived === true,
      cardsEarned: Math.floor(finiteNonnegative(entry.cardsEarned, 0)),
      couponsEarned: Math.floor(finiteNonnegative(entry.couponsEarned, 0)),
      timeTipPercentRemaining: clampNumber(entry.timeTipPercentRemaining, 0, 100),
      violationPoints: finiteNonnegative(entry.violationPoints, 0),
      violationTipPenaltyPercent: clampNumber(entry.violationTipPenaltyPercent, 0, 100),
      total: finiteNonnegative(entry.total, 0),
    });
  }
  return entries;
}

function finiteNonnegative(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function clampLevel(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(GAME_CONFIG.progression.maxUpgradeLevel, Math.floor(value)));
}

function clampNumber(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}
