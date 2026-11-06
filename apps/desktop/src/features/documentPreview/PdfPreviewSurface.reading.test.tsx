import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,describe,it,expect,vi} from "vitest";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import {PdfPreviewSurface} from "./PdfPreviewSurface";
vi.mock("pdfjs-dist/legacy/build/pdf.mjs",()=>({GlobalWorkerOptions:{},getDocument:vi.fn()}));
vi.mock("pdfjs-dist/legacy/build/pdf.worker.mjs?url",()=>({default:"worker"}));
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();Reflect.deleteProperty(HTMLElement.prototype,"scrollIntoView");});
describe("PDF reading position",()=>{
  it("restores proportional page and horizontal position across resize, and reports scrolling",async()=>{
    const frames=new Map<number,FrameRequestCallback>();let sequence=0;let width=800;
    vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{frames.set(++sequence,callback);return sequence;});vi.stubGlobal("cancelAnimationFrame",(id:number)=>frames.delete(id));
    const flush=()=>act(()=>{const values=[...frames.values()];frames.clear();values.forEach(fn=>fn(0));});
    let resize:((w:number,h:number)=>void)|undefined;
    vi.stubGlobal("ResizeObserver",class{constructor(private cb:(e:unknown[])=>void){}observe(){resize=(w,h)=>{width=w;this.cb([{contentRect:{width:w,height:h}}]);};resize(800,500);}disconnect(){}});
    vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({} as CanvasRenderingContext2D);
    const height=()=>width*4/3;const start=(page:number)=>16+(page-1)*(height()+16);
    vi.spyOn(HTMLElement.prototype,"getBoundingClientRect").mockImplementation(function(this:HTMLElement){const el=this;const page=Number(el.dataset.pdfPage);const surface=el.closest('[data-testid="pdf-scroll-surface"]');const top=page?start(page)-(surface?.scrollTop??0):0;return {top,bottom:top+(page?height():500),left:0,right:width,width,height:page?height():500,x:0,y:top,toJSON:()=>({})};});
    Object.defineProperty(HTMLElement.prototype,"scrollIntoView",{configurable:true,value:function(this:HTMLElement){const surface=this.closest('[data-testid="pdf-scroll-surface"]');if(surface)surface.scrollTop=start(Number(this.dataset.pdfPage));}});
    vi.mocked(pdfjsLib.getDocument).mockReturnValue({promise:Promise.resolve({numPages:3,getPage:vi.fn().mockResolvedValue({getViewport:({scale}:{scale:number})=>({width:600*scale,height:800*scale}),render:()=>({cancel:vi.fn(),promise:Promise.resolve()}),getTextContent:async()=>({items:[]})})}),destroy:vi.fn().mockResolvedValue(undefined)} as unknown as ReturnType<typeof pdfjsLib.getDocument>);
    const onPosition=vi.fn();const props={url:"synthetic.pdf",query:"",zoomPercent:100,fitMode:"width" as const,pageNumber:2,navigationSequence:0,onPageChange:vi.fn(),onPageCountChange:vi.fn(),onSearchCountChange:vi.fn(),readingPosition:{pageNumber:2,offsetRatio:.25,horizontalRatio:.5},onReadingPositionChange:onPosition};
    const view=render(<PdfPreviewSurface {...props}/>);const surface=screen.getByTestId("pdf-scroll-surface");Object.defineProperties(surface,{scrollWidth:{configurable:true,value:1200},clientWidth:{configurable:true,value:800}});
    await waitFor(()=>expect(view.container.querySelector('canvas')?.style.width).toBe("800px"));flush();flush();expect(surface.scrollTop).toBeCloseTo(start(2)+height()*.25);expect(surface.scrollLeft).toBe(200);
    act(()=>resize?.(400,500));await waitFor(()=>expect(view.container.querySelector('canvas')?.style.width).toBe("400px"));flush();flush();expect(surface.scrollTop).toBeCloseTo(start(2)+height()*.25);
    surface.scrollTop=start(3)+height()*.2;fireEvent.scroll(surface);flush();expect(onPosition).toHaveBeenLastCalledWith({pageNumber:3,offsetRatio:expect.closeTo(.2),horizontalRatio:.5});
  });
});
