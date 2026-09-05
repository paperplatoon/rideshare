import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { GAME_CONFIG } from "../game/config";
import type { BoxCollider, TrafficWaypoint } from "../game/types";
import { clamp, lerp, normalizeAngle } from "../utils/math";
import { resolveCircleBoxValues } from "../world/collisions";
import type { Input } from "./Input";
import type { WorldQuery } from "../world/WorldQuery";
import { STARTER_VEHICLE } from "../vehicles/VehicleCatalog";
import type { VehicleDefinition, VehicleStats } from "../vehicles/VehicleTypes";
import { createLowPolyVehicleMesh } from "../vehicles/VehicleMeshFactory";

export class PlayerCar {
  readonly root: Mesh;
  heading = 0;
  private velocityX = 0;
  private velocityZ = 0;
  private yawRate = 0;
  private readonly collisionCandidates: BoxCollider[] = [];
  private readonly config = GAME_CONFIG.player;
  private vehicleDefinition: VehicleDefinition;
  private effectiveStats: VehicleStats;
  private vehicleMeshes: Mesh[] = [];
  private vehicleMaterials: StandardMaterial[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly roadSpawnPoints: TrafficWaypoint[],
    vehicle: VehicleDefinition = STARTER_VEHICLE,
    effectiveStats: VehicleStats = vehicle.stats,
  ) {
    this.vehicleDefinition = vehicle;
    this.effectiveStats = { ...effectiveStats };
    this.root = new Mesh("player-car-root", scene);
    this.createMesh(vehicle);
    this.reset();
  }

  update(deltaTime: number, input: Input, worldQuery: WorldQuery, canAccelerate = true, damagePercent = 0): void {
    if (input.consumeReset()) {
      this.reset();
      return;
    }

    input.updateDriving(deltaTime);
    const onSidewalk = worldQuery.isOnSidewalk(this.root.position.x, this.root.position.z);
    this.simulateHandling(deltaTime, input, onSidewalk, canAccelerate, damagePercent);

    this.root.position.x += this.velocityX * deltaTime;
    this.root.position.z += this.velocityZ * deltaTime;
    this.root.rotation.y = this.heading;

    this.resolveStaticCollisions(worldQuery);
  }

  reset(): void {
    const nearest = this.findNearestRoadPoint();
    this.root.position.copyFrom(nearest.position);
    this.root.position.y = 0.9;
    const maxRoadX = this.roadSpawnPoints.reduce((max, point) => Math.max(max, point.ix), 0);
    const driveEast = nearest.ix < maxRoadX;
    this.heading = driveEast ? Math.PI / 2 : -Math.PI / 2;
    this.root.position.z += driveEast ? -GAME_CONFIG.traffic.laneOffset : GAME_CONFIG.traffic.laneOffset;
    this.velocityX = 0;
    this.velocityZ = 0;
    this.yawRate = 0;
    this.root.rotation.set(0, this.heading, 0);
  }

  getForwardToRef(result: Vector3): void {
    result.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  getTravelDirectionToRef(result: Vector3): void {
    const speed = Math.hypot(this.velocityX, this.velocityZ);
    if (speed < 0.5) {
      this.getForwardToRef(result);
      return;
    }
    result.set(this.velocityX / speed, 0, this.velocityZ / speed);
  }

  getSpeedMph(): number {
    return Math.hypot(this.velocityX, this.velocityZ) * GAME_CONFIG.ride.mphPerWorldUnitPerSecond;
  }

  getVelocityX(): number {
    return this.velocityX;
  }

  getVelocityZ(): number {
    return this.velocityZ;
  }

  getMaxForwardSpeed(): number {
    return this.effectiveStats.topSpeed;
  }

  get vehicleWidth(): number {
    return this.vehicleDefinition.appearance.bodyWidth;
  }

  get vehicleLength(): number {
    return this.vehicleDefinition.appearance.bodyLength;
  }

  get equippedVehicleId(): string {
    return this.vehicleDefinition.id;
  }

  get colliderRadius(): number {
    return this.config.radius * (this.vehicleWidth / this.config.width);
  }

  equipVehicle(vehicle: VehicleDefinition, effectiveStats: VehicleStats): void {
    this.vehicleDefinition = vehicle;
    this.effectiveStats = { ...effectiveStats };
    this.velocityX = 0;
    this.velocityZ = 0;
    this.yawRate = 0;
    this.createMesh(vehicle);
  }

  applyEffectiveStats(effectiveStats: VehicleStats): void {
    this.effectiveStats = { ...effectiveStats };
  }

  applyTrafficCollision(normalX: number, normalZ: number, depth: number, applyImpact = true): void {
    this.root.position.x += normalX * depth * 1.2;
    this.root.position.z += normalZ * depth * 1.2;
    if (applyImpact) this.applyCollisionResponse(normalX, normalZ);
  }

  private createMesh(vehicle: VehicleDefinition): void {
    for (const mesh of this.vehicleMeshes) mesh.dispose();
    for (const material of this.vehicleMaterials) material.dispose();
    this.vehicleMeshes = [];
    this.vehicleMaterials = [];
    const appearance = vehicle.appearance;
    const material = new StandardMaterial(`player-vehicle-mat-${vehicle.id}`, this.scene);
    material.diffuseColor = Color3.White();
    material.specularColor = new Color3(0.16, 0.16, 0.16);
    const mesh = createLowPolyVehicleMesh(this.scene, `player-vehicle-${vehicle.id}`, material, {
      bodyColor: Color3.FromHexString(appearance.bodyColor),
      bodyLength: appearance.bodyLength,
      bodyWidth: appearance.bodyWidth,
      bodyHeight: appearance.bodyHeight,
      cabinLength: appearance.cabinLength,
      cabinWidth: appearance.cabinWidth,
      cabinHeight: appearance.cabinHeight,
    });
    mesh.parent = this.root;
    material.freeze();
    this.vehicleMaterials.push(material);
    this.vehicleMeshes.push(mesh);
  }

  private simulateHandling(deltaTime: number, input: Input, onSidewalk: boolean, canAccelerate: boolean, damagePercent: number): void {
    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);
    const rightX = Math.cos(this.heading);
    const rightZ = -Math.sin(this.heading);
    let forwardSpeed = this.velocityX * forwardX + this.velocityZ * forwardZ;
    let lateralSpeed = this.velocityX * rightX + this.velocityZ * rightZ;
    const damage = clamp(damagePercent, 0, 1);
    const damageEffects = this.config.damageEffects;
    const accelerationRatio = this.effectiveStats.acceleration / this.config.acceleration;
    const turningRatio = this.effectiveStats.turning;
    const accelerationDamageMultiplier = damageStatMultiplier(damage, damageEffects.accelerationMultiplierAtMaxDamage);
    const topSpeedDamageMultiplier = damageStatMultiplier(damage, damageEffects.topSpeedMultiplierAtMaxDamage);
    const reverseDamageMultiplier = damageStatMultiplier(damage, damageEffects.reverseMultiplierAtMaxDamage);
    const brakingDamageMultiplier = damageStatMultiplier(damage, damageEffects.brakingMultiplierAtMaxDamage);
    const yawRateDamageMultiplier = damageStatMultiplier(damage, damageEffects.yawRateMultiplierAtMaxDamage);
    const steeringResponseDamageMultiplier = damageStatMultiplier(damage, damageEffects.steeringResponseMultiplierAtMaxDamage);
    const gripDamageMultiplier = damageStatMultiplier(damage, damageEffects.gripMultiplierAtMaxDamage);
    const yawRecoveryDamageMultiplier = damageStatMultiplier(damage, damageEffects.yawRecoveryMultiplierAtMaxDamage);
    const handlingMultiplier = onSidewalk ? this.config.sidewalkHandlingMultiplier : 1;
    const maxForwardSpeed = this.effectiveStats.topSpeed * handlingMultiplier * topSpeedDamageMultiplier;
    const maxReverseSpeed = this.config.maxReverseSpeed * handlingMultiplier * reverseDamageMultiplier;
    const throttle = canAccelerate ? input.throttle : 0;
    const brake = input.brake;

    if (brake > 0.01) {
      if (forwardSpeed > 0.5) {
        forwardSpeed = this.moveTowards(forwardSpeed, 0, this.effectiveStats.braking * brakingDamageMultiplier * brake * deltaTime);
      } else {
        forwardSpeed -= this.config.reverseAcceleration * handlingMultiplier * reverseDamageMultiplier * brake * deltaTime;
      }
    } else if (throttle > 0.01) {
      if (forwardSpeed < -0.5) {
        forwardSpeed = this.moveTowards(forwardSpeed, 0, this.effectiveStats.braking * brakingDamageMultiplier * throttle * deltaTime);
      } else {
        const speedRatio = clamp(Math.max(0, forwardSpeed) / maxForwardSpeed, 0, 1);
        const acceleration = lerp(
          this.effectiveStats.acceleration,
          this.config.highSpeedAcceleration * accelerationRatio,
          Math.pow(speedRatio, this.config.accelerationFalloffPower),
        );
        forwardSpeed += acceleration * handlingMultiplier * accelerationDamageMultiplier * throttle * deltaTime;
      }
    }

    const drag = this.config.rollingResistance
      + this.config.aerodynamicDrag * forwardSpeed * forwardSpeed
      + damageEffects.extraDragAtMaxDamage * damage;
    forwardSpeed = this.moveTowards(forwardSpeed, 0, drag * deltaTime);
    if (onSidewalk && Math.abs(forwardSpeed) > maxForwardSpeed) {
      forwardSpeed = this.moveTowards(forwardSpeed, 0, this.config.sidewalkExtraDrag * deltaTime);
    }
    forwardSpeed = clamp(forwardSpeed, -maxReverseSpeed, maxForwardSpeed);

    const baseSpeedRatio = clamp(Math.abs(forwardSpeed) / this.effectiveStats.topSpeed, 0, 1);
    const steeringActivation = clamp(
      (Math.abs(forwardSpeed) - this.config.minimumSteeringSpeed)
        / (this.config.fullSteeringSpeed - this.config.minimumSteeringSpeed),
      0,
      1,
    );
    const steeringDirection = forwardSpeed >= 0 ? 1 : -1;
    const availableYawRate = lerp(this.config.lowSpeedYawRate, this.config.highSpeedYawRate, baseSpeedRatio)
      * turningRatio
      * yawRateDamageMultiplier;
    const desiredYawRate = input.steering
      * steeringDirection
      * availableYawRate
      * steeringActivation
      * handlingMultiplier;

    const surfaceGrip = (onSidewalk ? this.config.sidewalkGripMultiplier : 1) * gripDamageMultiplier;
    const tractionCapacity = this.config.maxLateralAcceleration
      * turningRatio
      * surfaceGrip
      * (1 - brake * this.config.brakeGripLoss);
    const lateralDemand = Math.abs(forwardSpeed * desiredYawRate);
    const demandSlip = clamp((lateralDemand / Math.max(1, tractionCapacity) - 1) / 0.55, 0, 1);
    const groundSpeed = Math.hypot(forwardSpeed, lateralSpeed);
    const existingSlip = clamp((Math.abs(lateralSpeed) / Math.max(groundSpeed, 4) - 0.12) / 0.36, 0, 1);
    const slip = Math.max(demandSlip, existingSlip * 0.75);
    const counterSteering = input.steering * this.yawRate < -0.02;
    const steeringResponse = this.config.steeringResponse
      * (counterSteering ? this.config.counterSteerResponseMultiplier : 1)
      * turningRatio
      * steeringResponseDamageMultiplier
      * (1 - slip * 0.62);
    const yawBlend = 1 - Math.exp(-steeringResponse * deltaTime);
    this.yawRate += (desiredYawRate - this.yawRate) * yawBlend;

    if (slip > 0 && Math.abs(input.steering) > 0.05 && !counterSteering) {
      this.yawRate += Math.sign(desiredYawRate)
        * this.config.spinOutTorque
        * slip
        * baseSpeedRatio
        * deltaTime;
    }
    if (brake > 0 && Math.abs(this.yawRate) > 0.03) {
      this.yawRate += this.yawRate
        * this.config.brakeOversteer
        * brake
        * baseSpeedRatio
        * (0.2 + slip)
        * deltaTime;
    }
    if (Math.abs(input.steering) < 0.05) {
      this.yawRate *= Math.exp(-this.config.yawRecovery * yawRecoveryDamageMultiplier * deltaTime);
    }
    const maxYawRate = this.config.maxYawRate * turningRatio;
    this.yawRate = clamp(this.yawRate, -maxYawRate, maxYawRate);

    const lateralGrip = lerp(this.config.lateralGrip, this.config.slidingGrip, slip) * surfaceGrip;
    lateralSpeed *= Math.exp(-lateralGrip * deltaTime);

    this.velocityX = forwardX * forwardSpeed + rightX * lateralSpeed;
    this.velocityZ = forwardZ * forwardSpeed + rightZ * lateralSpeed;
    this.heading = normalizeAngle(this.heading + this.yawRate * deltaTime);

    if (groundSpeed < 0.08 && throttle < 0.01 && brake < 0.01) {
      this.velocityX = 0;
      this.velocityZ = 0;
      this.yawRate = 0;
    }
  }

  private resolveStaticCollisions(worldQuery: WorldQuery): void {
    const radius = this.colliderRadius;
    worldQuery.getNearbyColliders(this.root.position.x, this.root.position.z, radius, this.collisionCandidates);
    for (const collider of this.collisionCandidates) {
      const hit = resolveCircleBoxValues(this.root.position.x, this.root.position.z, radius, collider);
      if (!hit) {
        continue;
      }
      this.root.position.x += hit.x * hit.depth;
      this.root.position.z += hit.z * hit.depth;
      this.applyCollisionResponse(hit.x, hit.z);
    }
  }

  private findNearestRoadPoint(): TrafficWaypoint {
    let nearest = this.roadSpawnPoints[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const point of this.roadSpawnPoints) {
      const dx = point.position.x - this.root.position.x;
      const dz = point.position.z - this.root.position.z;
      const distance = dx * dx + dz * dz;
      if (distance < nearestDistance) {
        nearest = point;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  private applyCollisionResponse(normalX: number, normalZ: number): void {
    const velocityIntoSurface = this.velocityX * normalX + this.velocityZ * normalZ;
    if (velocityIntoSurface < 0) {
      const restitution = 0.08;
      this.velocityX -= normalX * velocityIntoSurface * (1 + restitution);
      this.velocityZ -= normalZ * velocityIntoSurface * (1 + restitution);
    }
    this.velocityX *= this.config.collisionSpeedLoss;
    this.velocityZ *= this.config.collisionSpeedLoss;
    this.yawRate *= 0.45;
  }

  private moveTowards(current: number, target: number, maxDelta: number): number {
    if (Math.abs(target - current) <= maxDelta) {
      return target;
    }
    return current + Math.sign(target - current) * maxDelta;
  }
}

export function damageStatMultiplier(damagePercent: number, multiplierAtMaxDamage: number): number {
  return lerp(1, multiplierAtMaxDamage, clamp(damagePercent, 0, 1));
}
