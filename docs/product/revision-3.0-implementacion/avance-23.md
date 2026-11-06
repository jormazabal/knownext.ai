# Avance 23 · Datos locales con un alcance claro

Sistema incorpora un mapa del uso lógico y las ubicaciones conservadas. La consulta es explícita, no recorre carpetas externas y diferencia cobertura completa de parcial. Este corte no ofrece limpieza ni cierra F17 o el programa.

## Implementado y contrastado

- Servicio Rust `storage_usage`, GET `/api/storage/usage`, fuera del mutex de mutaciones. Solo metadatos de archivos regulares bajo app data, sin leer contenidos para medirlos. Máximo 10.000 entradas y presupuesto cooperativo de 2 segundos; una llamada al sistema bloqueada no se puede interrumpir con ese presupuesto.
- Nueve grupos: documentos/historial, recuperación, grabaciones, trabajo IA, plantillas, preparaciones, índices/vistas, preferencias/acceso y otros. Papelera dentro del proyecto cuenta como recuperación; notas globales como documentos. Todas las categorías se conservan, incluidos datos desconocidos.
- Enlaces/junctions omitidos, errores y límites explícitos. La medición parcial muestra cotas inferiores, también para cero; no afirma almacén vacío ni espacio libre. Los tamaños lógicos por entrada no son bloques físicos; hard links pueden contabilizarse varias veces. Es una estimación en vivo, no una instantánea atómica o copia de seguridad.
- Ubicaciones registradas/retiradas, hasta 256 y con aviso de cobertura. Un registro o catálogo ilegible conserva sus bytes, la medición disponible y las ubicaciones legibles. No se mide ni comprueba automáticamente disponibilidad de las raíces externas; no se crean carpetas.
- Panel integrado en Sistema, localizable por búsqueda de ajustes. Sin consulta al montar ni polling oculto; un envío en vuelo. Actualizar conserva la medición previa ante error. Cabecera apilada en móvil, acción de 44 px, detalle progresivo y copia es/en mediante códigos de aviso.

## Evidencias locales

| Comprobación | Resultado |
|---|---|
| Frontend completo | **559/559, 123 archivos**, [suite 52](../../../output/v3-frontend-tests-52.log). |
| Rust completo | **320/320**, [suite 41](../../../output/v3-rust-tests-41.log). |
| Dominio focal | [7 pruebas Rust](../../../output/v3-storage-usage-tests-03.log): clasificación, límites, privacidad, ausencia de escrituras, registro/catálogo dañado, ubicaciones externas/retiradas, límite de ubicaciones y junction Windows real con destino intacto. El caso symlink Unix es específico de esa plataforma, no se declara ejecutado en Windows. |
| UI y transporte | [7 pruebas focales](../../../output/v3-storage-usage-ui-tests-02.log), [TypeScript](../../../output/v3-storage-usage-types-02.log); las 24 pruebas de ajustes también pasan en la suite completa. Un selector ambiguo del primer lote se corrigió sin cambiar comportamiento del producto. |
| Componentes reales | [Navegador](../../../output/v3-storage-usage-browser-evidence-23.json), 1360×900 y 360×520: cero consultas al inicio, sin overflow, acción 44 px, cero parcial identificado y error con datos conservados. [Escritorio](../../../output/playwright/revision-3.0/126-almacenamiento-escritorio.png), [móvil](../../../output/playwright/revision-3.0/127-almacenamiento-parcial-movil.png). Recibos controlados; no equivalen a Rust nativo. |

Browser plugin no disponible: se usa Playwright ordinario. Los errores HMR/WebSocket de la página de desarrollo aislada no se confunden con errores del APK; no se modifica seguridad del navegador.

## Android offline

[Evidencia consolidada](../../../output/android-v3-storage-usage-evidence-51.json). API36 x86_64, exclusivamente `ai.knownext.mobile.v3qa`. APK51 SHA256 `3c25c16a2cdb240f10d00bb83c8af67e983690fec4430b72e8e71f5e5b453a1f`; [475 entradas de fuente](../../../output/android-v3-storage-usage-inputs-51.json) sin cambios durante el [build completo frontend/Rust/Tauri/Gradle](../../../output/v3-android-qa-build-51.log). [Instalación](../../../output/v3-android-qa-install-51.log) y [JS/tres CSS coincidentes con dist](../../../output/android-v3-storage-usage-assets-51.json).

- Consulta inicial: 127 archivos, cobertura completa, 70 ms de medición observada y cuatro hashes de almacenes idénticos antes/después de consultar. Es una observación del emulador con datos QA, no benchmark general, capacidad libre ni tamaño del dispositivo del usuario.
- Proyecto sintético sin Git y Markdown de 49 bytes: el grupo de documentos aumenta exactamente 49 bytes. Un symlink a su raíz se omite; no duplica el tamaño ni cambia el archivo y vuelve parcial la cobertura.
- Catálogo sintético futuro v99: mismo SHA tras consultar, aviso de ubicaciones incompletas y dos ubicaciones registradas legibles conservadas. No se anuncia una lista vacía ni se reemplaza el catálogo.
- Búsqueda real «uso almacenamiento» lleva a Sistema. El panel sigue esperando Ver uso local; solo esa acción consulta. Medición parcial, acción de 44 px, sin overflow y aviso de catálogo visibles: [mapa nativo inspeccionado](../../../output/playwright/revision-3.0/128-android-uso-local.png), [ubicaciones inspeccionadas](../../../output/playwright/revision-3.0/129-android-ubicaciones-incompletas.png).
- Retirar solo alias/catálogo sintéticos y actualizar devuelve cobertura completa, cero enlaces omitidos y cero avisos. El documento conserva su SHA. Cero errores de página registrados y cero proveedor; no se afirma consola íntegramente limpia ni aceptación física por CDP.

El texto singular «1 enlaces» observado se corregirá en la siguiente construcción frontend junto con el corte de índices. No invalida los contadores, pero no se presenta la revisión lingüística completa como terminada. Los totales nativos incluyen backups privados y fixtures QA. Windows habitual intacto, sin reintentar su automatización; TalkBack, tacto/stylus y matriz física siguen pendientes.

## Restitución y siguiente prioridad

[Restauración](../../../output/android-v3-storage-usage-restoration-23.json): cuatro hashes originales coinciden, avión 0/Wi-Fi 1/datos 0, dos backups retirados, alias desvinculado y destino conservado durante la prueba; documento/proyecto sintéticos retirados tras verificar raíz, lista exacta y hash. Catálogo de prueba retirado solo tras comprobar que contenía exclusivamente la identidad QA; XML/forward propios retirados. QA detenida y emulador disponible.

**Siguiente C24:** corregir validación de rutas/identidades y acuses en los índices antes de ofrecer limpieza regenerable. La revisión estática detecta que el borrado actual ignora errores y construye la ruta con el ID recibido; queda registrado como riesgo de integridad prioritario, sin probarlo sobre datos ajenos. Se comprobará en TempDir aislado y no se prepara una candidata con ese riesgo pendiente.

Siguen limpieza regenerable, revinculación, archivo/cuotas/falta de espacio y el resto de F17; también todas las ampliaciones técnicas, funcionales y UX/UI del [plan completo](plan.md). Diez paquetes iniciados, ninguno cerrado completamente. VERSION 2.6.0; sin commit, integración, publicación ni aceptación humana de 3.0. [Avance anterior](avance-22.md).
