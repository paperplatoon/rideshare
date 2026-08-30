import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { GAME_CONFIG } from "../game/config";
import type { TrafficCollisionInfo, TrafficWaypoint } from "../game/types";
import { seededRandom } from "../utils/math";
import { TrafficCar, type Direction } from "./TrafficCar";
import type { PlayerCar } from "../player/PlayerCar";
import { collisionDamagePercent } from "../player/DamageManager";

export class TrafficManager {
  readonly cars: TrafficCar[] = [];
  activeCarCount = 0;
  lastCollisionCandidateCount = 0;
  private readonly rng = seededRandom(3777);
  private readonly materials: StandardMaterial[];
  private readonly prototypes: Mesh[];
  private readonly spatialHash = new Map<number, Map<number, TrafficCar[]>>();
  private readonly columnPool: Array<Map<number, TrafficCar[]>> = [];
  private readonly bucketPool: TrafficCar[][] = [];
  private readonly nearbyByCar: TrafficCar[][] = [];
  private readonly updateAccumulatorByCar: number[] = [];
  private readonly updateDeltaByCar: number[] = [];
  private readonly damageCooldownByCar: number[] = [];
  private readonly indexByCar = new Map<TrafficCar, number>();
  private readonly playerQueryResults: TrafficCar[] = [];
  private recycleCursor = 0;

  constructor(
    scene: Scene,
    private readonly waypoints: TrafficWaypoint[],
    private readonly roadPositionsX: number[],
    private readonly roadPositionsZ: number[],
  ) {
    this.materials = [
      this.material(scene, "traffic-red", new Color3(0.76, 0.18, 0.14)),
      this.material(scene, "traffic-blue", new Color3(0.12, 0.36, 0.72)),
      this.material(scene, "traffic-white", new Color3(0.82, 0.85, 0.82)),
      this.material(scene, "traffic-teal", new Color3(0.1, 0.55, 0.5)),
    ];
    this.prototypes = this.materials.map((material, index) => TrafficCar.createPrototype(scene, material, index));

    const shuffled = [...this.waypoints].sort(() => this.rng() - 0.5);
    const spawnRounds = Math.ceil(GAME_CONFIG.traffic.vehicleCount / shuffled.length);
    for (let i = 0; i < GAME_CONFIG.traffic.vehicleCount; i++) {
      const waypoint = shuffled[i % shuffled.length];
      const direction = this.pickValidDirection(waypoint, this.roadPositionsX.length, this.roadPositionsZ.length);
      const speed = GAME_CONFIG.traffic.minSpeed + this.rng() * (GAME_CONFIG.traffic.maxSpeed - GAME_CONFIG.traffic.minSpeed);
      const spawnRound = Math.floor(i / shuffled.length);
      const spawnProgress = spawnRound === 0 ? 0 : spawnRound / spawnRounds;
      const car = new TrafficCar(
        waypoint,
        direction,
        speed,
        this.roadPositionsX,
        this.roadPositionsZ,
        this.rng,
        this.prototypes[i % this.prototypes.length],
        spawnProgress,
      );
      this.cars.push(car);
      this.indexByCar.set(car, i);
      this.nearbyByCar.push([]);
      this.updateAccumulatorByCar.push(0);
      this.updateDeltaByCar.push(0);
      this.damageCooldownByCar.push(0);
    }
  }

  update(deltaTime: number, player: PlayerCar): TrafficCollisionInfo {
    for (let index = 0; index < this.damageCooldownByCar.length; index++) {
      this.damageCooldownByCar[index] = Math.max(0, this.damageCooldownByCar[index] - deltaTime);
    }
    this.prepareUpdates(deltaTime, player);
    this.rebuildSpatialHash();
    for (let index = 0; index < this.cars.length; index++) {
      const updateDelta = this.updateDeltaByCar[index];
      if (updateDelta <= 0) continue;
      const car = this.cars[index];
      const nearby = this.nearbyByCar[index];
      this.queryNearby(car.mesh.position.x, car.mesh.position.z, GAME_CONFIG.traffic.lookAheadDistance, nearby);
      car.update(updateDelta, nearby);
    }
    return this.resolvePlayerCollisions(player);
  }

  dispose(): void {
    for (const car of this.cars) {
      car.dispose();
    }
    for (const prototype of this.prototypes) prototype.dispose();
    for (const material of this.materials) material.dispose();
  }

  private resolvePlayerCollisions(player: PlayerCar): TrafficCollisionInfo {
    const playerX = player.root.position.x;
    const playerZ = player.root.position.z;
    const playerRadius = player.colliderRadius;
    let ridePenaltyMph = 0;
    let damagePercent = 0;
    this.queryNearby(
      playerX,
      playerZ,
      GAME_CONFIG.traffic.playerCollisionQueryRadius,
      this.playerQueryResults,
    );
    const nearbyCars = this.playerQueryResults;
    this.lastCollisionCandidateCount = nearbyCars.length;
    for (const car of nearbyCars) {
      const dx = playerX - car.mesh.position.x;
      const dz = playerZ - car.mesh.position.z;
      const distance = Math.hypot(dx, dz);
      const minDistance = playerRadius + GAME_CONFIG.traffic.radius;
      if (distance >= minDistance || distance < 0.001) {
        continue;
      }
      const nx = dx / distance;
      const nz = dz / distance;
      const depth = minDistance - distance;
      const relativeVelocityX = player.getVelocityX() - car.getVelocityX();
      const relativeVelocityZ = player.getVelocityZ() - car.getVelocityZ();
      const relativeSpeedMph = Math.hypot(relativeVelocityX, relativeVelocityZ) * GAME_CONFIG.ride.mphPerWorldUnitPerSecond;
      const closingSpeedMph = Math.max(0, -(relativeVelocityX * nx + relativeVelocityZ * nz) * GAME_CONFIG.ride.mphPerWorldUnitPerSecond);
      const directness = relativeSpeedMph > 0 ? closingSpeedMph / relativeSpeedMph : 0;
      ridePenaltyMph = Math.max(ridePenaltyMph, player.getSpeedMph());
      const carIndex = this.indexByCar.get(car) ?? -1;
      if (carIndex >= 0 && this.damageCooldownByCar[carIndex] <= 0) {
        damagePercent += collisionDamagePercent(closingSpeedMph, directness);
        this.damageCooldownByCar[carIndex] = GAME_CONFIG.traffic.damageCooldownSeconds;
      }
      player.applyTrafficCollision(nx, nz, depth);
      car.push(-nx * depth * 0.35, -nz * depth * 0.35);
    }
    return { ridePenaltyMph, damagePercent };
  }

  private rebuildSpatialHash(): void {
    for (const column of this.spatialHash.values()) {
      for (const bucket of column.values()) {
        bucket.length = 0;
        this.bucketPool.push(bucket);
      }
      column.clear();
      this.columnPool.push(column);
    }
    this.spatialHash.clear();
    for (const car of this.cars) {
      if (!car.mesh.isEnabled()) continue;
      const cellX = this.cellFor(car.mesh.position.x);
      const cellZ = this.cellFor(car.mesh.position.z);
      let column = this.spatialHash.get(cellX);
      if (!column) {
        column = this.columnPool.pop() ?? new Map<number, TrafficCar[]>();
        this.spatialHash.set(cellX, column);
      }
      let bucket = column.get(cellZ);
      if (!bucket) {
        bucket = this.bucketPool.pop() ?? [];
        column.set(cellZ, bucket);
      }
      bucket.push(car);
    }
  }

  private queryNearby(x: number, z: number, radius: number, results: TrafficCar[]): void {
    results.length = 0;
    const cellSize = GAME_CONFIG.traffic.spatialCellSize;
    const minCellX = Math.floor((x - radius) / cellSize);
    const maxCellX = Math.floor((x + radius) / cellSize);
    const minCellZ = Math.floor((z - radius) / cellSize);
    const maxCellZ = Math.floor((z + radius) / cellSize);

    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
        const bucket = this.spatialHash.get(cellX)?.get(cellZ);
        if (!bucket) {
          continue;
        }
        for (const car of bucket) {
          results.push(car);
        }
      }
    }

  }

  private cellFor(value: number): number {
    return Math.floor(value / GAME_CONFIG.traffic.spatialCellSize);
  }

  private prepareUpdates(deltaTime: number, player: PlayerCar): void {
    const fullRadiusSquared = GAME_CONFIG.traffic.fullSimulationRadius ** 2;
    const reducedRadiusSquared = GAME_CONFIG.traffic.reducedSimulationRadius ** 2;
    this.activeCarCount = 0;
    for (let index = 0; index < this.cars.length; index++) {
      const car = this.cars[index];
      let dx = car.mesh.position.x - player.root.position.x;
      let dz = car.mesh.position.z - player.root.position.z;
      let distanceSquared = dx * dx + dz * dz;
      if (distanceSquared > GAME_CONFIG.traffic.recycleRadius ** 2) {
        this.recycleCar(car, index, player);
        dx = car.mesh.position.x - player.root.position.x;
        dz = car.mesh.position.z - player.root.position.z;
        distanceSquared = dx * dx + dz * dz;
      }
      const enabled = distanceSquared <= reducedRadiusSquared;
      car.mesh.setEnabled(enabled);
      this.updateDeltaByCar[index] = 0;
      if (!enabled) continue;
      this.activeCarCount += 1;
      if (distanceSquared <= fullRadiusSquared) {
        this.updateDeltaByCar[index] = deltaTime;
        continue;
      }
      this.updateAccumulatorByCar[index] += deltaTime;
      if (this.updateAccumulatorByCar[index] >= GAME_CONFIG.traffic.reducedUpdateInterval) {
        this.updateDeltaByCar[index] = this.updateAccumulatorByCar[index];
        this.updateAccumulatorByCar[index] = 0;
      }
    }
  }

  private recycleCar(car: TrafficCar, carIndex: number, player: PlayerCar): void {
    const minDistanceSquared = GAME_CONFIG.traffic.respawnMinRadius ** 2;
    const maxDistanceSquared = GAME_CONFIG.traffic.respawnMaxRadius ** 2;
    for (let attempt = 0; attempt < this.waypoints.length; attempt++) {
      const waypoint = this.waypoints[this.recycleCursor % this.waypoints.length];
      this.recycleCursor += 1;
      const dx = waypoint.position.x - player.root.position.x;
      const dz = waypoint.position.z - player.root.position.z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared < minDistanceSquared || distanceSquared > maxDistanceSquared) continue;
      const direction = this.pickValidDirection(waypoint, this.roadPositionsX.length, this.roadPositionsZ.length);
      const progress = ((carIndex % 5) + 1) / 6;
      car.respawn(waypoint, direction, progress);
      this.updateAccumulatorByCar[carIndex] = 0;
      return;
    }
  }

  private pickValidDirection(waypoint: TrafficWaypoint, maxX: number, maxZ: number): Direction {
    const options: Direction[] = [];
    if (waypoint.iz > 0) options.push("north");
    if (waypoint.iz < maxZ - 1) options.push("south");
    if (waypoint.ix > 0) options.push("west");
    if (waypoint.ix < maxX - 1) options.push("east");
    return options[Math.floor(this.rng() * options.length)];
  }

  private material(scene: Scene, name: string, color: Color3): StandardMaterial {
    const mat = new StandardMaterial(name, scene);
    mat.diffuseColor = color;
    mat.specularColor = Color3.Black();
    return mat;
  }
}
