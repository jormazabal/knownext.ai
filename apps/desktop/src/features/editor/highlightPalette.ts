/** Visual values shared with the toolbar, independent of the editor runtime. */
export type MarkdownHighlightColorId = "yellow" | "green" | "blue" | "pink" | "orange";
export const markdownHighlightColors:Array<{id:MarkdownHighlightColorId;label:string;background:string;border:string}>=[
  {id:"yellow",label:"Amarillo",background:"#FEF08A",border:"#EAB308"},
  {id:"green",label:"Verde",background:"#BBF7D0",border:"#22C55E"},
  {id:"blue",label:"Azul",background:"#BFDBFE",border:"#3B82F6"},
  {id:"pink",label:"Rosa",background:"#FBCFE8",border:"#EC4899"},
  {id:"orange",label:"Naranja",background:"#FED7AA",border:"#F97316"},
];
export const defaultMarkdownHighlightColor:MarkdownHighlightColorId="yellow";
const highlightColorIds=new Set<MarkdownHighlightColorId>(markdownHighlightColors.map(color=>color.id));
export function normalizeMarkdownHighlightColor(value:unknown):MarkdownHighlightColorId{
  return typeof value==="string"&&highlightColorIds.has(value as MarkdownHighlightColorId)?value as MarkdownHighlightColorId:defaultMarkdownHighlightColor;
}
export function markdownHighlightColorValue(color:unknown){
  return markdownHighlightColors.find(item=>item.id===normalizeMarkdownHighlightColor(color))?.background??markdownHighlightColors[0].background;
}
