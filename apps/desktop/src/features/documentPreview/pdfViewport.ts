/** Bound raster memory and GPU dimensions; CSS size/zoom remains independent. */
export function rasterRatio(width:number,height:number,deviceRatio:number):number {
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error("Dimensiones PDF no válidas");
  return Math.min(Number.isFinite(deviceRatio)&&deviceRatio>0?deviceRatio:1,2,
    Math.sqrt(8_000_000/(width*height)),8192/Math.max(width,height));
}
