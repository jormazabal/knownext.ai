import {
  Bold,
  CheckSquare,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  History,
  Image,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Table,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { MouseEvent } from "react";
import type { MarkdownEditorAction, MarkdownEditorFormatState } from "./editorCommands";

const leftTools = [
  { label: "Texto normal", icon: Pilcrow, action: "paragraph" },
  { label: "H1", icon: Heading1, action: "heading-1" },
  { label: "H2", icon: Heading2, action: "heading-2" },
  { label: "H3", icon: Heading3, action: "heading-3" },
  { label: "Negrita", icon: Bold, action: "bold" },
  { label: "Cursiva", icon: Italic, action: "italic" },
  { label: "Tachado", icon: Strikethrough, action: "strike" },
  { label: "Borrar formato", icon: RemoveFormatting, action: "clear-format" },
  { label: "Lista con viñetas", icon: List, action: "bullet-list" },
  { label: "Lista numerada", icon: ListOrdered, action: "ordered-list" },
  { label: "Checklist", icon: CheckSquare, action: "check-list" },
  { label: "Tabla", icon: Table, action: "table" },
  { label: "Código", icon: Code2, action: "code" },
  { label: "Enlace", icon: Link, action: "link" },
  { label: "Imagen", icon: Image, action: "image" },
  { label: "Cita", icon: Quote, action: "quote" },
  { label: "Separador horizontal", icon: Minus, action: "horizontal-rule" },
] satisfies Array<{ label: string; icon: LucideIcon; action: MarkdownEditorAction }>;

type MarkdownToolbarProps = {
  historyOpen: boolean;
  historyEnabled: boolean;
  editorReady: boolean;
  activeActions: MarkdownEditorFormatState;
  onRunEditorAction: (action: MarkdownEditorAction) => void;
  onToggleHistory: () => void;
};

export function MarkdownToolbar({
  historyOpen,
  historyEnabled,
  editorReady,
  activeActions,
  onRunEditorAction,
  onToggleHistory,
}: MarkdownToolbarProps) {
  function keepEditorSelection(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  return (
    <div className="flex h-[58px] shrink-0 items-center border-b border-line bg-white px-7">
      <div className="flex items-center gap-2">
        {leftTools.map((tool, index) => {
          const active = Boolean(activeActions[tool.action]);

          return (
            <div key={tool.label} className="flex items-center gap-2">
              <button
                className={`toolbar-button ${active ? "toolbar-button-active" : ""} ${editorReady ? "" : "opacity-40"}`}
                data-tooltip={tool.label}
                aria-label={tool.label}
                aria-pressed={active}
                disabled={!editorReady}
                onMouseDown={keepEditorSelection}
                onClick={() => onRunEditorAction(tool.action)}
              >
                <tool.icon size={18} />
              </button>
              {[3, 7, 10, 12, 16].includes(index) ? <span className="mx-1 h-7 border-l border-line" /> : null}
            </div>
          );
        })}
        <button
          className={`toolbar-button ml-1 ${historyOpen ? "border-brand-orange text-brand-orange" : ""} ${historyEnabled ? "" : "opacity-40"}`}
          data-tooltip={historyEnabled ? "Histórico de versiones" : "Historial no disponible: la carpeta no está asociada a Git"}
          aria-label="Histórico de versiones"
          onMouseDown={keepEditorSelection}
          onClick={historyEnabled ? onToggleHistory : undefined}
          disabled={!historyEnabled}
        >
          <History size={18} />
        </button>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <button
          className={`toolbar-button ${editorReady ? "" : "opacity-40"}`}
          data-tooltip="Deshacer"
          aria-label="Deshacer"
          disabled={!editorReady}
          onMouseDown={keepEditorSelection}
          onClick={() => onRunEditorAction("undo")}
        >
          <Undo2 size={18} />
        </button>
        <button
          className={`toolbar-button ${editorReady ? "" : "opacity-40"}`}
          data-tooltip="Rehacer"
          aria-label="Rehacer"
          disabled={!editorReady}
          onMouseDown={keepEditorSelection}
          onClick={() => onRunEditorAction("redo")}
        >
          <Redo2 size={18} />
        </button>
      </div>
    </div>
  );
}
