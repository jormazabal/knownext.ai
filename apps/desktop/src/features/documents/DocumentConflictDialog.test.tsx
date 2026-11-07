import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {DocumentConflictDialog} from "./DocumentConflictDialog";
import type {DocumentConflictReview} from "../../types/documentConflicts";
vi.mock("../editor/ReadonlyMarkdownViewer",()=>({ReadonlyMarkdownViewer:({markdown}:{markdown:string})=><div>{markdown}</div>}));
afterEach(cleanup);
it("keeps an uncertain submitted choice read-only and offers an explicit check without submitting again",()=>{
 const review:DocumentConflictReview={documentId:'p::a.md',locationRevision:'root',diskMarkdown:'Disk',diskFingerprint:{sha256:'disk'},draftRevision:'draft',checkedAt:'now'};
 const check=vi.fn(),apply=vi.fn(),reload=vi.fn();render(<DocumentConflictDialog name="a.md" localMarkdown="Local" review={review} loading={false} busy={false} error="Confirmación pendiente" onReload={reload} onApply={apply} onClose={vi.fn()} onCheckAttempt={check}/>);
 expect(screen.getByRole('button',{name:'Mi edición'})).toBeDisabled();expect(screen.queryByRole('button',{name:'Aplicar al borrador'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Consultar intento'}));expect(check).toHaveBeenCalledTimes(1);expect(apply).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Nueva revisión'}));expect(reload).toHaveBeenCalledTimes(1);expect(screen.getByRole('button',{name:'Cerrar revisión'})).toBeEnabled();
});
it("uses known remote content for explicit choices while keeping synchronization pending",()=>{
 const review:DocumentConflictReview={documentId:'p::a.md',locationRevision:'root',diskMarkdown:'Disk text',diskFingerprint:{sha256:'disk'},draftRevision:'draft',checkedAt:'now',remoteSource:{sourcePath:'a.md',localCommit:'local',remoteCommit:'remote-owned',markdownSha256:'remote-hash',revision:'proof',markdown:'Remote text'}};
 const apply=vi.fn();render(<DocumentConflictDialog name="a.md" localMarkdown="My text" review={review} loading={false} busy={false} error="" onReload={vi.fn()} onApply={apply} onClose={vi.fn()}/>);
 expect(screen.getByText(/La sincronización del proyecto seguirá pendiente/)).toBeTruthy();expect(screen.getByText('Remote text')).toBeTruthy();expect(screen.queryByText('Disk text')).toBeNull();
 fireEvent.click(screen.getByText('Elegir una versión completa'));fireEvent.click(screen.getByRole('button',{name:'Usar todo el remoto conocido'}));fireEvent.click(screen.getByRole('button',{name:'Aplicar al borrador'}));expect(apply).toHaveBeenCalledTimes(1);expect(apply).toHaveBeenCalledWith('Remote text');
});
it("explains a detected remote rename while keeping local naming outside the content merge",()=>{
 const review:DocumentConflictReview={documentId:'p::a.md',locationRevision:'root',diskMarkdown:'Disk',diskFingerprint:{sha256:'disk'},draftRevision:'draft',checkedAt:'now',remotePathChanged:true,remoteSource:{sourcePath:'Decisiones/Remoto.md',localCommit:'local',remoteCommit:'remote',markdownSha256:'hash',revision:'proof',markdown:'Remote'}};
 render(<DocumentConflictDialog name="a.md" localMarkdown="Local" review={review} loading={false} busy={false} error="" onReload={vi.fn()} onApply={vi.fn()} onClose={vi.fn()}/>);expect(screen.getByText(/Solo se combina el texto; la ruta local se conserva/)).toBeTruthy();expect(screen.getByText('Decisiones/Remoto.md')).toBeTruthy();
});
