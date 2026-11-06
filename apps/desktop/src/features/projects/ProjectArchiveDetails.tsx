import type {ProjectArchiveSummary} from "../../types/projectTransfer";

export function ProjectArchiveDetails({summary}:{summary:ProjectArchiveSummary}) {
  return <section aria-label="Archivo privado incluido" className="rounded bg-panel p-3 text-xs leading-5">
    <h4 className="font-medium">Archivo privado incluido</h4>
    <p>{summary.drafts} {summary.drafts === 1 ? "borrador" : "borradores"} · {summary.recordingSessions} {summary.recordingSessions === 1 ? "sesión de audio" : "sesiones de audio"} · {summary.history ? "historial conservado" : "sin historial guardado"} · preferencias visuales</p>
    {!!summary.retainedFiles&&<p className="mt-2 font-medium">Conserva además {summary.retainedFiles} archivos del archivo privado anterior. Sus metadatos originales quedan en «Anteriores»; las copias nuevas, en una carpeta «Actual» distinta.</p>}
    <p className="mt-2">Al importar, encontrarás las copias en «{summary.directory}». Los borradores tienen versión editable y original; el audio, partes WAV reproducibles; el historial, partes verificadas de un archivo Git.</p>
    <details className="mt-1"><summary className="flex min-h-11 cursor-pointer items-center font-medium">Qué se activa al importar</summary><p>Se crea un proyecto nuevo con sus archivos. Las copias del archivo privado quedan como datos: no se activa el historial, no se aplican preferencias globales y no se inician transcripciones ni envíos. El inventario explica cómo reconstruir las partes.</p><p className="mt-2">No incluye cambios aún sin persistir en el editor, sesiones sin proyecto asignado, papelera, copias de conflictos ni todo el perfil de la aplicación. Las preferencias incluyen idioma, aspecto y anchura de paneles compatibles; excluyen IA, dispositivos y credenciales.</p></details>
  </section>;
}
