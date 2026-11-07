export type WorkspaceNodeFocus={kind:"handwritten-page";pageId:string}|{kind:"pdf-page";pageNumber:number};
export type HandwrittenPageFocus={noteId:string;pageId:string;requestId:number};
export type LocalSearchResult = { documentId: string; name: string; path: string; line: number; excerpt: string; kind?:"document"|"handwritten-note"|"attachment";pageId?:string;pageNumber?:number };
export type LocalSearchResponse = { projectId: string; query: string; searchedAt: string; results: LocalSearchResult[]; scannedDocuments: number; limited: boolean; warnings: string[]; notesWithoutText?:number;attachmentsWithoutText?:number;index?:{mode:"verified-memory";reusedDocuments:number;updatedDocuments:number;readBytes:number;elapsedMs:number} };
