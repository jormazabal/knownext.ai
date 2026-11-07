# Avance88 · publicación sin reemplazo

[Reporte visual](avance-88.html).

### Bloque88 · publicación completa sin reemplazar otro destino
T02/T03/F04/F15: movimientos, renombrados, entrada/restauración de papelera y publicación de proyectos preparados comparten rename_no_replace. La comprobación previa de destino libre ya no es la única defensa: si otro creador ocupa el nombre después, la publicación nativa se rechaza y ambas ubicaciones se conservan. Incluye carpetas vacías. No se usa fallback de copia/borrado o rename que sustituya contenido. Las sustituciones autorizadas de atomic_io::write mantienen su contrato separado.

atomic_io::create escribe ahora un temporal exclusivo en el directorio de destino, vacía su contenido y solo después publica sin reemplazo. Un error de escritura no expone un documento parcial ni limpia ciegamente la ruta pública. La limpieza del temporal solo se intenta si esa operación lo creó; un fallo al reservar su nombre no borra otro temporal. Un corte puede dejar el temporal privado para revisión; no se introduce poda automática. No se promete exclusión de procesos externos que alteren directorios antecesores o el contenido fuente durante la operación.

Windows usa MoveFileExW sin REPLACE_EXISTING ni COPY_ALLOWED, con rutas Unicode extendidas. Android/Linux usan renameat2 RENAME_NOREPLACE por syscall; si el kernel/sistema de archivos no lo admite, se rechaza conservando originales. Referencias del contrato: [Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw) y [Linux man-pages](https://man7.org/linux/man-pages/man2/rename.2.html). Sin servicios auxiliares ni cambio de formato de documentos.

Contrastado en Windows: ocho casos del módulo de publicación, tres casos de papelera y dos contratos afectados de movimientos/traslado de proyectos. Incluyen fallo parcial antes de publicar, creador tardío, carpeta vacía, conservación de fuente/destino, Unicode/ruta larga y cambio de mayúsculas. La rama Android del módulo y su syscall compilan para x86_64-linux-android con libc real; es comprobación de módulo, no ejecución en dispositivo ni APK. Sin suites completas ni cambios visuales del producto en este bloque.

Pendiente inmediato: revisión vinculada y límites del inventario de papelera, futuros/entradas desconocidas, resultados inciertos tras restauración. Retención/cuotas de otras familias, grafo Git transaccional, portabilidad y demás capacidades permanecen abiertos. Sin candidata, instalación o publicación.