# Bloque8 · Investigación verificable · entrega136

Autoridad: continuación explícita del usuario con agentes reales, un bloque tras otro; bloque7 cerrado antes de comenzar. F10/P08, sin proveedor/gasto, publicación/instalación ni cambio de VERSION. Se mantiene el plan padre y doctor SDD unbound ya consultado, sin instalación/migración.

## Criterios y separación

- C1/F10 → handwritten_ocr: nuevo servicio research_evidence_review, modificaciones mínimas del flujo/calidad para conservar afirmaciones sin respaldo y no contar IDs vacíos/inexistentes como evidencia suficiente. Proyección por afirmación/fuente/evidencia/fragmento/fecha; revisión local y exclusiones, sin LLM/web ni reescribir el informe original. Ámbito Rust workflow/review/quality y contratos nativos.
- C2/F10 → meeting_minutes: diálogo real de revisión por afirmación y fuente, estados de respaldo claros, original/propuesta, preparación/consentimiento, cambios pendientes/cierre protegido y ACKincierto solo consulta. Entrada optional en ResearchStatusCard/AiPromptInput, sin alterar proveedores. Ámbito UIresearch+AiPromptInput/tests.
- C3/contratos → recording_sources: SDK/types nuevos, identidad/proyecto/job/revisión/attempt verificados, límites y consulta no autoriza replay; pruebas frontend de contrato/adversas. Ámbito SDK/types/researchEvidenceReview y tests propios.
- C4/transversal → coordinador: rutas locales, autoridad/privacidad/App/passthrough/layout, portabilidad e inventario del overlay si aplica, pruebas agrupadas, revisión final, backlog50/cobertura70 y reporte visual.

## Comportamiento elegido

GET /api/projects/:p/research-evidence/:job, POST /prepare yPOST /apply locales; sin política de enviar a proveedor. Propuesta/contratos acordados por agentes antes de cerrar fuente. Se revisa el grafo estructurado guardado: hasta128fuentes/500afirmaciones/1000evidencias y2MiB de texto contrastado,16revisiones porjob; exceso explícito sin truncar. IDs de selección de usuario ajenos/duplicados/futuros rechazados. IDs inválidos del proveedor original se muestran como falta de respaldo; no se ocultan ni se inventan afirmaciones a partir del Markdown.

Comparar fragmento con fuente guardada prueba una coincidencia local, no veracidad ni actualidad de una web. La persona elige fuentes/evidencias por afirmación y comenta; recalcula cobertura/dependencias, nunca regenera prosa mediante heurísticas. Fuente/prosa/evidencias originales permanecen. La revisión local puede realizarse con nuevos envíos IA pausados; guardas de datos/ámbito siguen vigentes.

Overlay y acuse durable en job existente preferidos, con revisión estable de raíz/job/fuente/historial y escritura atómica/CAS. Sin repetir un apply tras ACKperdido; GET observa el mismo intento. Sin arranque de jobs/refine/update_sources, sin URLs abiertas automáticamente. Snapshot capturado con fecha y destino local validado o enlace web explícito.

## Trabajo

- [x] Proyección y calidad de evidencia honesta.
- [x] Revisión/exclusión por afirmación y recálculo local.
- [x] Overlay/acuse/originales y concurrencia protegidos.
- [x] UI/SDK integrados en flujo real.
- [x] Pruebas dirigidas y revisión independiente.
- [x] Reporte/backlog; aceptación instalada/real en P10/T17 diferida.


## Cierre verificado · 2026-11-06

13casos nativos únicos y22frontend únicos correctos. TypeScript/build y Rust/Tauri Android cruzado correctos;6capturas614–619 controladas yrevisadas,0errores/externas/overflow/proveedores/gasto. Tresagentes reales, revisión cruzada y contrato corregidos antes del cierre. [Evidencia y límites](avance-136.md). Sin aceptación instalada/física ni cierre de todo el programa: continúan9/10/11/P10; T17real sin gasto aplazado. Sin publicación/instalación/cambioVERSION.
