import { hasEnhancedGraphics } from "../graphics/GraphicsMode";
import { createBuildingVisuals, createFacadePixels } from "./BuildingVisuals";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { GAME_CONFIG } from "../game/config";
import type {
  AutoBodyShop,
  BoxCollider,
  DeliveryPoint,
  GasStation,
  RoadAxis,
  RoadDefinition,
  RoadTypeId,
  TrafficWaypoint,
} from "../game/types";
import { seededRandom } from "../utils/math";

export interface Town {
  meshes: Mesh[];
  staticColliders: BoxCollider[];
  roadPositionsX: number[];
  roadPositionsZ: number[];
  roads: RoadDefinition[];
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

interface ServiceLocation {
  position: Vector3;
  inwardX: -1 | 1;
  inwardZ: -1 | 1;
  roadAxis?: RoadAxis;
  roadSide?: -1 | 1;
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
    const roads = this.createRoadDefinitions(roadPositionsX, roadPositionsZ);

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
            const name = `building-${bx}-${bz}-${buildingIndex++}`;
            meshes.push(...this.createBuildingMeshes(
              name,
              x,
              z,
              width,
              depth,
              height,
              this.pickBuildingMaterial(),
            ));
            staticColliders.push({ x, z, halfX: width / 2 - 0.6, halfZ: depth / 2 - 0.6 });
          }
        }

        if (buildingIndex === 0) {
          const width = lotSize * buildingConfig.fallbackCoverage;
          const depth = lotSize * buildingConfig.fallbackCoverage;
          const height = buildingConfig.fallbackHeight;
          const x = centerX;
          const z = centerZ;
          meshes.push(...this.createBuildingMeshes(
            `building-${bx}-${bz}-${buildingIndex}`,
            x,
            z,
            width,
            depth,
            height,
            this.pickBuildingMaterial(),
          ));
          staticColliders.push({ x, z, halfX: width / 2 - 0.6, halfZ: depth / 2 - 0.6 });
        }
      }
    }

    staticColliders.push(...this.createBoundaries(minX, maxX, minZ, maxZ, meshes));
    const roadSpawnPoints = this.createRoadWaypoints(roadPositionsX, roadPositionsZ);
    const deliveryPoints = this.createDeliveryPoints(roadPositionsX, roadPositionsZ, roads);
    const gasLocations = this.createGasStationLocations(roadPositionsX, roadPositionsZ, staticColliders);
    const gasStations = this.createGasStations(
      gasLocations,
      meshes,
      staticColliders,
    );
    const serviceLocations = this.createServiceLocations(
      roadPositionsX,
      roadPositionsZ,
      staticColliders,
      GAME_CONFIG.repair.shopCount,
    );
    const autoBodyShops = this.createAutoBodyShops(
      serviceLocations,
      meshes,
      staticColliders,
    );
    const legalDrivingAreas = this.createLegalDrivingAreas(gasStations, autoBodyShops);
    const optimizedMeshes = this.optimizeStaticMeshes(meshes, minX, minZ);

    return {
      meshes: optimizedMeshes,
      staticColliders,
      roadPositionsX,
      roadPositionsZ,
      roads,
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
    this.materials.ground = this.texturedMaterial("ground-mat", new Color3(0.28, 0.36, 0.3), "ground", 17, 72);
    this.materials.road = this.texturedMaterial("road-mat", new Color3(0.13, 0.14, 0.15), "road", 29, 44);
    this.materials.centerLine = this.material("center-line-mat", new Color3(0.96, 0.72, 0.08));
    this.materials.sidewalk = this.texturedMaterial("sidewalk-mat", new Color3(0.48, 0.5, 0.49), "sidewalk", 43, 18);
    this.materials.buildingA = this.texturedMaterial("building-a-mat", new Color3(0.48, 0.46, 0.43), "facade", 59, 2);
    this.materials.buildingB = this.texturedMaterial("building-b-mat", new Color3(0.38, 0.43, 0.49), "facade", 71, 2);
    this.materials.buildingC = this.texturedMaterial("building-c-mat", new Color3(0.52, 0.39, 0.35), "facade", 83, 2);
    this.materials.roof = this.material("building-roof-mat", new Color3(0.2, 0.22, 0.23));
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

  private texturedMaterial(
    name: string,
    color: Color3,
    pattern: "ground" | "road" | "sidewalk" | "facade",
    seed: number,
    textureScale: number,
  ): StandardMaterial {
    const material = this.material(name, Color3.White());
    const texture = this.createSurfaceTexture(`${name}-texture`, color, pattern, seed);
    const scale = pattern === "facade" && hasEnhancedGraphics(this.scene) ? 1 : textureScale;
    texture.uScale = scale;
    texture.vScale = scale;
    material.diffuseTexture = texture;
    return material;
  }

  private createSurfaceTexture(
    name: string,
    base: Color3,
    pattern: "ground" | "road" | "sidewalk" | "facade",
    seed: number,
  ): RawTexture {
    const enhancedFacade = pattern === "facade" && hasEnhancedGraphics(this.scene);
    const size = enhancedFacade ? GAME_CONFIG.graphics.facadeTextureSize : GAME_CONFIG.graphics.surfaceTextureSize;
    const data = enhancedFacade ? createFacadePixels(size,[base.r,base.g,base.b],seed) : new Uint8Array(size * size * 4);
    const random = seededRandom(seed);
    for (let y = 0; !enhancedFacade && y < size; y++) {
      for (let x = 0; x < size; x++) {
        const pixel = (y * size + x) * 4;
        let variation = (random() * 2 - 1) * (pattern === "road" ? 11 : 8);
        let red = base.r * 255 + variation;
        let green = base.g * 255 + variation;
        let blue = base.b * 255 + variation;

        if (pattern === "ground" && random() > 0.93) {
          green += 13;
          red -= 7;
        } else if (pattern === "road" && random() > 0.965) {
          red += 18;
          green += 18;
          blue += 18;
        } else if (pattern === "sidewalk" && (x % 16 === 0 || y % 16 === 0)) {
          red -= 18;
          green -= 18;
          blue -= 18;
        } else if (pattern === "facade") {
          const windowX = x % 16 >= 3 && x % 16 <= 11;
          const windowY = y % 16 >= 4 && y % 16 <= 11;
          if (windowX && windowY) {
            const lit = ((Math.floor(x / 16) + Math.floor(y / 16) + seed) % 5) === 0;
            red = lit ? 194 : 31;
            green = lit ? 170 : 47;
            blue = lit ? 105 : 58;
            variation = 0;
          }
        }

        data[pixel] = Math.max(0, Math.min(255, Math.round(red + variation * 0.15)));
        data[pixel + 1] = Math.max(0, Math.min(255, Math.round(green + variation * 0.15)));
        data[pixel + 2] = Math.max(0, Math.min(255, Math.round(blue + variation * 0.15)));
        data[pixel + 3] = 255;
      }
    }
    const texture = RawTexture.CreateRGBATexture(
      data,
      size,
      size,
      this.scene,
      true,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
    );
    texture.name = name;
    texture.wrapU = Texture.WRAP_ADDRESSMODE;
    texture.wrapV = Texture.WRAP_ADDRESSMODE;
    texture.anisotropicFilteringLevel = 2;
    return texture;
  }

  private pickBuildingMaterial(): StandardMaterial {
    const options = [this.materials.buildingA, this.materials.buildingB, this.materials.buildingC];
    return options[Math.floor(this.rng() * options.length)];
  }

  private createBuildingMeshes(
    name: string,
    x: number,
    z: number,
    width: number,
    depth: number,
    height: number,
    facadeMaterial: StandardMaterial,
  ): Mesh[] {
    // Preserve the original random draws so visual changes cannot move later lots or services.
    const detail = this.rng() < GAME_CONFIG.graphics.buildingRoofDetailChance ? {
      height: 0.8 + this.rng() * 1.6,
      offsetX: (this.rng() * 2 - 1) * width * 0.18,
      offsetZ: (this.rng() * 2 - 1) * depth * 0.18,
    } : null;
    if (hasEnhancedGraphics(this.scene)) {
      return createBuildingVisuals(this.scene,name,x,z,width,depth,height,facadeMaterial,this.materials.roof,detail);
    }
    const building = MeshBuilder.CreateBox(name, { width, height, depth }, this.scene);
    building.position.set(x, height / 2, z);
    building.material = facadeMaterial;

    const roofTrim = MeshBuilder.CreateBox(`${name}-roof-trim`, {
      width: width + 0.7,
      height: 0.35,
      depth: depth + 0.7,
    }, this.scene);
    roofTrim.position.set(x, height + 0.175, z);
    roofTrim.material = this.materials.roof;
    const meshes = [building, roofTrim];

    if (detail) {
      const unitWidth = Math.min(6, width * 0.25);
      const unitDepth = Math.min(5, depth * 0.22);
      const unitHeight = detail.height;
      const rooftopUnit = MeshBuilder.CreateBox(`${name}-roof-unit`, {
        width: unitWidth,
        height: unitHeight,
        depth: unitDepth,
      }, this.scene);
      rooftopUnit.position.set(
        x + detail.offsetX,
        height + 0.35 + unitHeight / 2,
        z + detail.offsetZ,
      );
      rooftopUnit.material = this.materials.roof;
      meshes.push(rooftopUnit);
    }
    return meshes;
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
        halfX: (station.roadAxis ?? "northSouth") === "northSouth"
          ? GAME_CONFIG.world.roadWidth / 2 + GAME_CONFIG.world.sidewalkWidth + 17 + padding
          : GAME_CONFIG.world.servicePlacement.gasStationLegalHalfWidth + padding,
        halfZ: (station.roadAxis ?? "northSouth") === "northSouth"
          ? GAME_CONFIG.world.servicePlacement.gasStationLegalHalfWidth + padding
          : GAME_CONFIG.world.roadWidth / 2 + GAME_CONFIG.world.sidewalkWidth + 17 + padding,
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

  private createRoadDefinitions(roadPositionsX: number[], roadPositionsZ: number[]): RoadDefinition[] {
    return [
      ...this.createRoadDefinitionsForAxis("northSouth", "ns", roadPositionsX),
      ...this.createRoadDefinitionsForAxis("eastWest", "ew", roadPositionsZ),
    ];
  }

  private createRoadDefinitionsForAxis(
    axis: RoadAxis,
    idPrefix: string,
    positions: number[],
  ): RoadDefinition[] {
    return positions.map((center, index) => {
      const isPerimeter = index === 0 || index === positions.length - 1;
      const type = (isPerimeter
        ? this.config.perimeterRoadType
        : this.config.interiorRoadType) as RoadTypeId;
      const rules = this.config.roadTypes[type];
      return {
        id: `${idPrefix}-${index}`,
        axis,
        index,
        center,
        type,
        speedLimitMph: rules.speedLimitMph,
        allowsMissionStops: rules.allowsMissionStops,
      };
    });
  }

  private createDeliveryPoints(
    roadPositionsX: number[],
    roadPositionsZ: number[],
    roads: RoadDefinition[],
  ): DeliveryPoint[] {
    const points: DeliveryPoint[] = [];
    const offset = this.config.roadWidth * 0.35;
    const roadsById = new Map(roads.map((road) => [road.id, road]));
    for (let ix = 0; ix < roadPositionsX.length; ix++) {
      for (let iz = 0; iz < roadPositionsZ.length; iz++) {
        const eastWestRoadId = `ew-${iz}`;
        if (ix < roadPositionsX.length - 1 && roadsById.get(eastWestRoadId)?.allowsMissionStops) {
          const midX = (roadPositionsX[ix] + roadPositionsX[ix + 1]) / 2;
          points.push({ position: new Vector3(midX, 0.1, roadPositionsZ[iz] + offset), roadId: eastWestRoadId });
          points.push({ position: new Vector3(midX, 0.1, roadPositionsZ[iz] - offset), roadId: eastWestRoadId });
        }
        const northSouthRoadId = `ns-${ix}`;
        if (iz < roadPositionsZ.length - 1 && roadsById.get(northSouthRoadId)?.allowsMissionStops) {
          const midZ = (roadPositionsZ[iz] + roadPositionsZ[iz + 1]) / 2;
          points.push({ position: new Vector3(roadPositionsX[ix] + offset, 0.1, midZ), roadId: northSouthRoadId });
          points.push({ position: new Vector3(roadPositionsX[ix] - offset, 0.1, midZ), roadId: northSouthRoadId });
        }
      }
    }
    return points;
  }

  private createServiceLocations(
    roadPositionsX: number[],
    roadPositionsZ: number[],
    colliders: BoxCollider[],
    count: number,
  ): ServiceLocation[] {
    const candidates: ServiceLocation[] = [];
    const offset = this.config.roadWidth / 2 + this.config.sidewalkWidth + 12;

    for (let ix = 0; ix < roadPositionsX.length; ix++) {
      for (let iz = 0; iz < roadPositionsZ.length; iz++) {
        for (const inwardX of [-1, 1] as const) {
          const blockX = ix + (inwardX < 0 ? -1 : 0);
          if (blockX < 0 || blockX >= roadPositionsX.length - 1) continue;
          for (const inwardZ of [-1, 1] as const) {
            const blockZ = iz + (inwardZ < 0 ? -1 : 0);
            if (blockZ < 0 || blockZ >= roadPositionsZ.length - 1) continue;
            candidates.push({
              position: new Vector3(
                roadPositionsX[ix] + inwardX * offset,
                0.1,
                roadPositionsZ[iz] + inwardZ * offset,
              ),
              inwardX,
              inwardZ,
            });
          }
        }
      }
    }

    const random = seededRandom(this.config.servicePlacement.seed);
    for (let index = candidates.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(random() * (index + 1));
      [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
    }

    // This conservative footprint covers either service type, including its roadside sign.
    const footprintHalfX = 31;
    const footprintHalfZ = 21;
    const clearance = this.config.servicePlacement.buildingClearance;
    const buildableCandidates = candidates.filter(({ position }) => !colliders.some((collider) => (
      Math.abs(position.x - collider.x) < footprintHalfX + collider.halfX + clearance
      && Math.abs(position.z - collider.z) < footprintHalfZ + collider.halfZ + clearance
    )));
    const selected: ServiceLocation[] = [];
    let minimumSpacing: number = this.config.servicePlacement.minimumSpacing;
    while (selected.length < count && minimumSpacing >= 0) {
      selected.length = 0;
      for (const candidate of buildableCandidates) {
        if (selected.every(({ position }) => (
          Math.hypot(candidate.position.x - position.x, candidate.position.z - position.z) >= minimumSpacing
        ))) {
          selected.push(candidate);
          if (selected.length === count) break;
        }
      }
      if (selected.length < count) minimumSpacing = minimumSpacing === 0 ? -1 : Math.max(0, minimumSpacing - 25);
    }
    return selected;
  }

  private createGasStationLocations(
    roadPositionsX: number[],
    roadPositionsZ: number[],
    colliders: BoxCollider[],
  ): ServiceLocation[] {
    const candidates: ServiceLocation[] = [];
    const roadOffset = this.config.roadWidth / 2 + this.config.sidewalkWidth + 14;
    for (let roadIndex = 0; roadIndex < roadPositionsX.length; roadIndex++) {
      for (let blockZ = 0; blockZ < roadPositionsZ.length - 1; blockZ++) {
        candidates.push(...([-1, 1] as const).map((roadSide) => ({
          position: new Vector3(
            roadPositionsX[roadIndex] + roadSide * roadOffset,
            0.1,
            (roadPositionsZ[blockZ] + roadPositionsZ[blockZ + 1]) / 2,
          ),
          inwardX: roadSide,
          inwardZ: 1 as const,
          roadAxis: "northSouth" as const,
          roadSide,
        })));
      }
    }
    for (let roadIndex = 0; roadIndex < roadPositionsZ.length; roadIndex++) {
      for (let blockX = 0; blockX < roadPositionsX.length - 1; blockX++) {
        candidates.push(...([-1, 1] as const).map((roadSide) => ({
          position: new Vector3(
            (roadPositionsX[blockX] + roadPositionsX[blockX + 1]) / 2,
            0.1,
            roadPositionsZ[roadIndex] + roadSide * roadOffset,
          ),
          inwardX: 1 as const,
          inwardZ: roadSide,
          roadAxis: "eastWest" as const,
          roadSide,
        })));
      }
    }

    const random = seededRandom(this.config.servicePlacement.seed + 17);
    for (let index = candidates.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(random() * (index + 1));
      [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
    }
    const clearance = this.config.servicePlacement.buildingClearance;
    const buildable = candidates.filter((candidate) => !colliders.some((collider) => (
      // Boundary walls span the entire map and should not disqualify a
      // roadside station near the outermost block.
      collider.halfX < 100 && collider.halfZ < 100
      &&
      Math.abs(candidate.position.x - collider.x) < 22 + collider.halfX + clearance
      && Math.abs(candidate.position.z - collider.z) < 18 + collider.halfZ + clearance
    )));
    const selected: ServiceLocation[] = [];
    let minimumSpacing: number = this.config.servicePlacement.minimumSpacing;
    while (selected.length < GAME_CONFIG.fuel.stationCount && minimumSpacing >= 0) {
      selected.length = 0;
      for (const candidate of buildable) {
        if (selected.every((other) => Math.hypot(candidate.position.x - other.position.x, candidate.position.z - other.position.z) >= minimumSpacing)) {
          selected.push(candidate);
          if (selected.length === GAME_CONFIG.fuel.stationCount) break;
        }
      }
      if (selected.length < GAME_CONFIG.fuel.stationCount) minimumSpacing = minimumSpacing === 0 ? -1 : Math.max(0, minimumSpacing - 25);
    }
    return selected;
  }

  private createGasStations(
    locations: ServiceLocation[],
    meshes: Mesh[],
    colliders: BoxCollider[],
  ): GasStation[] {
    return locations.map(({ position, inwardX, roadAxis, roadSide }, index) => {
      const axis = roadAxis ?? "northSouth";
      const side = roadSide ?? inwardX;
      meshes.push(...this.createGasStationMeshes(position, index, colliders, inwardX, axis, side));
      return { position, radius: GAME_CONFIG.fuel.refuelRadius, roadAxis: axis, roadSide: side };
    });
  }

  private createGasStationMeshes(
    position: Vector3,
    index: number,
    colliders: BoxCollider[],
    inwardX: -1 | 1,
    roadAxis: RoadAxis,
    roadSide: -1 | 1,
  ): Mesh[] {
    const meshes: Mesh[] = [];
    const drivewayWidth = GAME_CONFIG.world.servicePlacement.gasStationDrivewayWidth;
    const apronRadius = GAME_CONFIG.world.servicePlacement.gasStationApronRadius;
    const approachDepth = this.config.roadWidth / 2 + this.config.sidewalkWidth + 14;
    const stationDepth = 24;
    const crossRoad = roadAxis === "northSouth" ? "x" : "z";
    const roadCenter = roadAxis === "northSouth" ? position.x - roadSide * approachDepth : position.z - roadSide * approachDepth;
    const stationNearEdge = roadAxis === "northSouth" ? position.x - roadSide * 17 : position.z - roadSide * 17;
    const drivewayLength = Math.abs(stationNearEdge - roadCenter);

    for (const direction of [-1, 1] as const) {
      const driveway = MeshBuilder.CreateBox(`gas-driveway-${index}-${direction}`, {
        width: drivewayLength,
        height: 0.08,
        depth: drivewayWidth,
      }, this.scene);
      if (crossRoad === "x") {
        driveway.position.set(position.x + roadSide * drivewayLength / 2, 0.055, position.z + direction * (stationDepth / 2 + drivewayWidth / 2));
      } else {
        driveway.position.set(position.x + direction * (stationDepth / 2 + drivewayWidth / 2), 0.055, position.z + roadSide * drivewayLength / 2);
      }
      // The apron is part of the drivable road surface. Keeping the same
      // material as the roadway makes the entrance read as a cut-in rather
      // than a blue service pad, and the legal area below matches it.
      driveway.material = this.materials.road;
      meshes.push(driveway);

      const apron = this.createQuarterCircleApron(
        `gas-apron-${index}-${direction}`,
        crossRoad === "x" ? position.x + roadSide * drivewayLength : position.x + direction * (stationDepth / 2 + drivewayWidth),
        crossRoad === "x" ? position.z + direction * (stationDepth / 2 + drivewayWidth) : position.z + roadSide * drivewayLength,
        apronRadius,
        crossRoad === "x" ? (roadSide < 0 ? 0 : Math.PI) : (roadSide < 0 ? Math.PI / 2 : -Math.PI / 2),
      );
      apron.material = this.materials.road;
      meshes.push(apron);
    }

    const pad = MeshBuilder.CreateBox(`gas-pad-${index}`, { width: roadAxis === "northSouth" ? 28 : 24, height: 0.16, depth: roadAxis === "northSouth" ? 24 : 28 }, this.scene);
    pad.position.set(position.x, 0.08, position.z);
    pad.material = this.materials.gasBase;
    meshes.push(pad);

    const canopy = MeshBuilder.CreateBox(`gas-canopy-${index}`, { width: roadAxis === "northSouth" ? 34 : 24, height: 3, depth: roadAxis === "northSouth" ? 24 : 34 }, this.scene);
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
    signPost.position.set(position.x + inwardX * 22, 14, position.z);
    signPost.material = this.materials.gasBase;
    meshes.push(signPost);
    colliders.push({ x: position.x + inwardX * 22, z: position.z, halfX: 0.75, halfZ: 0.75 });

    const sign = MeshBuilder.CreateBox(`gas-sign-${index}`, { width: 14, height: 9, depth: 1.3 }, this.scene);
    sign.position.set(position.x + inwardX * 22, 28, position.z);
    sign.material = this.materials.gasSign;
    meshes.push(sign);

    const beam = MeshBuilder.CreateCylinder(`gas-beam-${index}`, { diameter: 5, height: 46, tessellation: 16 }, this.scene);
    beam.position.set(position.x, 23, position.z);
    beam.material = this.materials.gasSign;
    meshes.push(beam);

    return meshes;
  }

  private createQuarterCircleApron(
    name: string,
    x: number,
    z: number,
    radius: number,
    startAngle: number,
  ): Mesh {
    const positions = [x, 0.065, z];
    const indices: number[] = [];
    const segments = 10;
    for (let index = 0; index <= segments; index++) {
      const angle = startAngle + index / segments * Math.PI / 2;
      positions.push(x + Math.cos(angle) * radius, 0.065, z + Math.sin(angle) * radius);
    }
    for (let index = 0; index < segments; index++) indices.push(0, index + 1, index + 2);
    const normals = Array.from({ length: positions.length }, (_, index) => index % 3 === 1 ? 1 : 0);
    const uvs = Array.from({ length: positions.length / 3 }, (_, index) => [index / segments, 0]).flat();
    const vertexData = new VertexData();
    vertexData.positions = positions;
    vertexData.indices = indices;
    vertexData.normals = normals;
    vertexData.uvs = uvs;
    const mesh = new Mesh(name, this.scene);
    vertexData.applyToMesh(mesh);
    return mesh;
  }

  private createAutoBodyShops(
    locations: ServiceLocation[],
    meshes: Mesh[],
    colliders: BoxCollider[],
  ): AutoBodyShop[] {
    return locations.map(({ position, inwardX, inwardZ }, index) => {
      meshes.push(...this.createAutoBodyShopMeshes(position, index, colliders, inwardX, inwardZ));
      return { position, radius: GAME_CONFIG.repair.repairRadius };
    });
  }

  private createAutoBodyShopMeshes(
    position: Vector3,
    index: number,
    colliders: BoxCollider[],
    inwardX: -1 | 1,
    inwardZ: -1 | 1,
  ): Mesh[] {
    const meshes: Mesh[] = [];
    const pad = MeshBuilder.CreateBox(`repair-pad-${index}`, { width: 30, height: 0.16, depth: 30 }, this.scene);
    pad.position.set(position.x, 0.08, position.z);
    pad.material = this.materials.repairBase;
    meshes.push(pad);

    const garage = MeshBuilder.CreateBox(`repair-garage-${index}`, { width: 28, height: 10, depth: 16 }, this.scene);
    garage.position.set(position.x, 5, position.z + inwardZ * 11);
    garage.material = this.materials.repairGarage;
    meshes.push(garage);
    colliders.push({ x: position.x, z: position.z + inwardZ * 11, halfX: 13.4, halfZ: 7.4 });

    const door = MeshBuilder.CreateBox(`repair-door-${index}`, { width: 15, height: 6, depth: 0.35 }, this.scene);
    door.position.set(position.x, 3, position.z + inwardZ * 2.8);
    door.material = this.materials.repairSign;
    meshes.push(door);

    const signPost = MeshBuilder.CreateBox(`repair-sign-post-${index}`, { width: 1.5, height: 26, depth: 1.5 }, this.scene);
    signPost.position.set(position.x + inwardX * 22, 13, position.z);
    signPost.material = this.materials.repairGarage;
    meshes.push(signPost);
    colliders.push({ x: position.x + inwardX * 22, z: position.z, halfX: 0.75, halfZ: 0.75 });

    const sign = MeshBuilder.CreateBox(`repair-sign-${index}`, { width: 15, height: 8, depth: 1.4 }, this.scene);
    sign.position.set(position.x + inwardX * 22, 27, position.z);
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
