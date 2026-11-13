import { ArrowLeft, Mic, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Search } from "lucide-react";
import type { ReactNode, RefObject } from "react";

type WorkspaceControlsProps = {
  settings: boolean;
  projectName?: string;
  navigationOpen: boolean;
  contextOpen: boolean;
  navigationRef: RefObject<HTMLButtonElement>;
  contextRef: RefObject<HTMLButtonElement>;
  onNavigation: () => void;
  onContext: () => void;
  onBack?: () => void;
  onSearch: () => void;
  onRecordings: () => void;
  tabs?: ReactNode;
};

/** Permanent controls keep the same order and footprint on both workspace surfaces. */
export function WorkspaceControls(props: WorkspaceControlsProps) {
  return <nav className="workspace-panel-controls" aria-label="Paneles de trabajo">
    <button className="workspace-control" ref={props.navigationRef} aria-label="Alternar navegación" title={props.navigationOpen ? "Ocultar navegación" : "Mostrar navegación"} aria-expanded={props.navigationOpen} onClick={props.onNavigation}>
      {props.navigationOpen ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}
    </button>
    <div className="workspace-tabs">
      {props.settings ? <button className="workspace-back" aria-label="Volver al documento" onClick={props.onBack}><ArrowLeft size={16}/><span>Volver al documento</span></button> : props.tabs ?? <span className="workspace-title">{props.projectName}</span>}
    </div>
    <button className="workspace-control" aria-label="Acceso rápido" title="Acceso rápido · Ctrl/Cmd Shift P" onClick={props.onSearch}><Search size={17}/></button>
    <button className="workspace-control" aria-label="Abrir Grabaciones" title="Grabaciones" onClick={props.onRecordings}><Mic size={17}/></button>
    <button className="workspace-control" ref={props.contextRef} aria-label="Alternar contexto" title={props.contextOpen ? "Ocultar contexto" : "Mostrar contexto"} aria-expanded={props.contextOpen} onClick={props.onContext}>
      {props.contextOpen ? <PanelRightClose size={17}/> : <PanelRightOpen size={17}/>}
    </button>
  </nav>;
}
