---
id: knownext.research_report
name: Informe de investigación
version: 1.0.0
---

# Objetivo

Crear informes de investigación profesionales y verificables para KnowNext.ai.

# Reglas Base

- El informe debe responder al objetivo concreto del usuario, no a una plantilla genérica.
- Antes de investigar debe existir un plan adhoc con un objetivo principal, exactamente 3 objetivos secundarios, exactamente 5 aspectos a investigar y un estilo recomendado.
- Cada objetivo secundario debe quedar cubierto por al menos 2 aspectos a investigar.
- `candidateSourceLimit` define el alcance maximo de fuentes candidatas a descubrir y evaluar; no significa que todas deban leerse completas.
- `reportLength` define la extension de salida: sintesis, detalle, profundidad de estructura y uso de anexos.
- Separar hechos, interpretación, riesgos y recomendaciones.
- Toda afirmación relevante debe estar respaldada por una fuente o marcada como no concluyente.
- No inventar fuentes, enlaces, documentos ni datos.
- Incluir metodología, fuentes consultadas, limitaciones y contradicciones cuando existan.
- Mantener Markdown portable y editable.
- No modificar documentos existentes; el resultado por defecto es un documento nuevo revisable.
- Las reglas de trazabilidad, privacidad y citas prevalecen sobre cualquier skill auxiliar.

# Pipeline De Trabajo

El informe se construye con un orquestador determinista. Cada fase produce artefactos verificables y la fase siguiente solo puede usar esos artefactos.

1. Planificacion: validar el objetivo principal, 3 objetivos secundarios, 5 aspectos a investigar, cobertura entre objetivos/aspectos y estilo recomendado.
2. Planificacion de consultas: generar lotes de busqueda por aspecto.
3. Busqueda: descubrir fuentes candidatas web y, si el usuario aporto contexto, registrar fuentes locales como contexto de proyecto.
4. Ranking: deduplicar y priorizar fuentes por relevancia, autoridad, actualidad, independencia y diversidad.
5. Lectura: leer fuentes seleccionadas o conservar extractos si la URL no es accesible.
6. Extraccion: extraer evidencias con `sourceId`, claim, excerpt, confianza, objetivo y aspecto.
7. Analisis de lagunas: comprobar cobertura minima por objetivo y registrar limitaciones cuando no sea suficiente.
8. Sintesis: producir hallazgos solo desde evidencias. No se aceptan hallazgos sin `evidenceIds`.
9. Redaccion: redactar solo desde plan, estrategia, hallazgos y evidencias. El escritor no debe usar fuentes brutas para inventar contenido.
10. Verificacion: validar citas, cobertura, tablas, Mermaid, assets, fuentes consultadas y limitaciones.
11. Publicacion: crear documento nuevo como Borrador IA solo si la verificacion termina en `ready_pass` o `ready_warning`.

# Tablas Y Citas

- Las tablas están siempre disponibles. Úsalas cuando ayuden a comparar alternativas, ordenar criterios, resumir riesgos, pros/contras, fuentes, métricas o decisiones.
- No fuerces tablas si el contenido se entiende mejor en texto.
- Las citas son obligatorias para afirmaciones relevantes.
- Si una afirmación relevante no tiene soporte suficiente, debe quedar marcada como no concluyente o como limitación.
- Las citas deben apuntar a fuentes usadas como evidencia, no a fuentes candidatas no leidas.

# Diagramas E Imágenes

- Usa Mermaid solo si `diagramsEnabled` está activo globalmente y un flujo, arquitectura, relación, secuencia o mapa conceptual aporta claridad real.
- Usa imágenes solo si `imagesEnabled` está activo globalmente y la imagen aporta claridad real al informe.
- No incluyas diagramas o imágenes como decoración.
- Las imágenes generadas deben guardarse como assets locales antes de referenciarse.
- Si un recurso visual no puede generarse o validarse, explica la limitación y continúa con el informe.

# Fuentes Y Extensión

- La busqueda web es obligatoria para investigaciones ejecutables. El contexto del proyecto solo se usa si el usuario lo aporta mediante documento activo, menciones, adjuntos o seleccion.
- Para 10 fuentes candidatas: lectura corta, pocas rondas, contraste ligero y conclusiones prudentes.
- Para 50 fuentes candidatas: contraste normal, lectura selectiva y cobertura suficiente para informes breves o estandar.
- Para 200 fuentes candidatas: varias rondas, deteccion de contradicciones y cobertura amplia.
- Para 500 fuentes candidatas: revision de lagunas estricta, mayor diversidad de fuentes y trazabilidad reforzada.
- `brief`: 800-1.500 palabras, H2, sin anexos.
- `standard`: 2.000-4.000 palabras, H2/H3 puntual.
- `wide`: 5.000-8.000 palabras, H2/H3 y anexos opcionales si aportan valor.
- `exhaustive`: 9.000-15.000 palabras, H2/H3 y anexos permitidos. No rellenar sin evidencia; declarar limitaciones.

# Skills Auxiliares

- `knownext.markdown`: tablas y estructura Markdown cuando aporten claridad.
- `knownext.mermaid`: diagramas Mermaid validables cuando estén habilitados.
- Skills de usuario o importadas: pueden aportar estilo, formato sectorial o criterios adicionales si están habilitadas y no rebajan las reglas base.
- Ningun skill auxiliar puede relajar trazabilidad, privacidad, citas, seguridad o la regla de redactar desde evidencias.

# Modos

- `ejecutivo`: breve, orientado a decisión.
- `profundo`: completo, trazable y contrastado.
- `comparativo`: alternativas, diferencias, contradicciones y fiabilidad.
- `normativo`: obligaciones, riesgos y cumplimiento.
- `tecnico`: arquitectura, implementación e impactos.
