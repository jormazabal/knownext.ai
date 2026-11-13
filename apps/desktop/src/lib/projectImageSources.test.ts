import { expect, it } from "vitest";
import type { DocumentTreeNode } from "../types/domain";
import { getProjectImageContentUrl } from "./api/projects";
import { projectImageAsset, projectImageSource } from "./projectImageSources";

const tree: DocumentTreeNode[] = [{id:"folder",name:"Assets",path:"Assets",type:"folder",children:[{id:"project::Assets/Plano (1).png",name:"Plano (1).png",path:"Assets/Plano (1).png",type:"image"}]}];
const contentUrl = getProjectImageContentUrl("project", "project::Assets/Plano (1).png");
it("adapts saved legacy image URLs to the current native asset protocol",()=>{
  const source=`knownext-asset://project/${encodeURIComponent("project::Assets/Plano (1).png")}`;
  expect(projectImageSource(source,"project","Docs/Plan.md",tree)).toBe(contentUrl);
  expect(projectImageAsset(source,"project","Docs/Plan.md",tree)?.id).toBe("project::Assets/Plano (1).png");
  expect(projectImageSource("knownext-asset://other/other%3A%3Aimage.png","project","Docs/Plan.md",tree)).toBe("knownext-asset://other/other%3A%3Aimage.png");
});
it("resolves a view URL without changing literal source, query or fragment",()=>{
  const source='../Assets/Plano%20(1).png?raw=1#vista';
  expect(projectImageSource(source,"project","Docs/Plan.md",tree)).toBe(contentUrl);
  expect(projectImageAsset(source,"project","Docs/Plan.md",tree)?.id).toBe("project::Assets/Plano (1).png");
  expect(source).toBe('../Assets/Plano%20(1).png?raw=1#vista');
});
it("does not clamp traversal, absolute or malformed paths to a project image",()=>{
  for(const source of ['../../Assets/Plano%20(1).png','/Assets/Plano%20(1).png','C:/Assets/Plano%20(1).png','%E0%A4%A.png']){
    expect(projectImageAsset(source,"project","Docs/Plan.md",tree)).toBeNull();
    expect(projectImageSource(source,"project","Docs/Plan.md",tree)).toBe(source);
  }
});
it("keeps external URLs and never identifies another project as a local asset",()=>{
  for(const source of ['https://example.com/Plano.png','data:image/png;base64,AA==',getProjectImageContentUrl('other','other::Assets/Plano (1).png')]){
    expect(projectImageSource(source,"project","Docs/Plan.md",tree)).toBe(source);
    expect(projectImageAsset(source,"project","Docs/Plan.md",tree)).toBeNull();
  }
  expect(projectImageAsset(contentUrl,"project","Docs/Plan.md",tree)?.id).toBe(tree[0].children![0].id);
});
