import type { BoxCollider } from "../game/types";

export class WorldQuery {
  lastCollisionCandidateCount = 0;
  private readonly cells = new Map<number, Map<number, BoxCollider[]>>();
  private readonly oversizedColliders: BoxCollider[] = [];
  private maxIndexedHalfX = 0;
  private maxIndexedHalfZ = 0;
  private readonly roadSpacingX: number;
  private readonly roadSpacingZ: number;

  constructor(
    colliders: BoxCollider[],
    private readonly roadPositionsX: number[],
    private readonly roadPositionsZ: number[],
    private readonly roadHalfWidth: number,
    private readonly sidewalkOuterHalfWidth: number,
    private readonly cellSize: number,
  ) {
    this.roadSpacingX = roadPositionsX.length > 1 ? roadPositionsX[1] - roadPositionsX[0] : 1;
    this.roadSpacingZ = roadPositionsZ.length > 1 ? roadPositionsZ[1] - roadPositionsZ[0] : 1;
    for (const collider of colliders) this.addCollider(collider);
  }

  getNearbyColliders(x: number, z: number, radius: number, results: BoxCollider[]): void {
    results.length = 0;
    const minCellX = this.cellFor(x - radius - this.maxIndexedHalfX);
    const maxCellX = this.cellFor(x + radius + this.maxIndexedHalfX);
    const minCellZ = this.cellFor(z - radius - this.maxIndexedHalfZ);
    const maxCellZ = this.cellFor(z + radius + this.maxIndexedHalfZ);

    for (let cellX = minCellX; cellX <= maxCellX; cellX++) {
      const column = this.cells.get(cellX);
      if (!column) continue;
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ++) {
        const bucket = column.get(cellZ);
        if (bucket) results.push(...bucket);
      }
    }
    results.push(...this.oversizedColliders);
    this.lastCollisionCandidateCount = results.length;
  }

  isOnSidewalk(x: number, z: number): boolean {
    const nearRoadX = this.nearestRoadDistance(x, this.roadPositionsX, this.roadSpacingX);
    const nearRoadZ = this.nearestRoadDistance(z, this.roadPositionsZ, this.roadSpacingZ);
    const onRoad = nearRoadX <= this.roadHalfWidth || nearRoadZ <= this.roadHalfWidth;
    const onSidewalk = nearRoadX <= this.sidewalkOuterHalfWidth || nearRoadZ <= this.sidewalkOuterHalfWidth;
    return !onRoad && onSidewalk;
  }

  private addCollider(collider: BoxCollider): void {
    if (collider.halfX > this.cellSize || collider.halfZ > this.cellSize) {
      this.oversizedColliders.push(collider);
      return;
    }
    this.maxIndexedHalfX = Math.max(this.maxIndexedHalfX, collider.halfX);
    this.maxIndexedHalfZ = Math.max(this.maxIndexedHalfZ, collider.halfZ);
    const cellX = this.cellFor(collider.x);
    const cellZ = this.cellFor(collider.z);
    let column = this.cells.get(cellX);
    if (!column) {
      column = new Map<number, BoxCollider[]>();
      this.cells.set(cellX, column);
    }
    let bucket = column.get(cellZ);
    if (!bucket) {
      bucket = [];
      column.set(cellZ, bucket);
    }
    bucket.push(collider);
  }

  private nearestRoadDistance(value: number, positions: number[], spacing: number): number {
    if (positions.length === 0) return Number.POSITIVE_INFINITY;
    const index = Math.max(0, Math.min(positions.length - 1, Math.round((value - positions[0]) / spacing)));
    return Math.abs(value - positions[index]);
  }

  private cellFor(value: number): number {
    return Math.floor(value / this.cellSize);
  }
}
