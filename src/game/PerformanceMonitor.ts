import type { Engine } from "@babylonjs/core/Engines/engine";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import type { Scene } from "@babylonjs/core/scene";

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

  afterRender(activeAiCount: number, collisionCandidates: number): void {
    if (!this.element || !this.instrumentation) {
      return;
    }
    const now = performance.now();
    if (now - this.lastDisplayUpdate < 500) {
      return;
    }
    this.lastDisplayUpdate = now;
    this.element.textContent = [
      `${this.engine.getFps().toFixed(0)} FPS`,
      `${this.updateMilliseconds.toFixed(2)} ms update`,
      `${this.instrumentation.renderTimeCounter.lastSecAverage.toFixed(2)} ms render`,
      `${this.instrumentation.drawCallsCounter.current} draw calls`,
      `${this.scene.getActiveMeshes().length}/${this.scene.meshes.length} meshes`,
      `${activeAiCount} active AI`,
      `${collisionCandidates} collision candidates`,
    ].join("\n");
  }

  dispose(): void {
    this.instrumentation?.dispose();
    this.element?.remove();
  }
}
