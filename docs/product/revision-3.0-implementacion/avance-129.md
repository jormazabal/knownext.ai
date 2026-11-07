# Avance 129 · Bloque 1: conservar, cerrar y continuar con seguridad

[Reporte visual](avance-129.html) · [Alcance y límites](bloque-129.md) · [Backlog](backlog.csv).

Bloque 1 cerrado en desarrollo local; comprobaciones dirigidas y composición final correctas.

## Implementado

Centro común de las 20 familias conocidas; respaldo privado completo de los bytes revisados y preparaciones parciales; identidades terminales conservadas fuera del cupo activo, sin reciclado ni repetición. Los cierres interrumpidos requieren consulta y confirmación nuevas. La retirada exige elegir otra vez un respaldo externo y verificar sus entradas, manifiesto y SHA; conserva identidades y huellas y trabaja por grupos de 16 archivos.

Orden de dependencias: los recibos de conflicto solo se cierran después de resolver la conservación de sus payloads; una aplicación mixta no se archiva mientras retenga la admisión del proyecto; un plan puede conservarse después de su aplicación y una plantilla no se cierra mientras una transferencia la necesita. Se conservan archivos y borradores del proyecto.

Preparaciones incompletas: nueva selección con identidad distinta y elecciones/bases verificadas, sin aplicar archivos. Cierre revisado de recibos conocidos con payload ilegible, conservando las copias sin reparar ni deshacer; la admisión se libera solo si pertenece a esa preparación. Formatos desconocidos no conceden esa autoridad.

Aplicación mixta 2 registra modos antes/después y conserva compatibilidad con 1. Contenido ejecutable sin cambios implícitos en índice/historial; cambios de permiso admitidos donde el sistema los representa y rechazados explícitamente en Windows cuando exigirían tocar el índice. Publicaciones internas y versiones respetan la reserva del proyecto; nueva captura/transferencia pasan por la admisión opcional.

Revisión de compatibilidad por los validadores de cada servicio; legado compatible no se convierte por obligación, cachés futuras/ilegibles permanecen. Una transición auxiliar conocida conserva antes sus bytes y manifiesto. Resumen por proyecto distingue acceso a archivos, historial comprobado, remoto sin consultar, continuidad y respaldo externo sin verificar.

## Comprobaciones

18 contratos nativos únicos correctos (12 de almacenamiento/formatos, 1 de clasificación nativa y 5 de variantes/conservación). Los 22 casos frontend/SDK afectados son correctos, reutilizando resultados no invalidados; se repitieron únicamente los casos corregidos. TypeScript y build de producción correctos. Composición Tauri Windows comprobada sobre las fuentes finales. El límite de 2 MiB del manifiesto se comprueba antes de publicar la identidad; la comprobación final cubre ese guard adicional. No se ejecutaron suites completas.

Capturas 547–554: diálogo y paneles reales, con controladores React y adaptadores de API sintéticos; navegador Chrome sin interfaz visible. No se inyecta un puente Tauri. No equivalen a selectores nativos, aplicación instalada ni aceptación física. A 320 px: sin desbordamiento horizontal y controles revisados de al menos 44 px. Un acuse incierto no repite la retirada y requiere otra revisión.

Evidencia: output/v3-integrity-final-native.log; output/v3-integrity-final-dependencies.log; output/v3-integrity-composition-final.log; output/v3-integrity-targeted-frontend.log; output/v3-integrity-dialog-fix.log; output/v3-integrity-incomplete-final.log; output/v3-integrity-types-final.log; output/v3-integrity-build-final.log; output/v3-integrity-browser-evidence.json; output/v3-integrity-incomplete-browser.json; output/v3-integrity-verification.json. Se conservan los fallos iniciales y las correcciones en los logs, sin contarlos como casos adicionales.

## Pendiente del programa

Piloto y aceptación instalada Windows/Android, regresión final al terminar el programa y campañas de cortes físicos/espacio/dispositivos. Android no se recompila mientras persista la incidencia ya registrada del entorno Gradle. Combinación visual por bloques, copias programadas y portabilidad integral permanecen en sus bloques funcionales. P01/P05 completos y la versión 3.0 global siguen abiertos.

Sin proveedores ni gasto IA; sin instalación, publicación o cambio de VERSION 2.6.0.
