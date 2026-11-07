# Avance138 · Bloque10: usabilidad y continuidad

[Reporte visual](avance-138.html) · [Criterios y delegación](bloque-138.md) · [Contratos](../../architecture/workspace-usability-closure.md).

Tres subagentes reales con archivos independientes: navegación/cuenta/búsqueda; visor táctil/barra/opciones de IA; continuidad de referencia/modales de grabación. El coordinador integra enlaces/renombrado/papelera, credenciales, ES/EN, contraste, límite de teclado compartido y evidencias.

122casos frontend únicos correctos. La corrección de Escape común se reprodujo antes: un listener nativo del ancestro impedía al menú React consumir la tecla. El nuevo límite React respeta eventos ya tratados;45comprobaciones de teclado/foco afectadas pasan, reutilizando los resultados restantes. Las correcciones finales de fixtures/tipos no ejecutaron suites generales. TypeScript y build de producción final correctos. Los errores de tipado detectados eran fixtures de pruebas y comprobaciones de tipo de eventos; se corrigieron antes del build final. No hay cambios Rust en este bloque: se conserva la comprobación Android137, sin reconstrucción nativa repetida.

25capturas628–652 de componentes reales con API/props controlados y contexto aislado: teclado/retorno, pinza real Chrome, PDF.js real, hoja y posiciones de lectura, formularios, idiomas y contraste. Fuente PDF sintética y subpaneles de privacidad excluidos expresamente de la campaña de credenciales. Sin puente Tauri falso, UI nativa, perfil real, proveedores ni gasto. Casos320x480/320/1280 sin desbordamiento;25muestras visuales no son aceptación instalada.

La continuidad PDF reabre página2,90%,consulta Acuerdo y desplazamiento0.239512855 sin perderlos; hoja Riesgos conserva scroll560. Cambiar fuente reinicia el estado. Un objeto equivalente de imagen no pierde zoom; una fuente realmente nueva sí reinicia. Se conservan sólo32vistas en memoria y16posiciones de hoja, sin blobs/texto/disco.24combinaciones reales de tema/paleta tienen contraste mínimo4.7297 para las muestras de acciones/texto. El naranja predeterminado conserva la línea acordada.

Revisión integral de declaradores: todos los diálogos aria-modal verdaderos pasan por ModalFrame. Búsqueda del árbol, opciones/cancelación IA y dos de grabación se incorporaron al detectar que aún tenían capas manuales. No se promete eliminar documentos parciales al cancelar investigación; se conserva lo ya guardado. Guardados de destino retienen foco/error/selección y bloquean cierre/duplicados mientras están pendientes.

Renombrar, mover y enviar a papelera muestran impacto de vínculos cuando corresponde, incluidos lotes. Cancelación/cambio de proyecto no autorizan una acción posterior; errores tardíos no aparecen en el proyecto nuevo. No se promete corrección automática de todo enlace. Formularios de credenciales tienen etiqueta/error/ayuda asociados y valor recuperable; bienvenida/acceso rápido y control de modelo usan ES/EN, con idioma HTML coherente.

Límites: lectores de pantalla, teclado virtual nativo, DPI, lápiz/dispositivos y personas siguen en P10. T17 real aplazado sin gasto. Continúa11: escala/corpus/rendimiento y una regresión completa al acabar implementación. Sin publicación, instalación, commit/push ni cambioVERSION2.6.0.


Registro de incidencias de QA: un primer ensayo de referencia mostró2mensajes document-is-not-defined sin pila; tras instrumentar, dos recorridos posteriores con PDF.js real no reprodujeron el error, sin cambio productivo. No se cuentan campañas fallidas como resultados correctos. Las notas de evidencia distinguen cambios de tipos/texto sin impacto visual de los recorridos capturados.

Evidencia principal: output/v3-block10-verification.json; output/v3-block10-build-verified.log; output/v3-block10-modal-keyboard-affected.log; output/v3-block10-root-browser-evidence.json; output/v3-block10-preview-browser-evidence.json; output/v3-block10-editor-browser-evidence.json; output/v3-block10-tabs-account-browser-evidence.json; output/v3-block10-tree-search-browser-evidence.json; output/v3-block10-prompt-modals-browser-evidence.json; output/v3-block10-recording-modals-evidence.json.
