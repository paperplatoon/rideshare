import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { GAME_CONFIG } from "../game/config";
import type { TrafficWaypoint } from "../game/types";
import { normalizeAngle } from "../utils/math";

type Direction = "north" | "south" | "east" | "west";

export class TrafficCar {
  readonly mesh: Mesh;
  direction: Direction;
  speed: number;
  waypoint: TrafficWaypoint;
  target: TrafficWaypoint;
  private velocityX = 0;
  private velocityZ = 0;

  constructor(
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
      this.chooseDirection();
      this.target = this.nextWaypoint();
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
    this.waypoint = waypoint;
    this.direction = direction;
    this.target = this.nextWaypoint();
    Vector3.LerpToRef(waypoint.position, this.target.position, progress, this.mesh.position);
    this.mesh.position.y = 0.75;
    this.velocityX = 0;
    this.velocityZ = 0;
    this.faceTarget();
  }

  dispose(): void {
    this.mesh.dispose();
  }

  static createPrototype(scene: import("@babylonjs/core/scene").Scene, material: StandardMaterial, index: number): Mesh {
    const body = MeshBuilder.CreateBox(`traffic-body-source-${index}`, { width: 2.8, height: 1, depth: 5 }, scene);
    body.material = material;
    const cabin = MeshBuilder.CreateBox(`traffic-cabin-source-${index}`, { width: 2, height: 0.75, depth: 1.9 }, scene);
    cabin.position.set(0, 0.75, -0.2);
    cabin.material = material;
    const prototype = Mesh.MergeMeshes([body, cabin], true, true, undefined, false, false)!;
    prototype.name = `traffic-source-${index}`;
    prototype.position.y = -10000;
    prototype.isPickable = false;
    return prototype;
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
    return {
      position: new Vector3(this.roadPositionsX[ix], 0.75, this.roadPositionsZ[iz]),
      ix,
      iz,
    };
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
