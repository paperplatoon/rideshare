import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { Scene } from "@babylonjs/core/scene";
import { GAME_CONFIG } from "../game/config";
import { createFacetedMesh } from "../graphics/FacetedMesh";

export type BuildingStyle = "commercial" | "stepped" | "pitched";
export interface RoofDetail { height: number; offsetX: number; offsetZ: number }

export function buildingStyleFor(name: string, height: number): BuildingStyle {
  // Visual choices never consume the world layout RNG.
  let hash = 2166136261;
  for (const char of name) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  if (height < 23 && hash % 3 === 0) return "pitched";
  return hash % 2 === 0 ? "stepped" : "commercial";
}

export function mapFacadeUVs(mesh: Mesh, tileSize = GAME_CONFIG.graphics.facadeTileWorldSize): void {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!;
  const normals = mesh.getVerticesData(VertexBuffer.NormalKind)!;
  const uvs: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    const [x,y,z] = positions.slice(i,i+3), [nx,ny,nz] = normals.slice(i,i+3);
    if (Math.abs(ny) > 0.9) uvs.push(x / tileSize, z / tileSize);
    else uvs.push((Math.abs(nx) > Math.abs(nz) ? z * -Math.sign(nx) : x * Math.sign(nz)) / tileSize,
      (y + mesh.position.y) / tileSize);
  }
  mesh.setVerticesData(VertexBuffer.UVKind,uvs);
}

export function createBuildingVisuals(
  scene: Scene, name: string, x: number, z: number, width: number, depth: number, height: number,
  facade: StandardMaterial, roof: StandardMaterial, detail: RoofDetail | null,
): Mesh[] {
  const style = buildingStyleFor(name,height), meshes: Mesh[] = [];
  function box(label: string, w: number, h: number, d: number, px: number, py: number, pz: number, material: StandardMaterial): Mesh {
    const mesh = MeshBuilder.CreateBox(`${name}-${label}`,{width:w,height:h,depth:d},scene);
    mesh.position.set(px,py,pz); mesh.material=material;
    if (material === facade) mapFacadeUVs(mesh);
    mesh.metadata={buildingStyle:style}; meshes.push(mesh); return mesh;
  }
  let roofY = height;
  if (style === "stepped") {
    const baseHeight = height * 0.57;
    box("base",width,baseHeight,depth,x,baseHeight/2,z,facade);
    box("terrace",width+0.5,0.35,depth+0.5,x,baseHeight+0.175,z,roof);
    box("upper",width*0.78,height-baseHeight,depth*0.78,x,baseHeight+(height-baseHeight)/2,z,facade);
    box("roof",width*0.78+0.5,0.35,depth*0.78+0.5,x,height+0.175,z,roof);
  } else if (style === "pitched") {
    const rise = Math.min(4,height*0.18), wallHeight = height-rise;
    box("walls",width,wallHeight,depth,x,wallHeight/2,z,facade);
    const hw=width/2+0.35, hd=depth/2+0.35;
    const roofMesh=createFacetedMesh(scene,`${name}-pitched-roof`,[
      [-hw,0,-hd],[hw,0,-hd],[hw,0,hd],[-hw,0,hd],[0,rise,-hd],[0,rise,hd],
    ],[[0,1,2,3],[0,4,1],[3,2,5],[0,3,5,4],[1,4,5,2]]);
    roofMesh.position.set(x,wallHeight,z); roofMesh.material=roof;
    roofMesh.metadata={buildingStyle:style}; meshes.push(roofMesh);
    roofY = wallHeight;
  } else {
    box("walls",width,height,depth,x,height/2,z,facade);
    box("roof",width+0.7,0.35,depth+0.7,x,height+0.175,z,roof);
    // Roof perimeter gives a readable silhouette with just four shared-material boxes.
    for(const sign of [-1,1]) {
      box("parapet-x",0.35,0.8,depth,x+sign*(width/2-0.175),height+0.5,z,facade);
      box("parapet-z",width,0.8,0.35,x,height+0.5,z+sign*(depth/2-0.175),facade);
    }
    box("storefront",width*0.72,2.3,0.07,x,1.65,z-depth/2-0.04,roof);
  }
  box("entrance",Math.min(2.4,width*0.15),3,0.09,x,1.5,z-depth/2-0.06,roof);
  box("entry-lintel",Math.min(3,width*0.20),0.25,0.55,x,3.15,z-depth/2-0.18,roof);
  if(detail && style !== "pitched") {
    box("roof-unit",Math.min(6,width*0.25),detail.height,Math.min(5,depth*0.22),
      x+detail.offsetX,roofY+0.35+detail.height/2,z+detail.offsetZ,roof);
  }
  return meshes;
}

/** A four-floor tile; all three styles share physical window/floor proportions. */
export function createFacadePixels(size: number, base: readonly number[], seed: number): Uint8Array {
  const pixels=new Uint8Array(size*size*4);
  const style=seed===83 ? "brick" : seed===71 ? "commercial" : "concrete";
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const px=x/size*256,py=y/size*256;
    const bay=px%64,floor=py%64;
    const noise=((Math.imul(x+seed,374761393)^Math.imul(y+seed,668265263))>>>0)%9-4;
    let color=base.map(v=>v*255+noise);
    if(style==="brick" && (py%8<1 || (px+(Math.floor(py/8)%2)*8)%16<1)) color=color.map(v=>v-22);
    if(style==="concrete" && (floor<3 || bay<2)) color=color.map(v=>v-24);
    const window=style==="commercial" ? bay>5 && bay<59 && floor>9 && floor<54 : bay>15 && bay<49 && floor>13 && floor<51;
    if(window) {
      const reflected=py/size*22;
      color=[48+reflected,72+reflected,85+reflected];
      const frame=style==="commercial" ? bay<8 || bay>56 || floor<12 || floor>51 || Math.abs(bay-32)<1
        : bay<18 || bay>46 || floor<16 || floor>48 || Math.abs(bay-32)<1;
      if(frame) color=style==="brick" ? [133,130,119] : [95,108,113];
    } else if(floor>=51 && floor<55 && bay>12 && bay<52) color=color.map(v=>v-32);
    const offset=(y*size+x)*4;
    for(let c=0;c<3;c++) pixels[offset+c]=Math.max(0,Math.min(255,Math.round(color[c])));
    pixels[offset+3]=255;
  }
  return pixels;
}
