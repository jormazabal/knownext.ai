import {expect,it} from "vitest";
import {rasterRatio} from "./pdfViewport";

it("caps dense or extreme PDF canvases by pixels and edge without changing CSS zoom",()=>{
  for(const [width,height,density] of [[420,595,3],[9000,18000,4],[100000,10,2]]){
    const ratio=rasterRatio(width,height,density);
    expect(Math.floor(width*ratio)*Math.floor(height*ratio)).toBeLessThanOrEqual(8_000_000);
    expect(Math.max(width,height)*ratio).toBeLessThanOrEqual(8192);
    expect(ratio).toBeLessThanOrEqual(2);
  }
  expect(rasterRatio(360,510,1)).toBe(1);
  expect(()=>rasterRatio(0,100,2)).toThrow();
});
