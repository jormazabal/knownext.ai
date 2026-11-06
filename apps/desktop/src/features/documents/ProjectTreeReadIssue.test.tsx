import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {ProjectTreeReadIssue} from "./ProjectTreeReadIssue";
afterEach(()=>{cleanup();});
it("explains an unavailable view without declaring the project empty and keeps search usable while reading",()=>{
 const retry=vi.fn(),search=vi.fn();const view=render(<ProjectTreeReadIssue message="Límite de profundidad" hasPreviousView={false} busy={false} onRetry={retry} onSearch={search}/>);
 expect(screen.getByText(/no significa que el proyecto esté vacío/)).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Reintentar lectura"}));expect(retry).toHaveBeenCalledOnce();
 view.rerender(<ProjectTreeReadIssue message="Límite de profundidad" hasPreviousView busy onRetry={retry} onSearch={search}/>);
 expect(screen.getByText(/Se conserva la última vista comprobada/)).toBeInTheDocument();expect(screen.getByRole("button",{name:"Consultando…"})).toBeDisabled();fireEvent.click(screen.getByRole("button",{name:"Buscar contenido"}));expect(search).toHaveBeenCalledOnce();
});
