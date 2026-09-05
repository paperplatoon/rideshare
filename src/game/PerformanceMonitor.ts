import type { Engine } from "@babylonjs/core/Engines/engine";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import type { Scene } from "@babylonjs/core/scene";
import type { DrivingBehaviorManager } from "../player/DrivingBehaviorManager";

export class PerformanceMonitor {
  private readonly enabled = new URLSearchParams(window.location.search).has("debug");
  private readonly element: HTMLDivElement | null;
  private instrumentation: SceneInstrumentation | null = null;
  private scene: Scene;
  private updateStartedAt = 0;
  private updateMilliseconds = 0;
  private lastDisplayUpdate = 0;

  constructor(private readonly engine: Engine, scene: Scene, uiRoot: HTMLElement) {
    this.scene = scene;
    if (!this.enabled) {
      this.element = null;
      return;
    }

    this.element = document.createElement("div");
    this.element.className = "performance-monitor";
    uiRoot.append(this.element);
    this.attachScene(scene);
  }

  attachScene(scene: Scene): void {
    this.scene = scene;
    this.instrumentation?.dispose();
    if (!this.enabled) {
      return;
    }
    this.instrumentation = new SceneInstrumentation(scene);
    this.instrumentation.captureFrameTime = true;
    this.instrumentation.captureRenderTime = true;
    this.instrumentation.captureActiveMeshesEvaluationTime = true;
  }

  beginUpdate(): void {
    if (this.enabled) {
      this.updateStartedAt = performance.now();
    }
  }

  endUpdate(): void {
    if (this.enabled) {
      const elapsed = performance.now() - this.updateStartedAt;
      this.updateMilliseconds += (elapsed - this.updateMilliseconds) * 0.1;
    }
  }

  afterRender(activeAiCount: number, collisionCandidates: number, drivingBehavior: DrivingBehaviorManager | null): void {
    if (!this.element || !this.instrumentation) {
      return;
    }
    const now = performance.now();
    if (now - this.lastDisplayUpdate < 500) {
      return;
    }
    this.lastDisplayUpdate = now;
    const activeMeshes = this.scene.getActiveMeshes();
    let visibleVertices = 0;
    let visibleTriangles = 0;
    for (let index = 0; index < activeMeshes.length; index++) {
      const mesh = activeMeshes.data[index];
      visibleVertices += mesh.getTotalVertices();
      visibleTriangles += Math.floor(mesh.getTotalIndices() / 3);
    }
    const lines = [
      `${this.engine.getFps().toFixed(0)} FPS`,
      `${this.updateMilliseconds.toFixed(2)} ms update`,
      `${this.instrumentation.renderTimeCounter.lastSecAverage.toFixed(2)} ms render`,
      `${this.instrumentation.drawCallsCounter.current} draw calls`,
      `${this.scene.getActiveMeshes().length}/${this.scene.meshes.length} meshes`,
      `${formatCount(visibleTriangles)} triangles / ${formatCount(visibleVertices)} vertices`,
      `${activeAiCount} active AI`,
      `${collisionCandidates} collision candidates`,
    ];
    if (drivingBehavior) {
      const current = drivingBehavior.current;
      const totals = drivingBehavior.totals;
      lines.push(
        `violations speed ${current.speeding.toFixed(2)} wrong ${current.wrongSide.toFixed(2)} sidewalk ${current.sidewalk.toFixed(2)}`,
        `illegal points ${totals.total.toFixed(1)} (speed ${totals.speeding.toFixed(1)} wrong ${totals.wrongSide.toFixed(1)} sidewalk ${totals.sidewalk.toFixed(1)})`,
      );
    }
    this.element.textContent = lines.join("\n");
  }

  dispose(): void {
    this.instrumentation?.dispose();
    this.element?.remove();
  }
}

function formatCount(value: number): string {
  if (value < 1000) return `${value}`;
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(2)}m`;
}
