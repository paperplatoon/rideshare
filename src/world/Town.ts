import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { GAME_CONFIG } from "../game/config";
import type { AutoBodyShop, BoxCollider, DeliveryPoint, GasStation, TrafficWaypoint } from "../game/types";
import { seededRandom } from "../utils/math";

export interface Town {
  meshes: Mesh[];
  staticColliders: BoxCollider[];
  roadPositionsX: number[];
  roadPositionsZ: number[];
  roadSpawnPoints: TrafficWaypoint[];
  deliveryPoints: DeliveryPoint[];
  gasStations: GasStation[];
  autoBodyShops: AutoBodyShop[];
  legalDrivingAreas: BoxCollider[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export class TownGenerator {
  private readonly config = GAME_CONFIG.world;
  private readonly rng = seededRandom(1842);
  private readonly materials: Record<string, StandardMaterial> = {};

  constructor(private readonly scene: Scene) {}

  generate(): Town {
    this.createMaterials();

    const { blocksX, blocksZ, blockSize, roadWidth, sidewalkWidth } = this.config;
    const totalX = blocksX * blockSize + (blocksX + 1) * roadWidth;
    const totalZ = blocksZ * blockSize + (blocksZ + 1) * roadWidth;
    const minX = -totalX / 2;
    const minZ = -totalZ / 2;
    const maxX = totalX / 2;
    const maxZ = totalZ / 2;
    const meshes: Mesh[] = [];
    const staticColliders: BoxCollider[] = [];

    const ground = MeshBuilder.CreateGround("ground", { width: totalX + 100, height: totalZ + 100 }, this.scene);
    ground.material = this.materials.ground;
    meshes.push(ground);

    const roadPositionsX = Array.from({ length: blocksX + 1 }, (_, index) => minX + roadWidth / 2 + index * (blockSize + roadWidth));
    const roadPositionsZ = Array.from({ length: blocksZ + 1 }, (_, index) => minZ + roadWidth / 2 + index * (blockSize + roadWidth));

    for (const x of roadPositionsX) {
      const road = MeshBuilder.CreateBox(`road-ns-${x}`, { width: roadWidth, height: 0.08, depth: totalZ }, this.scene);
      road.position.set(x, 0.02, 0);
      road.material = this.materials.road;
      meshes.push(road);
    }

    for (const z of roadPositionsZ) {
      const road = MeshBuilder.CreateBox(`road-ew-${z}`, { width: totalX, height: 0.09, depth: roadWidth }, this.scene);
      road.position.set(0, 0.03, z);
      road.material = this.materials.road;
      meshes.push(road);
    }

    this.createRoadMarkings(roadPositionsX, roadPositionsZ, meshes);

    for (let bx = 0; bx < blocksX; bx++) {
      for (let bz = 0; bz < blocksZ; bz++) {
        const leftRoad = roadPositionsX[bx];
        const topRoad = roadPositionsZ[bz];
        const centerX = leftRoad + roadWidth / 2 + blockSize / 2;
        const centerZ = topRoad + roadWidth / 2 + blockSize / 2;
        const sidewalk = MeshBuilder.CreateBox(`sidewalk-${bx}-${bz}`, {
          width: blockSize + sidewalkWidth * 2,
          height: 0.12,
          depth: blockSize + sidewalkWidth * 2,
        }, this.scene);
        sidewalk.position.set(centerX, 0.04, centerZ);
        sidewalk.material = this.materials.sidewalk;
        meshes.push(sidewalk);

        const buildingConfig = this.config.buildings;
        const lotsPerSide = Math.max(buildingConfig.minLotsPerSide, Math.floor(blockSize / buildingConfig.lotTargetSize));
        const buildableSize = blockSize - sidewalkWidth * 2 - buildingConfig.buildableInset;
        const lotSize = buildableSize / lotsPerSide;
        let buildingIndex = 0;
        for (let lotX = 0; lotX < lotsPerSide; lotX++) {
          for (let lotZ = 0; lotZ < lotsPerSide; lotZ++) {
            if (this.rng() < buildingConfig.emptyLotChance) continue;
            const lotCoverageRange = buildingConfig.maxLotCoverage - buildingConfig.minLotCoverage;
            const width = lotSize * (buildingConfig.minLotCoverage + this.rng() * lotCoverageRange);
            const depth = lotSize * (buildingConfig.minLotCoverage + this.rng() * lotCoverageRange);
            const lotCenterX = centerX - buildableSize / 2 + lotSize * (lotX + 0.5);
            const lotCenterZ = centerZ - buildableSize / 2 + lotSize * (lotZ + 0.5);
            const jitter = lotSize * buildingConfig.lotJitter;
            const x = lotCenterX + (this.rng() * 2 - 1) * jitter;
            const z = lotCenterZ + (this.rng() * 2 - 1) * jitter;
            const height = buildingConfig.minHeight + this.rng() * (buildingConfig.maxHeight - buildingConfig.minHeight);
            const building = MeshBuilder.CreateBox(`building-${bx}-${bz}-${buildingIndex++}`, { width, height, depth }, this.scene);
            building.position.set(x, height / 2, z);
            building.material = this.pickBuildingMaterial();
            meshes.push(building);
            staticColliders.push({ x, z, halfX: width / 2 - 0.6, halfZ: depth / 2 - 0.6 });
          }
        }

        if (buildingIndex === 0) {
          const width = lotSize * buildingConfig.fallbackCoverage;
          const depth = lotSize * buildingConfig.fallbackCoverage;
          const height = buildingConfig.fallbackHeight;
          const x = centerX;
          const z = centerZ;
          const building = MeshBuilder.CreateBox(`building-${bx}-${bz}-${buildingIndex}`, { width, height, depth }, this.scene);
          building.position.set(x, height / 2, z);
          building.material = this.pickBuildingMaterial();
          meshes.push(building);
          staticColliders.push({ x, z, halfX: width / 2 - 0.6, halfZ: depth / 2 - 0.6 });
        }
      }
    }

    staticColliders.push(...this.createBoundaries(minX, maxX, minZ, maxZ, meshes));
    const roadSpawnPoints = this.createRoadWaypoints(roadPositionsX, roadPositionsZ);
    const deliveryPoints = this.createDeliveryPoints(roadPositionsX, roadPositionsZ);
    const gasStations = this.createGasStations(roadPositionsX, roadPositionsZ, meshes, staticColliders);
    const autoBodyShops = this.createAutoBodyShops(roadPositionsX, roadPositionsZ, meshes, staticColliders);
    const legalDrivingAreas = this.createLegalDrivingAreas(gasStations, autoBodyShops);
    const optimizedMeshes = this.optimizeStaticMeshes(meshes, minX, minZ);

    return {
      meshes: optimizedMeshes,
      staticColliders,
      roadPositionsX,
      roadPositionsZ,
      roadSpawnPoints,
      deliveryPoints,
      gasStations,
      autoBodyShops,
      legalDrivingAreas,
      minX,
      maxX,
      minZ,
      maxZ,
    };
  }

  private createMaterials(): void {
    this.materials.ground = this.material("ground-mat", new Color3(0.28, 0.36, 0.3));
    this.materials.road = this.material("road-mat", new Color3(0.13, 0.14, 0.15));
    this.materials.centerLine = this.material("center-line-mat", new Color3(0.96, 0.72, 0.08));
    this.materials.sidewalk = this.material("sidewalk-mat", new Color3(0.48, 0.5, 0.49));
    this.materials.buildingA = this.material("building-a-mat", new Color3(0.48, 0.46, 0.43));
    this.materials.buildingB = this.material("building-b-mat", new Color3(0.38, 0.43, 0.49));
    this.materials.buildingC = this.material("building-c-mat", new Color3(0.52, 0.39, 0.35));
    this.materials.boundary = this.material("boundary-mat", new Color3(0.18, 0.2, 0.22));
    this.materials.gasCanopy = this.material("gas-canopy-mat", new Color3(0.98, 0.86, 0.16));
    this.materials.gasBase = this.material("gas-base-mat", new Color3(0.14, 0.54, 0.74));
    this.materials.gasSign = this.material("gas-sign-mat", new Color3(0.08, 0.95, 0.64));
    this.materials.repairBase = this.material("repair-base-mat", new Color3(0.58, 0.11, 0.14));
    this.materials.repairGarage = this.material("repair-garage-mat", new Color3(0.18, 0.2, 0.22));
    this.materials.repairSign = this.material("repair-sign-mat", new Color3(1, 0.44, 0.16));
  }

  private material(name: string, color: Color3): StandardMaterial {
    const mat = new StandardMaterial(name, this.scene);
    mat.diffuseColor = color;
    mat.specularColor = Color3.Black();
    return mat;
  }

  private pickBuildingMaterial(): StandardMaterial {
    const options = [this.materials.buildingA, this.materials.buildingB, this.materials.buildingC];
    return options[Math.floor(this.rng() * options.length)];
  }

  private createRoadMarkings(roadPositionsX: number[], roadPositionsZ: number[], meshes: Mesh[]): void {
    const marking = this.config.roadMarkings;
    const lineOffset = marking.lineGap / 2 + marking.lineWidth / 2;
    const segmentInset = this.config.roadWidth / 2 + marking.intersectionBuffer;
    const lines: Mesh[] = [];

    for (const x of roadPositionsX) {
      for (let iz = 0; iz < roadPositionsZ.length - 1; iz++) {
        const start = roadPositionsZ[iz] + segmentInset;
        const end = roadPositionsZ[iz + 1] - segmentInset;
        const length = end - start;
        if (length <= 0) continue;
        for (const offset of [-lineOffset, lineOffset]) {
          const line = MeshBuilder.CreateBox(`center-line-ns-${x}-${iz}-${offset}`, {
            width: marking.lineWidth,
            height: marking.height,
            depth: length,
          }, this.scene);
          line.position.set(x + offset, 0.1, (start + end) / 2);
          line.material = this.materials.centerLine;
          lines.push(line);
        }
      }
    }

    for (const z of roadPositionsZ) {
      for (let ix = 0; ix < roadPositionsX.length - 1; ix++) {
        const start = roadPositionsX[ix] + segmentInset;
        const end = roadPositionsX[ix + 1] - segmentInset;
        const length = end - start;
        if (length <= 0) continue;
        for (const offset of [-lineOffset, lineOffset]) {
          const line = MeshBuilder.CreateBox(`center-line-ew-${z}-${ix}-${offset}`, {
            width: length,
            height: marking.height,
            depth: marking.lineWidth,
          }, this.scene);
          line.position.set((start + end) / 2, 0.11, z + offset);
          line.material = this.materials.centerLine;
          lines.push(line);
        }
      }
    }

    const merged = Mesh.MergeMeshes(lines, true, true, undefined, false, false);
    if (merged) {
      merged.name = "center-lines";
      meshes.push(merged);
    }
  }

  private createLegalDrivingAreas(gasStations: GasStation[], shops: AutoBodyShop[]): BoxCollider[] {
    const padding = GAME_CONFIG.drivingRules.serviceAreaPadding;
    return [
      ...gasStations.map((station) => ({
        x: station.position.x,
        z: station.position.z,
        halfX: 14 + padding,
        halfZ: 14 + padding,
      })),
      ...shops.map((shop) => ({
        x: shop.position.x,
        z: shop.position.z,
        halfX: 15 + padding,
        halfZ: 15 + padding,
      })),
    ];
  }

  private createBoundaries(minX: number, maxX: number, minZ: number, maxZ: number, meshes: Mesh[]): BoxCollider[] {
    const thickness = 12;
    const height = 3;
    const width = maxX - minX + this.config.boundaryPadding * 2;
    const depth = maxZ - minZ + this.config.boundaryPadding * 2;
    const colliders: BoxCollider[] = [
      { x: 0, z: minZ - thickness / 2, halfX: width / 2, halfZ: thickness / 2 },
      { x: 0, z: maxZ + thickness / 2, halfX: width / 2, halfZ: thickness / 2 },
      { x: minX - thickness / 2, z: 0, halfX: thickness / 2, halfZ: depth / 2 },
      { x: maxX + thickness / 2, z: 0, halfX: thickness / 2, halfZ: depth / 2 },
    ];

    for (const [index, collider] of colliders.entries()) {
      const wall = MeshBuilder.CreateBox(`boundary-${index}`, {
        width: collider.halfX * 2,
        height,
        depth: collider.halfZ * 2,
      }, this.scene);
      wall.position.set(collider.x, height / 2, collider.z);
      wall.material = this.materials.boundary;
      meshes.push(wall);
    }

    return colliders;
  }

  private createRoadWaypoints(roadPositionsX: number[], roadPositionsZ: number[]): TrafficWaypoint[] {
    const waypoints: TrafficWaypoint[] = [];
    for (let ix = 0; ix < roadPositionsX.length; ix++) {
      for (let iz = 0; iz < roadPositionsZ.length; iz++) {
        waypoints.push({ position: new Vector3(roadPositionsX[ix], 0, roadPositionsZ[iz]), ix, iz });
      }
    }
    return waypoints;
  }

  private createDeliveryPoints(roadPositionsX: number[], roadPositionsZ: number[]): DeliveryPoint[] {
    const points: DeliveryPoint[] = [];
    const offset = this.config.roadWidth * 0.35;
    for (let ix = 0; ix < roadPositionsX.length; ix++) {
      for (let iz = 0; iz < roadPositionsZ.length; iz++) {
        if (ix < roadPositionsX.length - 1) {
          const midX = (roadPositionsX[ix] + roadPositionsX[ix + 1]) / 2;
          points.push({ position: new Vector3(midX, 0.1, roadPositionsZ[iz] + offset), roadId: `ew-${iz}` });
          points.push({ position: new Vector3(midX, 0.1, roadPositionsZ[iz] - offset), roadId: `ew-${iz}` });
        }
        if (iz < roadPositionsZ.length - 1) {
          const midZ = (roadPositionsZ[iz] + roadPositionsZ[iz + 1]) / 2;
          points.push({ position: new Vector3(roadPositionsX[ix] + offset, 0.1, midZ), roadId: `ns-${ix}` });
          points.push({ position: new Vector3(roadPositionsX[ix] - offset, 0.1, midZ), roadId: `ns-${ix}` });
        }
      }
    }
    return points;
  }

  private createGasStations(
    roadPositionsX: number[],
    roadPositionsZ: number[],
    meshes: Mesh[],
    colliders: BoxCollider[],
  ): GasStation[] {
    const stations: GasStation[] = [];
    const candidates: Vector3[] = [];
    const offset = this.config.roadWidth / 2 + this.config.sidewalkWidth + 12;

    for (let ix = 1; ix < roadPositionsX.length - 1; ix += 3) {
      for (let iz = 1; iz < roadPositionsZ.length - 1; iz += 3) {
        candidates.push(new Vector3(roadPositionsX[ix] + offset, 0.1, roadPositionsZ[iz] + offset));
      }
    }

    for (let i = 0; i < Math.min(GAME_CONFIG.fuel.stationCount, candidates.length); i++) {
      const position = candidates[i];
      stations.push({ position, radius: GAME_CONFIG.fuel.refuelRadius });
      meshes.push(...this.createGasStationMeshes(position, i, colliders));
    }

    return stations;
  }

  private createGasStationMeshes(position: Vector3, index: number, colliders: BoxCollider[]): Mesh[] {
    const meshes: Mesh[] = [];
    const pad = MeshBuilder.CreateBox(`gas-pad-${index}`, { width: 28, height: 0.16, depth: 28 }, this.scene);
    pad.position.set(position.x, 0.08, position.z);
    pad.material = this.materials.gasBase;
    meshes.push(pad);

    const canopy = MeshBuilder.CreateBox(`gas-canopy-${index}`, { width: 34, height: 3, depth: 24 }, this.scene);
    canopy.position.set(position.x, 9, position.z);
    canopy.material = this.materials.gasCanopy;
    meshes.push(canopy);

    for (const xOffset of [-12, 12]) {
      for (const zOffset of [-8, 8]) {
        const post = MeshBuilder.CreateBox(`gas-post-${index}-${xOffset}-${zOffset}`, { width: 1.2, height: 9, depth: 1.2 }, this.scene);
        post.position.set(position.x + xOffset, 4.5, position.z + zOffset);
        post.material = this.materials.gasBase;
        meshes.push(post);
        colliders.push({ x: position.x + xOffset, z: position.z + zOffset, halfX: 0.6, halfZ: 0.6 });
      }
    }

    const signPost = MeshBuilder.CreateBox(`gas-sign-post-${index}`, { width: 1.5, height: 28, depth: 1.5 }, this.scene);
    signPost.position.set(position.x + 22, 14, position.z);
    signPost.material = this.materials.gasBase;
    meshes.push(signPost);
    colliders.push({ x: position.x + 22, z: position.z, halfX: 0.75, halfZ: 0.75 });

    const sign = MeshBuilder.CreateBox(`gas-sign-${index}`, { width: 14, height: 9, depth: 1.3 }, this.scene);
    sign.position.set(position.x + 22, 28, position.z);
    sign.material = this.materials.gasSign;
    meshes.push(sign);

    const beam = MeshBuilder.CreateCylinder(`gas-beam-${index}`, { diameter: 5, height: 46, tessellation: 16 }, this.scene);
    beam.position.set(position.x, 23, position.z);
    beam.material = this.materials.gasSign;
    meshes.push(beam);

    return meshes;
  }

  private createAutoBodyShops(
    roadPositionsX: number[],
    roadPositionsZ: number[],
    meshes: Mesh[],
    colliders: BoxCollider[],
  ): AutoBodyShop[] {
    const shops: AutoBodyShop[] = [];
    const candidates: Vector3[] = [];
    const offset = this.config.roadWidth / 2 + this.config.sidewalkWidth + 12;

    for (let ix = 2; ix < roadPositionsX.length - 1; ix += 4) {
      for (let iz = 2; iz < roadPositionsZ.length - 1; iz += 4) {
        candidates.push(new Vector3(roadPositionsX[ix] - offset, 0.1, roadPositionsZ[iz] - offset));
      }
    }

    for (let i = 0; i < Math.min(GAME_CONFIG.repair.shopCount, candidates.length); i++) {
      const position = candidates[i];
      shops.push({ position, radius: GAME_CONFIG.repair.repairRadius });
      meshes.push(...this.createAutoBodyShopMeshes(position, i, colliders));
    }

    return shops;
  }

  private createAutoBodyShopMeshes(position: Vector3, index: number, colliders: BoxCollider[]): Mesh[] {
    const meshes: Mesh[] = [];
    const pad = MeshBuilder.CreateBox(`repair-pad-${index}`, { width: 30, height: 0.16, depth: 30 }, this.scene);
    pad.position.set(position.x, 0.08, position.z);
    pad.material = this.materials.repairBase;
    meshes.push(pad);

    const garage = MeshBuilder.CreateBox(`repair-garage-${index}`, { width: 28, height: 10, depth: 16 }, this.scene);
    garage.position.set(position.x, 5, position.z + 11);
    garage.material = this.materials.repairGarage;
    meshes.push(garage);
    colliders.push({ x: position.x, z: position.z + 11, halfX: 13.4, halfZ: 7.4 });

    const door = MeshBuilder.CreateBox(`repair-door-${index}`, { width: 15, height: 6, depth: 0.35 }, this.scene);
    door.position.set(position.x, 3, position.z + 2.8);
    door.material = this.materials.repairSign;
    meshes.push(door);

    const signPost = MeshBuilder.CreateBox(`repair-sign-post-${index}`, { width: 1.5, height: 26, depth: 1.5 }, this.scene);
    signPost.position.set(position.x - 22, 13, position.z);
    signPost.material = this.materials.repairGarage;
    meshes.push(signPost);
    colliders.push({ x: position.x - 22, z: position.z, halfX: 0.75, halfZ: 0.75 });

    const sign = MeshBuilder.CreateBox(`repair-sign-${index}`, { width: 15, height: 8, depth: 1.4 }, this.scene);
    sign.position.set(position.x - 22, 27, position.z);
    sign.material = this.materials.repairSign;
    meshes.push(sign);

    const beam = MeshBuilder.CreateCylinder(`repair-beam-${index}`, { diameter: 5, height: 42, tessellation: 16 }, this.scene);
    beam.position.set(position.x, 21, position.z);
    beam.material = this.materials.repairSign;
    meshes.push(beam);

    return meshes;
  }

  private optimizeStaticMeshes(meshes: Mesh[], minX: number, minZ: number): Mesh[] {
    const chunkSize = (this.config.blockSize + this.config.roadWidth) * 2;
    const groups = new Map<string, Mesh[]>();
    for (const mesh of meshes) {
      const chunkX = Math.floor((mesh.position.x - minX) / chunkSize);
      const chunkZ = Math.floor((mesh.position.z - minZ) / chunkSize);
      const materialId = mesh.material?.uniqueId ?? -1;
      const key = `${chunkX},${chunkZ},${materialId}`;
      const group = groups.get(key);
      if (group) group.push(mesh);
      else groups.set(key, [mesh]);
    }

    const optimized: Mesh[] = [];
    for (const [key, group] of groups) {
      if (group.length === 1) {
        optimized.push(group[0]);
        continue;
      }
      const merged = Mesh.MergeMeshes(group, true, true, undefined, false, false);
      if (merged) {
        merged.name = `world-chunk-${key}`;
        optimized.push(merged);
      } else {
        optimized.push(...group);
      }
    }

    for (const material of Object.values(this.materials)) material.freeze();
    for (const mesh of optimized) {
      mesh.isPickable = false;
      mesh.freezeWorldMatrix();
    }
    return optimized;
  }
}
