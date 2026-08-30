import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { GAME_CONFIG } from "../game/config";
import type { BoxCollider, TrafficWaypoint } from "../game/types";
import { clamp, lerp, normalizeAngle } from "../utils/math";
import { resolveCircleBoxValues } from "../world/collisions";
import type { Input } from "./Input";
import type { WorldQuery } from "../world/WorldQuery";

export class PlayerCar {
  readonly root: Mesh;
  heading = 0;
  private velocityX = 0;
  private velocityZ = 0;
  private yawRate = 0;
  private readonly collisionCandidates: BoxCollider[] = [];
  private readonly config = GAME_CONFIG.player;

  constructor(private readonly scene: Scene, private readonly roadSpawnPoints: TrafficWaypoint[]) {
    this.root = new Mesh("player-car-root", scene);
    this.createMesh();
    this.reset();
  }

  update(deltaTime: number, input: Input, worldQuery: WorldQuery, canAccelerate = true): void {
    if (input.consumeReset()) {
      this.reset();
      return;
    }

    input.updateDriving(deltaTime);
    const onSidewalk = worldQuery.isOnSidewalk(this.root.position.x, this.root.position.z);
    this.simulateHandling(deltaTime, input, onSidewalk, canAccelerate);

    this.root.position.x += this.velocityX * deltaTime;
    this.root.position.z += this.velocityZ * deltaTime;
    this.root.rotation.y = this.heading;

    this.resolveStaticCollisions(worldQuery);
  }

  reset(): void {
    const nearest = this.findNearestRoadPoint();
    this.root.position.copyFrom(nearest.position);
    this.root.position.y = 0.9;
    this.heading = nearest.ix < this.roadSpawnPoints.length ? Math.PI / 2 : 0;
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

  get colliderRadius(): number {
    return this.config.radius;
  }

  applyTrafficCollision(normalX: number, normalZ: number, depth: number): void {
    this.root.position.x += normalX * depth * 1.2;
    this.root.position.z += normalZ * depth * 1.2;
    this.applyCollisionResponse(normalX, normalZ);
  }

  private createMesh(): void {
    const bodyMat = new StandardMaterial("player-body-mat", this.scene);
    bodyMat.diffuseColor = new Color3(0.96, 0.77, 0.18);
    bodyMat.specularColor = Color3.Black();
    const cabinMat = new StandardMaterial("player-cabin-mat", this.scene);
    cabinMat.diffuseColor = new Color3(0.08, 0.17, 0.22);
    cabinMat.specularColor = Color3.Black();
    const wheelMat = new StandardMaterial("wheel-mat", this.scene);
    wheelMat.diffuseColor = new Color3(0.04, 0.04, 0.04);
    wheelMat.specularColor = Color3.Black();

    const body = MeshBuilder.CreateBox("player-body", { width: 3.1, height: 1.1, depth: 5.8 }, this.scene);
    body.position.y = 0;
    body.material = bodyMat;
    body.parent = this.root;

    const cabin = MeshBuilder.CreateBox("player-cabin", { width: 2.3, height: 0.9, depth: 2.1 }, this.scene);
    cabin.position.set(0, 0.9, -0.35);
    cabin.material = cabinMat;
    cabin.parent = this.root;

    const nose = MeshBuilder.CreateBox("player-front", { width: 1.2, height: 0.2, depth: 0.25 }, this.scene);
    nose.position.set(0, 0.25, 3.05);
    nose.material = cabinMat;
    nose.parent = this.root;

    for (const x of [-1.75, 1.75]) {
      for (const z of [-1.8, 1.8]) {
        const wheel = MeshBuilder.CreateBox(`player-wheel-${x}-${z}`, { width: 0.45, height: 0.7, depth: 1 }, this.scene);
        wheel.position.set(x, -0.25, z);
        wheel.material = wheelMat;
        wheel.parent = this.root;
      }
    }
  }

  private simulateHandling(deltaTime: number, input: Input, onSidewalk: boolean, canAccelerate: boolean): void {
    const forwardX = Math.sin(this.heading);
    const forwardZ = Math.cos(this.heading);
    const rightX = Math.cos(this.heading);
    const rightZ = -Math.sin(this.heading);
    let forwardSpeed = this.velocityX * forwardX + this.velocityZ * forwardZ;
    let lateralSpeed = this.velocityX * rightX + this.velocityZ * rightZ;
    const handlingMultiplier = onSidewalk ? this.config.sidewalkHandlingMultiplier : 1;
    const maxForwardSpeed = this.config.maxForwardSpeed * handlingMultiplier;
    const maxReverseSpeed = this.config.maxReverseSpeed * handlingMultiplier;
    const throttle = canAccelerate ? input.throttle : 0;
    const brake = input.brake;

    if (brake > 0.01) {
      if (forwardSpeed > 0.5) {
        forwardSpeed = this.moveTowards(forwardSpeed, 0, this.config.braking * brake * deltaTime);
      } else {
        forwardSpeed -= this.config.reverseAcceleration * handlingMultiplier * brake * deltaTime;
      }
    } else if (throttle > 0.01) {
      if (forwardSpeed < -0.5) {
        forwardSpeed = this.moveTowards(forwardSpeed, 0, this.config.braking * throttle * deltaTime);
      } else {
        const speedRatio = clamp(Math.max(0, forwardSpeed) / maxForwardSpeed, 0, 1);
        const acceleration = lerp(
          this.config.acceleration,
          this.config.highSpeedAcceleration,
          Math.pow(speedRatio, this.config.accelerationFalloffPower),
        );
        forwardSpeed += acceleration * handlingMultiplier * throttle * deltaTime;
      }
    }

    const drag = this.config.rollingResistance
      + this.config.aerodynamicDrag * forwardSpeed * forwardSpeed;
    forwardSpeed = this.moveTowards(forwardSpeed, 0, drag * deltaTime);
    if (onSidewalk && Math.abs(forwardSpeed) > maxForwardSpeed) {
      forwardSpeed = this.moveTowards(forwardSpeed, 0, this.config.sidewalkExtraDrag * deltaTime);
    }
    forwardSpeed = clamp(forwardSpeed, -maxReverseSpeed, maxForwardSpeed);

    const baseSpeedRatio = clamp(Math.abs(forwardSpeed) / this.config.maxForwardSpeed, 0, 1);
    const steeringActivation = clamp(
      (Math.abs(forwardSpeed) - this.config.minimumSteeringSpeed)
        / (this.config.fullSteeringSpeed - this.config.minimumSteeringSpeed),
      0,
      1,
    );
    const steeringDirection = forwardSpeed >= 0 ? 1 : -1;
    const availableYawRate = lerp(this.config.lowSpeedYawRate, this.config.highSpeedYawRate, baseSpeedRatio);
    const desiredYawRate = input.steering
      * steeringDirection
      * availableYawRate
      * steeringActivation
      * handlingMultiplier;

    const surfaceGrip = onSidewalk ? this.config.sidewalkGripMultiplier : 1;
    const tractionCapacity = this.config.maxLateralAcceleration
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
      this.yawRate *= Math.exp(-this.config.yawRecovery * deltaTime);
    }
    this.yawRate = clamp(this.yawRate, -this.config.maxYawRate, this.config.maxYawRate);

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
    worldQuery.getNearbyColliders(this.root.position.x, this.root.position.z, this.config.radius, this.collisionCandidates);
    for (const collider of this.collisionCandidates) {
      const hit = resolveCircleBoxValues(this.root.position.x, this.root.position.z, this.config.radius, collider);
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
