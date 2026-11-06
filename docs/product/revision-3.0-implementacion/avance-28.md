# Historial útil y continuidad del trabajo
2026-11-01 · Implementación del programa completo en curso. Ningún paquete completo cerrado.

[Resumen visual](avance-28.html) · [Plan vigente](plan.md)

## Producto implementado
- Importaciones que conservan el archivo existente, informan el nombre efectivo de la copia y mantienen ALT/archivo ante errores. Un fallo al construir la referencia de imagen permite reintentar sin volver a subir el archivo. Detalle C27 en el plan.
- Hitos de versiones guardadas: nombrar/quitar nombre modifica únicamente una anotación local del proyecto. Mantiene commits, fuentes y borrador abierto. Una revisión obsoleta se rechaza; un acuse perdido se concilia por lectura sin repetir la escritura. Almacén futuro/dañado se conserva y no oculta el historial Git.
- Comparación de dos versiones elegidas y comparación con el documento abierto. A/B, hashes, fechas y dirección explícitos; intercambio de lados, vista adaptable/unificada/dos columnas y consulta completa de cada contenido. Restaurar señala expresamente A y conserva el flujo de protección existente.
- Cálculo de diferencias único y acotado antes de reservar memoria. Fuera de presupuesto se ofrece contenido completo sin declarar igualdad ni inventar recuentos. No se acredita virtualización de documentos extensos.
- Consultar historial mantiene el editor montado. Su borrador, selección interna y pila de deshacer permanecen; al volver se recuperan desplazamiento y foco.

## Contraste realizado y límites
La validación durante desarrollo es focal, conforme a la instrucción del usuario. No se ha vuelto a ejecutar la suite completa frontend ni Rust, ni generado otro APK.

Rust: contratos de hitos con Git temporal, pertenencia/renombrado, revisión requerida/obsoleta, esquema futuro/dañado, permisos, límites y conservación de fuente/HEAD. Primera ejecución señaló un fixture con hash corto; se corrigió para usar el ID completo real del historial. Tras exigir presencia explícita del campo revision se repitió únicamente el contrato afectado. Logs: `v3-history-milestones-focused-02-28.log` y `v3-history-revision-focused-28.log` en output.

Frontend: selección de dos versiones, envío único, conciliación por lectura, texto conservado y respuesta antigua descartada; presupuesto del comparador y continuidad de una instancia de editor. Comprobación TypeScript detectó una desestructuración incorrecta del hook de tamaño; corregida y comprobación posterior correcta. Logs `v3-history-ui-focused-28.log`, `v3-history-continuity-focused-28.log`, `v3-history-types-02-28.log`.

Navegador con componentes reales y API de historial controlada: escritorio, 412 y 320 px; dirección intercambiada, solo lectura, texto de hito conservado tras fallo, controles de 44 px y sin desbordamiento del viewport. Dos columnas forzadas pueden desplazarse dentro de su área. Fixture visual no escribe anotaciones ni restaura versiones reales.

Milkdown real en la superficie de continuidad: mismo elemento antes/durante/después, borrador idéntico, deshacer disponible con profundidad 1 conservada, desplazamiento 500→500 y foco recuperado; sin errores de página. Recibo local: [evidencia](../../../output/v3-history-browser-evidence-28.json). El hallazgo del editor desmontado se corrigió antes de dar esta continuidad por contrastada.

La campaña nativa siguiente agrupa C26 posterior a APK57 (anclaje tras geometría y recuento desconocido), importaciones C27 e historial C28. APK57 instalado no contiene estos cambios. QA anterior sigue restituida y detenida; Windows habitual no se opera. No se repite restauración de versiones completa: su servicio no se ha modificado. La aceptación nativa de estas incorporaciones sigue pendiente.

## Trabajo que falta, por resultado
No hay un porcentaje o plazo fiable de finalización. Los paquetes contienen ampliaciones de distinto tamaño; contar cortes o pruebas no mide cuánto producto queda.

| Frente | Pendiente principal |
|---|---|
| Integridad y arquitectura | Inventario y durabilidad de persistencia secundaria restante, coordinación entre instancias, ejecución de trabajos largos fuera del bloqueo de mutaciones y migración completa. |
| Seguridad e IA | Cobertura de autoridad/retención en capacidades restantes, revisión de rutas/contenidos y evaluación semántica con presupuesto/proveedores pendientes. |
| Espacio de trabajo | Consistencia de todas las superficies, accesibilidad, contraste/temas y aceptación de teclado, DPI y dispositivos. |
| Edición y referencias | Fidelidad Markdown restante, escenarios de imágenes/dialectos, revisión/aplicación IA y tratamiento integral de conflictos. |
| Biblioteca e historial | Combinación/restauración por bloques, operaciones por lote ampliadas y centro integral de recuperación/copias. |
| Proyectos y almacenamiento | Revincular ubicaciones, cachés con regeneración demostrada, archivo/cuotas/recursos candidatos y falta de espacio en todos los flujos. |
| Ajustes y formularios | Completar simplificación, idiomas y continuidad en superficies secundarias. |
| Captura y libreta | Cobertura nativa de audio/dictado/lápiz, actas revisables, OCR y sus ampliaciones. |
| Productividad | Plantillas de proyecto, catálogo de recursos, conocimiento conectado, investigación y acciones rápidas ampliadas. |
| Exportación y portabilidad | Frescura/fidelidad de conversiones, representación documental compartida, traslado integral/historial y paridad explícita por plataforma. |
| Cierre de candidata | Rendimiento medido, regresión completa final, integración/migración, campaña nativa pendiente, piloto y documentación de entrega. Publicación posterior separada. |

Las 50 propuestas, las 70 capacidades y las ampliaciones continúan en el plan. Esta tabla agrupa resultados pendientes; no sustituye ni reduce el backlog.
