import { expect,it } from "vitest";
import { FrameTimingWindow } from "./FrameTimingWindow";
it("reports percentiles over the bounded recent window and resets between scenes",()=>{
  const window=new FrameTimingWindow(4);
  [10,20,30,40].forEach(v=>window.add(v));
  expect(window.summarize()).toEqual({samples:4,median:25,p95:40});
  window.add(12);window.add(NaN);window.add(-1);
  expect(window.summarize()).toEqual({samples:4,median:25,p95:40});
  window.clear();expect(window.summarize()).toEqual({samples:0,median:0,p95:0});
});
