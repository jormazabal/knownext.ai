import {
  Bold,
  CheckSquare,
  Code2,
  ChevronDown,
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
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { MarkdownEditorAction, MarkdownEditorActionOptions, MarkdownEditorFormatState, MarkdownEditorHistoryState } from "./editorTypes";

type ToolbarAction = {
  label: string;
  compactLabel?: string;
  icon: LucideIcon;
  action: MarkdownEditorAction;
  extended?: boolean;
  options?: MarkdownEditorActionOptions;
};

const blockFormats = [
  { label: "Texto normal", shortLabel: "Normal", action: "paragraph", icon: Pilcrow },
  { label: "Título 1", shortLabel: "H1", action: "heading-1", icon: Heading1 },
  { label: "Título 2", shortLabel: "H2", action: "heading-2", icon: Heading2 },
  { label: "Título 3", shortLabel: "H3", action: "heading-3", icon: Heading3 },
  { label: "Título 4", shortLabel: "H4", action: "heading-4", icon: Heading3 },
  { label: "Título 5", shortLabel: "H5", action: "heading-5", icon: Heading3 },
  { label: "Título 6", shortLabel: "H6", action: "heading-6", icon: Heading3 },
] satisfies Array<{ label: string; shortLabel: string; action: MarkdownEditorAction; icon: LucideIcon }>;

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
] satisfies ToolbarAction[];

type MarkdownToolbarProps = {
  historyOpen: boolean;
  historyEnabled: boolean;
  historyDisabledReason: string;
  editorReady: boolean;
  extendedUnderlineEnabled?: boolean;
  activeActions: MarkdownEditorFormatState;
  editorHistoryState: MarkdownEditorHistoryState;
  onRunEditorAction: (action: MarkdownEditorAction, options?: MarkdownEditorActionOptions) => void;
  onToggleHistory: () => void;
};

export function MarkdownToolbar({
  historyOpen,
  historyEnabled,
  historyDisabledReason,
  editorReady,
  extendedUnderlineEnabled = true,
  activeActions,
  editorHistoryState,
  onRunEditorAction,
  onToggleHistory,
}: MarkdownToolbarProps) {
  const [openMenu, setOpenMenu] = useState<"block" | "format" | "structure" | "insert" | "table" | null>(null);
  const [hoveredTableSize, setHoveredTableSize] = useState({ rows: 3, columns: 4 });
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openMenu) return;

    function closeOnPointerDown(event: PointerEvent) {
      if (toolbarRef.current?.contains(event.target as Node)) return;
      setOpenMenu(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenu(null);
    }

    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu]);

  const visibleSecondaryInlineTools = secondaryInlineTools.filter((tool) => !tool.extended || extendedUnderlineEnabled);
  const currentBlockFormat = blockFormats.find((format) => activeActions[format.action]) ?? blockFormats[0];
  const CurrentBlockIcon = currentBlockFormat.icon;

  function keepEditorSelection(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  function runAction(action: MarkdownEditorAction, options?: MarkdownEditorActionOptions) {
    setOpenMenu(null);
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

  return (
    <div ref={toolbarRef} className="knownext-editor-toolbar flex h-9 shrink-0 items-center gap-1 border-b border-line bg-white px-3">
      <div className="relative shrink-0">
        <button
          className={`toolbar-select ${editorReady ? "" : "opacity-40"}`}
          aria-label="Formato de bloque"
          aria-haspopup="menu"
          aria-expanded={openMenu === "block"}
          disabled={!editorReady}
          onMouseDown={keepEditorSelection}
          onClick={(event) => toggleMenu("block", event)}
        >
          <CurrentBlockIcon size={14} />
          <span className="toolbar-select-label">{currentBlockFormat.shortLabel}</span>
          <ChevronDown size={13} />
        </button>
        {openMenu === "block" ? (
          <ToolbarMenu align="left">
            {blockFormats.map((format) => (
              <MenuAction
                key={format.action}
                action={format}
                active={Boolean(activeActions[format.action])}
                onRun={() => runAction(format.action)}
              />
            ))}
          </ToolbarMenu>
        ) : null}
      </div>

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
          <ToolbarIconButton
            tool={insertionTools[1]}
            active={Boolean(activeActions[insertionTools[1].action])}
            disabled={!editorReady}
            onMouseDown={keepEditorSelection}
            onRun={() => runAction(insertionTools[1].action)}
          />
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
              <MenuAction action={insertionTools[1]} active={false} onRun={() => runAction("image")} />
              <MenuAction action={structureTools[5]} active={false} onRun={() => runAction("horizontal-rule")} />
            </ToolbarMenu>
          ) : null}
        </div>
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
      </ToolbarActionGroup>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          className={`toolbar-button ${editorReady && editorHistoryState.canUndo ? "" : "opacity-40"}`}
          data-tooltip={editorHistoryState.canUndo ? "Deshacer" : "No hay cambios para deshacer"}
          aria-label="Deshacer"
          disabled={!editorReady || !editorHistoryState.canUndo}
          onMouseDown={keepEditorSelection}
          onClick={() => runAction("undo")}
        >
          <Undo2 size={15} />
        </button>
        <button
          className={`toolbar-button ${editorReady && editorHistoryState.canRedo ? "" : "opacity-40"}`}
          data-tooltip={editorHistoryState.canRedo ? "Rehacer" : "No hay cambios para rehacer"}
          aria-label="Rehacer"
          disabled={!editorReady || !editorHistoryState.canRedo}
          onMouseDown={keepEditorSelection}
          onClick={() => runAction("redo")}
        >
          <Redo2 size={15} />
        </button>
      </div>
    </div>
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
