# Avance140 · Consolidación y candidata C1 instalada

**Cierre del alcance QA local solicitado. Sin publicación.** Tres subagentes reales y coordinador han cerrado consolidación documental/Git, arreglo del MSI y aceptación instalada Android. No equivale a autorización de distribución ni a aceptación productiva completa.

## Entrega y trazabilidad

- Consolidación funcional: `fe416299`. Fuente de la aplicación C1: `736e7484`, VERSION3.0.0.
- Arreglo del instalador: `a4dc873b`. El MSI se reempaquetó sin repetir frontend/Rust; su ejecutable instalado mantiene SHA256 `ED789DC3C7420A6932A90D316A4A57294F8A6C39EC3C7D6FCD290FADAD2FE433`.
- [Recibo canónico](../../development/candidate-c1-validation.json), [alcance](consolidacion-140-alcance.md) y [criterios](bloque-140.md). Logs/capturas/binarios están en output local ignorado; el recibo versionado conserva sus hashes, no su disponibilidad en un clon limpio.

## Windows · MSI aislado instalado y corregido

La licencia OFL usa componente estable por familia, KeyPath HKCU y cuatro retiradas de carpetas vacías. Un guard previo rechaza recursos adicionales/reemplazados o fuente no revisada. No se ocultan validaciones WiX. La revisión independiente y COM detectaron además un escape incorrecto que dejaba variables literales en la clave: se corrigió antes de consolidar el MSI definitivo.

MSI final `DAC25F7BEFA709546C788B8831A09A183455E0BF36AB2B92949314A683C24845`, reinstalado con salida0. COM y registro instalado confirman `Software\knownext\KnowNext.ai C1\Components`, HKCU y valor1. Licencia instalada idéntica a la fuente. Nombre/identificador/UpgradeCode separados; la instalación habitual2.6 no se sustituye.

Ventana nativa activada; proyecto con Git local sin cuenta, edición Milkdown, Guardar visible, guardado sólo con teclado mediante Ctrl+Shift+P→Guardar documento activo→Enter, SVG local, configuración contextual y diagnóstico3.0 contrastados con runtime real. Rust y archivo coinciden, sin borrador. La reapertura tras detención controlada posterior al guardado conserva contenido. No se certifica cierre suave ni recuperación de trabajo no guardado.

Tras reinstalar el MSI corregido se verificaron otra vez arranque/salud nativos, identidadQA y lectura íntegra del documento `7EE119262B6B4328D0EA6BDF6B6E459ABF69BD98FBF7ACFA617E3CC821D92E6D`. La campaña UI se reutiliza porque el ejecutable es idéntico. El proceso QA se detuvo después; el proceso habitual permanece intacto. Ctrl+S no es un atajo implementado ni se anuncia como verificado.

## Android · aceptación instalada cerrada

APK QA3.0.0/code3000000 `8386f3aa85057e24b0d7d57eb65296c9412ac4c86206a0fd5b10615ac438c19b`; el APK instalado coincide, igual que JNI y licencia empaquetados. Certificado de QA y UID conservados sin desinstalar ni borrar datos. La QA anterior etiquetada2.6 era QA64, no la distribución pública2.6: esta prueba no acredita esa migración productiva.

Emulador API36/x86_64 sin red durante aceptación. Testigo previo íntegro tras actualizar; apertura con un único evento táctil real del emulador, edición Milkdown, Guardar y una reapertura confirmados por UI/API/bytes. Documento final `023f7cb4d47f0558a25f0007af47ae1fe5e00668fd2e957334f89fb25f61d84e`, limpio y sin borrador. Sistema/Vista avanzada muestra tiempos locales y permite volver a vista básica y al mismo documento sin alterarlo. Cero errores de página observados tras conectar la inspección.

Las notas de versión se abren intencionadamente al actualizar; el primer ensayo asumió erróneamente que el documento estaría activo. El ensayo de ajustes usó después el selector móvil correcto. Se conservan esos intentos históricos; no se presentan como fallos de datos ni como comprobaciones aprobadas. La reanudación repitió únicamente el recorrido pendiente, sin nueva instalación/escritura/build/suites.

QA detenida, cero procesos/trabajadores de proveedor del paquete, red restaurada a avión0/Wi-Fi1/datos0. El AVD propio se cerró tras verificar PID/comando/serial, sin wipe/clear/uninstall; APK y datos se conservan. La copia JNI temporal verificada se retiró, conservando la biblioteca compilada y el APK.

## Verificación reutilizada y pendientes

Se reutilizan1.158casos frontend,740Rust y2benchmarks de139. Los3casos dirigidos del guard de instalador y el rechazo real de un override incompatible ya estaban contrastados; no se repiten suites completas. El cambio final de escape se acredita por reempaquetado/COM/reinstalación y no invalida la UI de un binario sin cambios.

Quedan firmas de distribución y artefactos oficiales, actualización con identidad productiva/migración pública2.6 y vuelta, ARM/dispositivos físicos, SAF/Keystore/restauración, audio/suspensión/cortes, IME/DPI/lectores/lápiz y piloto U16. T17 con proveedor real sigue aplazado por decisión de no gasto. Sin push, tag, ejecución de release.yml, publicación, regeneración de claves ni llamadas facturables IA.
