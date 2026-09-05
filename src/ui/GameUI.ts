import { passengerArchetype } from "../ride/PassengerArchetypes";
import type { RideOfferBoard } from "../ride/RideOfferBoard";
import type { RideManager } from "../ride/RideManager";
import type { PlayerCar } from "../player/PlayerCar";
import type { FuelManager } from "../player/FuelManager";
import type { DamageManager } from "../player/DamageManager";
import type { PoliceManager } from "../police/PoliceManager";
import { PackageDeliveryState, type PackageDeliveryManager } from "../delivery/PackageDeliveryManager";
import { GAME_CONFIG } from "../game/config";
import { PassengerType, RideState, type PoliceCitation, type RideHistoryEntry, type RideResult, type RideOffer } from "../game/types";
import type { Town } from "../world/Town";
import { distanceXZ, normalizeAngle } from "../utils/math";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { PlayerProfile } from "../player/PlayerProfile";
import { applyPermanentUpgrades, getUpgradeCost, VEHICLE_STAT_KEYS } from "../progression/UpgradeSystem";
import { ELITE_VEHICLE, VEHICLE_CATALOG, normalizedVehicleStat } from "../vehicles/VehicleCatalog";
import type { VehicleDefinition, VehicleStatKey } from "../vehicles/VehicleTypes";
import {
  MISSION_LICENSES,
  getMissionLicense,
  type MissionLicenseDefinition,
  type MissionLicenseId,
} from "../missions/MissionLicenseCatalog";
import { projectMapHeight, projectMapPoint, projectMapWidth } from "./MapProjection";

export interface GameUIActions {
  start(): void;
  acceptRide(categoryId: MissionLicenseId, id: string): boolean;
  acceptPackageDelivery(id: string): boolean;
  purchaseMissionLicense(id: MissionLicenseId): string;
  purchaseVehicle(id: string): string;
  equipVehicle(id: string): string;
  purchaseUpgrade(stat: VehicleStatKey): string;
  acknowledgeCitation(): void;
  debugGiveMoney(): void;
  debugResetMoney(): void;
  debugUnlockAllCars(): void;
  debugResetUpgrades(): void;
  debugSetUpgrade(stat: VehicleStatKey, level: number): void;
  debugEquipVehicle(id: string): void;
  debugTogglePoliceVision(): boolean;
  resetProgression(): void;
}

export class GameUI {
  private readonly startScreen: HTMLDivElement;
  private readonly pauseScreen: HTMLDivElement;
  private readonly pauseBalance: HTMLDivElement;
  private readonly packageUnlockButton: HTMLButtonElement;
  private readonly pauseFeedback: HTMLDivElement;
  private readonly hud: HTMLDivElement;
  private readonly indicator: HTMLDivElement;
  private readonly phone: HTMLDivElement;
  private readonly map: HTMLDivElement;
  private readonly refuelOverlay: HTMLDivElement;
  private readonly refuelButton: HTMLButtonElement;
  private readonly repairOverlay: HTMLDivElement;
  private readonly repairButton: HTMLButtonElement;
  private readonly rideResult: HTMLDivElement;
  private readonly citationOverlay: HTMLDivElement;
  private readonly policeMeter: HTMLDivElement;
  private readonly policeMeterLabel: HTMLDivElement;
  private readonly policeFineLabel: HTMLDivElement;
  private readonly policeMeterFill: HTMLDivElement;
  private readonly policeEscapeFill: HTMLDivElement;
  private readonly debugProgression: HTMLDivElement | null;
  private readonly startButton: HTMLButtonElement;
  private readonly moneyValue: HTMLDivElement;
  private readonly ridesValue: HTMLDivElement;
  private readonly speedometer: HTMLDivElement;
  private readonly fuelMeter: HTMLDivElement;
  private readonly fuelLabel: HTMLDivElement;
  private readonly fuelFill: HTMLDivElement;
  private readonly damageMeter: HTMLDivElement;
  private readonly damageLabel: HTMLDivElement;
  private readonly damageFill: HTMLDivElement;
  private readonly refuelStatus: HTMLDivElement;
  private readonly rideHud: HTMLDivElement;
  private readonly collisionFlash: HTMLDivElement;
  private readonly indicatorArrow: HTMLSpanElement;
  private readonly indicatorDistance: HTMLSpanElement;
  private phoneOpen = false;
  private phoneRefreshElapsed = 0;
  private mapOpen = false;
  private refuelHeld = false;
  private repairHeld = false;
  private lastRideHudHtml = "";
  private lastPhoneHtml = "";
  private lastRideResultHtml = "";
  private mapTown: Town | null = null;
  private mapPlayer: HTMLDivElement | null = null;
  private mapPickup: HTMLDivElement | null = null;
  private mapDropoff: HTMLDivElement | null = null;
  private phoneTab: MissionLicenseId | "garage" | "upgrades" | "scorecard" = "rideshare";
  private garagePage = 0;
  private scorecardPage = 0;
  private phoneFeedback = "";
  private phoneFeedbackSeconds = 0;
  private pausedProfile: PlayerProfile | null = null;

  constructor(
    private readonly root: HTMLDivElement,
    private readonly actions: GameUIActions,
  ) {
    root.innerHTML = "";

    this.startScreen = document.createElement("div");
    this.startScreen.className = "screen";
    this.startScreen.innerHTML = `
      <div class="panel">
        <h1>RIDE-SHARE DRIVER</h1>
        <p>Pick jobs, earn money, and keep gas in the tank.</p>
        <p>WASD to drive. P opens the app. M opens the map. R resets your car.</p>
        <button type="button">START</button>
      </div>
    `;
    this.startButton = this.startScreen.querySelector("button")!;
    this.startButton.addEventListener("click", () => actions.start());

    this.pauseScreen = document.createElement("div");
    this.pauseScreen.className = "screen pause-screen hidden";
    this.pauseScreen.innerHTML = `
      <div class="panel">
        <h1>PAUSED</h1>
        <p>Press Escape to resume.</p>
        <div class="pause-balance" data-pause-balance></div>
        <div class="pause-license">
          <div class="pause-license-title">PACKAGE DELIVERY</div>
          <div class="pause-license-description">Unlock time-sensitive package jobs.</div>
          <button type="button" data-unlock-packages></button>
        </div>
        <div class="pause-feedback" data-pause-feedback></div>
        <button type="button" class="pause-reset" data-reset-progression>RESET PROGRESSION</button>
      </div>
    `;
    this.pauseBalance = this.pauseScreen.querySelector("[data-pause-balance]")!;
    this.packageUnlockButton = this.pauseScreen.querySelector("[data-unlock-packages]")!;
    this.pauseFeedback = this.pauseScreen.querySelector("[data-pause-feedback]")!;
    this.packageUnlockButton.addEventListener("click", () => {
      if (!this.pausedProfile) return;
      this.pauseFeedback.textContent = actions.purchaseMissionLicense("package_delivery");
      this.renderPauseProgression(this.pausedProfile);
    });
    this.pauseScreen.querySelector("[data-reset-progression]")!.addEventListener("click", () => {
      if (window.confirm("Reset all progression? This will erase your money, purchases, upgrades, and ride history.")) {
        actions.resetProgression();
      }
    });

    this.hud = document.createElement("div");
    this.hud.className = "hud hidden";
    this.hud.innerHTML = `
      <div class="hud-stats" data-hud="stats">
        <div class="hud-stat" data-hud="money"></div>
        <div class="hud-stat" data-hud="rides"></div>
        <div class="hud-stat speedometer" data-hud="speed"></div>
        <div class="fuel-meter" data-hud="fuel">
          <div class="fuel-label" data-hud="fuel-label"></div>
          <div class="fuel-track"><div class="fuel-fill" data-hud="fuel-fill"></div></div>
        </div>
        <div class="damage-meter" data-hud="damage">
          <div class="damage-label" data-hud="damage-label"></div>
          <div class="damage-track"><div class="damage-fill" data-hud="damage-fill"></div></div>
        </div>
      </div>
      <div class="police-meter hidden" data-hud="police">
        <div class="police-meter-label" data-hud="police-label"></div>
        <div class="police-fine-label hidden" data-hud="police-fine"></div>
        <div class="police-meter-track">
          <div class="police-meter-fill" data-hud="police-fill"></div>
          <div class="police-escape-fill" data-hud="police-escape-fill"></div>
        </div>
      </div>
      <div class="refuel-status hidden" data-hud="refuel">REFUELING</div>
      <div class="mission-row">
        <div class="ride-hud" data-hud="ride"></div>
        <div class="indicator hidden" data-hud="indicator"><span class="arrow">↑</span><span data-indicator="distance"></span></div>
      </div>
      <div class="collision-flash hidden" data-hud="collision"></div>
    `;
    this.moneyValue = this.hud.querySelector('[data-hud="money"]')!;
    this.ridesValue = this.hud.querySelector('[data-hud="rides"]')!;
    this.speedometer = this.hud.querySelector('[data-hud="speed"]')!;
    this.fuelMeter = this.hud.querySelector('[data-hud="fuel"]')!;
    this.fuelLabel = this.hud.querySelector('[data-hud="fuel-label"]')!;
    this.fuelFill = this.hud.querySelector('[data-hud="fuel-fill"]')!;
    this.damageMeter = this.hud.querySelector('[data-hud="damage"]')!;
    this.damageLabel = this.hud.querySelector('[data-hud="damage-label"]')!;
    this.damageFill = this.hud.querySelector('[data-hud="damage-fill"]')!;
    this.policeMeter = this.hud.querySelector('[data-hud="police"]')!;
    this.policeMeterLabel = this.hud.querySelector('[data-hud="police-label"]')!;
    this.policeFineLabel = this.hud.querySelector('[data-hud="police-fine"]')!;
    this.policeMeterFill = this.hud.querySelector('[data-hud="police-fill"]')!;
    this.policeEscapeFill = this.hud.querySelector('[data-hud="police-escape-fill"]')!;
    this.refuelStatus = this.hud.querySelector('[data-hud="refuel"]')!;
    this.rideHud = this.hud.querySelector('[data-hud="ride"]')!;
    this.collisionFlash = this.hud.querySelector('[data-hud="collision"]')!;
    this.indicator = this.hud.querySelector('[data-hud="indicator"]')!;
    this.indicatorArrow = this.indicator.querySelector(".arrow")!;
    this.indicatorDistance = this.indicator.querySelector('[data-indicator="distance"]')!;
    this.phone = document.createElement("div");
    this.phone.className = "phone-overlay hidden";
    this.phone.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-phone-close]")) {
        this.closePhone();
        return;
      }
      const tab = target.closest<HTMLButtonElement>("[data-phone-tab]");
      if (tab) {
        this.phoneTab = (tab.dataset.phoneTab as typeof this.phoneTab) ?? "rideshare";
        this.lastPhoneHtml = "";
        return;
      }
      const pageButton = target.closest<HTMLButtonElement>("[data-phone-page]");
      if (pageButton && !pageButton.disabled) {
        const delta = Number(pageButton.dataset.pageDelta ?? 0);
        if (pageButton.dataset.phonePage === "garage") this.garagePage += delta;
        if (pageButton.dataset.phonePage === "scorecard") this.scorecardPage += delta;
        this.lastPhoneHtml = "";
        return;
      }
      const rideButton = target.closest<HTMLButtonElement>("[data-ride-id]");
      if (rideButton) {
        const categoryId = rideButton.dataset.rideCategory as MissionLicenseId;
        if (this.actions.acceptRide(categoryId, rideButton.dataset.rideId ?? "")) this.closePhone();
        return;
      }
      const packageButton = target.closest<HTMLButtonElement>("[data-package-delivery-id]");
      if (packageButton) {
        if (this.actions.acceptPackageDelivery(packageButton.dataset.packageDeliveryId ?? "")) this.closePhone();
        return;
      }
      const licenseButton = target.closest<HTMLButtonElement>("[data-purchase-license]");
      if (licenseButton) {
        this.showPhoneFeedback(this.actions.purchaseMissionLicense(
          licenseButton.dataset.purchaseLicense as MissionLicenseId,
        ));
        return;
      }
      const buyButton = target.closest<HTMLButtonElement>("[data-buy-vehicle]");
      if (buyButton) {
        this.showPhoneFeedback(this.actions.purchaseVehicle(buyButton.dataset.buyVehicle ?? ""));
        return;
      }
      const equipButton = target.closest<HTMLButtonElement>("[data-equip-vehicle]");
      if (equipButton) {
        this.showPhoneFeedback(this.actions.equipVehicle(equipButton.dataset.equipVehicle ?? ""));
        return;
      }
      const upgradeButton = target.closest<HTMLButtonElement>("[data-upgrade-stat]");
      if (upgradeButton) {
        this.showPhoneFeedback(this.actions.purchaseUpgrade(upgradeButton.dataset.upgradeStat as VehicleStatKey));
      }
    });
    this.map = document.createElement("div");
    this.map.className = "map-overlay hidden";
    this.refuelOverlay = document.createElement("div");
    this.refuelOverlay.className = "refuel-overlay hidden";
    this.refuelOverlay.innerHTML = `
      <div class="refuel-panel">
        <div class="refuel-title">GAS STATION</div>
        <button type="button" class="refuel-button">FILL TANK</button>
      </div>
    `;
    this.refuelButton = this.refuelOverlay.querySelector("button")!;
    this.refuelButton.addEventListener("pointerdown", (event) => {
      if (this.refuelButton.disabled) return;
      event.preventDefault();
      this.refuelHeld = true;
      this.refuelButton.setPointerCapture(event.pointerId);
    });
    this.refuelButton.addEventListener("pointerup", (event) => {
      this.refuelHeld = false;
      if (this.refuelButton.hasPointerCapture(event.pointerId)) {
        this.refuelButton.releasePointerCapture(event.pointerId);
      }
    });
    this.refuelButton.addEventListener("pointercancel", () => {
      this.refuelHeld = false;
    });
    window.addEventListener("blur", () => {
      this.refuelHeld = false;
      this.repairHeld = false;
    });
    this.repairOverlay = document.createElement("div");
    this.repairOverlay.className = "repair-overlay hidden";
    this.repairOverlay.innerHTML = `
      <div class="repair-panel">
        <div class="repair-title">AUTO BODY</div>
        <button type="button" class="repair-button">REPAIR CAR</button>
      </div>
    `;
    this.repairButton = this.repairOverlay.querySelector("button")!;
    this.repairButton.addEventListener("pointerdown", (event) => {
      if (this.repairButton.disabled) return;
      event.preventDefault();
      this.repairHeld = true;
      this.repairButton.setPointerCapture(event.pointerId);
    });
    this.repairButton.addEventListener("pointerup", (event) => {
      this.repairHeld = false;
      if (this.repairButton.hasPointerCapture(event.pointerId)) {
        this.repairButton.releasePointerCapture(event.pointerId);
      }
    });
    this.repairButton.addEventListener("pointercancel", () => {
      this.repairHeld = false;
    });
    this.rideResult = document.createElement("div");
    this.rideResult.className = "ride-result hidden";
    this.citationOverlay = document.createElement("div");
    this.citationOverlay.className = "citation-overlay hidden";
    this.citationOverlay.addEventListener("click", (event) => {
      if ((event.target as HTMLElement).closest("[data-citation-continue]")) actions.acknowledgeCitation();
    });

    this.debugProgression = new URLSearchParams(window.location.search).has("debug")
      ? this.createDebugProgressionPanel()
      : null;

    root.append(this.startScreen, this.pauseScreen, this.hud, this.phone, this.map, this.refuelOverlay, this.repairOverlay, this.rideResult, this.citationOverlay);
    if (this.debugProgression) root.append(this.debugProgression);
  }

  showStart(): void {
    this.startScreen.classList.remove("hidden");
    this.pauseScreen.classList.add("hidden");
    this.hud.classList.add("hidden");
    this.indicator.classList.add("hidden");
    this.phone.classList.add("hidden");
    this.map.classList.add("hidden");
    this.refuelOverlay.classList.add("hidden");
    this.repairOverlay.classList.add("hidden");
    this.rideResult.classList.add("hidden");
    this.citationOverlay.classList.add("hidden");
    this.phoneOpen = false;
    this.mapOpen = false;
    this.refuelHeld = false;
    this.repairHeld = false;
    this.phoneFeedback = "";
    this.phoneFeedbackSeconds = 0;
  }

  showPlaying(): void {
    this.startScreen.classList.add("hidden");
    this.pauseScreen.classList.add("hidden");
    this.hud.classList.remove("hidden");
    this.rideResult.classList.remove("hidden");
    this.citationOverlay.classList.add("hidden");
  }

  showPaused(profile: PlayerProfile): void {
    this.startScreen.classList.add("hidden");
    this.pauseScreen.classList.remove("hidden");
    this.phone.classList.add("hidden");
    this.map.classList.add("hidden");
    this.refuelOverlay.classList.add("hidden");
    this.repairOverlay.classList.add("hidden");
    this.phoneOpen = false;
    this.mapOpen = false;
    this.refuelHeld = false;
    this.repairHeld = false;
    this.pausedProfile = profile;
    this.pauseFeedback.textContent = "";
    this.renderPauseProgression(profile);
  }

  showCitation(citation: PoliceCitation): void {
    this.pauseScreen.classList.add("hidden");
    this.phone.classList.add("hidden");
    this.map.classList.add("hidden");
    this.refuelOverlay.classList.add("hidden");
    this.repairOverlay.classList.add("hidden");
    this.phoneOpen = false;
    this.mapOpen = false;
    this.refuelHeld = false;
    this.repairHeld = false;
    const basePayment = citation.waiverReason ? "WAIVED" : citation.amountPaid > 0 ? `${this.money(citation.amountPaid)} PAID` : "NO FUNDS COLLECTED";
    const resistingPenalty = citation.resistingArrestFine > 0
      ? `<div class="citation-offense">RESISTING ARREST</div>
        <div class="citation-payment">FINE ${this.money(citation.resistingArrestFine)} · ${this.money(citation.resistingArrestAmountPaid)} PAID</div>`
      : "";
    const packagePenalty = citation.packageConfiscated
      ? `<div class="citation-offense">PACKAGE CONFISCATED</div>
        <div class="citation-payment">POSSESSION FINE ${this.money(citation.possessionFine ?? 0)} · ${this.money(citation.possessionAmountPaid ?? 0)} PAID</div>`
      : "";
    const totalAssessed = citation.assessedFine
      + citation.resistingArrestFine
      + (citation.possessionFine ?? 0);
    const totalPaid = citation.amountPaid
      + citation.resistingArrestAmountPaid
      + (citation.possessionAmountPaid ?? 0);
    this.citationOverlay.innerHTML = `
      <div class="citation-panel">
        <div class="citation-agency">CITY POLICE</div>
        <div class="citation-title">CITATION</div>
        <div class="citation-offense">${citation.offense}</div>
        <div class="citation-payment">FINE ${this.money(citation.assessedFine)} · ${basePayment}</div>
        ${resistingPenalty}
        ${packagePenalty}
        <div class="citation-payment">TOTAL ${this.money(totalAssessed)} · ${this.money(totalPaid)} PAID</div>
        ${citation.waiverReason ? `<div class="trait-status">${citation.waiverReason === "lawyer" ? "LAWYER" : "GET OUT OF JAIL FREE CARD USED"} · ${this.money(citation.waivedAmount ?? 0)} WAIVED</div>` : ""}
        <div class="citation-balance">BALANCE ${this.money(citation.remainingBalance)}</div>
        <button type="button" data-citation-continue>CONTINUE</button>
      </div>
    `;
    this.citationOverlay.classList.remove("hidden");
  }

  togglePhone(): void {
    this.phoneOpen = !this.phoneOpen;
    this.phone.classList.toggle("hidden", !this.phoneOpen);
    if (this.phoneOpen) {
      this.phoneRefreshElapsed = GAME_CONFIG.ride.offerDistanceRefreshSeconds;
    }
  }

  closePhone(): void {
    this.phoneOpen = false;
    this.phone.classList.add("hidden");
  }

  toggleMap(): void {
    this.mapOpen = !this.mapOpen;
    this.map.classList.toggle("hidden", !this.mapOpen);
  }

  get isRefuelHeld(): boolean {
    return this.refuelHeld;
  }

  get isRepairHeld(): boolean {
    return this.repairHeld;
  }

  update(
    offers: RideOfferBoard,
    ride: RideManager,
    packageDelivery: PackageDeliveryManager,
    player: PlayerCar,
    fuel: FuelManager,
    damage: DamageManager,
    police: PoliceManager,
    profile: PlayerProfile,
    town: Town,
    objectivePosition: Vector3 | null,
    deltaTime: number,
  ): void {
    this.phoneFeedbackSeconds = Math.max(0, this.phoneFeedbackSeconds - deltaTime);
    if (this.phoneFeedbackSeconds <= 0 && this.phoneFeedback) {
      this.phoneFeedback = "";
      this.lastPhoneHtml = "";
    }
    const speedMph = player.getSpeedMph();
    const speedWarning = ride.isSpeedWarning(speedMph);
    const speedLabel = ride.getSpeedWarningLabel(speedMph);
    const fuelPercent = Math.round(fuel.fuelPercent * 100);
    const damagePercent = Math.round(damage.damagePercent * 100);
    const walletMoney = ride.totalMoney;
    this.moneyValue.textContent = `$${ride.totalMoney.toFixed(2)}`;
    this.ridesValue.textContent = `RIDES: ${ride.completedRides}`;
    this.speedometer.textContent = speedLabel;
    this.speedometer.classList.toggle("warning", speedWarning);
    this.fuelMeter.classList.toggle("low", fuel.isLow);
    this.fuelLabel.textContent = `GAS ${fuelPercent}%`;
    this.fuelFill.style.width = `${fuelPercent}%`;
    this.damageMeter.classList.toggle("damaged", damage.damagePercent > 0);
    this.damageLabel.textContent = `DAMAGE ${damagePercent}/100`;
    this.damageFill.style.width = `${damagePercent}%`;
    const policePercent = Math.round(police.warning.hudProgress * 100);
    const escapePercent = Math.round(police.warning.escapeProgress * 100);
    this.policeMeter.classList.toggle("hidden", police.warning.hudMode === "idle" && policePercent <= 0);
    this.policeMeter.classList.remove("observing", "resisting", "arresting", "fleeing", "escaping");
    if (police.warning.hudMode !== "idle") this.policeMeter.classList.add(police.warning.hudMode);
    const policeLabels: Record<typeof police.warning.hudMode, string> = {
      idle: "POLICE SUSPICION",
      observing: police.warning.activelyObserving
        ? `OBSERVING: ${police.warning.observedOffense ?? "VIOLATION"}`
        : "POLICE SUSPICION",
      resisting: "RESISTING ARREST",
      arresting: "ARRESTING",
      fleeing: "FLEEING",
      escaping: "ESCAPING",
    };
    this.policeMeterLabel.textContent = policeLabels[police.warning.hudMode];
    this.policeFineLabel.classList.toggle("hidden", !police.isPursuitActive);
    if (police.isPursuitActive) {
      this.policeFineLabel.textContent = ride.hasOnboardTrait(PassengerType.Lawyer)
        ? "LAWYER · FINES WAIVED IF CAUGHT"
        : profile.jailFreeCards > 0 ? "GET OUT OF JAIL FREE CARD WILL BE USED"
        : `${this.money(police.warning.potentialFine)} FINE IF CAUGHT`;
    }
    this.policeMeterFill.style.width = `${policePercent}%`;
    this.policeEscapeFill.style.width = police.warning.hudMode === "escaping"
      ? `${escapePercent}%`
      : "0%";
    this.refuelStatus.classList.toggle("hidden", !fuel.isRefueling);
    this.updateRefuelOverlay(fuel, fuelPercent, walletMoney);
    this.updateRepairOverlay(damage, damagePercent, walletMoney);
    const rideHudHtml = this.activeActivityHudLine(ride, packageDelivery, player);
    if (rideHudHtml !== this.lastRideHudHtml) {
      this.lastRideHudHtml = rideHudHtml;
      this.rideHud.innerHTML = rideHudHtml;
    }
    this.collisionFlash.textContent = ride.collisionFlashText;
    this.collisionFlash.classList.toggle("hidden", !ride.collisionFlashText);

    this.updateIndicator(objectivePosition, player);
    if (this.phoneOpen) {
      this.phoneRefreshElapsed += deltaTime;
      if (this.lastPhoneHtml === "" || this.phoneRefreshElapsed >= GAME_CONFIG.ride.offerDistanceRefreshSeconds) {
        this.phoneRefreshElapsed = 0;
        this.renderPhone(offers, ride, packageDelivery, player, profile);
      }
    }
    if (this.mapOpen) {
      this.renderMap(ride, packageDelivery, player, town);
    }
    this.renderActivityResult(ride, packageDelivery);
  }

  dispose(): void {
    this.root.innerHTML = "";
  }

  private updateRefuelOverlay(fuel: FuelManager, fuelPercent: number, walletMoney: number): void {
    const showOverlay = fuel.canUsePump;
    this.refuelOverlay.classList.toggle("hidden", !showOverlay);
    if (!showOverlay) {
      this.refuelHeld = false;
      return;
    }
    const full = fuel.isFull;
    const outOfMoney = walletMoney <= 0;
    this.refuelButton.disabled = full || outOfMoney;
    this.refuelButton.textContent = full ? "TANK FULL" : outOfMoney ? "NO MONEY" : "FILL TANK";
    this.refuelButton.classList.toggle("held", this.refuelHeld && !full && !outOfMoney);
    this.refuelOverlay.style.setProperty("--fuel-percent", `${fuelPercent}%`);
  }

  private updateRepairOverlay(damage: DamageManager, damagePercent: number, walletMoney: number): void {
    const showOverlay = damage.canUseRepair;
    this.repairOverlay.classList.toggle("hidden", !showOverlay);
    if (!showOverlay) {
      this.repairHeld = false;
      return;
    }
    const repaired = damage.isRepaired;
    const outOfMoney = walletMoney <= 0 && !damage.freeRepair;
    this.repairButton.disabled = repaired || outOfMoney;
    this.repairButton.textContent = repaired ? "CAR REPAIRED" : outOfMoney ? "NO MONEY" : damage.freeRepair ? "FREE REPAIR · WAIVE FARE + TIP" : "REPAIR CAR";
    this.repairButton.classList.toggle("held", this.repairHeld && !repaired && !outOfMoney);
    this.repairOverlay.style.setProperty("--damage-percent", `${damagePercent}%`);
  }

  private renderPauseProgression(profile: PlayerProfile): void {
    const category = getMissionLicense("package_delivery")!;
    const owned = profile.ownsMissionLicense(category.id);
    const affordable = profile.money >= category.unlockCost;
    this.pauseBalance.textContent = `BALANCE ${this.money(profile.money)}`;
    this.packageUnlockButton.disabled = owned || !affordable;
    this.packageUnlockButton.textContent = owned
      ? "PACKAGE DELIVERY UNLOCKED"
      : affordable
        ? `UNLOCK FOR ${this.wholeMoney(category.unlockCost)}`
        : `NEED ${this.wholeMoney(category.unlockCost)}`;
  }

  private renderPhone(
    offers: RideOfferBoard,
    ride: RideManager,
    packageDelivery: PackageDeliveryManager,
    player: PlayerCar,
    profile: PlayerProfile,
  ): void {
    let content: string;
    const missionCategory = getMissionLicense(this.phoneTab);
    if (missionCategory) {
      content = missionCategory.activityType === "packageDelivery"
        ? this.renderPackageDeliveryTab(packageDelivery, ride, player, profile, missionCategory)
        : this.renderMissionTab(offers, ride, packageDelivery, player, profile, missionCategory);
    } else if (this.phoneTab === "garage") {
      content = this.renderGarage(profile, player);
    } else if (this.phoneTab === "upgrades") {
      content = this.renderUpgrades(profile);
    } else if (this.phoneTab === "scorecard") {
      content = this.renderScorecard(profile);
    } else {
      content = this.renderScorecard(profile);
    }

    this.setHtml(this.phone, "lastPhoneHtml", `
      <div class="phone-panel">
        <div class="phone-topbar">
          <span class="phone-brand">DRIVER</span>
          <div class="phone-topbar-actions">
            <div class="phone-balance">${this.money(profile.money)}</div>
            <button type="button" class="phone-close" data-phone-close aria-label="Close phone" title="Close phone">&times;</button>
          </div>
        </div>
        <div class="phone-tabs" role="tablist">
          ${MISSION_LICENSES.map((license) => this.phoneTabButton(license.id, license.tabLabel)).join("")}
          ${this.phoneTabButton("garage", "GARAGE")}
          ${this.phoneTabButton("upgrades", "UPGRADES")}
          ${this.phoneTabButton("scorecard", "HISTORY")}
        </div>
        <div class="phone-screen">
          ${this.phoneFeedback ? `<div class="phone-feedback">${this.phoneFeedback}</div>` : ""}
          ${content}
        </div>
        <div class="phone-home-indicator" aria-hidden="true"></div>
      </div>
    `);
  }

  private renderMissionTab(
    offerBoard: RideOfferBoard,
    ride: RideManager,
    packageDelivery: PackageDeliveryManager,
    player: PlayerCar,
    profile: PlayerProfile,
    category: MissionLicenseDefinition,
  ): string {
    if (!profile.ownsMissionLicense(category.id)) return this.renderLockedMission(category, profile);
    if (ride.state !== RideState.Idle && ride.activeRide?.missionCategoryId === category.id) {
      return this.renderCurrentRide(ride, player, category);
    }
    const rideInProgress = ride.state !== RideState.Idle || packageDelivery.isActive;
    return `
      <div class="phone-title">${category.name.toUpperCase()} JOBS</div>
      ${rideInProgress ? '<div class="mission-status">CURRENT RIDE IN PROGRESS · NEW JOBS UNAVAILABLE</div>' : ""}
      <div class="offer-list">
        ${offerBoard.getOffers(category.id).map((offer) => this.offerCard(offer, rideInProgress)).join("")}
      </div>
    `;
  }

  private renderPackageDeliveryTab(
    packageDelivery: PackageDeliveryManager,
    ride: RideManager,
    player: PlayerCar,
    profile: PlayerProfile,
    category: MissionLicenseDefinition,
  ): string {
    if (!profile.ownsMissionLicense(category.id)) return this.renderLockedMission(category, profile);
    if (packageDelivery.activeOffer) {
      const target = packageDelivery.getObjectivePosition();
      const distance = target
        ? Math.round(distanceXZ(player.root.position, target) * GAME_CONFIG.ride.metersPerWorldUnit)
        : 0;
      const status = packageDelivery.state === PackageDeliveryState.DrivingToPickup
        ? "Driving to package pickup"
        : "Package onboard";
      return `
        <div class="phone-title">CURRENT PACKAGE DELIVERY</div>
        <div class="current-ride-card">
          <div class="ride-name">PRIORITY COURIER JOB</div>
          <div>${status}</div>
          <div>${distance} m away</div>
          <div>Current Rate: ${this.money(packageDelivery.currentRatePerMeter)} / m</div>
          <div>Current Payout: ${this.money(packageDelivery.currentPayout)}</div>
          <div>Payout Remaining: ${Math.round(packageDelivery.payoutMultiplier * 100)}%</div>
        </div>
      `;
    }
    const offer = packageDelivery.offer;
    const unavailable = ride.isActive;
    return `
      <div class="phone-title">PACKAGE DELIVERY</div>
      ${unavailable ? '<div class="mission-status">CURRENT RIDE IN PROGRESS · NEW JOBS UNAVAILABLE</div>' : ""}
      <div class="offer-list">
        <div class="offer-card">
          <div class="offer-heading">
            <div class="ride-name">PRIORITY COURIER JOB</div>
            <div class="ride-type">TIME SENSITIVE</div>
          </div>
          <button type="button" data-package-delivery-id="${offer.id}" ${unavailable ? "disabled" : ""}>
            ${unavailable ? "MISSION IN PROGRESS" : "ACCEPT"}
          </button>
          <div class="ride-details">
            ${this.offerMetric("PICKUP", `${Math.round(offer.pickupDistance)} m`)}
            ${this.offerMetric("TRIP", `${Math.round(offer.tripDistance)} m`)}
            ${this.offerMetric("BASE PAY", this.money(offer.initialPayout))}
          </div>
        </div>
      </div>
    `;
  }

  private renderCurrentRide(ride: RideManager, player: PlayerCar, category: MissionLicenseDefinition): string {
    if (ride.activeRide) {
      const target = ride.getObjectivePosition();
      const distance = target
        ? Math.round(distanceXZ(player.root.position, target) * GAME_CONFIG.ride.metersPerWorldUnit)
        : 0;
      const status = ride.state === RideState.DrivingToPickup ? "Driving to pickup" : "Passenger onboard";
      const onboardDetails = ride.state === RideState.PassengerOnboard
        ? `<div class="phone-current-score">${this.stars(ride.getStars())} · Tip now ${this.money(ride.getCurrentTip())}${this.violationPenaltyText(ride)}</div>`
        : "";
      return `
        <div class="phone-title">CURRENT ${category.name.toUpperCase()} RIDE</div>
        <div class="current-ride-card">
          <div class="ride-name">${ride.activeRide.passengerName}</div>
          ${this.passengerTypeBadge(ride.activeRide.passengerType)}
          ${this.traitExplanation(ride.activeRide.passengerType)}
          <div>${status}</div>
          <div>${distance} m away</div>
          <div>Base Fare: ${this.money(ride.effectiveBaseFare)}</div>
          ${onboardDetails}
          ${this.currentTraitStatus(ride)}
        </div>
      `;
    }
    return "";
  }

  private renderLockedMission(category: MissionLicenseDefinition, profile: PlayerProfile): string {
    const affordable = profile.money >= category.unlockCost;
    const unlockAction = category.unlockLocation === "pause"
      ? `<div class="mission-status">UNLOCK FOR ${this.wholeMoney(category.unlockCost)} FROM THE PAUSE MENU</div>`
      : `<button type="button" data-purchase-license="${category.id}" ${affordable ? "" : "disabled"}>
          ${affordable ? `PURCHASE FOR ${this.wholeMoney(category.unlockCost)}` : `NEED ${this.wholeMoney(category.unlockCost)}`}
        </button>`;
    return `
      <div class="license-lock">
        <div class="license-lock-label">MISSION LICENSE</div>
        <div class="license-lock-title">${category.name.toUpperCase()}</div>
        <div class="license-lock-description">${category.description}</div>
        <div class="license-lock-rate">${category.activityType === "packageDelivery"
          ? `${this.money(GAME_CONFIG.packageDelivery.ratePerMeter)} / M STARTING RATE`
          : `BASE FARES ×${category.fareMultiplier}`}</div>
        ${unlockAction}
      </div>
    `;
  }

  private renderGarage(profile: PlayerProfile, player: PlayerCar): string {
    const stopped = player.getSpeedMph() <= GAME_CONFIG.progression.equipMaxSpeedMph;
    const pageSize = 2;
    const pageCount = Math.max(1, Math.ceil(VEHICLE_CATALOG.length / pageSize));
    this.garagePage = Math.max(0, Math.min(this.garagePage, pageCount - 1));
    const vehicles = VEHICLE_CATALOG.slice(this.garagePage * pageSize, (this.garagePage + 1) * pageSize);
    return `
      <div class="phone-title-row">
        <div class="phone-title">VEHICLE GARAGE</div>
        ${this.phonePagination("garage", this.garagePage, pageCount)}
      </div>
      ${this.rewardInventory(profile)}
      <div class="garage-list">
        ${vehicles.map((vehicle) => this.vehicleCard(vehicle, profile, stopped)).join("")}
      </div>
    `;
  }

  private vehicleCard(vehicle: VehicleDefinition, profile: PlayerProfile, stopped: boolean): string {
    const owned = profile.ownsVehicle(vehicle.id);
    const equipped = profile.equippedVehicleId === vehicle.id;
    const quote = profile.getVehiclePurchaseQuote(vehicle.id)!;
    const affordable = profile.money >= quote.price;
    const effective = applyPermanentUpgrades(vehicle.stats, profile.upgrades);
    let action: string;
    if (equipped) {
      action = '<button type="button" disabled>EQUIPPED</button>';
    } else if (owned) {
      action = `<button type="button" data-equip-vehicle="${vehicle.id}" ${stopped ? "" : "disabled"}>${stopped ? "EQUIP" : "STOP TO EQUIP"}</button>`;
    } else {
      action = `<button type="button" data-buy-vehicle="${vehicle.id}" ${affordable ? "" : "disabled"}>${affordable ? "BUY" : "INSUFFICIENT FUNDS"}</button>`;
    }
    return `
      <div class="garage-card ${equipped ? "equipped" : ""}">
        <div class="garage-card-heading">
          <div>
            <div class="vehicle-name">${vehicle.name}</div>
            <div class="vehicle-status">${equipped ? "EQUIPPED" : owned ? "OWNED" : this.wholeMoney(quote.price)}</div>
          </div>
          <span class="vehicle-swatch" style="background:${vehicle.appearance.bodyColor}"></span>
        </div>
        ${quote.discount > 0 ? `<div class="trait-status">${this.wholeMoney(quote.discount)} coupon discount · ${quote.couponsUsed} used on purchase</div>` : ""}
        <div class="vehicle-stats">
          ${VEHICLE_STAT_KEYS.map((stat) => this.vehicleStatRow(vehicle, stat, effective[stat], profile.upgrades[stat])).join("")}
        </div>
        ${action}
      </div>
    `;
  }

  private vehicleStatRow(vehicle: VehicleDefinition, stat: VehicleStatKey, effectiveValue: number, level: number): string {
    const basePercent = normalizedVehicleStat(vehicle, stat) * 100;
    const effectivePercent = Math.min(100, effectiveValue / ELITE_VEHICLE.stats[stat] * 100);
    const baseDisplay = stat === "topSpeed"
      ? `${Math.round(vehicle.stats.topSpeed * GAME_CONFIG.ride.mphPerWorldUnitPerSecond)} MPH`
      : `${Math.round(basePercent)}`;
    const effectiveDisplay = stat === "topSpeed"
      ? `${Math.round(effectiveValue * GAME_CONFIG.ride.mphPerWorldUnitPerSecond)} MPH`
      : `${Math.round(effectiveValue / ELITE_VEHICLE.stats[stat] * 100)}`;
    return `
      <div class="vehicle-stat">
        <div class="vehicle-stat-label"><span>${this.statLabel(stat)}</span><span>${baseDisplay}${level > 0 ? ` → ${effectiveDisplay} (+${level}%)` : ""}</span></div>
        <div class="vehicle-stat-track">
          <div class="vehicle-stat-effective" style="width:${effectivePercent}%"></div>
          <div class="vehicle-stat-base" style="width:${basePercent}%"></div>
        </div>
      </div>
    `;
  }

  private renderUpgrades(profile: PlayerProfile): string {
    return `
      <div class="phone-title">PERMANENT UPGRADES</div>
      <div class="upgrade-list">
        ${VEHICLE_STAT_KEYS.map((stat) => this.upgradeCard(stat, profile)).join("")}
      </div>
    `;
  }

  private renderScorecard(profile: PlayerProfile): string {
    const history = profile.rideHistory;
    const pageSize = 1;
    const pageCount = Math.max(1, Math.ceil(history.length / pageSize));
    this.scorecardPage = Math.max(0, Math.min(this.scorecardPage, pageCount - 1));
    const visibleHistory = history.slice(this.scorecardPage * pageSize, (this.scorecardPage + 1) * pageSize);
    const recordedEarnings = history.reduce((sum, ride) => sum + ride.total, 0);
    const recordedTips = history.reduce((sum, ride) => sum + ride.tip, 0);
    const averageStars = history.length > 0
      ? history.reduce((sum, ride) => sum + ride.stars, 0) / history.length
      : 0;
    const limitNote = history.length > 0 && profile.completedRides > history.length
      ? `<div class="scorecard-note">Showing the latest ${history.length} recorded rides</div>`
      : "";
    const emptyMessage = profile.completedRides > 0
      ? "Detailed scorecards will be recorded for new rides."
      : "Completed rides will appear here.";
    return `
      <div class="phone-title-row">
        <div class="phone-title">RIDE SCORECARD</div>
        ${history.length > 0 ? this.phonePagination("scorecard", this.scorecardPage, pageCount) : ""}
      </div>
      ${this.rewardInventory(profile)}
      <div class="scorecard-summary">
        ${this.scorecardSummaryStat(profile.completedRides.toLocaleString("en-US"), "LIFETIME RIDES")}
        ${this.scorecardSummaryStat(history.length > 0 ? averageStars.toFixed(1) : "-", "AVERAGE STARS")}
        ${this.scorecardSummaryStat(this.money(recordedTips), "RECORDED TIPS")}
        ${this.scorecardSummaryStat(this.money(recordedEarnings), "RECORDED EARNINGS")}
      </div>
      ${limitNote}
      ${history.length > 0
        ? `<div class="scorecard-list">${visibleHistory.map((ride) => this.rideScorecard(ride)).join("")}</div>`
        : `<div class="scorecard-empty"><strong>NO RECORDED RIDES</strong><span>${emptyMessage}</span></div>`}
    `;
  }

  private rideScorecard(ride: RideHistoryEntry): string {
    const totalDistance = ride.pickupDistance + ride.tripDistance;
    const passengerType = ride.passengerType === PassengerType.Normal ? "" : ` · ${ride.passengerType}`;
    return `
      <div class="ride-scorecard">
        <div class="scorecard-heading">
          <div>
            <div class="vehicle-name">${ride.passengerName}</div>
            <div class="ride-type">${getMissionLicense(ride.missionCategoryId)?.name.toUpperCase() ?? "RIDESHARE"}${passengerType} · ${ride.rideTier}</div>
          </div>
          <div class="scorecard-date">${this.completedDate(ride.completedAt)}</div>
        </div>
        <div class="scorecard-stars">${this.stars(ride.stars)}</div>
        <div class="scorecard-details">
          ${this.scorecardDetail("TOTAL DISTANCE", `${Math.round(totalDistance)} m`)}
          ${this.scorecardDetail("PICKUP DISTANCE", `${Math.round(ride.pickupDistance)} m`)}
          ${this.scorecardDetail("RIDE DISTANCE", `${Math.round(ride.tripDistance)} m`)}
          ${this.scorecardDetail("RIDE TIME", this.duration(ride.durationSeconds))}
          ${this.scorecardDetail("COLLISIONS", ride.collisionCount.toString())}
          ${this.scorecardDetail("ILLEGAL POINTS", ride.violationPoints.toFixed(1))}
          ${this.scorecardDetail("TIP PENALTY", `-${Math.round(ride.violationTipPenaltyPercent)}%`)}
          ${this.scorecardDetail("TIME TIP", `${Math.round(ride.timeTipPercentRemaining)}%`)}
        </div>
        ${this.traitResultDetails(ride)}
        <div class="scorecard-money">
          <span>FARE ${this.money(ride.baseFare)}</span>
          <span>TIP ${this.money(ride.tip)}</span>
          <strong>TOTAL ${this.money(ride.total)}</strong>
        </div>
      </div>
    `;
  }

  private scorecardSummaryStat(value: string, label: string): string {
    return `<div><strong>${value}</strong><span>${label}</span></div>`;
  }

  private scorecardDetail(label: string, value: string): string {
    return `<div><span>${label}</span><strong>${value}</strong></div>`;
  }

  private completedDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  private duration(seconds: number): string {
    const wholeSeconds = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(wholeSeconds / 60);
    const remainder = wholeSeconds % 60;
    return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
  }

  private upgradeCard(stat: VehicleStatKey, profile: PlayerProfile): string {
    const level = profile.upgrades[stat];
    const maxed = level >= GAME_CONFIG.progression.maxUpgradeLevel;
    const nextLevel = Math.min(GAME_CONFIG.progression.maxUpgradeLevel, level + 1);
    const cost = maxed ? 0 : getUpgradeCost(nextLevel);
    const affordable = profile.money >= cost;
    return `
      <div class="upgrade-card">
        <div>
          <div class="upgrade-name">${this.statLabel(stat)}</div>
          <div class="upgrade-level">LEVEL ${level} / ${GAME_CONFIG.progression.maxUpgradeLevel}</div>
        </div>
        <div class="upgrade-comparison">
          ${maxed ? '<strong>+50% · MAX LEVEL</strong>' : `<span>+${level}% → +${nextLevel}%</span><strong>${this.wholeMoney(cost)}</strong>`}
        </div>
        <button type="button" data-upgrade-stat="${stat}" ${maxed || !affordable ? "disabled" : ""}>
          ${maxed ? "MAX LEVEL" : affordable ? "UPGRADE" : "INSUFFICIENT FUNDS"}
        </button>
      </div>
    `;
  }

  private phoneTabButton(tab: typeof this.phoneTab, label: string): string {
    return `<button type="button" class="phone-tab ${this.phoneTab === tab ? "active" : ""}" data-phone-tab="${tab}" role="tab" aria-selected="${this.phoneTab === tab}">${label}</button>`;
  }

  private phonePagination(section: "garage" | "scorecard", page: number, pageCount: number): string {
    return `
      <div class="phone-pagination" aria-label="${section} pages">
        <button type="button" data-phone-page="${section}" data-page-delta="-1" aria-label="Previous page" ${page <= 0 ? "disabled" : ""}>&lsaquo;</button>
        <span>${page + 1} / ${pageCount}</span>
        <button type="button" data-phone-page="${section}" data-page-delta="1" aria-label="Next page" ${page >= pageCount - 1 ? "disabled" : ""}>&rsaquo;</button>
      </div>
    `;
  }

  private showPhoneFeedback(message: string): void {
    this.phoneFeedback = message;
    this.phoneFeedbackSeconds = 2.5;
    this.lastPhoneHtml = "";
  }

  private renderMap(
    ride: RideManager,
    packageDelivery: PackageDeliveryManager,
    player: PlayerCar,
    town: Town,
  ): void {
    if (this.mapTown !== town || !this.mapPlayer || !this.mapPickup || !this.mapDropoff) {
      this.buildMap(town);
    }

    const playerPoint = projectMapPoint(player.root.position.x, player.root.position.z, town);
    this.mapPlayer!.style.left = `${playerPoint.x}%`;
    this.mapPlayer!.style.top = `${playerPoint.y}%`;
    this.mapPlayer!.style.transform = `translate(-50%, -50%) rotate(${player.heading}rad)`;

    const activeRide = ride.activeRide;
    const activePackage = packageDelivery.activeOffer;
    const pickup = activeRide?.pickupPoint ?? activePackage?.pickupPoint ?? null;
    const destination = activeRide?.destinationPoint ?? activePackage?.destinationPoint ?? null;
    const drivingToPickup = (activeRide !== null && ride.state === RideState.DrivingToPickup)
      || (activePackage !== null && packageDelivery.state === PackageDeliveryState.DrivingToPickup);

    this.updateObjectiveMapMarker(this.mapPickup!, pickup?.position.x, pickup?.position.z, town, {
      current: drivingToPickup,
      completed: pickup !== null && !drivingToPickup,
      label: "P",
    });
    this.updateObjectiveMapMarker(this.mapDropoff!, destination?.position.x, destination?.position.z, town, {
      current: destination !== null && !drivingToPickup,
      completed: false,
      label: "D",
    });
  }

  private buildMap(town: Town): void {
    const roadWidth = projectMapWidth(GAME_CONFIG.world.roadWidth, town);
    const roadHeight = projectMapHeight(GAME_CONFIG.world.roadWidth, town);
    const roads = town.roads.map((road) => {
      const point = road.axis === "northSouth"
        ? projectMapPoint(road.center, 0, town)
        : projectMapPoint(0, road.center, town);
      const style = road.axis === "northSouth"
        ? `left:${point.x}%;width:${roadWidth}%`
        : `top:${point.y}%;height:${roadHeight}%`;
      return `<div class="map-road ${road.axis} ${road.type}" style="${style}"></div>`;
    }).join("");
    const gasMarkers = town.gasStations.map((station) => {
      const point = projectMapPoint(station.position.x, station.position.z, town);
      return `<div class="map-marker gas" style="left:${point.x}%;top:${point.y}%">G</div>`;
    }).join("");
    const repairMarkers = town.autoBodyShops.map((shop) => {
      const point = projectMapPoint(shop.position.x, shop.position.z, town);
      return `<div class="map-marker repair" style="left:${point.x}%;top:${point.y}%">A</div>`;
    }).join("");

    this.map.innerHTML = `
      <div class="map-panel">
        <div class="map-title">MAP</div>
        <div class="map-canvas">
          ${roads}
          ${gasMarkers}
          ${repairMarkers}
          <div class="map-marker pickup hidden" data-map="pickup">P</div>
          <div class="map-marker dropoff hidden" data-map="dropoff">D</div>
          <div class="map-player" data-map="player">▲</div>
        </div>
        <div class="map-legend">
          <span><b class="legend-player"></b>Player</span>
          <span><b class="legend-gas"></b>Gas</span>
          <span><b class="legend-repair"></b>Auto</span>
          <span><b class="legend-pickup"></b>Pickup</span>
          <span><b class="legend-dropoff"></b>Dropoff</span>
        </div>
        <div class="phone-close-hint">M TO CLOSE · ESC TO PAUSE</div>
      </div>
    `;
    this.mapTown = town;
    this.mapPlayer = this.map.querySelector('[data-map="player"]')!;
    this.mapPickup = this.map.querySelector('[data-map="pickup"]')!;
    this.mapDropoff = this.map.querySelector('[data-map="dropoff"]')!;
  }

  private updateObjectiveMapMarker(
    marker: HTMLDivElement,
    x: number | undefined,
    z: number | undefined,
    town: Town,
    state: { current: boolean; completed: boolean; label: string },
  ): void {
    const visible = x !== undefined && z !== undefined;
    marker.classList.toggle("hidden", !visible);
    if (!visible) return;
    const point = projectMapPoint(x, z, town);
    marker.style.left = `${point.x}%`;
    marker.style.top = `${point.y}%`;
    marker.textContent = state.completed ? "✓" : state.label;
    marker.classList.toggle("current", state.current);
    marker.classList.toggle("completed", state.completed);
    marker.classList.toggle("upcoming", !state.current && !state.completed);
  }

  private offerCard(offer: RideOffer, disabled = false): string {
    return `
      <div class="offer-card">
        <div class="offer-heading">
          <div class="ride-name">${offer.passengerName}</div>
          ${this.passengerTypeBadge(offer.passengerType)}
        </div>
        <button type="button" data-ride-id="${offer.id}" data-ride-category="${offer.missionCategoryId}" ${disabled ? "disabled" : ""}>
          ${disabled ? "RIDE IN PROGRESS" : "ACCEPT"}
        </button>
        ${this.traitExplanation(offer.passengerType)}
        <div class="ride-details">
          ${this.offerMetric("PICKUP", `${Math.round(offer.pickupDistance)} m`)}
          ${this.offerMetric("TRIP", `${Math.round(offer.tripDistance)} m`)}
          ${this.offerMetric("BASE FARE", this.money(offer.baseFare))}
        </div>
      </div>
    `;
  }

  private offerMetric(label: string, value: string): string {
    return `<div><span>${label}</span><strong>${value}</strong></div>`;
  }

  private passengerTypeBadge(passengerType: PassengerType): string {
    return passengerType === PassengerType.Normal ? "" : `<div class="ride-type">${passengerArchetype(passengerType).name}</div>`;
  }

  private activeActivityHudLine(
    ride: RideManager,
    packageDelivery: PackageDeliveryManager,
    player: PlayerCar,
  ): string {
    if (packageDelivery.activeOffer) {
      const objective = packageDelivery.state === PackageDeliveryState.DrivingToPickup
        ? "COLLECT PACKAGE"
        : "DELIVER PACKAGE";
      return `
        <div class="objective">PACKAGE DELIVERY · ${objective}</div>
        <div>PAYOUT: ${this.money(packageDelivery.currentPayout)}</div>
        <div>RATE: ${this.money(packageDelivery.currentRatePerMeter)} / M</div>
      `;
    }
    if (!ride.activeRide) {
      return `<div class="objective">PRESS P FOR RIDES</div>`;
    }
    const arrivalWarning = ride.isWaitingForArrivalSpeed(player)
      ? `<div>SLOW BELOW ${GAME_CONFIG.ride.maximumArrivalSpeedMph} MPH</div>`
      : "";
    if (ride.state === RideState.DrivingToPickup) {
      const category = getMissionLicense(ride.activeRide.missionCategoryId);
      return `
        <div class="objective">${category?.name.toUpperCase() ?? "RIDE"} · PICK UP: ${this.passengerNameWithTrait(ride.activeRide.passengerName, ride.activeRide.passengerType)}</div>
        ${this.traitExplanation(ride.activeRide.passengerType)}
        ${arrivalWarning}
      `;
    }
    const tipPenalty = ride.violationTipPenaltyPercent > 0
      ? `<span class="ride-tip-penalty">-${Math.round(ride.violationTipPenaltyPercent)}%</span>`
      : "";
    return `
      <div class="objective">${getMissionLicense(ride.activeRide.missionCategoryId)?.name.toUpperCase() ?? "RIDE"} · ${this.passengerNameWithTrait(ride.activeRide.passengerName, ride.activeRide.passengerType)}</div>
      ${this.traitExplanation(ride.activeRide.passengerType)}
      <div class="ride-score-line">
        <span class="ride-stars">${this.stars(ride.getStars())}</span>
        <span class="ride-tip">${this.money(ride.getCurrentTip())}</span>
        ${tipPenalty}
      </div>
      ${this.currentTraitStatus(ride)}
      ${arrivalWarning}
    `;
  }

  private traitExplanation(type: PassengerType): string {
    const text = passengerArchetype(type).text;
    return text ? `<div class="trait-explanation">${text}</div>` : "";
  }

  private currentTraitStatus(ride: RideManager): string {
    if (ride.fareWaived) return '<div class="trait-status">FREE REPAIR · FARE AND TIP WAIVED</div>';
    return `${ride.bonusTip > 0 ? `<div class="trait-status">BONUS EARNED ${this.money(ride.bonusTip)}</div>` : ""}
      ${ride.traitTipDeduction > 0 ? `<div class="trait-status">TRAIT TIP DEDUCTIONS ${this.money(ride.traitTipDeduction)}</div>` : ""}`;
  }

  private rewardInventory(profile: PlayerProfile): string {
    return `<div class="reward-inventory">Get Out of Jail Free cards: ${profile.jailFreeCards}<br>Vehicle coupons: ${profile.vehicleCoupons} × ${this.wholeMoney(GAME_CONFIG.ride.archetypes.vehicleCouponValue)}</div>`;
  }

  private traitResultDetails(result: RideResult): string {
    return `${result.fareWaived ? '<div class="trait-status">FARE AND TIP WAIVED FOR REPAIRS</div>' : ""}
      ${(result.bonusTip ?? 0) > 0 ? `<div class="trait-status">Bonus included in tip: ${this.money(result.bonusTip!)}</div>` : ""}
      ${(result.traitTipDeduction ?? 0) > 0 ? `<div class="trait-status">Trait tip deductions: ${this.money(result.traitTipDeduction!)}</div>` : ""}
      ${(result.cardsEarned ?? 0) > 0 ? '<div class="trait-status">+1 GET OUT OF JAIL FREE CARD</div>' : ""}
      ${(result.couponsEarned ?? 0) > 0 ? `<div class="trait-status">+1 ${this.wholeMoney(GAME_CONFIG.ride.archetypes.vehicleCouponValue)} VEHICLE COUPON</div>` : ""}`;
  }

  private passengerNameWithTrait(name: string, passengerType: PassengerType): string {
    return passengerType === PassengerType.Normal ? name : `${name} (${passengerArchetype(passengerType).name})`;
  }

  private updateIndicator(target: Vector3 | null, player: PlayerCar): void {
    if (!target) {
      this.indicator.classList.add("hidden");
      return;
    }
    this.indicator.classList.remove("hidden");
    const dx = target.x - player.root.position.x;
    const dz = target.z - player.root.position.z;
    const worldAngle = Math.atan2(dx, dz);
    const relativeAngle = normalizeAngle(worldAngle - player.heading);
    const distance = Math.round(distanceXZ(player.root.position, target) * GAME_CONFIG.ride.metersPerWorldUnit);
    this.indicatorArrow.style.transform = `rotate(${relativeAngle}rad)`;
    this.indicatorDistance.textContent = `${distance}m`;
  }

  private renderActivityResult(ride: RideManager, packageDelivery: PackageDeliveryManager): void {
    if (packageDelivery.lastResult && packageDelivery.resultTimeRemaining > 0) {
      const result = packageDelivery.lastResult;
      this.rideResult.classList.remove("hidden");
      this.setHtml(this.rideResult, "lastRideResultHtml", `
        <div class="ride-result-title">DELIVERY COMPLETE</div>
        <div>${Math.round(result.tripDistance)} m delivered in ${this.duration(result.durationSeconds)}</div>
        <div>Starting Payout ${this.money(result.initialPayout)}</div>
        <div>Total ${this.money(result.payout)}</div>
      `);
      return;
    }
    if (!ride.lastResult || ride.resultTimeRemaining <= 0) {
      this.rideResult.classList.add("hidden");
      this.lastRideResultHtml = "";
      return;
    }
    const result = ride.lastResult;
    this.rideResult.classList.remove("hidden");
    this.setHtml(this.rideResult, "lastRideResultHtml", `
      <div class="ride-result-title">RIDE COMPLETE</div>
      <div>${getMissionLicense(result.missionCategoryId)?.name ?? "Rideshare"}</div>
      <div>${result.passengerName}</div>
      <div>${this.stars(result.stars)}</div>
      <div>Base Fare ${this.money(result.baseFare)}</div>
      <div>Tip ${this.money(result.tip)}</div>
      ${result.violationTipPenaltyPercent > 0 ? `<div>Illegal Driving ${result.violationPoints.toFixed(1)} pts · Tip -${Math.round(result.violationTipPenaltyPercent)}%</div>` : ""}
      ${this.traitResultDetails(result)}
      <div>Total ${this.money(result.total)}</div>
    `);
  }

  private stars(count: number): string {
    return `${"★".repeat(count)}${"☆".repeat(5 - count)}`;
  }

  private violationPenaltyText(ride: RideManager): string {
    if (ride.violationTipPenaltyPercent <= 0) return "";
    return ` · Illegal driving -${Math.round(ride.violationTipPenaltyPercent)}%`;
  }

  private statLabel(stat: VehicleStatKey): string {
    if (stat === "topSpeed") return "TOP SPEED";
    return stat.toUpperCase();
  }

  private wholeMoney(value: number): string {
    return `$${Math.round(value).toLocaleString("en-US")}`;
  }

  private money(value: number): string {
    return `$${value.toFixed(2)}`;
  }

  private createDebugProgressionPanel(): HTMLDivElement {
    const panel = document.createElement("div");
    panel.className = "progression-debug";
    panel.innerHTML = `
      <div class="progression-debug-title">PROGRESSION DEBUG</div>
      <div class="progression-debug-row">
        <button type="button" data-debug-action="money">TEMP +$25K</button>
        <button type="button" data-debug-action="reset-money">RESET CASH</button>
      </div>
      <div class="progression-debug-row">
        <button type="button" data-debug-action="unlock">UNLOCK CARS</button>
        <button type="button" data-debug-action="reset-upgrades">RESET UPGRADES</button>
      </div>
      <div class="progression-debug-row">
        <button type="button" data-debug-action="police-vision">POLICE VISION: ON</button>
      </div>
      <div class="progression-debug-row">
        <select data-debug="stat">${VEHICLE_STAT_KEYS.map((stat) => `<option value="${stat}">${this.statLabel(stat)}</option>`).join("")}</select>
        <input data-debug="level" type="number" min="0" max="50" value="10" aria-label="Upgrade level">
        <button type="button" data-debug-action="set-upgrade">SET LEVEL</button>
      </div>
      <div class="progression-debug-row">
        <select data-debug="vehicle">${VEHICLE_CATALOG.map((vehicle) => `<option value="${vehicle.id}">${vehicle.name}</option>`).join("")}</select>
        <button type="button" data-debug-action="equip">EQUIP</button>
        <button type="button" class="danger" data-debug-action="reset">RESET SAVE</button>
      </div>
    `;
    panel.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-debug-action]");
      if (!button) return;
      const action = button.dataset.debugAction;
      if (action === "money") this.actions.debugGiveMoney();
      if (action === "reset-money") this.actions.debugResetMoney();
      if (action === "unlock") this.actions.debugUnlockAllCars();
      if (action === "reset-upgrades") this.actions.debugResetUpgrades();
      if (action === "police-vision") {
        const visible = this.actions.debugTogglePoliceVision();
        button.textContent = `POLICE VISION: ${visible ? "ON" : "OFF"}`;
      }
      if (action === "set-upgrade") {
        const stat = panel.querySelector<HTMLSelectElement>('[data-debug="stat"]')!.value as VehicleStatKey;
        const level = Number(panel.querySelector<HTMLInputElement>('[data-debug="level"]')!.value);
        this.actions.debugSetUpgrade(stat, level);
      }
      if (action === "equip") {
        const id = panel.querySelector<HTMLSelectElement>('[data-debug="vehicle"]')!.value;
        this.actions.debugEquipVehicle(id);
      }
      if (action === "reset" && window.confirm("Clear all saved progression and reload?")) {
        this.actions.resetProgression();
      }
      this.lastPhoneHtml = "";
    });
    return panel;
  }

  private setHtml(element: HTMLElement, cacheKey: "lastPhoneHtml" | "lastRideResultHtml", html: string): void {
    if (this[cacheKey] === html) {
      return;
    }
    this[cacheKey] = html;
    element.innerHTML = html;
  }
}
