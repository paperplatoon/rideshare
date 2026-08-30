import type { RideOfferManager } from "../ride/RideOfferManager";
import type { RideManager } from "../ride/RideManager";
import type { PlayerCar } from "../player/PlayerCar";
import type { FuelManager } from "../player/FuelManager";
import type { DamageManager } from "../player/DamageManager";
import { GAME_CONFIG } from "../game/config";
import { RideState, type RideOffer } from "../game/types";
import type { Town } from "../world/Town";
import { distanceXZ, normalizeAngle } from "../utils/math";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";

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
  private mapOpen = false;
  private refuelHeld = false;
  private repairHeld = false;
  private mapRefreshElapsed = 0;
  private lastRideHudHtml = "";
  private lastPhoneHtml = "";
  private lastMapHtml = "";
  private lastRideResultHtml = "";

  constructor(
    private readonly root: HTMLDivElement,
    onStart: () => void,
    private readonly onAcceptRide: (id: string) => void,
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
    this.startButton.addEventListener("click", onStart);

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
      const button = target.closest<HTMLButtonElement>("[data-ride-id]");
      if (!button) return;
      this.onAcceptRide(button.dataset.rideId ?? "");
      this.closePhone();
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

    root.append(this.startScreen, this.pauseScreen, this.hud, this.indicator, this.phone, this.map, this.refuelOverlay, this.repairOverlay, this.rideResult);
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
    this.phoneOpen = false;
    this.mapOpen = false;
    this.refuelHeld = false;
    this.repairHeld = false;
  }

  showPlaying(): void {
    this.startScreen.classList.add("hidden");
    this.pauseScreen.classList.add("hidden");
    this.hud.classList.remove("hidden");
    this.rideResult.classList.remove("hidden");
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

  togglePhone(): void {
    this.phoneOpen = !this.phoneOpen;
    this.phone.classList.toggle("hidden", !this.phoneOpen);
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
    offers: RideOfferManager,
    ride: RideManager,
    player: PlayerCar,
    fuel: FuelManager,
    damage: DamageManager,
    town: Town,
    objectivePosition: Vector3 | null,
    deltaTime: number,
  ): void {
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
      this.renderPhone(offers, ride, player);
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

  private renderPhone(offers: RideOfferManager, ride: RideManager, player: PlayerCar): void {
    if (ride.state !== RideState.Idle && ride.activeRide) {
      const target = ride.getObjectivePosition();
      const distance = target ? Math.round(distanceXZ(player.root.position, target)) : 0;
      const status = ride.state === RideState.DrivingToPickup ? "Driving to pickup" : "Passenger onboard";
      const onboardDetails = ride.state === RideState.PassengerOnboard
        ? `<div class="phone-current-score">${this.stars(ride.getStars())} · Tip now ${this.money(ride.getCurrentTip())}</div>`
        : "";
      this.setHtml(this.phone, "lastPhoneHtml", `
        <div class="phone-panel">
          <div class="phone-title">CURRENT RIDE</div>
          <div class="current-ride-card">
            <div class="ride-name">${ride.activeRide.passengerName}</div>
            <div class="ride-type">${ride.activeRide.passengerType}</div>
            <div>${status}</div>
            <div>${distance} m away</div>
            <div>Base Fare: ${this.money(ride.activeRide.baseFare)}</div>
            ${onboardDetails}
          </div>
          <div class="phone-close-hint">P TO CLOSE · ESC TO PAUSE</div>
        </div>
      `);
      return;
    }

    this.setHtml(this.phone, "lastPhoneHtml", `
      <div class="phone-panel">
        <div class="phone-title">AVAILABLE RIDES</div>
        <div class="offer-list">
          ${offers.offers.map((offer) => this.offerCard(offer)).join("")}
        </div>
        <div class="phone-close-hint">P TO CLOSE · ESC TO PAUSE</div>
      </div>
    `);
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

  private offerCard(offer: RideOffer): string {
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
        <button type="button" data-ride-id="${offer.id}">ACCEPT</button>
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
      return `
        <div class="objective">PICK UP: ${ride.activeRide.passengerName}</div>
        <div>${ride.activeRide.passengerType}</div>
        <div>${distance} m</div>
      `;
    }
    return `
      <div class="objective">${ride.activeRide.passengerName}</div>
      <div>${ride.activeRide.passengerType}</div>
      <div>${this.stars(ride.getStars())}</div>
      <div>TIP: ${this.money(ride.getCurrentTip())}</div>
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
      <div>${result.passengerName}</div>
      <div>${this.stars(result.stars)}</div>
      <div>Base Fare ${this.money(result.baseFare)}</div>
      <div>Tip ${this.money(result.tip)}</div>
      <div>Total ${this.money(result.total)}</div>
    `);
  }

  private stars(count: number): string {
    return `${"★".repeat(count)}${"☆".repeat(5 - count)}`;
  }

  private money(value: number): string {
    return `$${value.toFixed(2)}`;
  }

  private setHtml(element: HTMLElement, cacheKey: "lastPhoneHtml" | "lastMapHtml" | "lastRideResultHtml", html: string): void {
    if (this[cacheKey] === html) {
      return;
    }
    this[cacheKey] = html;
    element.innerHTML = html;
  }
}
