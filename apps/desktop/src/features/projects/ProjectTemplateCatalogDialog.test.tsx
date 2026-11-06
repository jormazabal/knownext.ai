import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {ProjectTemplateCatalogDialog} from "./ProjectTemplateCatalogDialog";
import {getProjectTemplates,retireProjectTemplate} from "../../lib/api/projectTemplates";
import type {ProjectTemplate,ProjectTemplateInventory} from "../../types/projectTemplates";
vi.mock("../../lib/api/projectTemplates",()=>({getProjectTemplates:vi.fn(),retireProjectTemplate:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const template={id:"project-template-owned",name:"Kit",description:"Documentos reutilizables",fileCount:2,directoryCount:1,archiveBytes:500,retired:false,revision:"r1"} as ProjectTemplate;
const inventory:ProjectTemplateInventory={templates:[template],complete:true,warnings:[],maximumEntries:50,maximumBytes:10000,storedBytes:500};
it("uses reviewed identities and retires only the catalogue entry while keeping it recoverable",async()=>{
  const choose=vi.fn();vi.mocked(getProjectTemplates).mockResolvedValueOnce(inventory).mockResolvedValue({...inventory,templates:[{...template,retired:true,revision:"r2"}]});vi.mocked(retireProjectTemplate).mockResolvedValue({...template,retired:true,revision:"r2"});
  render(<ProjectTemplateCatalogDialog onClose={vi.fn()} onChoose={choose} onImport={vi.fn()}/>);
  fireEvent.click(await screen.findByRole("button",{name:"Crear proyecto…"}));expect(choose).toHaveBeenCalledWith({kind:"template-import",templateId:template.id,revision:"r1",projectName:"Kit"});
  fireEvent.click(screen.getByRole("button",{name:"Retirar del catálogo"}));await waitFor(()=>expect(retireProjectTemplate).toHaveBeenCalledWith(template,true));
  await screen.findByText(/No hay plantillas disponibles/);fireEvent.click(screen.getByRole("checkbox",{name:"Mostrar retiradas"}));
  expect(await screen.findByRole("button",{name:"Reincorporar"})).toBeEnabled();expect(screen.getByText("Kit · Retirada")).toBeInTheDocument();
});
