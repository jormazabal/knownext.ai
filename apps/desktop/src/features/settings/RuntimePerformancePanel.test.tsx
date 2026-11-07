import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {RuntimePerformancePanel} from "./RuntimePerformancePanel";
import {getRuntimePerformance} from "../../lib/api/runtimePerformance";
import type {RuntimePerformance} from "../../types/runtimePerformance";
vi.mock("../../lib/api/runtimePerformance",()=>({getRuntimePerformance:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const measured:RuntimePerformance={schemaVersion:1,available:true,scope:"local-api-requests",clock:"monotonic-wall-clock",persistent:false,readOnly:true,startsProvider:false,includesStartup:false,sampleLimitPerClass:128,maximumClasses:11,observedRequests:2,errorCount:0,classes:[{operationClass:"search",count:2,errorCount:0,totalDurationUs:3000,maxDurationUs:2000,p95RecentDurationUs:2000,recentSamples:2}]};
it("keeps unavailable runtime distinct from a measured empty session",async()=>{vi.mocked(getRuntimePerformance).mockResolvedValue(null);render(<RuntimePerformancePanel/>);expect(await screen.findByRole("status")).toHaveTextContent(/no expone/);expect(screen.queryByText(/solicitudes observadas/)).not.toBeInTheDocument();});
it("shows scoped measurements and preserves the last observation when refresh fails",async()=>{
 vi.mocked(getRuntimePerformance).mockResolvedValueOnce(measured).mockRejectedValueOnce(Error("Consulta no confirmada"));render(<RuntimePerformancePanel/>);
 await screen.findByText(/2 solicitudes observadas/);expect(screen.getByText("Búsqueda")).toBeVisible();expect(screen.getByText(/últimas128/)).toBeVisible();
 fireEvent.click(screen.getByRole("button",{name:"Actualizar medición"}));await screen.findByRole("alert");expect(screen.getByText(/Última observación/)).toBeVisible();expect(screen.getByText(/2 solicitudes observadas/)).toBeVisible();expect(getRuntimePerformance).toHaveBeenCalledTimes(2);
});
it("does not duplicate a pending measurement and ignores its result after unmount",async()=>{
 let resolve!:(value:RuntimePerformance)=>void;vi.mocked(getRuntimePerformance).mockReturnValue(new Promise(r=>{resolve=r;}));const view=render(<RuntimePerformancePanel english/>);
 const refresh=screen.getByRole("button",{name:"Refresh measurements"});expect(refresh).toBeDisabled();fireEvent.click(refresh);expect(getRuntimePerformance).toHaveBeenCalledTimes(1);view.unmount();await act(async()=>resolve(measured));
});
