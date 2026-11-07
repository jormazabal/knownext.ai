# Avance 08 · Recuperar sin sustituir el original

31/10/2026 · Rama `codex/v3-programa` · [Resumen visual](avance.html)

## Implementado

- **P05 / F04 y F06:** el diálogo Recuperación distingue archivos ausentes, copias que requieren revisión y copias apartadas. Las categorías y Cerrar permanecen fuera del desplazamiento de los resultados. La fecha y un extracto permiten distinguir variantes antes de actuar; los detalles técnicos quedan plegados.
- **P01 / T02, T03 y T05:** inventario sin migración ni aplicación automática de variantes, JSON dañado, identidad no coincidente, proyecto inaccesible y archivos no permitidos. Las copias ordinarias de archivos existentes siguen en su documento. Las consultas comprueban límites de entradas, bytes y tiempo entre archivos; una revisión parcial lo anuncia.
- **P05 / F04:** recuperar como otro archivo exige proyecto y nombre, comprueba la huella revisada y crea exclusivamente en un destino libre. Sirve para Markdown y notas a mano, incluso si desapareció el proyecto original. Conserva la copia de origen y no reemplaza el documento existente.
- **P05 / F04:** apartar exige confirmación. Primero escribe y verifica los bytes originales y un registro privado con huella; después intenta retirar la copia del almacén activo. Un fallo posterior devuelve un resultado parcial y conserva la copia archivada. No hay caducidad ni limpieza automática del archivo privado.
- **P05 / F04:** «Apartadas» permite revisar y recuperar contenido válido como otro archivo. Una copia archivada que no coincide con su registro se identifica y no se aplica. Los bytes dañados se conservan aunque no puedan convertirse en un documento.
- **P03 / U10 y P06 / U12:** categorías móviles de 44 px; formularios mantienen proyecto y nombre ante fallo, impiden doble envío y distinguen una creación confirmada de un fallo al actualizar la vista. El extracto es texto sin HTML ejecutable ni carga de recursos; las notas muestran resumen de páginas y trazos.

## Verificación

- **397 pruebas frontend / 86 archivos**, superadas: `v3-frontend-tests-19.log`. Diez pruebas focalizadas contrastan recuperación, confirmación, retención del formulario, resultados parciales, respuestas tardías, categorías y contratos API.
- **207 pruebas Rust**, superadas: `v3-rust-tests-17.log`, incluidas 130 de almacenamiento y 15 de documentos. Una ronda anterior detectó que el test exigía 1.000 entradas aunque podía vencer antes el límite temporal; se corrigió esa expectativa, sin quitar el límite del producto.
- TypeScript y **APK Android QA 14** correctos: `v3-recovery-types-04.log` y `v3-android-qa-build-14.log`. Siguen los avisos conocidos de chunks grandes, código Rust no usado y Gradle.
- Android API 36 x86_64, `ai.knownext.mobile.v3qa`, sin conexión: se prepararon dos variantes y un JSON dañado en el paquete aislado. El inventario identificó las tres incidencias sin modificar el disco.
- Se revisó el extracto de la variante B y se recuperó como un archivo nuevo. Ambas variantes permanecieron y la huella SHA-256 del documento original siguió siendo exactamente la inicial.
- Se apartaron el JSON dañado y la variante B mediante confirmaciones de la UI. Sus huellas coincidieron con las copias originales. Después se recuperó B desde Apartadas como un segundo archivo nuevo; la copia archivada permaneció.
- Tras instalar el APK 14 y reiniciar el proceso, los dos elementos apartados y el texto recuperado permanecieron; la huella del original siguió intacta. Un nombre ya ocupado produjo error, mantuvo el formulario y conservó el nombre escrito.
- [Categorías fijas](../../../output/playwright/revision-3.0/26-android-recuperacion-categorias.png) y [extracto](../../../output/playwright/revision-3.0/27-android-recuperacion-extracto.png): capturas reales del APK 14, inspeccionadas. Anchuras de contenido y viewport: 412 px; categorías visibles de 44 px.
- [Evidencia nativa](../../../output/android-v3-recovery-evidence.json) e [inventario posterior a la compilación](../../../output/android-v3-recovery-inputs-14.json). Fixtures mediante API local y ADB con el paquete detenido; acciones mediante DOM del WebView nativo. Sin proveedores facturables. No acredita tacto físico, TalkBack o teclado virtual.
- En el arranque del emulador apareció el diálogo de System UI sin respuesta, con el paquete QA detenido; se eligió Esperar desde los límites del XML accesible. No aparece en las capturas publicadas. Al finalizar se detuvo QA y se cerró la conexión; se comprobó modo avión 0, Wi-Fi 1 y datos 0 antes de cerrar el emulador propio.

## Pendiente y siguiente corte

Diez paquetes iniciados; **ninguno cerrado completamente**. Este corte no completa el centro integral: quedan copias programadas, portabilidad, retención gestionada por el usuario, recuperación de archivos fuera de los límites y coordinación atómica entre procesos. Una copia dañada conservada no equivale a contenido reparado. El extracto no representa toda la fidelidad visual del documento ni de los trazos.

Continúan todos los pendientes del [plan completo](plan.md): privacidad y recuperación de credenciales, trabajos largos, ajustes y navegación contextual completa, edición/IA, captura avanzada, índice/plantillas/investigación, exportación y plataformas, accesibilidad/DPI y piloto/candidata. El siguiente corte desarrolla la configuración dentro del sistema de paneles y su simplificación, conservando la sesión documental.

VERSION continúa en 2.6.0. Sin commit, push, integración, publicación ni aceptación humana de 3.0.
