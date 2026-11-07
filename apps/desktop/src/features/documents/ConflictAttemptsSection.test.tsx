import {act,cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {StrictMode} from "react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {ConflictAttemptsSection} from "./ConflictAttemptsSection";
import {listConflictAttempts,reviewConflictAttempt,changeConflictAttemptArchive} from "../../lib/api/conflictRecovery";
import type {ConflictAttemptRecovery,ConflictAttemptRow} from "../../types/conflictAttempts";
import type {RecoveryCopy} from "../../types/recovery";
vi.mock("../../lib/api/conflictRecovery",()=>({listConflictAttempts:vi.fn(),reviewConflictAttempt:vi.fn(),changeConflictAttemptArchive:vi.fn()}));
const list=vi.mocked(listConflictAttempts),inspect=vi.mocked(reviewConflictAttempt);
const change=vi.mocked(changeConflictAttemptArchive);
const a:ConflictAttemptRow={id:"attempt-a",documentId:"p::A.md",name:"A.md",kind:"markdown",phase:"applying",createdAt:"2026-11-02T00:00:00Z",bytes:1000,revision:"a",canReview:true,warning:null};
const b={...a,id:"attempt-b",documentId:"p::B.md",name:"B.md"};
const copies=[{key:"recovery-local",source:"archive",variantRole:"local",documentId:a.documentId,fingerprint:"a".repeat(64)}] as RecoveryCopy[];
function detail(receipt=a):ConflictAttemptRecovery{return {receipt,operationId:"conflict-a",copies,copiesVerified:true,draftMatchesRecordedPublication:false,fileStateReviewed:false,remoteStateReviewed:false,canReplay:false,warnings:[],checkedAt:"2026-11-02T00:00:00Z"};}
beforeEach(()=>{vi.resetAllMocks();list.mockResolvedValue({items:[a],scanned:1,limited:false,warnings:[],checkedAt:"now"});});afterEach(cleanup);
it("does not duplicate the bounded native catalogue scan on StrictMode remount",async()=>{
  render(<StrictMode><ConflictAttemptsSection onReviewCopies={vi.fn()}/></StrictMode>);await screen.findByText("A.md");expect(list).toHaveBeenCalledTimes(1);
});
it("opens preserved copies without treating a completed receipt or matching draft as a resolved source",async()=>{
  inspect.mockResolvedValue({...detail(),receipt:{...a,phase:"completed"},draftMatchesRecordedPublication:true});const onReviewCopies=vi.fn();render(<ConflictAttemptsSection onReviewCopies={onReviewCopies}/>);
  fireEvent.click(await screen.findByRole("button",{name:"Revisar intento"}));expect(await screen.findByText("Recibo completado",{exact:false})).toBeInTheDocument();expect(screen.getByText("El borrador privado coincide con la publicación registrada.")).toBeInTheDocument();expect(screen.getByText(/El archivo y el origen remoto no se han contrastado aquí/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Ver copias conservadas (1)"}));expect(onReviewCopies).toHaveBeenCalledWith(copies);expect(inspect).toHaveBeenCalledTimes(1);expect(screen.queryByRole("button",{name:/Aplicar|Resolver|Reintentar/})).not.toBeInTheDocument();
});
it("ignores an old detail after refreshing and inspecting a different receipt",async()=>{
  list.mockResolvedValue({items:[a,b],scanned:2,limited:false,warnings:[],checkedAt:"now"});let finish!:(data:ConflictAttemptRecovery)=>void;inspect.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce(detail(b));
  render(<ConflictAttemptsSection onReviewCopies={vi.fn()}/>);fireEvent.click(within((await screen.findByText("A.md")).closest("article")!).getByRole("button",{name:"Revisar intento"}));fireEvent.click(screen.getByRole("button",{name:"Actualizar recibos"}));await waitFor(()=>expect(list).toHaveBeenCalledTimes(2));
  await waitFor(()=>expect(screen.getAllByRole("button",{name:"Revisar intento"})[1]).toBeEnabled());fireEvent.click(within(screen.getByText("B.md").closest("article")!).getByRole("button",{name:"Revisar intento"}));await screen.findByLabelText("Revisión de B.md");await act(async()=>finish(detail(a)));expect(screen.queryByLabelText("Revisión de A.md")).not.toBeInTheDocument();expect(screen.getByLabelText("Revisión de B.md")).toBeInTheDocument();
});
it("rejects a mismatched response and preserves unknown receipts as read-only rows",async()=>{
  list.mockResolvedValue({items:[a,{...b,canReview:false,phase:null,warning:"Formato futuro conservado"}],scanned:2,limited:true,warnings:[],checkedAt:"now"});inspect.mockResolvedValue(detail(b));render(<ConflictAttemptsSection onReviewCopies={vi.fn()}/>);
  expect(await screen.findByText("Formato futuro conservado")).toBeInTheDocument();expect(within(screen.getByText("B.md").closest("article")!).getByRole("button",{name:"Revisar intento"})).toBeDisabled();fireEvent.click(within(screen.getByText("A.md").closest("article")!).getByRole("button",{name:"Revisar intento"}));expect(await screen.findByRole("alert")).toHaveTextContent("no corresponde");expect(screen.queryByRole("button",{name:/Ver copias conservadas/})).not.toBeInTheDocument();
});

it("archives once after a lost ACK and reopens from an explicit archived-scope review",async()=>{
  let archived=false;const completed={...a,phase:"completed" as const,revision:"a".repeat(64)};const current=()=>({...completed,archivedAt:archived?"2026-11-02T01:00:00Z":null,revision:(archived?"b":"a").repeat(64)});
  list.mockImplementation(async(scope=false)=>({items:scope===archived?[current()]:[],scanned:1,limited:false,warnings:[],checkedAt:"now"}));inspect.mockImplementation(async()=>detail(current()));
  change.mockImplementation(async(id,revision,action)=>{archived=action==="archive";if(archived)throw Error("Lost ACK");return {id,status:"active",revision:"a".repeat(64),checkedAt:"now"};});
  render(<ConflictAttemptsSection onReviewCopies={vi.fn()}/>);fireEvent.click(await screen.findByRole("button",{name:"Revisar intento"}));const archive=await screen.findByRole("button",{name:"Archivar recibo"});fireEvent.click(archive);fireEvent.click(archive);
  expect(await screen.findByRole("status")).toHaveTextContent("No llegó el acuse");expect(change).toHaveBeenCalledTimes(1);expect(change).toHaveBeenLastCalledWith(a.id,"a".repeat(64),"archive");expect(screen.queryByText("A.md")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Archivados"}));fireEvent.click(await screen.findByRole("button",{name:"Revisar intento"}));fireEvent.click(await screen.findByRole("button",{name:"Reabrir recibo"}));await waitFor(()=>expect(screen.getByRole("status")).toHaveTextContent("Sin archivar"));expect(change).toHaveBeenCalledTimes(2);expect(change).toHaveBeenLastCalledWith(a.id,"b".repeat(64),"reopen");expect(inspect).toHaveBeenCalledTimes(4);
});

it("blocks another archive after an unconfirmed result until the user explicitly reviews again",async()=>{
  const completed={...a,phase:"completed" as const};inspect.mockResolvedValue(detail(completed));change.mockRejectedValue(new Error("Unknown result"));render(<ConflictAttemptsSection onReviewCopies={vi.fn()}/>);
  fireEvent.click(await screen.findByRole("button",{name:"Revisar intento"}));fireEvent.click(await screen.findByRole("button",{name:"Archivar recibo"}));expect(await screen.findByRole("alert")).toHaveTextContent("No se confirmó");expect(screen.getByRole("button",{name:"Archivar recibo"})).toBeDisabled();expect(change).toHaveBeenCalledTimes(1);expect(inspect).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button",{name:"Revisar intento"}));await waitFor(()=>expect(screen.getByRole("button",{name:"Archivar recibo"})).toBeEnabled());expect(change).toHaveBeenCalledTimes(1);
});
