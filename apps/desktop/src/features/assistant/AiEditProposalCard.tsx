import { Check, ChevronDown, ChevronRight, FileText, GitCompareArrows, Image, Layers3, MapPin, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AiEditOperation, AiEditProposal } from "../../types/domain";

type AiEditProposalCardProps = {
  proposal: AiEditProposal | null;
  compact?: boolean;
  applying?: boolean;
  staleOperationIds?: string[];
  blockedOperationReasons?: Record<string, string>;
  appliedOperationIds?: string[];
  onApply: (proposalId: string, operationIds?: string[]) => void | Promise<void>;
  onDiscard: (proposalId: string) => void;
  onOpenConversation?: () => void;
};

const EMPTY_OPERATION_IDS: string[] = [];
const EMPTY_OPERATION_REASONS: Record<string, string> = {};

export function AiEditProposalCard({
  proposal,
  compact = false,
  applying = false,
  staleOperationIds = EMPTY_OPERATION_IDS,
  blockedOperationReasons = EMPTY_OPERATION_REASONS,
  appliedOperationIds = EMPTY_OPERATION_IDS,
  onApply,
  onDiscard,
  onOpenConversation,
}: AiEditProposalCardProps) {
  const [reviewOpen, setReviewOpen] = useState(!compact);
  const staleIds = useMemo(() => new Set(staleOperationIds), [staleOperationIds]);
  const blockedIds = useMemo(() => new Set(Object.keys(blockedOperationReasons)), [blockedOperationReasons]);
  const appliedIds = useMemo(() => new Set(appliedOperationIds), [appliedOperationIds]);
  const defaultSelectedIds = useMemo(
    () => proposal?.operations.filter((operation) => !staleIds.has(operation.id) && !blockedIds.has(operation.id) && !appliedIds.has(operation.id)).map((operation) => operation.id) ?? [],
    [proposal, staleIds, blockedIds, appliedIds],
  );
  const [selectedIds, setSelectedIds] = useState<string[]>(defaultSelectedIds);
  useEffect(() => {
    setSelectedIds(defaultSelectedIds);
  }, [defaultSelectedIds]);
  if (!proposal || proposal.status !== "proposed") return null;

  const operationsCount = proposal.operations.length;
  const documentsCount = new Set(proposal.operations.map((operation) => operation.documentId)).size;
  const hasImageOperation = proposal.operations.some((operation) => operation.action === "insert_image");
  const Icon = hasImageOperation ? Image : proposal.scope === "project" ? Layers3 : proposal.scope === "cursor" ? MapPin : FileText;
  const effectiveSelectedIds = selectedIds.filter((id) => proposal.operations.some((operation) => operation.id === id) && !staleIds.has(id) && !blockedIds.has(id) && !appliedIds.has(id));
  const staleCount = proposal.operations.filter((operation) => staleIds.has(operation.id)).length;
  const blockedCount = proposal.operations.filter((operation) => blockedIds.has(operation.id)).length;
  const appliedCount = proposal.operations.filter((operation) => appliedIds.has(operation.id)).length;
  const reviewCount = staleCount + blockedCount;

  return (
    <div className="mt-3 py-2 text-ink-primary" aria-busy={applying}>
      <div className="flex items-start gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center text-brand-orange">
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase text-brand-orange">Propuesta IA</span>
            <span className="text-[11px] font-medium text-ink-secondary">{scopeLabel(proposal)}</span>
          </div>
          <p className="mt-1 text-[12px] font-semibold leading-5 text-ink-primary">{proposal.title}</p>
          <p className="mt-0.5 text-[11px] leading-4 text-ink-secondary">{proposal.summary}</p>
          {proposal.recovery && <p role={proposal.recovery.stored ? "status" : "alert"} className={`mt-2 text-xs leading-5 ${proposal.recovery.stored ? "text-ink-secondary" : "text-red-800"}`}>{proposal.recovery.removed ? "Has retirado la copia conservada. Esta propuesta permanece solo en la sesión." : proposal.recovery.stored ? "Copia conservada en Resultados IA. Puedes recuperarla tras cerrar la aplicación; se mantiene hasta que la quites." : `Solo disponible en esta sesión. No cierres la aplicación antes de conservarla en Resultados IA. ${proposal.recovery.error ?? ""}`}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-ink-secondary">
            <span className="py-1">
              {operationsCount === 1 ? "1 cambio" : `${operationsCount} cambios`}
            </span>
            <span className="py-1">
              {documentsCount === 1 ? "1 documento" : `${documentsCount} documentos`}
            </span>
            {appliedCount > 0 ? (
              <span className="py-1 font-medium text-green-700">
                {appliedCount === 1 ? "1 aplicado" : `${appliedCount} aplicados`}
              </span>
            ) : null}
            {reviewCount > 0 ? (
              <span className="py-1 font-medium text-brand-orange">
                {reviewCount === 1 ? "1 requiere revisión" : `${reviewCount} requieren revisión`}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {proposal.operations.length > 0 ? (
        <div className="mt-2">
          <button
            type="button"
            className="flex min-h-11 w-full items-center gap-2 text-left text-[12px] font-semibold text-ink-primary hover:bg-panel/50"
            aria-expanded={reviewOpen}
            onClick={() => setReviewOpen((open) => !open)}
          >
            {reviewOpen ? <ChevronDown size={13} className="text-brand-orange" /> : <ChevronRight size={13} className="text-brand-orange" />}
            <span className="min-w-0 flex-1 truncate">Revisar cambios</span>
            <span className="text-[10px] font-medium text-ink-secondary">
              {effectiveSelectedIds.length}/{operationsCount}
            </span>
          </button>
          {reviewOpen ? (
            <div className="max-h-[360px] space-y-3 overflow-y-auto py-2">
              {proposal.operations.map((operation, index) => {
                const stale = staleIds.has(operation.id);
                const blocked = blockedIds.has(operation.id);
                const applied = appliedIds.has(operation.id);
                const reviewReason = stale ? "stale" : blockedOperationReasons[operation.id] ?? null;
                const selected = effectiveSelectedIds.includes(operation.id);
                return (
                  <ProposalOperationRow
                    key={operation.id}
                    operation={operation}
                    index={index}
                    selected={selected}
                    stale={stale}
                    blocked={blocked}
                    applied={applied}
                    applying={applying}
                    sideBySide={!compact}
                    reviewReason={reviewReason}
                    onToggle={() => {
                      if (stale || blocked || applied) return;
                      setSelectedIds((currentIds) => (
                        currentIds.includes(operation.id)
                          ? currentIds.filter((id) => id !== operation.id)
                          : [...currentIds, operation.id]
                      ));
                    }}
                  />
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap justify-end gap-1.5">
        {onOpenConversation ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-ink-secondary hover:bg-panel hover:text-brand-orange"
            onClick={onOpenConversation}
          >
            <GitCompareArrows size={13} />
            Ver cambios
          </button>
        ) : null}
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium text-ink-secondary hover:bg-panel hover:text-brand-orange disabled:opacity-50"
          disabled={applying}
          onClick={() => onDiscard(proposal.id)}
        >
          <X size={13} />
          Descartar
        </button>
        <button
          type="button"
          className={["inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand-orange px-4 text-[12px] font-semibold text-white hover:bg-brand-dark", effectiveSelectedIds.length === 0 || applying ? "cursor-not-allowed opacity-50" : ""].join(" ")}
          disabled={effectiveSelectedIds.length === 0 || applying}
          onClick={() => void onApply(proposal.id, effectiveSelectedIds)}
        >
          <Check size={13} />
          {applying ? "Aplicando…" : `Aplicar${effectiveSelectedIds.length > 0 && effectiveSelectedIds.length < operationsCount ? ` ${effectiveSelectedIds.length}` : ""}`}
        </button>
      </div>
    </div>
  );
}

function ProposalOperationRow({
  operation,
  index,
  selected,
  stale,
  blocked,
  applied,
  applying,
  sideBySide,
  reviewReason,
  onToggle,
}: {
  operation: AiEditOperation;
  index: number;
  selected: boolean;
  stale: boolean;
  blocked: boolean;
  applied: boolean;
  applying: boolean;
  sideBySide: boolean;
  reviewReason: string | null;
  onToggle: () => void;
}) {
  const after = operation.replacementMarkdown ?? operation.markdown ?? operation.imageAltText ?? operation.imageAssetId ?? "";
  const before = operation.action === "replace_document" ? operation.expectedMarkdown ?? operation.originalExcerpt ?? "" : operation.originalExcerpt ?? operation.anchorExcerpt ?? "";
  const disabled = stale || blocked || applied || applying;
  return (
    <div className={["py-2", stale || blocked ? "bg-brand-hover/40" : ""].join(" ")}>
      <label className="flex min-h-11 items-start gap-2">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 accent-brand-orange"
          checked={selected}
          disabled={disabled}
          onChange={onToggle}
        />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="text-[10px] font-semibold text-brand-orange">Cambio {index + 1}</span>
            <span className="rounded-full bg-panel px-1.5 py-0.5 text-[9px] font-medium text-ink-secondary">{operationLabel(operation)}</span>
            {stale ? <span className="rounded-full bg-brand-hover px-1.5 py-0.5 text-[9px] font-semibold text-brand-orange">Obsoleto</span> : null}
            {blocked ? <span className="rounded-full bg-brand-hover px-1.5 py-0.5 text-[9px] font-semibold text-brand-orange">Revisar</span> : null}
            {applied ? <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-semibold text-green-700">Aplicado</span> : null}
          </span>
          <span className="mt-1 block text-[11px] font-medium leading-4 text-ink-primary">{operation.summary}</span>
          <span className="mt-1 block text-[10px] leading-4 text-ink-secondary">{operationPlacementLabel(operation)}</span>
          <span className="mt-1 block truncate text-[11px] text-ink-secondary">{operation.documentLabel ?? "Documento de destino"}</span>
          {reviewReason ? <span className="mt-1 block text-[10px] leading-4 text-brand-orange">{reviewReasonLabel(reviewReason)}</span> : null}
        </span>
      </label>
      {before || after ? (
        <div className={["mt-2 grid gap-3 text-[11px] leading-5", sideBySide ? "md:grid-cols-2" : ""].join(" ")}>
          <DiffPane title="Base enviada" text={before || "Sin texto reemplazado"} tone="before" collapsed={!sideBySide && operation.action === "replace_document"}/>
          <DiffPane title="Propuesta" text={after || "Sin vista previa"} tone="after" />
        </div>
      ) : null}
    </div>
  );
}

function DiffPane({ title, text, tone, collapsed = false }: { title: string; text: string; tone: "before" | "after"; collapsed?: boolean }) {
  if (collapsed) return <details className="min-w-0"><summary className="min-h-11 cursor-pointer py-3 text-[11px] font-semibold text-ink-secondary">{title}</summary><p className="whitespace-pre-wrap break-words p-2 text-[11px] leading-5 text-ink-primary">{text}</p></details>;
  return (
    <div className={["min-w-0 p-2", tone === "after" ? "bg-brand-hover/30" : "bg-panel/50"].join(" ")}>
      <p className="mb-1 text-[9px] font-semibold uppercase text-ink-secondary">{title}</p>
      <p className="whitespace-pre-wrap break-words text-[11px] leading-5 text-ink-primary">{text}</p>
    </div>
  );
}

function reviewReasonLabel(reason: string) {
  if (reason === "permission_revoked") return "La edición con IA está desactivada. Se conserva esta propuesta para revisión.";
  if (reason === "source_changed") return "Hay cambios nuevos desde el envío a IA. Conserva la propuesta como copia para revisarla.";
  if (reason === "stale") return "El documento cambió desde que se generó la propuesta.";
  if (reason === "anchor_ambiguous") return "El texto de referencia aparece varias veces; elige o ajusta el fragmento antes de aplicar.";
  if (reason === "anchor_not_found") return "El texto de referencia ya no aparece en el documento.";
  if (reason === "missing_anchor") return "La propuesta no incluye una referencia suficiente para ubicar el cambio.";
  if (reason === "missing_replacement") return "La propuesta no incluye contenido aplicable.";
  if (reason === "editor_apply_failed") return "El editor no pudo aplicar este cambio parcial; revisa la ubicación antes de intentarlo de nuevo.";
  return "Requiere revisión manual antes de aplicar.";
}

function operationLabel(operation: AiEditOperation) {
  if (operation.action === "replace_selection") return "Reemplazar selección";
  if (operation.action === "insert_at_cursor") return "Insertar en cursor";
  if (operation.action === "insert_image") return "Insertar imagen";
  if (operation.action === "replace_document") return "Reemplazar documento";
  if (operation.action === "edit_project") return "Proyecto";
  if (operation.action === "edit_block") return "Apartado";
  return "Documento";
}

function operationPlacementLabel(operation: AiEditOperation) {
  const placementHeadingParts = operation.placement?.headingPath?.filter(Boolean) ?? [];
  const operationHeadingParts = operation.headingPath?.filter(Boolean) ?? [];
  const heading = placementHeadingParts.length > 0
    ? placementHeadingParts[placementHeadingParts.length - 1]
    : operationHeadingParts.length > 0
      ? operationHeadingParts[operationHeadingParts.length - 1]
      : null;
  const placementType = operation.placement?.type;
  if (operation.action === "replace_selection" || placementType === "replace_selection") return "Ubicación: sustituye el texto seleccionado";
  if (placementType === "before_selection") return "Ubicación: antes del texto seleccionado";
  if (placementType === "after_selection") return "Ubicación: después del texto seleccionado";
  if (placementType === "after_heading") return heading ? `Ubicación: después del apartado “${heading}”` : "Ubicación: después del apartado indicado";
  if (placementType === "after_paragraph") return "Ubicación: después del párrafo de referencia";
  if (placementType === "document_end") return "Ubicación: final del documento";
  if (operation.action === "insert_at_cursor" || placementType === "at_cursor") return "Ubicación: cursor del documento";
  if (operation.action === "edit_block") return heading ? `Ubicación: apartado “${heading}”` : "Ubicación: apartado detectado";
  if (operation.action === "edit_document" || operation.action === "replace_document") return "Ubicación: documento completo";
  return "Ubicación: ancla validada del documento";
}

function scopeLabel(proposal: AiEditProposal) {
  if (proposal.scope === "selection") return "Texto seleccionado";
  if (proposal.scope === "cursor") return "Cursor";
  if (proposal.scope === "block") return "Apartado";
  if (proposal.scope === "project") return "Proyecto";
  if (proposal.operations.length > 1) return "Documento";
  return "Documento activo";
}
