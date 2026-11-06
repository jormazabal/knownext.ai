import { useCallback, useEffect, useRef, useState } from "react";
import { listDocumentTemplates, previewDocumentTemplate } from "../../lib/api/documentTemplates";
import { getApiErrorMessage } from "../../lib/api/client";
import type { DocumentTemplateInventory, DocumentTemplatePreview, TemplateRenderRequest } from "../../types/documentTemplates";

export function useDocumentTemplates(open: boolean) {
  const [inventory, setInventory] = useState<DocumentTemplateInventory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError(null);
    try {
      const result = await listDocumentTemplates();
      if (generation.current === current) setInventory(result);
    } catch (error) {
      if (generation.current === current) setError(getApiErrorMessage(error, "No se pudieron cargar las plantillas."));
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (open) void reload();
    return () => { generation.current++; };
  }, [open, reload]);
  return { inventory, loading, error, reload };
}

export function useDocumentTemplatePreview(open: boolean, templateId: string, request: TemplateRenderRequest | null) {
  const [attempt, setAttempt] = useState(0);
  const signature = request ? JSON.stringify([templateId, request, attempt]) : "";
  const [state, setState] = useState<{ signature: string; preview: DocumentTemplatePreview | null; error: string | null }>({ signature: "", preview: null, error: null });
  useEffect(() => {
    if (!open || !signature) return;
    const [id, payload] = JSON.parse(signature) as [string, TemplateRenderRequest, number];
    let active = true;
    const timer = window.setTimeout(() => {
      void previewDocumentTemplate(id, payload).then(preview => {
        if (active) setState({ signature, preview, error: null });
      }).catch(error => {
        if (active) setState({ signature, preview: null, error: getApiErrorMessage(error, "No se pudo preparar la vista previa.") });
      });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, signature]);
  const current = open && request && state.signature === signature;
  return {
    preview: current ? state.preview : null,
    error: current ? state.error : null,
    loading: Boolean(open && request && !current),
    retry: () => setAttempt(value => value + 1),
  };
}
