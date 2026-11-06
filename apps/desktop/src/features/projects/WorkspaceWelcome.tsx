import { ArrowRight, FileText, FolderOpen } from "lucide-react";

export function WorkspaceWelcome({ onCreateProject, onUseNotes,language="es" }: { onCreateProject: () => void; onUseNotes: () => void;language?:"es"|"en" }) {
  const t=(es:string,en:string)=>language==="en"?en:es;
  return <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto bg-white px-6 py-8">
    <section className="w-full max-w-lg" aria-labelledby="workspace-welcome-title">
      <div aria-hidden="true" className="mb-7 flex items-end gap-2 text-brand-orange"><span className="h-9 w-9 rounded-full bg-current"/><span className="h-14 w-4 bg-current opacity-35"/></div>
      <p className="mb-3 text-xs font-medium tracking-wide text-ink-secondary">{t('TU ESPACIO DE DOCUMENTACIÓN','YOUR DOCUMENTATION WORKSPACE')}</p>
      <h1 id="workspace-welcome-title" className="text-3xl font-semibold leading-tight tracking-tight text-ink-primary">{t('Las ideas empiezan aquí.','Ideas start here.')}</h1>
      <p className="mt-4 max-w-md text-sm leading-6 text-ink-secondary">{t('Organiza tus documentos en proyectos o empieza con una nota personal. Puedes escribir y guardar en este dispositivo sin conexión ni cuenta.','Organize documents in projects or start with a personal note. Write and save on this device without a connection or an account.')}</p>
      <div className="mt-7 flex flex-col items-stretch gap-3 sm:items-start">
        <button type="button" onClick={onCreateProject} className="flex min-h-11 items-center justify-center gap-3 rounded-md bg-brand-orange px-4 py-3 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-orange"><FolderOpen size={18}/>{t('Crear o abrir un proyecto','Create or open a project')}<ArrowRight size={16}/></button>
        <button type="button" onClick={onUseNotes} className="flex min-h-11 items-center gap-3 rounded-md px-4 py-3 text-sm text-ink-primary hover:bg-panel focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-orange"><FileText size={18}/>{t('Usar notas personales','Use personal notes')}</button>
      </div>
      <p className="mt-7 text-xs leading-5 text-ink-secondary">{t('GitHub y la asistencia de IA son opcionales. Podrás configurarlos cuando los necesites.','GitHub and AI assistance are optional. Set them up when you need them.')}</p>
    </section>
  </div>;
}
