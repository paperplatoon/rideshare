import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Loading/loadingScreen";
import { GAME_CONFIG } from "./config";
import { GameState } from "./types";
import { TownGenerator, type Town } from "../world/Town";
import { PlayerCar } from "../player/PlayerCar";
import { ChaseCamera } from "../player/ChaseCamera";
import { Input } from "../player/Input";
import { TrafficManager } from "../traffic/TrafficManager";
import { GameUI } from "../ui/GameUI";
import { RideOfferManager } from "../ride/RideOfferManager";
import { RideManager } from "../ride/RideManager";
import { FuelManager } from "../player/FuelManager";
import { DamageManager } from "../player/DamageManager";
import { PerformanceMonitor } from "./PerformanceMonitor";
import { WorldQuery } from "../world/WorldQuery";
import { PlayerProfile } from "../player/PlayerProfile";
import { ActivityManager } from "../activity/ActivityManager";
import { lerp, normalizeAngle } from "../utils/math";

export class Game {
  private scene: Scene;
  private state = GameState.Start;
  private town: Town | null = null;
  private player: PlayerCar | null = null;
  private chaseCamera: ChaseCamera | null = null;
  private input: Input | null = null;
  private rideOffers: RideOfferManager | null = null;
  private ride: RideManager | null = null;
  private fuel: FuelManager | null = null;
  private damage: DamageManager | null = null;
  private traffic: TrafficManager | null = null;
  private profile: PlayerProfile | null = null;
  private activity: ActivityManager | null = null;
  private worldQuery: WorldQuery | null = null;
  private physicsAccumulator = 0;
  private readonly previousPlayerPosition = Vector3.Zero();
  private readonly currentPlayerPosition = Vector3.Zero();
  private readonly renderPlayerPosition = Vector3.Zero();
  private previousPlayerHeading = 0;
  private currentPlayerHeading = 0;
  private readonly ui: GameUI;
  private readonly performanceMonitor: PerformanceMonitor;

  constructor(
    private readonly engine: Engine,
    private readonly canvas: HTMLCanvasElement,
    uiRoot: HTMLDivElement,
  ) {
    this.scene = this.createScene();
    this.ui = new GameUI(uiRoot, () => this.startShift(), (id) => this.acceptRide(id));
    this.performanceMonitor = new PerformanceMonitor(engine, this.scene, uiRoot);
    this.buildSimulation();
    this.ui.showStart();
  }

  startRenderLoop(): void {
    this.engine.runRenderLoop(() => {
      const deltaTime = Math.min(0.05, this.engine.getDeltaTime() / 1000);
      this.performanceMonitor.beginUpdate();
      this.update(deltaTime);
      this.performanceMonitor.endUpdate();
      this.scene.render();
      this.performanceMonitor.afterRender(
        this.traffic?.activeCarCount ?? 0,
        (this.worldQuery?.lastCollisionCandidateCount ?? 0) + (this.traffic?.lastCollisionCandidateCount ?? 0),
      );
    });
  }

  private startShift(): void {
    this.state = GameState.Playing;
    this.physicsAccumulator = 0;
    this.ui.showPlaying();
    this.canvas.focus();
  }

  private restart(): void {
    this.disposeSimulation();
    this.scene.dispose();
    this.scene = this.createScene();
    this.performanceMonitor.attachScene(this.scene);
    this.state = GameState.Playing;
    this.buildSimulation();
    this.ui.showPlaying();
    this.canvas.focus();
  }

  private update(deltaTime: number): void {
    if (!this.player || !this.input || !this.rideOffers || !this.ride || !this.fuel || !this.damage || !this.traffic || !this.chaseCamera || !this.town || !this.activity || !this.profile) {
      if (this.chaseCamera) {
        this.chaseCamera.update(deltaTime);
      }
      return;
    }

    if (this.input.consumeEscape()) {
      if (this.state === GameState.Paused) {
        this.state = GameState.Playing;
        this.physicsAccumulator = 0;
        this.ui.showPlaying();
      } else if (this.state === GameState.Playing) {
        this.state = GameState.Paused;
        this.physicsAccumulator = 0;
        this.input.resetDrivingState();
        this.ui.closePhone();
        this.ui.showPaused();
      }
    }

    if (this.state !== GameState.Playing) {
      return;
    }

    if (this.input.consumePhoneToggle()) {
      this.ui.togglePhone();
    }
    if (this.input.consumeMapToggle()) {
      this.ui.toggleMap();
    }

    if (this.worldQuery) {
      const fixedStep = GAME_CONFIG.simulation.fixedStepSeconds;
      this.restorePlayerPhysicsPose();
      this.physicsAccumulator = Math.min(
        this.physicsAccumulator + deltaTime,
        fixedStep * GAME_CONFIG.simulation.maxSubSteps,
      );
      let trafficCollisionMph = 0;
      let collisionDamagePercent = 0;
      while (this.physicsAccumulator >= fixedStep) {
        this.previousPlayerPosition.copyFrom(this.currentPlayerPosition);
        this.previousPlayerHeading = this.currentPlayerHeading;
        this.player.update(fixedStep, this.input, this.worldQuery, this.fuel.hasFuel);
        const collision = this.traffic.update(fixedStep, this.player);
        trafficCollisionMph = Math.max(trafficCollisionMph, collision.ridePenaltyMph);
        collisionDamagePercent += collision.damagePercent;
        this.currentPlayerPosition.copyFrom(this.player.root.position);
        this.currentPlayerHeading = this.player.heading;
        this.physicsAccumulator -= fixedStep;
      }
      this.ride.registerTrafficCollision(trafficCollisionMph);
      if (collisionDamagePercent > 0) {
        this.damage.applyDamage(collisionDamagePercent);
      }
    }
    this.rideOffers.update(deltaTime, !this.activity.hasActiveActivity);
    this.ride.update(deltaTime, this.player, true);
    this.activity.update();
    this.fuel.update(deltaTime, this.player, this.town.gasStations, this.profile, this.ui.isRefuelHeld);
    this.damage.update(deltaTime, this.player, this.town.autoBodyShops, this.profile, this.ui.isRepairHeld);
    if (this.worldQuery) {
      this.applyInterpolatedPlayerPose(this.physicsAccumulator / GAME_CONFIG.simulation.fixedStepSeconds);
    }
    this.chaseCamera.update(deltaTime);
    this.ui.update(
      this.rideOffers,
      this.ride,
      this.player,
      this.fuel,
      this.damage,
      this.town,
      this.activity.getObjectivePosition(),
      deltaTime,
    );
  }

  private buildSimulation(): void {
    this.town = new TownGenerator(this.scene).generate();
    this.worldQuery = new WorldQuery(
      this.town.staticColliders,
      this.town.roadPositionsX,
      this.town.roadPositionsZ,
      GAME_CONFIG.world.roadWidth / 2,
      GAME_CONFIG.world.roadWidth / 2 + GAME_CONFIG.world.sidewalkWidth,
      GAME_CONFIG.world.spatialCellSize,
    );
    this.input = new Input();
    this.player = new PlayerCar(this.scene, this.town.roadSpawnPoints);
    this.capturePlayerPhysicsPose();
    this.chaseCamera = new ChaseCamera(this.scene, this.player);
    this.scene.activeCamera = this.chaseCamera.camera;
    this.rideOffers = new RideOfferManager(this.town.deliveryPoints, this.player);
    this.profile = new PlayerProfile();
    this.damage = new DamageManager();
    this.ride = new RideManager(this.scene, this.rideOffers, this.profile);
    this.activity = new ActivityManager();
    this.fuel = new FuelManager();
    this.traffic = new TrafficManager(this.scene, this.town.roadSpawnPoints, this.town.roadPositionsX, this.town.roadPositionsZ);
  }

  private disposeSimulation(): void {
    this.input?.dispose();
    this.ride?.dispose();
    this.traffic?.dispose();
    this.input = null;
    this.rideOffers = null;
    this.ride = null;
    this.profile = null;
    this.activity = null;
    this.fuel = null;
    this.damage = null;
    this.traffic = null;
    this.worldQuery = null;
    this.physicsAccumulator = 0;
    this.player = null;
    this.chaseCamera = null;
    this.town = null;
  }

  private acceptRide(id: string): void {
    if (this.state !== GameState.Playing || !this.ride || !this.activity) {
      return;
    }
    this.activity.start(this.ride, () => this.ride!.acceptRide(id));
  }

  private capturePlayerPhysicsPose(): void {
    if (!this.player) return;
    this.currentPlayerPosition.copyFrom(this.player.root.position);
    this.previousPlayerPosition.copyFrom(this.currentPlayerPosition);
    this.currentPlayerHeading = this.player.heading;
    this.previousPlayerHeading = this.currentPlayerHeading;
  }

  private restorePlayerPhysicsPose(): void {
    if (!this.player) return;
    this.player.root.position.copyFrom(this.currentPlayerPosition);
    this.player.heading = this.currentPlayerHeading;
    this.player.root.rotation.y = this.currentPlayerHeading;
  }

  private applyInterpolatedPlayerPose(alpha: number): void {
    if (!this.player) return;
    const clampedAlpha = Math.max(0, Math.min(1, alpha));
    Vector3.LerpToRef(this.previousPlayerPosition, this.currentPlayerPosition, clampedAlpha, this.renderPlayerPosition);
    const headingDelta = normalizeAngle(this.currentPlayerHeading - this.previousPlayerHeading);
    const renderHeading = normalizeAngle(lerp(this.previousPlayerHeading, this.previousPlayerHeading + headingDelta, clampedAlpha));
    this.player.root.position.copyFrom(this.renderPlayerPosition);
    this.player.heading = renderHeading;
    this.player.root.rotation.y = renderHeading;
  }

  private createScene(): Scene {
    const scene = new Scene(this.engine);
    scene.clearColor.set(0.55, 0.72, 0.86, 1);
    const light = new HemisphericLight("main-light", new Vector3(0.4, 1, 0.3), scene);
    light.intensity = 0.92;
    light.groundColor = new Color3(0.32, 0.34, 0.34);

    const previewCamera = new ArcRotateCamera("preview-camera", Math.PI * 0.25, Math.PI * 0.35, 850, Vector3.Zero(), scene);
    previewCamera.minZ = 0.1;
    previewCamera.maxZ = 2200;
    scene.activeCamera = previewCamera;
    return scene;
  }
}
