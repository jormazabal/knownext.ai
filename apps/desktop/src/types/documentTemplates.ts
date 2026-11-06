export type DocumentTemplateSummary = {
  id: string;
  name: string;
  description: string;
  variables: string[];
  revision: string;
  builtIn: boolean;
  createdAt: string | null;
  resourceCount?: number;
  resourceBytes?: number;
};
export type DocumentTemplateAttachment={path:string;name:string;mimeType:string;sha256:string;byteLength:number;dataBase64:string};
export type DocumentTemplateResourceSummary={path:string;name:string;mimeType:string;sha256:string;bytes:number};
export type DocumentTemplate = DocumentTemplateSummary & {markdown:string;schemaVersion?:1|2;resources?:DocumentTemplateAttachment[]};
export type DocumentTemplateInventory = {
  templates: DocumentTemplateSummary[];
  complete: boolean;
  warnings: { message: string }[];
  scannedEntries: number;
  scannedBytes: number;
};
export type TemplateRenderRequest = {
  projectId: string;
  name: string;
  revision: string;
  values: Record<string, string>;
  parentId?: string | null;
  projectRootHash?: string;
  localDate?: string;
};
export type DocumentTemplatePreview = {
  templateId: string;
  revision: string;
  markdown: string;
  values: Record<string, string>;
  name: string;
  projectRootHash: string;
  resources?:DocumentTemplateResourceSummary[];
};
export type DocumentTemplateTransferFile = { fileName: string; content: string; digest: string; byteLength: number };
export type DocumentTemplateTransferReview = { name: string; description: string; markdown: string; variables: string[]; digest: string; byteLength: number;resources?:DocumentTemplateResourceSummary[];catalog?:DocumentTemplateCatalogEntry[] };
export type DocumentTemplateTransferReceipt = { status: "saved" | "cancelled" | "download-requested"; fileName?: string; byteLength?: number; completedAt?: string; requestId?: string };
export type DocumentTemplateSource = {attachments?:DocumentTemplateAttachment[];markdown:string;digest:string;preparedAt:string;resources:Array<{path:string;bytes:number;sha256:string;mimeType:string;width:number;height:number}>};
export type DocumentTemplateCatalogEntry={index:number;name:string;description:string;markdown:string;variables:string[];resources?:DocumentTemplateResourceSummary[]};
export type TemplateCatalogSelection=Array<{index:number;name:string}>;
export type TemplateCatalogExportSelection=Array<{id:string;revision:string}>;
export type TemplateCatalogResult={id:string;checkedAt:string;applied:boolean;digest:string;outcomes:Array<{index:number;name:string;status:"new"|"existing"|"conflict"|"blocked"|"imported"|"unconfirmed";message:string;template:DocumentTemplate|null}>};
