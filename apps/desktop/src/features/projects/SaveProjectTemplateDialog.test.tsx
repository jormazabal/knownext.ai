import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {SaveProjectTemplateDialog} from "./SaveProjectTemplateDialog";
import {getProjectTemplates,saveProjectTemplate} from "../../lib/api/projectTemplates";
import type {ProjectTransferJob} from "../../types/projectTransfer";
import type {ProjectTemplate} from "../../types/projectTemplates";
vi.mock("../../lib/api/projectTemplates",()=>({getProjectTemplates:vi.fn(),saveProjectTemplate:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const job={id:"transfer-owned",archiveSha256:"source-sha",manifest:{projectName:"Kit",files:[{path:"Plan.md"}]}} as ProjectTransferJob;
const template={id:"project-template-owned",name:"Kit",description:"",retired:false,sourceArchiveSha256:"source-sha"} as ProjectTemplate;
it("observes a saved template after a lost acknowledgement without creating another copy",async()=>{
  vi.mocked(saveProjectTemplate).mockRejectedValue(new Error("Connection lost"));
  vi.mocked(getProjectTemplates).mockResolvedValue({templates:[template],complete:true,warnings:[],maximumEntries:50,maximumBytes:100,storedBytes:50});
  const saved=vi.fn();render(<SaveProjectTemplateDialog job={job} onSaved={saved} onClose={vi.fn()}/>);
  fireEvent.click(screen.getByRole("button",{name:"Guardar plantilla"}));await screen.findByRole("button",{name:"Guardar plantilla"});
  await vi.waitFor(()=>expect(saved).toHaveBeenCalledWith(template));expect(saveProjectTemplate).toHaveBeenCalledOnce();
});
it("preserves the edited fields and requires observation when the outcome is unavailable",async()=>{
  vi.mocked(saveProjectTemplate).mockRejectedValue(new Error("No response"));vi.mocked(getProjectTemplates).mockRejectedValue(new Error("Offline"));
  render(<SaveProjectTemplateDialog job={job} onSaved={vi.fn()} onClose={vi.fn()}/>);
  fireEvent.change(screen.getByRole("textbox",{name:"Nombre"}),{target:{value:"Kit para el equipo"}});
  fireEvent.click(screen.getByRole("button",{name:"Guardar plantilla"}));await screen.findByRole("button",{name:"Consultar catálogo"});
  expect(screen.getByRole("textbox",{name:"Nombre"})).toHaveValue("Kit para el equipo");expect(screen.getByRole("textbox",{name:"Nombre"})).toBeDisabled();
  expect(screen.queryByRole("button",{name:"Guardar plantilla"})).not.toBeInTheDocument();
});
