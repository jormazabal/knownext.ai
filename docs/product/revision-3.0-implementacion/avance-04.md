# Avance 04 · Continuidad, seguridad nativa y primer uso

31/10/2026 · Rama `codex/v3-programa` · [Resumen visual](avance.html)

## Implementación

- **P01 / T03 y U07:** las cargas de Markdown y notas manuscritas identifican la solicitud vigente y comparan el contenido y la base antes de aplicar su respuesta. No resucitan sesiones cerradas o movidas, ni sustituyen ediciones o guardados posteriores. La recarga no remonta el editor mientras espera; solo cambia su versión al aceptar la respuesta. Los errores conservan el contenido y ofrecen reintento, sin un bucle automático de reaperturas fallidas.
- **P01 / U07:** se respeta `activeUtilityTab=null` al normalizar configuración; antes se convertía en Notas en cada lectura. Se restaura la superficie elegida cuando hay Markdown y notas manuscritas abiertos. La barra estrecha identifica la utilidad realmente activa.
- **P02 / T06:** Windows usa DPAPI del usuario y Android utiliza AES-256-GCM con Android Keystore. Migración tras comprobar cifrado/descifrado y sustitución atómica. Errores de lectura, autenticación o persistencia conservan el almacén. Los límites evitan escribir un sobre que después no pueda abrirse. Los cambios de claves y cierre de cuenta propagan fallos, y React recibe estado y vista parcial, no el secreto completo.
- **P02 / T07:** CSP de producción y desarrollo diferenciadas; se eliminan permisos de shell, proceso y actualizador de la ventana de grabaciones. El runtime toma la identidad de ventana de Tauri y limita la bandeja a grabación y consulta de destinos. El protocolo de recursos y los comandos generales del espacio exigen la ventana principal. La política no constituye un aislamiento total de toda la aplicación.
- **P05 / F15:** los lotes separan movimientos físicos y actualización de referencias de imágenes. Así, actualizar una referencia no invalida la huella de un documento todavía pendiente del mismo lote. El registro conserva los movimientos y la necesidad de revisar referencias ante interrupción o fallo. La UI distingue ejecución en curso de interrupción.
- **P06 / U06 y U12:** bienvenida con proyecto o notas personales; alta disponible también en acceso rápido. Textos de almacenamiento correctos en Android. Los formularios de proyecto y documento conservan sus datos ante errores, bloquean doble envío y utilizan la misma frontera de foco. Los pasos del asistente se compactan en móvil.
- **P03 / U01–U03:** navegación cerrada invisible también para el foco; acciones móviles independientes de las preferencias de escritorio. Corregido el ancho mínimo de pestañas auxiliares que desplazaba la pantalla nativa. Apertura con un toque implementada y cubierta en componente. El acceso a grabaciones pasa a la barra común para dejar libres los controles de guardado.
- **P03 / U13:** acento funcional terracota unificado también en diálogos, conservando un único juego de tokens. El botón primario examinado en navegador registra contraste de texto **6,17:1 en claro y 8,40:1 en oscuro**. Es una medición de ese control, no certificación completa de todas las superficies.

## Contrastes confirmados

- **370 pruebas frontend / 79 archivos**, todas superadas (`v3-frontend-tests-11.log`). La última mejora de continuidad/foco tiene además 13 pruebas focalizadas superadas (`v3-load-focus-tests.log`). No se suman como pruebas diferentes.
- **166 pruebas Rust del workspace**, incluidas 93 de almacenamiento, todas superadas (`v3-rust-tests-11.log`). Compilación TypeScript/Vite y APK QA superadas (`v3-android-qa-build-06.log`); se mantiene el aviso de chunks grandes, pendiente T10.
- Android x86_64 API 36, paquete separado `ai.knownext.mobile.v3qa`, red desactivada antes de las operaciones. Alta de proyecto, creación, edición, guardado, reinicio de proceso y reapertura con contenido conservado. Tras corregir la selección, se restaura también el documento activo.
- Android Keystore real: migración de credencial sintética, ausencia del valor en el archivo cifrado, lectura tras reinicio y borrado. Un payload alterado con su checksum recalculado sigue siendo rechazado; el intento de sustituirlo no modifica el archivo. El sobre válido restaurado vuelve a abrirse. Los valores sintéticos no aparecieron en el buffer de logcat inspeccionado; no se afirma una inspección ilimitada de logs. La clave de prueba quedó retirada.
- CSP nativa Android: un corpus con Mermaid, tabla e imagen SVG local se representa correctamente sin rechazos CSP observados. La imagen se sirve por el protocolo privado de la aplicación. Esta comprobación no acredita todo el corpus ni las exportaciones.
- A 412 CSS px, el editor nativo registra `clientWidth=scrollWidth=412` y `scrollLeft=0`; navegación cerrada con `visibility=hidden`. Las capturas anteriores con desplazamiento se conservan como evidencia del defecto corregido.
- Actualización QA sobre los mismos datos: el sobre cifrado vacío sigue abriéndose, el corpus se conserva y Grabaciones está en la barra sin cubrir el feedback de guardado. La compilación nativa 06 precede al último ajuste global de color y al aplazamiento del remonte del editor; estos últimos tienen contraste web y pruebas focalizadas, respectivamente.
- [Evidencia Android estructurada](../../../output/android-v3-offline-evidence.json), [procedimiento y límites](../../development/v3-native-qa.md).

## Límites y siguiente trabajo

Diez de los once paquetes están iniciados; **ninguno está cerrado completamente**. El programa autorizado mantiene todas sus ampliaciones.

| Paquete | Trabajo todavía abierto |
|---|---|
| P00 | Corpus completo, mediciones de rendimiento y observación de usuarios |
| P01 | Coordinación y cancelación por recurso; migraciones y continuidad de todas las superficies |
| P02 | Recuperación guiada de credenciales inaccesibles, dispositivo nuevo/downgrade, política de datos, autoridad y evaluación IA |
| P03 | Referencias y propiedades contextuales; contraste y accesibilidad completos |
| P04 | Fidelidad editorial, revisión/trazabilidad y reversión de cambios IA |
| P05 | Borradores y sesiones tras actualizar referencias; enlaces documentales; conflictos, hitos, ciclo de proyecto y retención |
| P06 | Simplificación de todas las categorías, validaciones y primer uso por capacidad |
| P07 | Aceptación nativa del controlador compacto, estados, sesiones y DPI; dictado, OCR y actas |
| P08 | Índice incremental, plantillas, referencias e investigaciones |
| P09 | Corpus de exportación, transferencia y migración; matriz completa Windows/Android |
| P10 | Integración, piloto, candidata y release |

La interacción Android se automatizó con el DOM del WebView nativo y capturas ADB. No sustituye tacto físico, TalkBack, teclado virtual, rotación ni suspensión. La automatización visual Windows no pudo activar la ventana QA en el intento posterior al arranque; no se declara aceptación de bandeja/DPI. Las reglas de backup se compilaron, pero no se ha ejecutado restauración cloud/dispositivo. No se certifica StrongBox ni almacenamiento hardware del emulador.

No se han usado proveedores facturables ni migrado credenciales de la instalación del usuario. VERSION permanece en 2.6.0; no hay commit, integración, publicación, despliegue ni aceptación humana de 3.0.

Siguiente corte: continuar con referencias/borradores, cobertura contextual y los demás criterios del [plan evolutivo](plan.md).
