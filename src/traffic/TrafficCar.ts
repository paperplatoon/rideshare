import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { GAME_CONFIG } from "../game/config";
import type { TrafficVehicleRole, TrafficWaypoint } from "../game/types";
import { normalizeAngle } from "../utils/math";

type Direction = "north" | "south" | "east" | "west";

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
    this.target = waypoint;
    this.mesh = prototype.clone("traffic-car", null, false)!;
    this.mesh.setEnabled(false);
    this.respawn(waypoint, direction, spawnProgress);
  }

  update(deltaTime: number, nearbyTraffic: TrafficCar[]): void {
    const dx = this.target.position.x - this.mesh.position.x;
    const dz = this.target.position.z - this.mesh.position.z;
    const distance = Math.hypot(dx, dz);

    if (distance < 2) {
      this.waypoint = this.target;
      if (this.completingTurn) {
        this.completingTurn = false;
        this.target = this.nextWaypoint();
        this.faceTarget();
        return;
      }

      const previousDirection = this.direction;
      this.chooseDirection();
      if (this.direction === previousDirection) {
        this.target = this.nextWaypoint();
      } else {
        this.target = this.laneWaypoint({
          position: new Vector3(
            this.roadPositionsX[this.waypoint.ix],
            1,
            this.roadPositionsZ[this.waypoint.iz],
          ),
          ix: this.waypoint.ix,
          iz: this.waypoint.iz,
        }, this.direction);
        this.completingTurn = true;
      }
      this.faceTarget();
      return;
    }

    const slowFactor = this.hasCarAhead(nearbyTraffic) ? 0.35 : 1;
    const step = Math.min(distance, this.speed * slowFactor * deltaTime);
    const dirX = dx / distance;
    const dirZ = dz / distance;
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

  respawn(waypoint: TrafficWaypoint, direction: Direction, progress: number): void {
    this.respawnGeneration += 1;
    this.waypoint = this.laneWaypoint(waypoint, direction);
    this.direction = direction;
    this.target = this.nextWaypoint();
    this.completingTurn = false;
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

  private chooseDirection(): void {
    const options = this.validDirections();
    const currentIndex = options.indexOf(this.direction);
    const straightBias = currentIndex >= 0 && this.rng() < 0.55 ? this.direction : null;
    this.direction = straightBias ?? options[Math.floor(this.rng() * options.length)];
  }

  private validDirections(): Direction[] {
    const options: Direction[] = [];
    if (this.waypoint.iz > 0) options.push("north");
    if (this.waypoint.iz < this.roadPositionsZ.length - 1) options.push("south");
    if (this.waypoint.ix > 0) options.push("west");
    if (this.waypoint.ix < this.roadPositionsX.length - 1) options.push("east");
    return options;
  }

  private nextWaypoint(): TrafficWaypoint {
    let ix = this.waypoint.ix;
    let iz = this.waypoint.iz;
    if (this.direction === "north") iz -= 1;
    if (this.direction === "south") iz += 1;
    if (this.direction === "west") ix -= 1;
    if (this.direction === "east") ix += 1;

    ix = Math.max(0, Math.min(this.roadPositionsX.length - 1, ix));
    iz = Math.max(0, Math.min(this.roadPositionsZ.length - 1, iz));
    return this.laneWaypoint({
      position: new Vector3(this.roadPositionsX[ix], 1, this.roadPositionsZ[iz]),
      ix,
      iz,
    }, this.direction);
  }

  private laneWaypoint(waypoint: TrafficWaypoint, direction: Direction): TrafficWaypoint {
    const position = waypoint.position.clone();
    const offset = GAME_CONFIG.traffic.laneOffset;
    if (direction === "north") position.x -= offset;
    if (direction === "south") position.x += offset;
    if (direction === "east") position.z -= offset;
    if (direction === "west") position.z += offset;
    return { position, ix: waypoint.ix, iz: waypoint.iz };
  }

  private faceTarget(): void {
    const dx = this.target.position.x - this.mesh.position.x;
    const dz = this.target.position.z - this.mesh.position.z;
    this.mesh.rotation.y = Math.atan2(dx, dz);
  }

  private hasCarAhead(traffic: TrafficCar[]): boolean {
    const forwardX = this.target.position.x - this.mesh.position.x;
    const forwardZ = this.target.position.z - this.mesh.position.z;
    const forwardLength = Math.hypot(forwardX, forwardZ);
    if (forwardLength < 0.1) {
      return false;
    }
    const normalizedForwardX = forwardX / forwardLength;
    const normalizedForwardZ = forwardZ / forwardLength;
    for (const other of traffic) {
      if (other === this) continue;
      const offsetX = other.mesh.position.x - this.mesh.position.x;
      const offsetZ = other.mesh.position.z - this.mesh.position.z;
      const distance = Math.hypot(offsetX, offsetZ);
      if (distance > GAME_CONFIG.traffic.lookAheadDistance || distance < 0.1) continue;
      const alignment = normalizedForwardX * (offsetX / distance) + normalizedForwardZ * (offsetZ / distance);
      if (alignment > 0.78) {
        return true;
      }
    }
    return false;
  }
}

export type { Direction };
