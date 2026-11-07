import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {HandwrittenConflictDialog} from "./HandwrittenConflictDialog";
import {createDefaultHandwrittenContent} from "./handwrittenModel";
afterEach(cleanup);
it("offers read-only verification of a submitted page choice and a separate new review",()=>{
 const local=createDefaultHandwrittenContent('p::note.knote');const disk={...local,title:'Disk title'};
 const check=vi.fn(),apply=vi.fn(),reload=vi.fn();
 render(<HandwrittenConflictDialog name="note.knote" localContent={local} review={{noteId:local.id,locationRevision:'root',diskContent:disk,diskFingerprint:{sha256:'disk'},draftRevision:'draft',checkedAt:'now'}} loading={false} busy={false} error="Confirmación pendiente" onCheckAttempt={check} onReload={reload} onApply={apply} onClose={vi.fn()}/>);
 expect(screen.getByRole('button',{name:/Mi edición ·/})).toBeDisabled();expect(screen.queryByRole('button',{name:'Aplicar al borrador'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Consultar intento'}));expect(check).toHaveBeenCalledTimes(1);expect(apply).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Nueva revisión'}));expect(reload).toHaveBeenCalledTimes(1);expect(screen.getByRole('button',{name:'Cerrar revisión'})).toBeEnabled();
});
