import {
  Bold,
  CheckSquare,
  Code2,
  ChevronDown,
  Download,
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
  MoreHorizontal,
  Pilcrow,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Table,
  Undo2,
  Underline,
  Workflow,
  ZoomIn,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { MarkdownEditorAction, MarkdownEditorActionOptions, MarkdownEditorFormatState, MarkdownEditorHistoryState } from "./editorTypes";
import type { ExportFormat } from "../../types/domain";

type ToolbarAction = {
  label: string;
  compactLabel?: string;
  icon: LucideIcon;
  action: MarkdownEditorAction;
  extended?: boolean;
  options?: MarkdownEditorActionOptions;
};

const blockFormats = [
  { label: "Normal", action: "paragraph", icon: Pilcrow },
  { label: "Título 1", action: "heading-1", icon: Heading1 },
  { label: "Título 2", action: "heading-2", icon: Heading2 },
  { label: "Título 3", action: "heading-3", icon: Heading3 },
  { label: "Título 4", action: "heading-4", icon: Heading3 },
  { label: "Título 5", action: "heading-5", icon: Heading3 },
  { label: "Título 6", action: "heading-6", icon: Heading3 },
] satisfies Array<{ label: string; action: MarkdownEditorAction; icon: LucideIcon }>;

const primaryInlineTools = [
  { label: "Negrita", icon: Bold, action: "bold" },
  { label: "Cursiva", icon: Italic, action: "italic" },
] satisfies ToolbarAction[];

const secondaryInlineTools = [
  { label: "Tachado", icon: Strikethrough, action: "strike" },
  { label: "Subrayado", compactLabel: "Subrayado HTML", icon: Underline, action: "underline", extended: true },
  { label: "Código inline", icon: Code2, action: "inline-code" },
  { label: "Borrar formato", icon: RemoveFormatting, action: "clear-format" },
] satisfies ToolbarAction[];

const structureTools = [
  { label: "Lista con viñetas", compactLabel: "Viñetas", icon: List, action: "bullet-list" },
  { label: "Lista numerada", compactLabel: "Numerada", icon: ListOrdered, action: "ordered-list" },
  { label: "Checklist", icon: CheckSquare, action: "check-list" },
  { label: "Cita", icon: Quote, action: "quote" },
  { label: "Bloque de código", icon: Code2, action: "code-block" },
  { label: "Separador horizontal", compactLabel: "Separador", icon: Minus, action: "horizontal-rule" },
] satisfies ToolbarAction[];

const insertionTools = [
  { label: "Enlace", icon: Link, action: "link" },
  { label: "Imagen", icon: Image, action: "image" },
  { label: "Diagrama", icon: Workflow, action: "diagram" },
] satisfies ToolbarAction[];

const markdownZoomOptions = [80, 90, 100, 110, 125, 150];

type MarkdownToolbarProps = {
  historyOpen: boolean;
  historyEnabled: boolean;
  historyDisabledReason: string;
  editorReady: boolean;
  extendedUnderlineEnabled?: boolean;
  markdownZoomPercent: number;
  activeActions: MarkdownEditorFormatState;
  editorHistoryState: MarkdownEditorHistoryState;
  imageInsertionEnabled?: boolean;
  diagramInsertionEnabled?: boolean;
  documentActionsEnabled?: boolean;
  onRunEditorAction: (action: MarkdownEditorAction, options?: MarkdownEditorActionOptions) => void;
  onExportDocument: (format: ExportFormat) => void;
  onMarkdownZoomChange: (zoomPercent: number) => void;
  onToggleHistory: () => void;
};

export function MarkdownToolbar({
  historyOpen,
  historyEnabled,
  historyDisabledReason,
  editorReady,
  extendedUnderlineEnabled = true,
  markdownZoomPercent,
  activeActions,
  editorHistoryState,
  imageInsertionEnabled = true,
  diagramInsertionEnabled = true,
  documentActionsEnabled = true,
  onRunEditorAction,
  onExportDocument,
  onMarkdownZoomChange,
  onToggleHistory,
}: MarkdownToolbarProps) {
  const [openMenu, setOpenMenu] = useState<"block" | "format" | "structure" | "insert" | "table" | "export" | "zoom" | null>(null);
  const [compactOptionsOpen, setCompactOptionsOpen] = useState(false);
  const [hoveredTableSize, setHoveredTableSize] = useState({ rows: 3, columns: 4 });
  const compactToolbar = useCompactToolbarMode();
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenu) return;

    function closeOnPointerDown(event: PointerEvent) {
      if (toolbarRef.current?.contains(event.target as Node)) return;
      setOpenMenu(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenMenu(null);
        setCompactOptionsOpen(false);
      }
    }

    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!compactOptionsOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setCompactOptionsOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [compactOptionsOpen]);

  const visibleSecondaryInlineTools = secondaryInlineTools.filter((tool) => !tool.extended || extendedUnderlineEnabled);
  const currentBlockFormat = blockFormats.find((format) => activeActions[format.action]) ?? blockFormats[0];

  function keepEditorSelection(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  function runAction(action: MarkdownEditorAction, options?: MarkdownEditorActionOptions) {
    setOpenMenu(null);
    setCompactOptionsOpen(false);
    if (options) {
      onRunEditorAction(action, options);
      return;
    }
    onRunEditorAction(action);
  }

  function toggleMenu(menu: typeof openMenu, event: MouseEvent<HTMLButtonElement>) {
    keepEditorSelection(event);
    setOpenMenu((currentMenu) => (currentMenu === menu ? null : menu));
  }

  function openCompactOptions(event: MouseEvent<HTMLButtonElement>) {
    keepEditorSelection(event);
    setOpenMenu(null);
    setCompactOptionsOpen(true);
  }

  if (compactToolbar) {
    return (
      <div ref={toolbarRef} className="knownext-editor-toolbar knownext-editor-toolbar-compact flex h-9 shrink-0 items-center gap-1 border-b border-line bg-white px-2">
        <BlockFormatSelect
          currentBlockFormat={currentBlockFormat}
          activeActions={activeActions}
          editorReady={editorReady}
          open={openMenu === "block"}
          onMouseDown={keepEditorSelection}
          onToggle={(event) => toggleMenu("block", event)}
          onRun={(action) => runAction(action)}
        />

        <ToolbarIconButton
          tool={primaryInlineTools[0]}
          active={Boolean(activeActions[primaryInlineTools[0].action])}
          disabled={!editorReady}
          onMouseDown={keepEditorSelection}
          onRun={() => runAction(primaryInlineTools[0].action)}
        />
        <ToolbarIconButton
          tool={primaryInlineTools[1]}
          active={Boolean(activeActions[primaryInlineTools[1].action])}
          disabled={!editorReady}
          onMouseDown={keepEditorSelection}
          onRun={() => runAction(primaryInlineTools[1].action)}
        />
        <ToolbarMenuButton
          label="Más opciones"
          icon={MoreHorizontal}
          disabled={!editorReady}
          expanded={compactOptionsOpen}
          onMouseDown={keepEditorSelection}
          onClick={openCompactOptions}
        />

        <ToolbarHistoryActions
          editorReady={editorReady}
          editorHistoryState={editorHistoryState}
          onMouseDown={keepEditorSelection}
          onRun={runAction}
        />

        {compactOptionsOpen ? (
          <CompactToolbarOptionsDialog
            activeActions={activeActions}
            editorReady={editorReady}
            historyOpen={historyOpen}
            historyEnabled={historyEnabled}
            historyDisabledReason={historyDisabledReason}
            markdownZoomPercent={markdownZoomPercent}
            imageInsertionEnabled={imageInsertionEnabled}
            diagramInsertionEnabled={diagramInsertionEnabled}
            documentActionsEnabled={documentActionsEnabled}
            visibleSecondaryInlineTools={visibleSecondaryInlineTools}
            onClose={() => setCompactOptionsOpen(false)}
            onRunAction={runAction}
            onExportDocument={(format) => {
              setCompactOptionsOpen(false);
              onExportDocument(format);
            }}
            onMarkdownZoomChange={(zoomPercent) => {
              setCompactOptionsOpen(false);
              onMarkdownZoomChange(zoomPercent);
            }}
            onToggleHistory={() => {
              setCompactOptionsOpen(false);
              onToggleHistory();
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div ref={toolbarRef} className="knownext-editor-toolbar flex h-9 shrink-0 items-center gap-1 border-b border-line bg-white px-3">
      <BlockFormatSelect
        currentBlockFormat={currentBlockFormat}
        activeActions={activeActions}
        editorReady={editorReady}
        open={openMenu === "block"}
        onMouseDown={keepEditorSelection}
        onToggle={(event) => toggleMenu("block", event)}
        onRun={(action) => runAction(action)}
      />

      <ToolbarDivider />

      <ToolbarActionGroup>
        {primaryInlineTools.map((tool) => (
          <ToolbarIconButton
            key={tool.action}
            tool={tool}
            active={Boolean(activeActions[tool.action])}
            disabled={!editorReady}
            onMouseDown={keepEditorSelection}
            onRun={() => runAction(tool.action)}
          />
        ))}
        <div className="knownext-toolbar-wide-group flex items-center gap-0.5">
          {visibleSecondaryInlineTools.map((tool) => (
            <ToolbarIconButton
              key={tool.action}
              tool={tool}
              active={Boolean(activeActions[tool.action])}
              disabled={!editorReady}
              onMouseDown={keepEditorSelection}
              onRun={() => runAction(tool.action)}
            />
          ))}
        </div>
        <div className="knownext-toolbar-compact-menu relative">
          <ToolbarMenuButton
            label="Formato"
            icon={MoreHorizontal}
            disabled={!editorReady}
            expanded={openMenu === "format"}
            onMouseDown={keepEditorSelection}
            onClick={(event) => toggleMenu("format", event)}
          />
          {openMenu === "format" ? (
            <ToolbarMenu align="left">
              {visibleSecondaryInlineTools.map((tool) => (
                <MenuAction
                  key={tool.action}
                  action={tool}
                  active={Boolean(activeActions[tool.action])}
                  onRun={() => runAction(tool.action)}
                />
              ))}
            </ToolbarMenu>
          ) : null}
        </div>
      </ToolbarActionGroup>

      <ToolbarDivider />

      <ToolbarActionGroup>
        <ToolbarIconButton
          tool={structureTools[0]}
          active={Boolean(activeActions[structureTools[0].action])}
          disabled={!editorReady}
          onMouseDown={keepEditorSelection}
          onRun={() => runAction(structureTools[0].action)}
        />
        <div className="knownext-toolbar-wide-group flex items-center gap-0.5">
          {structureTools.slice(1).map((tool) => (
            <ToolbarIconButton
              key={tool.action}
              tool={tool}
              active={Boolean(activeActions[tool.action])}
              disabled={!editorReady}
              onMouseDown={keepEditorSelection}
              onRun={() => runAction(tool.action)}
            />
          ))}
        </div>
        <div className="knownext-toolbar-compact-menu relative">
          <ToolbarMenuButton
            label="Estructura"
            icon={MoreHorizontal}
            disabled={!editorReady}
            expanded={openMenu === "structure"}
            onMouseDown={keepEditorSelection}
            onClick={(event) => toggleMenu("structure", event)}
          />
          {openMenu === "structure" ? (
            <ToolbarMenu align="left">
              {structureTools.slice(1).map((tool) => (
                <MenuAction
                  key={tool.action}
                  action={tool}
                  active={Boolean(activeActions[tool.action])}
                  onRun={() => runAction(tool.action)}
                />
              ))}
            </ToolbarMenu>
          ) : null}
        </div>
      </ToolbarActionGroup>

      <ToolbarDivider />

      <ToolbarActionGroup>
        <ToolbarIconButton
          tool={insertionTools[0]}
          active={Boolean(activeActions[insertionTools[0].action])}
          disabled={!editorReady}
          onMouseDown={keepEditorSelection}
          onRun={() => runAction(insertionTools[0].action)}
        />
        <div className="knownext-toolbar-wide-group flex items-center gap-0.5">
          {imageInsertionEnabled ? (
            <ToolbarIconButton
              tool={insertionTools[1]}
              active={Boolean(activeActions[insertionTools[1].action])}
              disabled={!editorReady}
              onMouseDown={keepEditorSelection}
              onRun={() => runAction(insertionTools[1].action)}
            />
          ) : null}
          {diagramInsertionEnabled ? (
            <ToolbarIconButton
              tool={insertionTools[2]}
              active={Boolean(activeActions[insertionTools[2].action])}
              disabled={!editorReady}
              onMouseDown={keepEditorSelection}
              onRun={() => runAction(insertionTools[2].action)}
            />
          ) : null}
        </div>
        <div className="relative">
          <ToolbarMenuButton
            label="Tabla"
            icon={Table}
            disabled={!editorReady}
            expanded={openMenu === "table"}
            onMouseDown={keepEditorSelection}
            onClick={(event) => toggleMenu("table", event)}
          />
          {openMenu === "table" ? (
            <TablePicker
              rows={hoveredTableSize.rows}
              columns={hoveredTableSize.columns}
              onHover={setHoveredTableSize}
              onInsert={(rows, columns) => runAction("table", { table: { rows, columns } })}
            />
          ) : null}
        </div>
        <div className="knownext-toolbar-compact-menu relative">
          <ToolbarMenuButton
            label="Insertar"
            icon={MoreHorizontal}
            disabled={!editorReady}
            expanded={openMenu === "insert"}
            onMouseDown={keepEditorSelection}
            onClick={(event) => toggleMenu("insert", event)}
          />
          {openMenu === "insert" ? (
            <ToolbarMenu align="right">
              {imageInsertionEnabled ? <MenuAction action={insertionTools[1]} active={false} onRun={() => runAction("image")} /> : null}
              {diagramInsertionEnabled ? <MenuAction action={insertionTools[2]} active={false} onRun={() => runAction("diagram")} /> : null}
              <MenuAction action={structureTools[5]} active={false} onRun={() => runAction("horizontal-rule")} />
            </ToolbarMenu>
          ) : null}
        </div>
        {documentActionsEnabled ? (
          <>
            <button
              className={`toolbar-button knownext-history-button ml-1 ${historyOpen ? "border-brand-orange text-brand-orange" : ""} ${historyEnabled ? "" : "opacity-40"}`}
              data-tooltip={historyEnabled ? "Histórico de versiones" : historyDisabledReason}
              aria-label="Histórico de versiones"
              onMouseDown={keepEditorSelection}
              onClick={historyEnabled ? onToggleHistory : undefined}
              disabled={!historyEnabled}
            >
              <History size={15} />
            </button>
            <div className="knownext-document-export-menu relative">
              <ToolbarMenuButton
                label="Exportar documento"
                icon={Download}
                disabled={!editorReady}
                expanded={openMenu === "export"}
                onMouseDown={keepEditorSelection}
                onClick={(event) => toggleMenu("export", event)}
              />
              {openMenu === "export" ? (
                <ToolbarMenu align="right">
                  <ExportMenuAction label="Markdown (.md)" format="md" onRun={(format) => {
                    setOpenMenu(null);
                    onExportDocument(format);
                  }} />
                  <ExportMenuAction label="PDF (.pdf)" format="pdf" onRun={(format) => {
                    setOpenMenu(null);
                    onExportDocument(format);
                  }} />
                  <ExportMenuAction label="Word (.docx)" format="docx" onRun={(format) => {
                    setOpenMenu(null);
                    onExportDocument(format);
                  }} />
                </ToolbarMenu>
              ) : null}
            </div>
          </>
        ) : null}
      </ToolbarActionGroup>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <div className="relative shrink-0">
          <button
            className="toolbar-select knownext-markdown-zoom-select"
            aria-label="Zoom del visualizador Markdown"
            aria-haspopup="menu"
            aria-expanded={openMenu === "zoom"}
            onMouseDown={keepEditorSelection}
            onClick={(event) => toggleMenu("zoom", event)}
          >
            <ZoomIn size={13} />
            <span className="toolbar-select-label">{markdownZoomPercent}%</span>
            <ChevronDown size={13} />
          </button>
          {openMenu === "zoom" ? (
            <ToolbarMenu align="right">
              {markdownZoomOptions.map((zoomPercent) => (
                <ZoomMenuAction
                  key={zoomPercent}
                  zoomPercent={zoomPercent}
                  active={zoomPercent === markdownZoomPercent}
                  onRun={() => {
                    setOpenMenu(null);
                    onMarkdownZoomChange(zoomPercent);
                  }}
                />
              ))}
            </ToolbarMenu>
          ) : null}
        </div>
        <ToolbarHistoryActions
          editorReady={editorReady}
          editorHistoryState={editorHistoryState}
          onMouseDown={keepEditorSelection}
          onRun={runAction}
        />
      </div>
    </div>
  );
}

function BlockFormatSelect({
  currentBlockFormat,
  activeActions,
  editorReady,
  open,
  onMouseDown,
  onToggle,
  onRun,
}: {
  currentBlockFormat: { label: string };
  activeActions: MarkdownEditorFormatState;
  editorReady: boolean;
  open: boolean;
  onMouseDown: (event: MouseEvent<HTMLButtonElement>) => void;
  onToggle: (event: MouseEvent<HTMLButtonElement>) => void;
  onRun: (action: MarkdownEditorAction) => void;
}) {
  return (
    <div className="relative shrink-0">
      <button
        className={`toolbar-select ${editorReady ? "" : "opacity-40"}`}
        aria-label="Formato de bloque"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={!editorReady}
        onMouseDown={onMouseDown}
        onClick={onToggle}
      >
        <span className="toolbar-select-label">{currentBlockFormat.label}</span>
        <ChevronDown size={13} />
      </button>
      {open ? (
        <ToolbarMenu align="left">
          {blockFormats.map((format) => (
            <BlockMenuAction
              key={format.action}
              action={format}
              active={Boolean(activeActions[format.action])}
              onRun={() => onRun(format.action)}
            />
          ))}
        </ToolbarMenu>
      ) : null}
    </div>
  );
}

function ToolbarHistoryActions({
  editorReady,
  editorHistoryState,
  onMouseDown,
  onRun,
}: {
  editorReady: boolean;
  editorHistoryState: MarkdownEditorHistoryState;
  onMouseDown: (event: MouseEvent<HTMLButtonElement>) => void;
  onRun: (action: MarkdownEditorAction) => void;
}) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1">
      <span
        className="inline-grid rounded-md focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-brand-orange"
        data-tooltip={editorHistoryState.canUndo ? "Deshacer" : "No hay cambios para deshacer"}
        tabIndex={editorReady && editorHistoryState.canUndo ? -1 : 0}
      >
        <button
          className={`toolbar-button ${editorReady && editorHistoryState.canUndo ? "" : "pointer-events-none opacity-40"}`}
          aria-label="Deshacer"
          disabled={!editorReady || !editorHistoryState.canUndo}
          onMouseDown={onMouseDown}
          onClick={() => onRun("undo")}
        >
          <Undo2 size={15} />
        </button>
      </span>
      <span
        className="inline-grid rounded-md focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-brand-orange"
        data-tooltip={editorHistoryState.canRedo ? "Rehacer" : "No hay cambios para rehacer"}
        tabIndex={editorReady && editorHistoryState.canRedo ? -1 : 0}
      >
        <button
          className={`toolbar-button ${editorReady && editorHistoryState.canRedo ? "" : "pointer-events-none opacity-40"}`}
          aria-label="Rehacer"
          disabled={!editorReady || !editorHistoryState.canRedo}
          onMouseDown={onMouseDown}
          onClick={() => onRun("redo")}
        >
          <Redo2 size={15} />
        </button>
      </span>
    </div>
  );
}

function CompactToolbarOptionsDialog({
  activeActions,
  editorReady,
  historyOpen,
  historyEnabled,
  historyDisabledReason,
  markdownZoomPercent,
  imageInsertionEnabled,
  diagramInsertionEnabled,
  documentActionsEnabled,
  visibleSecondaryInlineTools,
  onClose,
  onRunAction,
  onExportDocument,
  onMarkdownZoomChange,
  onToggleHistory,
}: {
  activeActions: MarkdownEditorFormatState;
  editorReady: boolean;
  historyOpen: boolean;
  historyEnabled: boolean;
  historyDisabledReason: string;
  markdownZoomPercent: number;
  imageInsertionEnabled: boolean;
  diagramInsertionEnabled: boolean;
  documentActionsEnabled: boolean;
  visibleSecondaryInlineTools: ToolbarAction[];
  onClose: () => void;
  onRunAction: (action: MarkdownEditorAction, options?: MarkdownEditorActionOptions) => void;
  onExportDocument: (format: ExportFormat) => void;
  onMarkdownZoomChange: (zoomPercent: number) => void;
  onToggleHistory: () => void;
}) {
  return (
    <div className="knownext-modal-overlay fixed inset-0 z-[90] flex items-center justify-center bg-black/20 px-4 py-6" role="presentation" onMouseDown={onClose}>
      <section
        className="flex max-h-[min(640px,calc(100dvh-48px))] w-[min(460px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-line bg-white shadow-menu"
        role="dialog"
        aria-modal="true"
        aria-labelledby="compact-toolbar-options-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
          <h2 id="compact-toolbar-options-title" className="text-[13px] font-semibold text-ink-primary">Opciones del editor</h2>
          <button className="grid h-8 w-8 place-items-center rounded-md text-ink-secondary hover:bg-brand-hover hover:text-brand-orange" aria-label="Cerrar opciones del editor" onClick={onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
          <CompactToolbarSection title="Formato">
            {visibleSecondaryInlineTools.map((tool) => (
              <CompactToolbarAction
                key={tool.action}
                action={tool}
                active={Boolean(activeActions[tool.action])}
                disabled={!editorReady}
                onRun={() => onRunAction(tool.action)}
              />
            ))}
          </CompactToolbarSection>

          <CompactToolbarSection title="Estructura">
            {structureTools.map((tool) => (
              <CompactToolbarAction
                key={tool.action}
                action={tool}
                active={Boolean(activeActions[tool.action])}
                disabled={!editorReady}
                onRun={() => onRunAction(tool.action)}
              />
            ))}
          </CompactToolbarSection>

          <CompactToolbarSection title="Insertar">
            <CompactToolbarAction
              action={insertionTools[0]}
              active={Boolean(activeActions[insertionTools[0].action])}
              disabled={!editorReady}
              onRun={() => onRunAction(insertionTools[0].action)}
            />
            {imageInsertionEnabled ? (
              <CompactToolbarAction
                action={insertionTools[1]}
                active={Boolean(activeActions[insertionTools[1].action])}
                disabled={!editorReady}
                onRun={() => onRunAction(insertionTools[1].action)}
              />
            ) : null}
            {diagramInsertionEnabled ? (
              <CompactToolbarAction
                action={insertionTools[2]}
                active={Boolean(activeActions[insertionTools[2].action])}
                disabled={!editorReady}
                onRun={() => onRunAction(insertionTools[2].action)}
              />
            ) : null}
            <CompactToolbarTablePicker disabled={!editorReady} onRun={(rows, columns) => onRunAction("table", { table: { rows, columns } })} />
          </CompactToolbarSection>

          {documentActionsEnabled ? (
            <CompactToolbarSection title="Documento">
              <button
                className={`flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-[12px] hover:bg-brand-hover ${historyOpen ? "bg-brand-hover text-brand-orange" : "text-ink-primary"} ${historyEnabled ? "" : "opacity-40"}`}
                disabled={!historyEnabled}
                title={historyEnabled ? undefined : historyDisabledReason}
                onMouseDown={(event) => event.preventDefault()}
                onClick={historyEnabled ? onToggleHistory : undefined}
              >
                <History size={16} />
                <span className="min-w-0 flex-1 truncate">Histórico de versiones</span>
              </button>
              <CompactExportAction label="Exportar Markdown (.md)" format="md" onRun={onExportDocument} />
              <CompactExportAction label="Exportar PDF (.pdf)" format="pdf" onRun={onExportDocument} />
              <CompactExportAction label="Exportar Word (.docx)" format="docx" onRun={onExportDocument} />
            </CompactToolbarSection>
          ) : null}

          <CompactToolbarSection title="Zoom">
            <div className="grid grid-cols-3 gap-2">
              {markdownZoomOptions.map((zoomPercent) => (
                <button
                  key={zoomPercent}
                  className={`h-9 rounded-md border text-[12px] font-semibold ${zoomPercent === markdownZoomPercent ? "border-brand-orange bg-brand-hover text-brand-orange" : "border-line text-ink-primary hover:bg-brand-hover"}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onMarkdownZoomChange(zoomPercent)}
                >
                  {zoomPercent}%
                </button>
              ))}
            </div>
          </CompactToolbarSection>
        </div>
      </section>
    </div>
  );
}

function CompactToolbarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase text-ink-secondary">{title}</h3>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </section>
  );
}

function CompactToolbarAction({
  action,
  active,
  disabled,
  onRun,
}: {
  action: ToolbarAction;
  active: boolean;
  disabled: boolean;
  onRun: () => void;
}) {
  return (
    <button
      className={`flex h-10 min-w-0 items-center gap-2 rounded-md border px-3 text-left text-[12px] font-medium ${active ? "border-brand-orange bg-brand-hover text-brand-orange" : "border-line text-ink-primary hover:bg-brand-hover"} ${disabled ? "opacity-40" : ""}`}
      disabled={disabled}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onRun}
    >
      <action.icon size={16} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{action.compactLabel ?? action.label}</span>
    </button>
  );
}

function CompactToolbarTablePicker({ disabled, onRun }: { disabled: boolean; onRun: (rows: number, columns: number) => void }) {
  const presets = [
    { label: "Tabla 2 x 2", rows: 2, columns: 2 },
    { label: "Tabla 3 x 4", rows: 3, columns: 4 },
  ];

  return (
    <>
      {presets.map((preset) => (
        <button
          key={preset.label}
          className={`flex h-10 min-w-0 items-center gap-2 rounded-md border border-line px-3 text-left text-[12px] font-medium text-ink-primary hover:bg-brand-hover ${disabled ? "opacity-40" : ""}`}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onRun(preset.rows, preset.columns)}
        >
          <Table size={16} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">{preset.label}</span>
        </button>
      ))}
    </>
  );
}

function CompactExportAction({ label, format, onRun }: { label: string; format: ExportFormat; onRun: (format: ExportFormat) => void }) {
  return (
    <button
      className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-line px-3 text-left text-[12px] font-medium text-ink-primary hover:bg-brand-hover"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onRun(format)}
    >
      <Download size={16} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function ExportMenuAction({ label, format, onRun }: { label: string; format: ExportFormat; onRun: (format: ExportFormat) => void }) {
  return (
    <button
      className="flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] text-ink-primary hover:bg-brand-hover"
      role="menuitem"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onRun(format)}
    >
      <Download size={14} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}

function ToolbarActionGroup({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 shrink-0 items-center gap-0.5">{children}</div>;
}

function ToolbarDivider() {
  return <span className="knownext-toolbar-divider mx-1 h-5 shrink-0 border-l border-line" />;
}

function ToolbarIconButton({
  tool,
  active,
  disabled,
  onMouseDown,
  onRun,
}: {
  tool: ToolbarAction;
  active: boolean;
  disabled: boolean;
  onMouseDown: (event: MouseEvent<HTMLButtonElement>) => void;
  onRun: () => void;
}) {
  return (
    <button
      className={`toolbar-button ${active ? "toolbar-button-active" : ""} ${disabled ? "opacity-40" : ""}`}
      data-tooltip={tool.label}
      aria-label={tool.label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={onMouseDown}
      onClick={onRun}
    >
      <tool.icon size={15} />
    </button>
  );
}

function ToolbarMenuButton({
  label,
  icon: Icon,
  disabled,
  expanded,
  onMouseDown,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  disabled: boolean;
  expanded: boolean;
  onMouseDown: (event: MouseEvent<HTMLButtonElement>) => void;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      className={`toolbar-button ${expanded ? "toolbar-button-active" : ""} ${disabled ? "opacity-40" : ""}`}
      data-tooltip={label}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={expanded}
      disabled={disabled}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      <Icon size={15} />
    </button>
  );
}

function ToolbarMenu({ children, align }: { children: ReactNode; align: "left" | "right" }) {
  return (
    <div
      className={[
        "absolute top-8 z-[90] min-w-[178px] rounded-md border border-line bg-white p-1 shadow-menu",
        align === "right" ? "right-0" : "left-0",
      ].join(" ")}
      role="menu"
    >
      {children}
    </div>
  );
}

function MenuAction({
  action,
  active,
  onRun,
}: {
  action: { label: string; compactLabel?: string; icon: LucideIcon };
  active: boolean;
  onRun: () => void;
}) {
  return (
    <button
      className={`flex h-8 w-full items-center gap-2 rounded px-2 text-left text-[11px] hover:bg-brand-hover ${active ? "bg-brand-hover text-brand-orange" : "text-ink-primary"}`}
      role="menuitem"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onRun}
    >
      <action.icon size={14} />
      <span className="min-w-0 flex-1 truncate">{action.compactLabel ?? action.label}</span>
    </button>
  );
}

function BlockMenuAction({
  action,
  active,
  onRun,
}: {
  action: { label: string };
  active: boolean;
  onRun: () => void;
}) {
  return (
    <button
      className={`flex h-8 w-full items-center rounded px-2 text-left text-[11px] hover:bg-brand-hover ${active ? "bg-brand-hover font-semibold text-brand-orange" : "text-ink-primary"}`}
      role="menuitem"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onRun}
    >
      <span className="min-w-0 flex-1 truncate">{action.label}</span>
    </button>
  );
}

function ZoomMenuAction({
  zoomPercent,
  active,
  onRun,
}: {
  zoomPercent: number;
  active: boolean;
  onRun: () => void;
}) {
  return (
    <button
      className={`flex h-8 w-full items-center rounded px-2 text-left text-[11px] hover:bg-brand-hover ${active ? "bg-brand-hover font-semibold text-brand-orange" : "text-ink-primary"}`}
      role="menuitem"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onRun}
    >
      <span className="min-w-0 flex-1 truncate">{zoomPercent}%</span>
    </button>
  );
}

function useCompactToolbarMode() {
  const [compact, setCompact] = useState(() => (
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(max-width: 760px)").matches
      : false
  ));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(max-width: 760px)");
    const update = () => setCompact(mediaQuery.matches);
    update();
    mediaQuery.addEventListener?.("change", update);
    return () => mediaQuery.removeEventListener?.("change", update);
  }, []);

  return compact;
}

function TablePicker({
  rows,
  columns,
  onHover,
  onInsert,
}: {
  rows: number;
  columns: number;
  onHover: (size: { rows: number; columns: number }) => void;
  onInsert: (rows: number, columns: number) => void;
}) {
  const grid = Array.from({ length: 5 }, (_, rowIndex) =>
    Array.from({ length: 5 }, (_, columnIndex) => ({ row: rowIndex + 1, column: columnIndex + 1 })),
  );

  return (
    <div className="absolute left-0 top-8 z-[90] w-[172px] rounded-md border border-line bg-white p-3 shadow-menu">
      <div className="grid grid-cols-5 gap-1">
        {grid.flat().map((cell) => {
          const selected = cell.row <= rows && cell.column <= columns;
          return (
            <button
              key={`${cell.row}-${cell.column}`}
              className={`h-6 w-6 rounded border ${selected ? "border-brand-orange bg-brand-hover" : "border-line bg-white hover:bg-panel"}`}
              aria-label={`Insertar tabla ${cell.row} x ${cell.column}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => onHover({ rows: cell.row, columns: cell.column })}
              onFocus={() => onHover({ rows: cell.row, columns: cell.column })}
              onClick={() => onInsert(cell.row, cell.column)}
            />
          );
        })}
      </div>
      <p className="mt-2 text-center font-mono text-[10px] font-semibold text-ink-secondary">
        {rows} x {columns}
      </p>
      <button
        className="mt-2 h-7 w-full rounded border border-line text-[10px] font-semibold text-ink-secondary hover:bg-brand-hover hover:text-brand-orange"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onInsert(rows, columns)}
      >
        Insertar tabla
      </button>
      <button
        className="mt-1 h-7 w-full rounded text-[10px] font-semibold text-ink-secondary hover:bg-panel hover:text-ink-primary"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          const customRows = Number(window.prompt("Filas", String(rows)));
          const customColumns = Number(window.prompt("Columnas", String(columns)));
          if (!customRows || !customColumns) return;
          onInsert(customRows, customColumns);
        }}
      >
        Personalizar...
      </button>
    </div>
  );
}
