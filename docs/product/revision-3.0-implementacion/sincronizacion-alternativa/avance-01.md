# SC01 · Primera integración en paralelo

> Histórico: [plan vigente revisión3](plan.md). El enfoque Proton por carpeta fue descartado por no satisfacer conexión directa Windows/Android y sesión persistente. Esta evidencia conserva su alcance original; no acredita la nueva integración.

2026-11-06. Desarrollo parcial; no es una candidata instalada ni sincronización cloud operativa.

## Trabajo integrado

Cuatro agentes reales en total: coordinador, núcleo/migración, conectores y UX. Ámbitos separados; compilación Rust centralizada. El agente de núcleo realizó después una revisión independiente de transportes, interfaz y dispatch.

- Rutas Tauri locales de capacidades, estado, revisión, aplicación y cancelación.
- Inventario local acotado con hashes, exclusiones visibles, recibo durable y rechazo de revisiones obsoletas/manipuladas. GitHub y documentos se conservan.
- Conciliación pura de tres vías: duplicados, edición concurrente y borrado frente a edición. Todavía no está conectada a una cola de sincronización entre dispositivos.
- Adaptadores HTTP nativos Graph/Drive: páginas acotadas, identidad durable Google, creación de objetos de hasta8MiB y recibo tras descargar/verificar contenido e identidad. Sin autenticación integrada ni llamadas de cuenta reales.
- Asistente React de destino/comprobación/cambio, entrada desde el menú del proyecto activo, motivos de indisponibilidad y protección frente a activaciones ficticias.
- Trabajo de revisión y consulta fuera del mutex global del editor. La revisión independiente detectó un GET que podía esperar el gate del inventario bajo ese mutex; se corrigió su despacho.

## Verificación

Comprobaciones dirigidas terminadas:19casos frontend únicos correctos, TypeScript final correcto y21casos Rust únicos correctos (18unitarios reutilizados,1expectativa de prueba corregida y2contratos runtime). No suites completas, compilación nativa de instaladores, IA o publicación. El primer intento Rust encontró un error de visibilidad entre módulos: se corrigió. Un caso posterior esperaba exclusivamente la omisión del archivo oculto del usuario e ignoraba la carpeta interna de coordinación de la fixture: se corrigió sólo la expectativa y se repitió ese caso; los18correctos no se repitieron. Los2contratos runtime se ejecutaron sobre el binario ya compilado, pues el único cambio posterior era cfg(test).

[Recibo y procedencia de resultados](verificacion-01.json). La evidencia Vitest es la salida de herramientas del subagente; no se han inventado logs locales que no conservó. El recibo distingue pruebas de código y aceptación real.

[Vista escritorio del componente real](../../../../output/playwright/revision-3.0/sc01-destino-1280.png) · [vista390px](../../../../output/playwright/revision-3.0/sc01-destino-390.png).

Las capturas usan el componente real y datos controlados, con etiqueta visible; no acreditan cuentas, transferencias reales, Tauri instalado o aceptación del diseño definitivo.

## Estado real del plan

| Bloque | Estado |
|---|---|
| B0 | Evaluación documental y transportes parciales; faltan OAuth nativo y aceptación de APIs con cuentas sintéticas. |
| B1 | Base de revisión/recuperación y UX integrada; sin cola de transferencia activa ni recorrido OneDrive completo. |
| B2/B3 | Google/Android no aceptados: faltan integración de cuentas, sincronización, migración y recorridos entre equipos. |
| B4 | Proton no habilitado; modalidad y transporte real pendientes. |
| B5/B6 | Ampliaciones y aceptación conjunta pendientes. |

## Dependencias y siguiente desarrollo

Las variables de registro OAuth de Microsoft, Google desktop y Google Android no están configuradas en este entorno. Se preguntó por su disponibilidad y responsable sin solicitar secretos. Esto limita conexiones reales; además sigue faltando desarrollo de almacén multicuenta, login/renovación, cola durable, transferencia incremental/reanudable, recepción y cambio entre proveedores. No se presenta la falta de registros como única tarea pendiente.

Continuar por autenticación segura y su contrato de cuenta; integrar el transporte con cola y recepción verificadas; completar OneDrive Windows y migración antes de anunciar B1 terminado. Hasta entonces las capacidades cloud permanecen no disponibles, aunque un identificador OAuth se configure. C1 conserva su aceptación previa y su binario instalado; no incluye esta ampliación.
