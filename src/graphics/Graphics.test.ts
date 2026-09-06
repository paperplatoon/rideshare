import { afterEach, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { GAME_CONFIG } from "../game/config";
import { createLowPolyVehicleMesh } from "../vehicles/VehicleMeshFactory";
import { VEHICLE_CATALOG } from "../vehicles/VehicleCatalog";
import { TrafficCar } from "../traffic/TrafficCar";
import { PlayerCar } from "../player/PlayerCar";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { buildingStyleFor, createBuildingVisuals, createFacadePixels } from "../world/BuildingVisuals";
import { TownGenerator } from "../world/Town";
import { resolveGraphicsMode, setSceneGraphicsMode } from "./GraphicsMode";
import { beveledRing, createLoftMesh } from "./FacetedMesh";

const cleanup: (() => void)[]=[];
afterEach(()=>cleanup.splice(0).forEach(fn=>fn()));
function fixture(mode: "original" | "enhanced" = "enhanced") {
  const engine=new NullEngine(),scene=new Scene(engine);
  setSceneGraphicsMode(scene,mode);
  cleanup.push(()=>{scene.dispose();engine.dispose();});
  return {scene,material:new StandardMaterial("test",scene)};
}
function validate(mesh: Mesh) {
  const positions=mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const normals=mesh.getVerticesData(VertexBuffer.NormalKind)!;
  const indices=mesh.getIndices()!;
  expect(positions.every(Number.isFinite)).toBe(true);
  expect(normals).toHaveLength(positions.length);
  expect([...indices].every(i=>i>=0 && i<positions.length/3)).toBe(true);
  for(let i=0;i<normals.length;i+=3) expect(Math.hypot(normals[i],normals[i+1],normals[i+2])).toBeCloseTo(1,4);
}

describe("enhanced graphics",()=>{
  it("allows the original renderer only through an explicit debug comparison",()=>{
    expect(resolveGraphicsMode("?graphics=original")).toBe("enhanced");
    expect(resolveGraphicsMode("?debug&graphics=original")).toBe("original");
    expect(resolveGraphicsMode("?debug&graphics=enhanced")).toBe("enhanced");
  });
  it("builds outward-facing convex bevels",()=>{
    const {scene}=fixture();
    const mesh=createLoftMesh(scene,"bevel",[beveledRing(4,8,-1,0.3),beveledRing(3.8,7.8,1,0.3)]);
    validate(mesh);
    const p=mesh.getVerticesData(VertexBuffer.PositionKind)!,n=mesh.getVerticesData(VertexBuffer.NormalKind)!;
    for(let i=0;i<p.length;i+=3) expect(p[i]*n[i]+p[i+1]*n[i+1]+p[i+2]*n[i+2]).toBeGreaterThan(0);
  });
  it("keeps all catalog vehicles within one mesh and the triangle budget",()=>{
    const {scene,material}=fixture();
    for(const vehicle of VEHICLE_CATALOG) {
      const {bodyColor,...appearance}=vehicle.appearance;
      const mesh=createLowPolyVehicleMesh(scene,vehicle.id,material,{...appearance,bodyColor:Color3.FromHexString(bodyColor)});
      validate(mesh);
      expect(mesh.getTotalIndices()/3).toBeLessThanOrEqual(GAME_CONFIG.graphics.playerTriangleBudget);
      expect(scene.meshes).toHaveLength(1);
      mesh.dispose();
    }
  });
  it("keeps civilian and police prototypes below their budget and shares geometry with clones",()=>{
    const {scene,material}=fixture();
    const civilian=TrafficCar.createPrototype(scene,material,0),police=TrafficCar.createPolicePrototype(scene,material);
    for(const mesh of [civilian,police]) {
      validate(mesh);
      expect(mesh.getTotalIndices()/3).toBeLessThanOrEqual(GAME_CONFIG.graphics.trafficTriangleBudget);
      const clone=mesh.clone("clone")!;
      expect(clone.geometry).toBe(mesh.geometry);clone.dispose();
    }
    expect(scene.meshes).toHaveLength(2);
  });
  it("disposes old geometry and materials when switching player vehicles",()=>{
    const {scene}=fixture();
    const player=new PlayerCar(scene,[{position:Vector3.Zero(),ix:0,iz:0}]);
    const meshes=scene.meshes.length, materials=scene.materials.length;
    for(const vehicle of VEHICLE_CATALOG) {
      player.equipVehicle(vehicle,vehicle.stats);
      expect(scene.meshes.length).toBe(meshes);
      expect(scene.materials.length).toBe(materials);
    }
  });
  it("keeps building styles deterministic and below 120 triangles",()=>{
    const {scene,material}=fixture(),roof=new StandardMaterial("roof",scene),styles=new Set();
    for(let i=0;i<30;i++) {
      const name=`building-${i}`,h=12+i;
      styles.add(buildingStyleFor(name,h));
      expect(buildingStyleFor(name,h)).toBe(buildingStyleFor(name,h));
      const meshes=createBuildingVisuals(scene,name,0,0,20,30,h,material,roof,{height:1,offsetX:0,offsetZ:0});
      expect(meshes.reduce((sum,m)=>sum+m.getTotalIndices()/3,0)).toBeLessThanOrEqual(GAME_CONFIG.graphics.buildingTriangleBudget);
      meshes.forEach(m=>{validate(m);m.dispose();});
    }
    expect([...styles].sort()).toEqual(["commercial","pitched","stepped"]);
    expect(scene.meshes).toHaveLength(0);
  });
  it("maps vertical facade repeats to floor height rather than building size",()=>{
    const {scene,material}=fixture(),roof=new StandardMaterial("roof",scene);
    for(const height of [12,24,40]) {
      const meshes=createBuildingVisuals(scene,"building-test",0,0,20,30,height,material,roof,null);
      for(const mesh of meshes.filter(m=>m.material===material)) {
        const p=mesh.getVerticesData(VertexBuffer.PositionKind)!,n=mesh.getVerticesData(VertexBuffer.NormalKind)!,uv=mesh.getVerticesData(VertexBuffer.UVKind)!;
        for(let i=0;i<p.length/3;i++) if(Math.abs(n[i*3+1])<0.9) {
          expect(uv[i*2+1]).toBeCloseTo((p[i*3+1]+mesh.position.y)/GAME_CONFIG.graphics.facadeTileWorldSize);
        }
      }
    }
  });
  it("uses distinct repeatable opaque facade patterns",()=>{
    const a=createFacadePixels(256,[0.48,0.46,0.43],59);
    expect(a).toEqual(createFacadePixels(256,[0.48,0.46,0.43],59));
    expect(a).not.toEqual(createFacadePixels(256,[0.48,0.46,0.43],83));
    for(let i=3;i<a.length;i+=4) expect(a[i]).toBe(255);
  });
  it("preserves layout, collision, services and static batching across render modes",()=>{
    const original=fixture("original"),enhanced=fixture("enhanced");
    const a=new TownGenerator(original.scene).generate(),b=new TownGenerator(enhanced.scene).generate();
    expect(b.staticColliders).toEqual(a.staticColliders);
    expect(b.gasStations).toEqual(a.gasStations);
    expect(b.autoBodyShops).toEqual(a.autoBodyShops);
    expect(b.deliveryPoints).toEqual(a.deliveryPoints);
    expect(b.legalDrivingAreas).toEqual(a.legalDrivingAreas);
    expect(b.meshes.length).toBeLessThan(210);
    expect(b.meshes.length).toBe(a.meshes.length);
    expect(enhanced.scene.meshes.length).toBe(b.meshes.length);
    expect(enhanced.scene.materials.length).toBe(original.scene.materials.length);
    expect(enhanced.scene.textures.filter(t=>t.name.startsWith("building-")).every(t=>t.getSize().width===256)).toBe(true);
  });
});
