# Bloque 9 · Copias programadas

Fecha: 2026-11-06. Continuación autorizada del plan 3.0. Sin gasto en IA.

## Reparto real y ámbitos

- handwritten_ocr: servicio Rust y empaquetado de copias; pruebas de persistencia, retención y restauración.
- recording_sources: tipos y API frontend con comprobación de acuses; revisión cruzada de contratos.
- meeting_minutes: panel de ajustes, consentimiento y recuperación visible; pruebas de interacción y capturas.
- Coordinador: rutas, admisión nativa, planificador en proceso, conexión con el espacio de trabajo, inventarios, integración y cierre.

## Criterios de cierre

- [x] Desactivadas por defecto; frecuencia diaria optativa, independiente de que ajustes estén abiertos.
- [x] Copias portables de contenido guardado y borradores persistidos; alcance y omisiones visibles.
- [x] Identidad monotónica consumida antes del efecto; acuse incierto se consulta sin repetir la copia.
- [x] Retención sólo con consentimiento y una copia posterior verificada; historial lleno puede aplicar conservación diferida con ancla compatible revalidada que siempre se conserva. Parciales y desconocidos se conservan.
- [x] Política vinculada a perfil y ubicación; importación o cambio de origen no activa automáticamente copias.
- [x] Restauración explícita hacia el flujo normal de importación, también si desaparece la raíz original.
- [x] Cupos y actividad prolongada no bloquean guardados del editor; sin proveedores ni servicios auxiliares.
- [x] Pruebas focalizadas, compilación, revisión de contrato y evidencia visual; sin repetir suites completas.

La programación funciona mientras la aplicación está ejecutándose. La aceptación instalada en dispositivos pertenece al cierre de plataforma y no se sustituye por estas pruebas.


## Cierre verificado · 2026-11-06

22casos nativos únicos y54frontend únicos aprobados. TypeScript/build correctos y Rust/Tauri aarch64-linux-android comprobado con NDK28.2.13676358, sin errores; la configuración de toolchain recompiló una dependencia y duró7m26s. Ocho capturas620–627 revisadas. Sin suites completas, IA, instalación ni aceptación física. Backlog50/cobertura70 conciliados. Continúan UX10, escala/regresión11 y aceptación P10.
