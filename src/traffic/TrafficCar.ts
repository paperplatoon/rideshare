import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { GAME_CONFIG } from "../game/config";
import type { TrafficVehicleRole, TrafficWaypoint } from "../game/types";
import { clamp, lerp, normalizeAngle, randomBetween } from "../utils/math";

type Direction = "north" | "south" | "east" | "west";

export interface TrafficPursuitTarget {
  x: number;
  z: number;
}

interface LeadVehicle {
  bumperGap: number;
  forwardSpeed: number;
}

function createQuadraticTurnPath(
  start: Vector3,
  control: Vector3,
  end: Vector3,
  segments: number,
): Vector3[] {
  const points: Vector3[] = [];
  const segmentCount = Math.max(1, Math.floor(segments));
  for (let segment = 1; segment <= segmentCount; segment++) {
    const t = segment / segmentCount;
    const inverse = 1 - t;
    points.push(new Vector3(
      inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
      end.y,
      inverse * inverse * start.z + 2 * inverse * t * control.z + t * t * end.z,
    ));
  }
  return points;
}

export function createTrafficTurnPath(
  start: Vector3,
  end: Vector3,
  incomingDirection: Direction,
  segments: number,
): Vector3[] {
  const incomingIsHorizontal = incomingDirection === "east" || incomingDirection === "west";
  const control = new Vector3(
    incomingIsHorizontal ? end.x : start.x,
    end.y,
    incomingIsHorizontal ? start.z : end.z,
  );
  return createQuadraticTurnPath(start, control, end, segments);
}

export function createTrafficUTurnPath(
  start: Vector3,
  end: Vector3,
  incomingDirection: Direction,
  segments: number,
): Vector3[] {
  const points: Vector3[] = [];
  const segmentCount = Math.max(2, Math.floor(segments));
  const centerX = (start.x + end.x) / 2;
  const centerZ = (start.z + end.z) / 2;
  const radialX = start.x - centerX;
  const radialZ = start.z - centerZ;
  const radius = Math.hypot(radialX, radialZ);
  const forward = directionVector(incomingDirection);
  for (let segment = 1; segment <= segmentCount; segment++) {
    const angle = Math.PI * segment / segmentCount;
    points.push(new Vector3(
      centerX + radialX * Math.cos(angle) + forward.x * radius * Math.sin(angle),
      end.y,
      centerZ + radialZ * Math.cos(angle) + forward.z * radius * Math.sin(angle),
    ));
  }
  return points;
}

export function choosePursuitDirection(
  waypoint: TrafficWaypoint,
  currentDirection: Direction,
  target: TrafficPursuitTarget,
  roadPositionsX: number[],
  roadPositionsZ: number[],
  allowReverse = true,
): Direction {
  const valid = validDirectionsAt(waypoint, roadPositionsX.length, roadPositionsZ.length);
  const reverse = oppositeDirection(currentDirection);
  const nonReversing = valid.filter((direction) => direction !== reverse);
  const options = allowReverse || nonReversing.length === 0 ? valid : nonReversing;
  let best = options[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const direction of options) {
    const next = nextIndices(waypoint.ix, waypoint.iz, direction);
    const score = Math.abs(roadPositionsX[next.ix] - target.x)
      + Math.abs(roadPositionsZ[next.iz] - target.z)
      + (direction === reverse ? GAME_CONFIG.police.pursuitReverseDirectionPenalty : 0)
      + (direction === currentDirection ? 0 : 0.001);
    if (score < bestScore) {
      best = direction;
      bestScore = score;
    }
  }
  return best;
}

export function shouldStartPursuitUTurn(
  position: TrafficPursuitTarget,
  previousWaypoint: TrafficWaypoint,
  nextWaypoint: TrafficWaypoint,
  direction: Direction,
  target: TrafficPursuitTarget,
  roadPositionsX: number[],
  roadPositionsZ: number[],
): boolean {
  const forward = directionVector(direction);
  const targetLongitudinalDistance = (target.x - position.x) * forward.x
    + (target.z - position.z) * forward.z;
  if (targetLongitudinalDistance >= -GAME_CONFIG.police.pursuitUTurnMinimumBehindDistance) {
    return false;
  }

  const previousCenter = {
    x: roadPositionsX[previousWaypoint.ix],
    z: roadPositionsZ[previousWaypoint.iz],
  };
  const nextCenter = {
    x: roadPositionsX[nextWaypoint.ix],
    z: roadPositionsZ[nextWaypoint.iz],
  };
  const forwardCost = Math.hypot(nextCenter.x - position.x, nextCenter.z - position.z)
    + Math.abs(nextCenter.x - target.x)
    + Math.abs(nextCenter.z - target.z);
  const reverseCost = Math.hypot(previousCenter.x - position.x, previousCenter.z - position.z)
    + Math.abs(previousCenter.x - target.x)
    + Math.abs(previousCenter.z - target.z)
    + GAME_CONFIG.police.pursuitReverseDirectionPenalty;
  return forwardCost - reverseCost >= GAME_CONFIG.police.pursuitUTurnRequiredRouteSavings;
}

export class TrafficCar {
  readonly mesh: Mesh;
  respawnGeneration = 0;
  direction: Direction;
  speed: number;
  waypoint: TrafficWaypoint;
  target: TrafficWaypoint;
  private velocityX = 0;
  private velocityZ = 0;
  private completingTurn = false;
  private plannedDirection: Direction;
  private readonly turnTargets: TrafficWaypoint[] = [];
  private cruiseSpeed: number;
  private speedChangeTimeRemaining: number;
  private pursuitTarget: TrafficPursuitTarget | null = null;
  private pursuitUTurnRequested = false;
  private pursuitUTurnCooldown = 0;

  constructor(
    readonly id: number,
    readonly role: TrafficVehicleRole,
    waypoint: TrafficWaypoint,
    direction: Direction,
    speed: number,
    private readonly roadPositionsX: number[],
    private readonly roadPositionsZ: number[],
    private readonly rng: () => number,
    prototype: Mesh,
    spawnProgress = 0,
  ) {
    this.waypoint = waypoint;
    this.direction = direction;
    this.speed = speed;
    this.cruiseSpeed = speed;
    this.speedChangeTimeRemaining = this.randomSpeedChangeInterval();
    this.plannedDirection = direction;
    this.target = waypoint;
    this.mesh = prototype.clone("traffic-car", null, false)!;
    this.mesh.setEnabled(false);
    this.respawn(waypoint, direction, spawnProgress);
  }

  update(deltaTime: number, nearbyTraffic: TrafficCar[]): void {
    this.pursuitUTurnCooldown = Math.max(0, this.pursuitUTurnCooldown - deltaTime);
    if (!this.pursuitTarget) this.updateCruiseSpeed(deltaTime);

    if (this.pursuitTarget && this.pursuitUTurnRequested && !this.completingTurn) {
      this.beginUTurn(this.direction, this.target);
    }

    let dx = this.target.position.x - this.mesh.position.x;
    let dz = this.target.position.z - this.mesh.position.z;
    let distance = Math.hypot(dx, dz);
    if (!this.completingTurn
      && this.plannedDirection !== this.direction
      && distance <= GAME_CONFIG.traffic.turnCurveRadius) {
      if (this.plannedDirection === oppositeDirection(this.direction)) {
        this.beginUTurn(this.direction, this.target);
      } else {
        this.beginTurn(this.direction, this.target);
      }
      dx = this.target.position.x - this.mesh.position.x;
      dz = this.target.position.z - this.mesh.position.z;
      distance = Math.hypot(dx, dz);
    }
    let routeAdvances = 0;
    while (distance < 0.05 && routeAdvances <= GAME_CONFIG.traffic.turnCurveSegments + 1) {
      this.advanceRoute();
      dx = this.target.position.x - this.mesh.position.x;
      dz = this.target.position.z - this.mesh.position.z;
      distance = Math.hypot(dx, dz);
      routeAdvances += 1;
    }
    if (distance < 0.05) return;

    const dirX = dx / distance;
    const dirZ = dz / distance;
    const desiredSpeed = this.desiredSpeed(distance, dirX, dirZ, nearbyTraffic);
    const speedChangeRate = desiredSpeed < this.speed
      ? (this.pursuitTarget ? GAME_CONFIG.police.pursuitBraking : GAME_CONFIG.traffic.braking)
      : (this.pursuitTarget ? GAME_CONFIG.police.pursuitAcceleration : GAME_CONFIG.traffic.acceleration);
    const maximumSpeedChange = speedChangeRate * deltaTime;
    this.speed += clamp(desiredSpeed - this.speed, -maximumSpeedChange, maximumSpeedChange);

    const step = Math.min(distance, this.speed * deltaTime);
    this.velocityX = deltaTime > 0 ? dirX * step / deltaTime : 0;
    this.velocityZ = deltaTime > 0 ? dirZ * step / deltaTime : 0;
    this.mesh.position.x += dirX * step;
    this.mesh.position.z += dirZ * step;
    const desiredHeading = Math.atan2(dirX, dirZ);
    this.mesh.rotation.y += normalizeAngle(desiredHeading - this.mesh.rotation.y) * Math.min(1, deltaTime * 6);
  }

  push(x: number, z: number): void {
    this.mesh.position.x += x;
    this.mesh.position.z += z;
  }

  getVelocityX(): number {
    return this.velocityX;
  }

  getVelocityZ(): number {
    return this.velocityZ;
  }

  get targetCruiseSpeed(): number {
    return this.cruiseSpeed;
  }

  get isTurning(): boolean {
    return this.completingTurn;
  }

  get isPursuing(): boolean {
    return this.pursuitTarget !== null;
  }

  setPursuitTarget(target: TrafficPursuitTarget): void {
    if (this.role !== "police") return;
    const wasPursuing = this.pursuitTarget !== null;
    this.pursuitTarget = { x: target.x, z: target.z };
    if (!this.completingTurn) {
      if (!wasPursuing) this.retargetCurrentLane();
      const distanceToIntersection = Math.hypot(
        this.target.position.x - this.mesh.position.x,
        this.target.position.z - this.mesh.position.z,
      );
      this.pursuitUTurnRequested = this.pursuitUTurnCooldown <= 0
        && distanceToIntersection > GAME_CONFIG.police.pursuitTurnCommitDistance
        && shouldStartPursuitUTurn(
          this.mesh.position,
          this.waypoint,
          this.target,
          this.direction,
          target,
          this.roadPositionsX,
          this.roadPositionsZ,
        );
      if (!this.pursuitUTurnRequested
        && (!wasPursuing || distanceToIntersection > GAME_CONFIG.police.pursuitTurnCommitDistance)) {
        this.plannedDirection = this.chooseDirectionAt(this.target);
      }
    }
  }

  clearPursuit(): void {
    if (!this.pursuitTarget) return;
    this.pursuitTarget = null;
    this.pursuitUTurnRequested = false;
    if (!this.completingTurn) {
      this.retargetCurrentLane();
      this.plannedDirection = this.chooseDirectionAt(this.target);
    }
  }

  respawn(waypoint: TrafficWaypoint, direction: Direction, progress: number): void {
    this.respawnGeneration += 1;
    this.waypoint = this.laneWaypoint(waypoint, direction);
    this.direction = direction;
    this.target = this.nextWaypoint();
    this.completingTurn = false;
    this.turnTargets.length = 0;
    this.pursuitUTurnRequested = false;
    this.pursuitUTurnCooldown = 0;
    this.plannedDirection = this.chooseDirectionAt(this.target);
    Vector3.LerpToRef(this.waypoint.position, this.target.position, progress, this.mesh.position);
    this.mesh.position.y = 1;
    this.velocityX = 0;
    this.velocityZ = 0;
    this.faceTarget();
  }

  dispose(): void {
    this.mesh.dispose();
  }

  static createPrototype(scene: import("@babylonjs/core/scene").Scene, material: StandardMaterial, index: number): Mesh {
    const width = GAME_CONFIG.traffic.vehicleWidth;
    const length = GAME_CONFIG.traffic.vehicleLength;
    const body = MeshBuilder.CreateBox(`traffic-body-source-${index}`, { width, height: 1.5, depth: length }, scene);
    body.material = material;
    const cabin = MeshBuilder.CreateBox(`traffic-cabin-source-${index}`, {
      width: width * 0.704,
      height: 1.05,
      depth: length * 0.351,
    }, scene);
    cabin.position.set(0, 1.05, -length * 0.037);
    cabin.material = material;
    const prototype = Mesh.MergeMeshes([body, cabin], true, true, undefined, false, false)!;
    prototype.name = `traffic-source-${index}`;
    prototype.position.y = -10000;
    prototype.isPickable = false;
    return prototype;
  }

  static createPolicePrototype(scene: import("@babylonjs/core/scene").Scene, material: StandardMaterial): Mesh {
    const width = GAME_CONFIG.traffic.vehicleWidth;
    const length = GAME_CONFIG.traffic.vehicleLength;
    const body = MeshBuilder.CreateBox("police-body-source", { width, height: 1.5, depth: length }, scene);
    const cabin = MeshBuilder.CreateBox("police-cabin-source", {
      width: width * 0.704,
      height: 1.05,
      depth: length * 0.351,
    }, scene);
    cabin.position.set(0, 1.05, -length * 0.037);
    const leftLight = MeshBuilder.CreateBox("police-light-red-source", { width: 1.25, height: 0.34, depth: 0.72 }, scene);
    leftLight.position.set(-0.68, 1.72, -0.35);
    const rightLight = MeshBuilder.CreateBox("police-light-blue-source", { width: 1.25, height: 0.34, depth: 0.72 }, scene);
    rightLight.position.set(0.68, 1.72, -0.35);
    const bumper = MeshBuilder.CreateBox("police-bumper-source", { width: width + 0.1, height: 0.38, depth: 0.42 }, scene);
    bumper.position.set(0, -0.25, -length / 2 + 0.02);

    TrafficCar.applyVertexColor(body, new Color4(0.035, 0.055, 0.075, 1));
    TrafficCar.applyVertexColor(cabin, new Color4(0.88, 0.91, 0.92, 1));
    TrafficCar.applyVertexColor(leftLight, new Color4(0.95, 0.08, 0.08, 1));
    TrafficCar.applyVertexColor(rightLight, new Color4(0.08, 0.3, 1, 1));
    TrafficCar.applyVertexColor(bumper, new Color4(0.88, 0.91, 0.92, 1));
    for (const part of [body, cabin, leftLight, rightLight, bumper]) part.material = material;

    const prototype = Mesh.MergeMeshes(
      [body, cabin, leftLight, rightLight, bumper],
      true,
      true,
      undefined,
      false,
      false,
    )!;
    prototype.name = "police-source";
    prototype.position.y = -10000;
    prototype.isPickable = false;
    prototype.useVertexColors = true;
    return prototype;
  }

  private static applyVertexColor(mesh: Mesh, color: Color4): void {
    const colors: number[] = [];
    for (let index = 0; index < mesh.getTotalVertices(); index++) {
      colors.push(color.r, color.g, color.b, color.a);
    }
    mesh.setVerticesData(VertexBuffer.ColorKind, colors);
    mesh.useVertexColors = true;
  }

  private updateCruiseSpeed(deltaTime: number): void {
    this.speedChangeTimeRemaining -= deltaTime;
    if (this.speedChangeTimeRemaining > 0) return;
    this.cruiseSpeed = randomBetween(this.rng, GAME_CONFIG.traffic.minSpeed, GAME_CONFIG.traffic.maxSpeed);
    this.speedChangeTimeRemaining = this.randomSpeedChangeInterval();
  }

  private randomSpeedChangeInterval(): number {
    return randomBetween(
      this.rng,
      GAME_CONFIG.traffic.minSpeedChangeSeconds,
      GAME_CONFIG.traffic.maxSpeedChangeSeconds,
    );
  }

  private chooseDirectionAt(waypoint: TrafficWaypoint): Direction {
    if (this.pursuitTarget) {
      return choosePursuitDirection(
        waypoint,
        this.direction,
        this.pursuitTarget,
        this.roadPositionsX,
        this.roadPositionsZ,
        this.pursuitUTurnCooldown <= 0,
      );
    }
    const valid = this.validDirectionsAt(waypoint);
    const nonReversing = valid.filter((direction) => direction !== this.oppositeDirection());
    const options = nonReversing.length > 0 ? nonReversing : valid;
    if (options.includes(this.direction) && this.rng() < 0.55) {
      return this.direction;
    }
    return options[Math.floor(this.rng() * options.length)];
  }

  private validDirectionsAt(waypoint: TrafficWaypoint): Direction[] {
    return validDirectionsAt(waypoint, this.roadPositionsX.length, this.roadPositionsZ.length);
  }

  private oppositeDirection(): Direction {
    return oppositeDirection(this.direction);
  }

  private advanceRoute(): void {
    this.mesh.position.x = this.target.position.x;
    this.mesh.position.z = this.target.position.z;
    this.waypoint = this.target;

    if (this.completingTurn && this.turnTargets.length > 0) {
      this.target = this.turnTargets.shift()!;
      return;
    }
    if (this.completingTurn) {
      this.completingTurn = false;
      this.target = this.nextWaypoint();
      this.plannedDirection = this.chooseDirectionAt(this.target);
      return;
    }

    const previousDirection = this.direction;
    this.direction = this.plannedDirection;
    if (this.direction === previousDirection) {
      this.target = this.nextWaypoint();
      this.plannedDirection = this.chooseDirectionAt(this.target);
      return;
    }

    if (this.direction === oppositeDirection(previousDirection)) {
      this.beginUTurn(previousDirection, this.waypoint);
      return;
    }

    this.beginTurn(previousDirection, this.waypoint);
  }

  private beginUTurn(previousDirection: Direction, routeWaypoint: TrafficWaypoint): void {
    this.pursuitUTurnRequested = false;
    if (this.pursuitTarget) {
      this.pursuitUTurnCooldown = GAME_CONFIG.police.pursuitUTurnCooldownSeconds;
    }
    this.direction = oppositeDirection(previousDirection);
    this.plannedDirection = this.direction;
    const turnEnd = this.mesh.position.clone();
    const roadCenter = previousDirection === "east" || previousDirection === "west"
      ? this.roadPositionsZ[routeWaypoint.iz]
      : this.roadPositionsX[routeWaypoint.ix];
    const laneOffset = this.pursuitTarget
      ? GAME_CONFIG.police.pursuitLaneOffset
      : GAME_CONFIG.traffic.laneOffset;
    if (this.direction === "east") turnEnd.z = roadCenter - laneOffset;
    if (this.direction === "west") turnEnd.z = roadCenter + laneOffset;
    if (this.direction === "north") turnEnd.x = roadCenter - laneOffset;
    if (this.direction === "south") turnEnd.x = roadCenter + laneOffset;

    this.turnTargets.length = 0;
    const points = createTrafficUTurnPath(
      this.mesh.position,
      turnEnd,
      previousDirection,
      GAME_CONFIG.traffic.turnCurveSegments * 2,
    );
    this.turnTargets.push(...points.map((position) => ({
      position,
      ix: routeWaypoint.ix,
      iz: routeWaypoint.iz,
    })));
    this.target = this.turnTargets.shift()!;
    this.completingTurn = true;
  }

  private beginTurn(previousDirection: Direction, intersectionWaypoint: TrafficWaypoint): void {
    this.direction = this.plannedDirection;
    const intersection = new Vector3(
      this.roadPositionsX[intersectionWaypoint.ix],
      1,
      this.roadPositionsZ[intersectionWaypoint.iz],
    );
    const turnEnd = this.laneWaypoint({
      position: intersection,
      ix: intersectionWaypoint.ix,
      iz: intersectionWaypoint.iz,
    }, this.direction);
    this.moveAlongDirection(turnEnd.position, this.direction, GAME_CONFIG.traffic.turnCurveRadius);
    this.turnTargets.length = 0;
    const points = createTrafficTurnPath(
      this.mesh.position,
      turnEnd.position,
      previousDirection,
      GAME_CONFIG.traffic.turnCurveSegments,
    );
    this.turnTargets.push(...points.map((position) => ({
      position,
      ix: intersectionWaypoint.ix,
      iz: intersectionWaypoint.iz,
    })));
    this.target = this.turnTargets.shift()!;
    this.completingTurn = true;
  }

  private moveAlongDirection(position: Vector3, direction: Direction, distance: number): void {
    if (direction === "north") position.z -= distance;
    if (direction === "south") position.z += distance;
    if (direction === "west") position.x -= distance;
    if (direction === "east") position.x += distance;
  }

  private nextWaypoint(): TrafficWaypoint {
    const next = nextIndices(this.waypoint.ix, this.waypoint.iz, this.direction);
    const ix = Math.max(0, Math.min(this.roadPositionsX.length - 1, next.ix));
    const iz = Math.max(0, Math.min(this.roadPositionsZ.length - 1, next.iz));
    return this.laneWaypoint({
      position: new Vector3(this.roadPositionsX[ix], 1, this.roadPositionsZ[iz]),
      ix,
      iz,
    }, this.direction);
  }

  private laneWaypoint(waypoint: TrafficWaypoint, direction: Direction): TrafficWaypoint {
    const position = waypoint.position.clone();
    const offset = this.pursuitTarget
      ? GAME_CONFIG.police.pursuitLaneOffset
      : GAME_CONFIG.traffic.laneOffset;
    if (direction === "north") position.x -= offset;
    if (direction === "south") position.x += offset;
    if (direction === "east") position.z -= offset;
    if (direction === "west") position.z += offset;
    return { position, ix: waypoint.ix, iz: waypoint.iz };
  }

  private retargetCurrentLane(): void {
    this.target = this.laneWaypoint({
      position: new Vector3(
        this.roadPositionsX[this.target.ix],
        1,
        this.roadPositionsZ[this.target.iz],
      ),
      ix: this.target.ix,
      iz: this.target.iz,
    }, this.direction);
  }

  private faceTarget(): void {
    const dx = this.target.position.x - this.mesh.position.x;
    const dz = this.target.position.z - this.mesh.position.z;
    this.mesh.rotation.y = Math.atan2(dx, dz);
  }

  private desiredSpeed(distanceToTarget: number, forwardX: number, forwardZ: number, traffic: TrafficCar[]): number {
    const cruisingSpeed = this.pursuitTarget ? GAME_CONFIG.police.pursuitSpeed : this.cruiseSpeed;
    const turnSpeed = this.pursuitTarget ? GAME_CONFIG.police.pursuitTurnSpeed : GAME_CONFIG.traffic.turnSpeed;
    let targetSpeed = cruisingSpeed;
    const approachingTurn = !this.completingTurn && this.plannedDirection !== this.direction;
    if (this.completingTurn) {
      targetSpeed = Math.min(targetSpeed, turnSpeed);
    } else if (approachingTurn && distanceToTarget < GAME_CONFIG.traffic.turnSlowdownDistance) {
      const turnAmount = 1 - distanceToTarget / GAME_CONFIG.traffic.turnSlowdownDistance;
      targetSpeed = Math.min(
        targetSpeed,
        lerp(cruisingSpeed, turnSpeed, clamp(turnAmount, 0, 1)),
      );
    }

    const leader = this.findLeadVehicle(forwardX, forwardZ, traffic);
    if (!leader) return targetSpeed;
    const minimumGap = this.pursuitTarget
      ? GAME_CONFIG.police.pursuitMinimumFollowingGap
      : GAME_CONFIG.traffic.minimumFollowingGap;
    const timeHeadway = this.pursuitTarget
      ? GAME_CONFIG.police.pursuitFollowingTimeHeadway
      : GAME_CONFIG.traffic.followingTimeHeadway;
    const desiredGap = minimumGap + this.speed * timeHeadway;
    if (this.pursuitTarget && leader.bumperGap > minimumGap) return targetSpeed;
    const followingTarget = Math.max(
      0,
      leader.forwardSpeed
        + (leader.bumperGap - desiredGap) * GAME_CONFIG.traffic.followingSpeedCorrection,
    );
    return Math.min(targetSpeed, followingTarget);
  }

  private findLeadVehicle(forwardX: number, forwardZ: number, traffic: TrafficCar[]): LeadVehicle | null {
    let nearest: LeadVehicle | null = null;
    for (const other of traffic) {
      if (other === this) continue;
      const offsetX = other.mesh.position.x - this.mesh.position.x;
      const offsetZ = other.mesh.position.z - this.mesh.position.z;
      const forwardDistance = forwardX * offsetX + forwardZ * offsetZ;
      if (forwardDistance <= 0 || forwardDistance > GAME_CONFIG.traffic.lookAheadDistance) continue;
      const lateralDistance = Math.abs(-forwardZ * offsetX + forwardX * offsetZ);
      if (lateralDistance > GAME_CONFIG.traffic.sameLaneTolerance) continue;

      const otherVelocityLength = Math.hypot(other.velocityX, other.velocityZ);
      const otherForwardX = otherVelocityLength > 0.1
        ? other.velocityX / otherVelocityLength
        : Math.sin(other.mesh.rotation.y);
      const otherForwardZ = otherVelocityLength > 0.1
        ? other.velocityZ / otherVelocityLength
        : Math.cos(other.mesh.rotation.y);
      if (forwardX * otherForwardX + forwardZ * otherForwardZ < GAME_CONFIG.traffic.sameDirectionAlignment) continue;

      const bumperGap = forwardDistance - GAME_CONFIG.traffic.hitboxLength;
      if (nearest && bumperGap >= nearest.bumperGap) continue;
      nearest = {
        bumperGap,
        forwardSpeed: Math.max(0, other.velocityX * forwardX + other.velocityZ * forwardZ),
      };
    }
    return nearest;
  }
}

function validDirectionsAt(waypoint: TrafficWaypoint, maxX: number, maxZ: number): Direction[] {
  const options: Direction[] = [];
  if (waypoint.iz > 0) options.push("north");
  if (waypoint.iz < maxZ - 1) options.push("south");
  if (waypoint.ix > 0) options.push("west");
  if (waypoint.ix < maxX - 1) options.push("east");
  return options;
}

function oppositeDirection(direction: Direction): Direction {
  if (direction === "north") return "south";
  if (direction === "south") return "north";
  if (direction === "east") return "west";
  return "east";
}

function nextIndices(ix: number, iz: number, direction: Direction): { ix: number; iz: number } {
  if (direction === "north") return { ix, iz: iz - 1 };
  if (direction === "south") return { ix, iz: iz + 1 };
  if (direction === "west") return { ix: ix - 1, iz };
  return { ix: ix + 1, iz };
}

function directionVector(direction: Direction): { x: number; z: number } {
  if (direction === "north") return { x: 0, z: -1 };
  if (direction === "south") return { x: 0, z: 1 };
  if (direction === "west") return { x: -1, z: 0 };
  return { x: 1, z: 0 };
}

export type { Direction };
