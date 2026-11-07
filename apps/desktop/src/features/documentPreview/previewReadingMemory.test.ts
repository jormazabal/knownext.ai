import {describe,it,expect} from "vitest";
import {PreviewReadingMemory,emptyPreviewReadingState,previewReadingScope,previewSourceRevision} from "./previewReadingMemory";
const fingerprint={sha256:"source",size:1024,mtimeNs:2};
const revision=previewSourceRevision(fingerprint)!;
describe("preview reading session memory",()=>{
  it("isolates project, location, tab and path without caching document data",()=>{
    const memory=new PreviewReadingMemory();const project={id:"p",folderPath:"C:/one"};const tab={id:"a",path:"A.pdf",format:"pdf"};const scope=previewReadingScope(project,tab);
    memory.write(scope,revision,{...emptyPreviewReadingState(),pageNumber:3,query:"find"});
    expect(memory.read(scope,revision)?.pageNumber).toBe(3);
    for(const other of [previewReadingScope({...project,id:"other"},tab),previewReadingScope({...project,folderPath:"C:/two"},tab),previewReadingScope(project,{...tab,id:"b"}),previewReadingScope(project,{...tab,path:"B.pdf"}),previewReadingScope(project,{...tab,format:"docx"})])expect(memory.read(other,revision)).toBeNull();
    expect(Object.keys(memory.read(scope,revision)!)).not.toContain("text");
  });
  it("invalidates changed or unverified fingerprints and does not revive an older source",()=>{
    const memory=new PreviewReadingMemory();memory.write("a",revision,emptyPreviewReadingState());
    expect(memory.read("a",previewSourceRevision({...fingerprint,mtimeNs:3}))).toBeNull();expect(memory.read("a",revision)).toBeNull();
    memory.write("a",null,emptyPreviewReadingState());expect(memory.size).toBe(0);expect(previewSourceRevision({sha256:"source"})).toBeNull();
  });
  it("bounds 32 scopes, 512 search characters and 16 sheets, returning defensive copies",()=>{
    const memory=new PreviewReadingMemory();const state={...emptyPreviewReadingState(),query:"x".repeat(900),pdfPosition:{pageNumber:4,offsetRatio:0.5,horizontalRatio:0.25},sheetPositions:Object.fromEntries(Array.from({length:20},(_,i)=>[String(i),{top:i,left:i}]))};
    for(let i=0;i<32;i++)memory.write(String(i),revision,state);
    memory.read("0",revision);memory.write("32",revision,state);
    expect(memory.size).toBe(32);expect(memory.read("1",revision)).toBeNull();const found=memory.read("0",revision)!;expect(found.query).toHaveLength(512);expect(Object.keys(found.sheetPositions)).toHaveLength(16);found.pdfPosition!.offsetRatio=1;expect(memory.read("0",revision)!.pdfPosition!.offsetRatio).toBe(.5);
  });
});
