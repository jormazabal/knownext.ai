import { Brain, ChevronDown, ExternalLink, Lightbulb } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

export type AiModelSelectorTone = "recommended" | "advanced" | "maximum" | "economy" | "new" | "neutral";

export type AiModelSelectorOption<ModelId extends string = string> = {
  id: ModelId;
  name: string;
  providerLabel?: string;
  description: string;
  capability: number;
  cost: number;
  inputPrice: string;
  outputPrice: string;
  priceUnit?: string;
  tag?: {
    label: string;
    tone?: AiModelSelectorTone;
  };
  recommended?: boolean;
  icon?: ReactNode;
};

type AiModelSelectorProps<ModelId extends string = string> = {
  value: ModelId;
  options: Array<AiModelSelectorOption<ModelId>>;
  onChange: (modelId: ModelId) => void;
  title?: string;
  description?: string;
  recommendedOnlyLabel?: string;
  guideLabel?: string;
  guideDescription?: string;
  onOpenGuide?: () => void;
};

export function AiModelSelector<ModelId extends string = string>({
  value,
  options,
  onChange,
  title = "Elige el modelo que mejor se adapte a tu tarea.",
  description,
  recommendedOnlyLabel = "Solo mostrar recomendados",
  guideLabel = "Ver guía de modelos",
  guideDescription = "Equilibrado es la mejor opción para la mayoría de tareas de documentación.",
  onOpenGuide,
}: AiModelSelectorProps<ModelId>) {
  const [open, setOpen] = useState(false);
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const selected = options.find((option) => option.id === value) ?? options[0];
  const visibleOptions = useMemo(
    () => recommendedOnly ? options.filter((option) => option.recommended) : options,
    [options, recommendedOnly],
  );

  if (!selected) return null;

  return (
    <div className="relative">
      {description ? <p className="mb-3 text-[11px] leading-5 text-ink-secondary">{description}</p> : null}
      <button
        type="button"
        className={[
          "grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3 border border-line bg-white px-4 py-3 text-left transition",
          open ? "rounded-t-lg rounded-b-none" : "rounded-lg hover:border-orange-200 hover:bg-panel",
        ].join(" ")}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        <ModelIcon option={selected} />
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate whitespace-nowrap text-[13px] font-semibold text-ink-primary">{selected.id}</span>
            {selected.tag ? <ModelTag label={selected.tag.label} tone={selected.tag.tone} /> : null}
          </div>
          <p className="mt-1 truncate text-[11px] text-ink-secondary">
            {selected.name}
            <span className="px-1.5">·</span>
            {selected.description}
          </p>
        </div>
        <div className="min-w-[84px] shrink-0 text-right">
          <p className="text-[11px] font-semibold text-ink-primary">{formatPrice(selected)}</p>
          <p className="mt-1 text-[10px] text-ink-secondary">{selected.priceUnit ?? "por 1M tokens"}</p>
        </div>
        <ChevronDown size={16} className={["shrink-0 text-ink-secondary transition", open ? "rotate-180" : ""].join(" ")} />
        <div className="col-start-2 col-end-5 grid min-w-0 grid-cols-2 gap-3 border-t border-line/70 pt-2">
          <ModelMetric label="Capacidad" value={selected.capability} />
          <ModelMetric label="Coste" value={selected.cost} color="green" />
        </div>
      </button>

      {open ? (
        <section className="absolute left-0 right-0 top-full z-[115] -mt-px max-h-[min(460px,calc(100dvh-260px))] overflow-y-auto rounded-b-lg border border-line bg-white p-3 shadow-menu">
          <header className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3">
            <p className="text-[11px] font-semibold text-ink-primary">{title}</p>
            <label className="flex items-center gap-2 text-[11px] text-ink-secondary">
              <input
                className="h-4 w-4 rounded border-line accent-brand-orange"
                type="checkbox"
                checked={recommendedOnly}
                onChange={(event) => setRecommendedOnly(event.target.checked)}
              />
              {recommendedOnlyLabel}
            </label>
          </header>

          <ModelOptionList
            options={visibleOptions}
            selectedId={selected.id}
            onSelect={(modelId) => {
              onChange(modelId);
              setOpen(false);
            }}
          />

          <footer className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-panel px-3 py-3">
            <div className="flex min-w-0 items-start gap-3">
              <Lightbulb size={17} className="mt-0.5 shrink-0 text-brand-orange" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-ink-primary">¿No sabes cuál elegir?</p>
                <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{guideDescription}</p>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-white px-3 text-[11px] font-semibold text-ink-primary hover:bg-brand-hover hover:text-brand-orange"
              onClick={onOpenGuide}
            >
              {guideLabel}
              <ExternalLink size={13} />
            </button>
          </footer>
        </section>
      ) : null}
    </div>
  );
}

function ModelOptionList<ModelId extends string>({
  options,
  selectedId,
  onSelect,
}: {
  options: Array<AiModelSelectorOption<ModelId>>;
  selectedId: ModelId;
  onSelect: (modelId: ModelId) => void;
}) {
  return (
    <div className="space-y-2" role="listbox">
      {options.map((option) => {
        const selected = option.id === selectedId;
        return (
          <button
            key={option.id}
            type="button"
            role="option"
            aria-selected={selected}
            className={[
              "w-full min-w-0 text-left transition",
              "grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-start gap-3 rounded-md border px-3 py-3",
              selected ? "border-brand-orange bg-brand-hover" : "border-transparent hover:border-orange-200 hover:bg-panel",
            ].join(" ")}
            onClick={() => onSelect(option.id)}
          >
            <span
              className={[
                "grid shrink-0 place-items-center rounded-full border",
                "h-5 w-5",
                selected ? "border-brand-orange" : "border-slate-300",
              ].join(" ")}
              aria-hidden="true"
            >
              {selected ? <span className="h-2.5 w-2.5 rounded-full bg-brand-orange" /> : null}
            </span>
            <ModelIcon option={option} muted={!selected} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate whitespace-nowrap text-[11px] font-semibold text-ink-primary">{option.id}</span>
                {option.tag ? <ModelTag label={option.tag.label} tone={option.tag.tone} /> : null}
              </div>
              <p className="mt-1 text-[10px] leading-4 text-ink-secondary">{option.name} · {option.description}</p>
              <div className="mt-2 grid max-w-[280px] grid-cols-2 gap-3">
                <ModelMetric label="Capacidad" value={option.capability} />
                <ModelMetric label="Coste" value={option.cost} color="green" />
              </div>
            </div>
            <div className="min-w-[86px] text-right">
              <p className="text-[11px] font-semibold text-ink-primary">{formatPrice(option)}</p>
              <p className="mt-1 text-[10px] text-ink-secondary">{option.priceUnit ?? "por 1M tokens"}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ModelIcon<ModelId extends string>({ option, muted }: { option: AiModelSelectorOption<ModelId>; muted?: boolean }) {
  return (
    <span
      className={[
        "grid shrink-0 place-items-center rounded-full border",
        "h-9 w-9",
        muted ? "border-line text-ink-secondary" : "border-orange-200 bg-white text-brand-orange",
      ].join(" ")}
      aria-hidden="true"
    >
      {option.icon ?? <Brain size={18} />}
    </span>
  );
}

function formatPrice<ModelId extends string>(option: AiModelSelectorOption<ModelId>) {
  return option.outputPrice ? `${option.inputPrice} / ${option.outputPrice}` : option.inputPrice;
}

function ModelMetric({ label, value, color = "orange" }: { label: string; value: number; color?: "orange" | "green" }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold text-ink-secondary">{label}</p>
      <Meter value={value} color={color} />
    </div>
  );
}

function Meter({ value, color = "orange" }: { value: number; color?: "orange" | "green" }) {
  const activeClass = color === "green" ? "bg-emerald-500" : "bg-brand-orange";
  return (
    <span className="mt-1 grid grid-cols-6 gap-1" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <span
          key={index}
          className={[
            "h-1.5 rounded-full",
            index < value ? activeClass : "bg-slate-200",
          ].join(" ")}
        />
      ))}
    </span>
  );
}

function ModelTag({ label, tone = "neutral" }: { label: string; tone?: AiModelSelectorTone }) {
  const toneClass =
    tone === "recommended"
      ? "bg-orange-50 text-brand-orange"
      : tone === "advanced"
        ? "bg-slate-100 text-slate-600"
        : tone === "maximum"
          ? "bg-purple-50 text-purple-700"
          : tone === "economy"
            ? "bg-emerald-50 text-emerald-700"
            : tone === "new"
              ? "bg-blue-50 text-blue-700"
              : "bg-panel text-ink-secondary";
  return (
    <span className={["shrink-0 rounded px-2 py-0.5 text-[9px] font-semibold", toneClass].join(" ")}>
      {label}
    </span>
  );
}
