import type { RideOfferBoard } from "../ride/RideOfferBoard";
import type { RideManager } from "../ride/RideManager";
import type { PlayerCar } from "../player/PlayerCar";
import type { FuelManager } from "../player/FuelManager";
import type { DamageManager } from "../player/DamageManager";
import type { PoliceManager } from "../police/PoliceManager";
import { GAME_CONFIG } from "../game/config";
import { RideState, type PoliceCitation, type RideHistoryEntry, type RideOffer } from "../game/types";
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

export interface GameUIActions {
  start(): void;
  acceptRide(categoryId: MissionLicenseId, id: string): boolean;
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
  debugResetProgression(): void;
}

export class GameUI {
  private readonly startScreen: HTMLDivElement;
  private readonly pauseScreen: HTMLDivElement;
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
  private readonly policeMeterFill: HTMLDivElement;
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
  private mapRefreshElapsed = 0;
  private lastRideHudHtml = "";
  private lastPhoneHtml = "";
  private lastMapHtml = "";
  private lastRideResultHtml = "";
  private phoneTab: MissionLicenseId | "garage" | "upgrades" | "scorecard" = "rideshare";
  private phoneFeedback = "";
  private phoneFeedbackSeconds = 0;

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
      </div>
    `;

    this.hud = document.createElement("div");
    this.hud.className = "hud hidden";
    this.hud.innerHTML = `
      <div data-hud="money"></div>
      <div data-hud="rides"></div>
      <div class="speedometer" data-hud="speed"></div>
      <div class="fuel-meter" data-hud="fuel">
        <div class="fuel-label" data-hud="fuel-label"></div>
        <div class="fuel-track"><div class="fuel-fill" data-hud="fuel-fill"></div></div>
      </div>
      <div class="damage-meter" data-hud="damage">
        <div class="damage-label" data-hud="damage-label"></div>
        <div class="damage-track"><div class="damage-fill" data-hud="damage-fill"></div></div>
      </div>
      <div class="police-meter hidden" data-hud="police">
        <div class="police-meter-label" data-hud="police-label"></div>
        <div class="police-meter-track"><div class="police-meter-fill" data-hud="police-fill"></div></div>
      </div>
      <div class="refuel-status hidden" data-hud="refuel">REFUELING</div>
      <div data-hud="ride"></div>
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
    this.policeMeterFill = this.hud.querySelector('[data-hud="police-fill"]')!;
    this.refuelStatus = this.hud.querySelector('[data-hud="refuel"]')!;
    this.rideHud = this.hud.querySelector('[data-hud="ride"]')!;
    this.collisionFlash = this.hud.querySelector('[data-hud="collision"]')!;
    this.indicator = document.createElement("div");
    this.indicator.className = "indicator hidden";
    this.indicator.innerHTML = '<span class="arrow">↑</span><span data-indicator="distance"></span>';
    this.indicatorArrow = this.indicator.querySelector(".arrow")!;
    this.indicatorDistance = this.indicator.querySelector('[data-indicator="distance"]')!;
    this.phone = document.createElement("div");
    this.phone.className = "phone-overlay hidden";
    this.phone.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const tab = target.closest<HTMLButtonElement>("[data-phone-tab]");
      if (tab) {
        this.phoneTab = (tab.dataset.phoneTab as typeof this.phoneTab) ?? "rideshare";
        this.lastPhoneHtml = "";
        return;
      }
      const rideButton = target.closest<HTMLButtonElement>("[data-ride-id]");
      if (rideButton) {
        const categoryId = rideButton.dataset.rideCategory as MissionLicenseId;
        if (this.actions.acceptRide(categoryId, rideButton.dataset.rideId ?? "")) this.closePhone();
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

    root.append(this.startScreen, this.pauseScreen, this.hud, this.indicator, this.phone, this.map, this.refuelOverlay, this.repairOverlay, this.rideResult, this.citationOverlay);
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

  showPaused(): void {
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
    const payment = citation.amountPaid > 0 ? `${this.money(citation.amountPaid)} PAID` : "NO FUNDS COLLECTED";
    this.citationOverlay.innerHTML = `
      <div class="citation-panel">
        <div class="citation-agency">CITY POLICE</div>
        <div class="citation-title">CITATION</div>
        <div class="citation-offense">${citation.offense}</div>
        <div class="citation-payment">${payment}</div>
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
    this.mapRefreshElapsed = GAME_CONFIG.map.refreshSeconds;
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
    this.moneyValue.textContent = `MONEY: $${ride.totalMoney.toFixed(2)}`;
    this.ridesValue.textContent = `RIDES: ${ride.completedRides}`;
    this.speedometer.textContent = speedLabel;
    this.speedometer.classList.toggle("warning", speedWarning);
    this.fuelMeter.classList.toggle("low", fuel.isLow);
    this.fuelLabel.textContent = `GAS ${fuelPercent}%`;
    this.fuelFill.style.width = `${fuelPercent}%`;
    this.damageMeter.classList.toggle("damaged", damage.damagePercent > 0);
    this.damageLabel.textContent = `DAMAGE ${damagePercent}/100`;
    this.damageFill.style.width = `${damagePercent}%`;
    const policePercent = Math.round(police.warning.progress * 100);
    this.policeMeter.classList.toggle("hidden", policePercent <= 0);
    this.policeMeter.classList.toggle("observing", police.warning.activelyObserving);
    this.policeMeterLabel.textContent = police.warning.activelyObserving ? "POLICE OBSERVING" : "POLICE SUSPICION";
    this.policeMeterFill.style.width = `${policePercent}%`;
    this.refuelStatus.classList.toggle("hidden", !fuel.isRefueling);
    this.updateRefuelOverlay(fuel, fuelPercent, walletMoney);
    this.updateRepairOverlay(damage, damagePercent, walletMoney);
    const rideHudHtml = this.activeRideHudLine(ride, player);
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
        this.renderPhone(offers, ride, player, profile);
      }
    }
    if (this.mapOpen) {
      this.mapRefreshElapsed += deltaTime;
      if (this.mapRefreshElapsed >= GAME_CONFIG.map.refreshSeconds) {
        this.mapRefreshElapsed = 0;
        this.renderMap(ride, player, town);
      }
    }
    this.renderRideResult(ride);
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
    const outOfMoney = walletMoney <= 0;
    this.repairButton.disabled = repaired || outOfMoney;
    this.repairButton.textContent = repaired ? "CAR REPAIRED" : outOfMoney ? "NO MONEY" : "REPAIR CAR";
    this.repairButton.classList.toggle("held", this.repairHeld && !repaired && !outOfMoney);
    this.repairOverlay.style.setProperty("--damage-percent", `${damagePercent}%`);
  }

  private renderPhone(offers: RideOfferBoard, ride: RideManager, player: PlayerCar, profile: PlayerProfile): void {
    let content: string;
    const missionCategory = getMissionLicense(this.phoneTab);
    if (missionCategory) {
      content = this.renderMissionTab(offers, ride, player, profile, missionCategory);
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
        <div class="phone-header">
          <div class="phone-tabs" role="tablist">
            ${MISSION_LICENSES.map((license) => this.phoneTabButton(license.id, license.tabLabel)).join("")}
            ${this.phoneTabButton("garage", "GARAGE")}
            ${this.phoneTabButton("upgrades", "UPGRADES")}
            ${this.phoneTabButton("scorecard", "SCORECARD")}
          </div>
          <div class="phone-balance">BALANCE ${this.money(profile.money)}</div>
        </div>
        ${this.phoneFeedback ? `<div class="phone-feedback">${this.phoneFeedback}</div>` : ""}
        ${content}
        <div class="phone-close-hint">P TO CLOSE · ESC TO PAUSE</div>
      </div>
    `);
  }

  private renderMissionTab(
    offerBoard: RideOfferBoard,
    ride: RideManager,
    player: PlayerCar,
    profile: PlayerProfile,
    category: MissionLicenseDefinition,
  ): string {
    if (!profile.ownsMissionLicense(category.id)) return this.renderLockedMission(category, profile);
    if (ride.state !== RideState.Idle && ride.activeRide?.missionCategoryId === category.id) {
      return this.renderCurrentRide(ride, player, category);
    }
    const rideInProgress = ride.state !== RideState.Idle;
    return `
      <div class="phone-title">${category.name.toUpperCase()} JOBS</div>
      ${rideInProgress ? '<div class="mission-status">CURRENT RIDE IN PROGRESS · NEW JOBS UNAVAILABLE</div>' : ""}
      <div class="offer-list">
        ${offerBoard.getOffers(category.id).map((offer) => this.offerCard(offer, rideInProgress)).join("")}
      </div>
    `;
  }

  private renderCurrentRide(ride: RideManager, player: PlayerCar, category: MissionLicenseDefinition): string {
    if (ride.activeRide) {
      const target = ride.getObjectivePosition();
      const distance = target ? Math.round(distanceXZ(player.root.position, target)) : 0;
      const status = ride.state === RideState.DrivingToPickup ? "Driving to pickup" : "Passenger onboard";
      const onboardDetails = ride.state === RideState.PassengerOnboard
        ? `<div class="phone-current-score">${this.stars(ride.getStars())} · Tip now ${this.money(ride.getCurrentTip())}${this.violationPenaltyText(ride)}</div>`
        : "";
      return `
        <div class="phone-title">CURRENT ${category.name.toUpperCase()} RIDE</div>
        <div class="current-ride-card">
          <div class="ride-name">${ride.activeRide.passengerName}</div>
          <div class="ride-type">${ride.activeRide.passengerType}</div>
          <div>${status}</div>
          <div>${distance} m away</div>
          <div>Base Fare: ${this.money(ride.activeRide.baseFare)}</div>
          ${onboardDetails}
        </div>
      `;
    }
    return "";
  }

  private renderLockedMission(category: MissionLicenseDefinition, profile: PlayerProfile): string {
    const affordable = profile.money >= category.unlockCost;
    return `
      <div class="license-lock">
        <div class="license-lock-label">MISSION LICENSE</div>
        <div class="license-lock-title">${category.name.toUpperCase()}</div>
        <div class="license-lock-description">${category.description}</div>
        <div class="license-lock-rate">BASE FARES ×${category.fareMultiplier}</div>
        <button type="button" data-purchase-license="${category.id}" ${affordable ? "" : "disabled"}>
          ${affordable ? `PURCHASE FOR ${this.wholeMoney(category.unlockCost)}` : `NEED ${this.wholeMoney(category.unlockCost)}`}
        </button>
      </div>
    `;
  }

  private renderGarage(profile: PlayerProfile, player: PlayerCar): string {
    const stopped = player.getSpeedMph() <= GAME_CONFIG.progression.equipMaxSpeedMph;
    return `
      <div class="phone-title">VEHICLE GARAGE</div>
      <div class="garage-list">
        ${VEHICLE_CATALOG.map((vehicle) => this.vehicleCard(vehicle, profile, stopped)).join("")}
      </div>
    `;
  }

  private vehicleCard(vehicle: VehicleDefinition, profile: PlayerProfile, stopped: boolean): string {
    const owned = profile.ownsVehicle(vehicle.id);
    const equipped = profile.equippedVehicleId === vehicle.id;
    const affordable = profile.money >= vehicle.price;
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
            <div class="vehicle-status">${equipped ? "EQUIPPED" : owned ? "OWNED" : this.wholeMoney(vehicle.price)}</div>
          </div>
          <span class="vehicle-swatch" style="background:${vehicle.appearance.bodyColor}"></span>
        </div>
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
      <div class="phone-title">RIDE SCORECARD</div>
      <div class="scorecard-summary">
        ${this.scorecardSummaryStat(profile.completedRides.toLocaleString("en-US"), "LIFETIME RIDES")}
        ${this.scorecardSummaryStat(history.length > 0 ? averageStars.toFixed(1) : "-", "AVERAGE STARS")}
        ${this.scorecardSummaryStat(this.money(recordedTips), "RECORDED TIPS")}
        ${this.scorecardSummaryStat(this.money(recordedEarnings), "RECORDED EARNINGS")}
      </div>
      ${limitNote}
      ${history.length > 0
        ? `<div class="scorecard-list">${history.map((ride) => this.rideScorecard(ride)).join("")}</div>`
        : `<div class="scorecard-empty"><strong>NO RECORDED RIDES</strong><span>${emptyMessage}</span></div>`}
    `;
  }

  private rideScorecard(ride: RideHistoryEntry): string {
    const totalDistance = ride.pickupDistance + ride.tripDistance;
    return `
      <div class="ride-scorecard">
        <div class="scorecard-heading">
          <div>
            <div class="vehicle-name">${ride.passengerName}</div>
            <div class="ride-type">${getMissionLicense(ride.missionCategoryId)?.name.toUpperCase() ?? "RIDESHARE"} · ${ride.passengerType} · ${ride.rideTier}</div>
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

  private showPhoneFeedback(message: string): void {
    this.phoneFeedback = message;
    this.phoneFeedbackSeconds = 2.5;
    this.lastPhoneHtml = "";
  }

  private renderMap(ride: RideManager, player: PlayerCar, town: Town): void {
    const playerPoint = this.mapPoint(player.root.position.x, player.root.position.z, town);
    const playerRotation = Math.PI - player.heading;
    const gasMarkers = town.gasStations.map((station) => {
      const point = this.mapPoint(station.position.x, station.position.z, town);
      return `<div class="map-marker gas" style="left:${point.x}%;top:${point.y}%">G</div>`;
    }).join("");
    const repairMarkers = town.autoBodyShops.map((shop) => {
      const point = this.mapPoint(shop.position.x, shop.position.z, town);
      return `<div class="map-marker repair" style="left:${point.x}%;top:${point.y}%">A</div>`;
    }).join("");
    const activeRide = ride.activeRide;
    const pickupMarker = activeRide && ride.state === RideState.DrivingToPickup
      ? this.objectiveMapMarker(activeRide.pickupPoint.position.x, activeRide.pickupPoint.position.z, town, "pickup", "P")
      : "";
    const destinationMarker = activeRide && ride.state === RideState.PassengerOnboard
      ? this.objectiveMapMarker(activeRide.destinationPoint.position.x, activeRide.destinationPoint.position.z, town, "dropoff", "D")
      : "";

    this.setHtml(this.map, "lastMapHtml", `
      <div class="map-panel">
        <div class="map-title">MAP</div>
        <div class="map-canvas">
          ${gasMarkers}
          ${repairMarkers}
          ${pickupMarker}
          ${destinationMarker}
          <div class="map-player" style="left:${playerPoint.x}%;top:${playerPoint.y}%;transform: translate(-50%, -50%) rotate(${playerRotation}rad)">▲</div>
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
    `);
  }

  private objectiveMapMarker(x: number, z: number, town: Town, className: string, label: string): string {
    const point = this.mapPoint(x, z, town);
    return `<div class="map-marker ${className}" style="left:${point.x}%;top:${point.y}%">${label}</div>`;
  }

  private mapPoint(x: number, z: number, town: Town): { x: number; y: number } {
    const percentX = ((x - town.minX) / (town.maxX - town.minX)) * 100;
    const percentY = 100 - ((z - town.minZ) / (town.maxZ - town.minZ)) * 100;
    return {
      x: Math.max(1, Math.min(99, percentX)),
      y: Math.max(1, Math.min(99, percentY)),
    };
  }

  private offerCard(offer: RideOffer, disabled = false): string {
    const expires = Math.max(0, Math.ceil(GAME_CONFIG.ride.offerLifetimeSeconds - offer.ageSeconds));
    const totalDistance = offer.pickupDistance + offer.tripDistance;
    const dollarsPerHundredMeters = totalDistance > 0 ? (offer.baseFare / totalDistance) * 100 : 0;
    return `
      <div class="offer-card">
        <div>
          <div class="ride-name">${offer.passengerName}</div>
          <div class="ride-tier">${offer.tier}</div>
          <div class="ride-type">${offer.passengerType}</div>
        </div>
        <div class="ride-details">
          <div>Pickup: ${Math.round(offer.pickupDistance)} m away</div>
          <div>Trip: ${Math.round(offer.tripDistance)} m</div>
          <div>Total: ${Math.round(totalDistance)} m</div>
          <div>Base Fare: ${this.money(offer.baseFare)}</div>
          <div>Value: ${this.money(dollarsPerHundredMeters)} / 100 m</div>
          <div class="${expires <= 10 ? "expires urgent" : "expires"}">Expires in ${expires}s</div>
        </div>
        <button type="button" data-ride-id="${offer.id}" data-ride-category="${offer.missionCategoryId}" ${disabled ? "disabled" : ""}>
          ${disabled ? "RIDE IN PROGRESS" : "ACCEPT"}
        </button>
      </div>
    `;
  }

  private activeRideHudLine(ride: RideManager, player: PlayerCar): string {
    if (!ride.activeRide) {
      return `<div class="objective">PRESS P FOR RIDES</div>`;
    }
    const target = ride.getObjectivePosition();
    const distance = target ? Math.round(distanceXZ(player.root.position, target)) : 0;
    if (ride.state === RideState.DrivingToPickup) {
      const category = getMissionLicense(ride.activeRide.missionCategoryId);
      return `
        <div class="objective">${category?.name.toUpperCase() ?? "RIDE"} · PICK UP: ${ride.activeRide.passengerName}</div>
        <div>${ride.activeRide.passengerType}</div>
        <div>${distance} m</div>
      `;
    }
    return `
      <div class="objective">${getMissionLicense(ride.activeRide.missionCategoryId)?.name.toUpperCase() ?? "RIDE"} · ${ride.activeRide.passengerName}</div>
      <div>${ride.activeRide.passengerType}</div>
      <div>${this.stars(ride.getStars())}</div>
      <div>TIP: ${this.money(ride.getCurrentTip())}</div>
      ${ride.violationTipPenaltyPercent > 0 ? `<div>ILLEGAL DRIVING: ${ride.currentViolationPoints.toFixed(1)} PTS · TIP -${Math.round(ride.violationTipPenaltyPercent)}%</div>` : ""}
      <div>${distance} m</div>
    `;
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
    const distance = Math.round(distanceXZ(player.root.position, target));
    this.indicatorArrow.style.transform = `rotate(${relativeAngle}rad)`;
    this.indicatorDistance.textContent = `${distance}m`;
  }

  private renderRideResult(ride: RideManager): void {
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
        this.actions.debugResetProgression();
      }
      this.lastPhoneHtml = "";
    });
    return panel;
  }

  private setHtml(element: HTMLElement, cacheKey: "lastPhoneHtml" | "lastMapHtml" | "lastRideResultHtml", html: string): void {
    if (this[cacheKey] === html) {
      return;
    }
    this[cacheKey] = html;
    element.innerHTML = html;
  }
}
