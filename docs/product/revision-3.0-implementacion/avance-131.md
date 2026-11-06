# Avance131 · Bloque3: seguridad, privacidad y control de IA

[Reporte visual](avance-131.html) · [Criterios](bloque-131.md) · [Matriz técnica](../../architecture/security-and-privacy.md) · [Backlog](backlog.csv).

Bloque3 cerrado en desarrollo local dentro del alcance acordado. La aceptación instalada y la regresión global permanecen en P10; la campaña real IA sigue aplazada por no gasto.

## Implementado

Credenciales: revisión sin secretos ni migración al consultar, rotación/retirada por huella, serialización con autenticación y sesión pública invalidada cuando cambia GitHub. El formulario de clave existente usa el contrato revisado. Restablecer/restaurar conserva antes una copia exacta cifrada con protección nativa, verificada por descifrado; nunca una copia en claro. Restauración solo de copias compatibles y con huella vigente. Las copias ilegibles/futuras se conservan para recuperación compatible, sin prometer reparación. Gestión explícita de copias privadas con fecha/compatibilidad, revisión y confirmación.16 copias/16MiB, lectura individual2MiB; ninguna revocación en proveedor ni exportación de secretos a React.

Privacidad: política por proyecto para pausar nuevos envíos de texto, imágenes, investigación, dictado y fragmentos de grabación antes del presupuesto/proveedor. Capturar/guardar local sigue disponible; una llamada iniciada no se interrumpe por fuerza. Archivo estricto1 de256 proyectos/256KiB, cambio por revisión. Una política ilegible/futura no concede permisos vacíos.

Conservación/eliminación manual de conversación, contexto, resultados, índice e investigación, con30/90/365días o totalidad. Se usa la fecha más reciente conocida; sin fecha se conserva al filtrar antigüedad. Revisión de cantidades/huellas/raíz/política y confirmación nuevas; pausa e inactividad requeridas. Archivos originales, borradores, historial, audio/transcripciones, contabilidad, recuperación, exportaciones y copias de proveedor se excluyen expresamente y mantienen sus propios flujos. No hay caducidad automática, borrado remoto o garantía forense.

Exclusión privada durante cálculo/espera/publicación impide eliminar mientras otro trabajo compatible pudiera repoblar esos datos. Revisión conjunta128MiB/260 archivos, con límites menores de cada almacén. Recibos mínimos1 sin contenido, máximo1000 identidades/64KiB cada uno, creados antes del primer efecto. Cada archivo es atómico, el conjunto puede quedar parcial. Fallos se observan sin deshacer ni repetir; consultar un recibo applying sin trabajador lo describe como interrumpido sin reescribirlo. El mismo ID nunca vuelve a ejecutar. Otra eliminación exige revisión e identidad nuevas.

Permisos y autoridad: inventario de16 entradas IPC registradas y enum nativo; las superficies privadas se deniegan a grabaciones y ventanas desconocidas. Plugin de navegación común para origen local Tauri y about:blank, desarrollo acotado y hosts/protocolos externos rechazados. Enlaces explícitos solo http/https sin credenciales ni controles. CSP de recursos conservada; la política visible diferencia imágenes remotas de envíos IA.

Límites previos al negocio/decodificación:64 archivos, JSON64 niveles/250000 nodos/192MiB de texto,180MiB de base64 por archivo y352MiB conjunto; vector de recorrido acotado antes de crecer. Contexto32MiB por fuente y base64 inválido no se convierte en vacío. Los validadores específicos de imágenes, paquetes/ZIP, notas, plantillas, bundles/WAV y datos privados siguen siendo obligatorios; traversal/alias/futuros no obtienen otra autoridad. El control no promete impedir toda asignación inicial de IPC/WebView ni todo pico de memoria.

readOnly explícito y estructurado reduce permisos presentados al proveedor y rechaza efectos recibidos. Proyecto/raíz/base/borrador/permiso se revalidan; una referencia no amplía autorización y un ACK del modelo no demuestra aplicación nativa. No se emplean heurísticas de texto/idioma para resolver intención.

UX: controles integrados en IA documental, plegados y consultados al abrir, proyecto explícito, selector de categorías/antigüedad, cantidades y exclusiones antes de confirmar. Acuse incierto ofrece consulta, no otra eliminación. Recuperación de claves con original conservado, efecto local claro y fecha de copia. Respuestas tardías de superficies cerradas no sustituyen el proyecto actual. Buscador incluye privacidad/retención/credenciales.

## Verificación

34 contratos nativos únicos correctos:14 nuevos y20 afectados. Cubren DPAPI real con claves sintéticas, preservación de otro proveedor, almacén ilegible, original cifrado exacto/restauración, revisión vieja; pausa, trabajo activo, cinco categorías, fechas, parcialidad por solo lectura, recibo huérfano y antirrepetición; autoridad/ventanas, navegación, entradas e importaciones. Los efectos IA del corpus usan ejecutores controlados, nunca un proveedor.

42 casos frontend correctos:40 de SDK/paneles/ajustes/enlaces más2 de búsqueda. Tras ajustar los paneles solo se repitieron sus5 casos. TypeScript y build de producción finales correctos. Composición Tauri Windows de biblioteca compilada en la ejecución nativa final; no es un instalador ejecutado.

Correcciones de cierre: lectura de copias acotada también al calcular/revalidar su huella; restauración vinculada a la huella de la copia; retención incluye fechas receivedAt/indexedAt. El recibo huérfano evita espera indefinida de UI sin ejecutar al consultar. Un test de importación suponía carpeta inicial vacía aunque la propiedad del proyecto ya crea estado técnico: ahora compara nombres con la situación inicial del fixture, sin abrir metadata/contenido de coordinación. Solo se repitió el objetivo corregido. Los fallos iniciales siguen en sus logs y no se cuentan como casos adicionales.

Capturas559–564: App/ajustes/Milkdown/controladores reales con módulo API de seguridad sintético; no puente Tauri. Revisión, acuse incierto, consulta confirmada y recuperación del almacén. Una sola eliminación, una consulta de acuse y un cambio de credenciales en la campaña; documento conservado. A320×720 no hay desbordamiento, controles y etiqueta de confirmación revisados de44px. El formulario desplaza su contenido dentro de ajustes; no se presenta como una barra fija de grabación. Cero errores de página y cero solicitudes externas.

Logs: output/v3-security-block-native-complete.log; output/v3-security-block-affected-native.log; output/v3-security-block-formats-authority.log; output/v3-security-block-formats-authority-final.log; output/v3-security-block-receipts-final.log; output/v3-security-block-import-final.log; output/v3-security-block-frontend.log; output/v3-security-block-panels-final.log; output/v3-security-block-search.log; output/v3-security-block-build-final.log; output/v3-security-block-browser-captures.log; output/v3-security-block-browser-evidence.json; output/v3-security-block-verification.json.

Backlog50 y cobertura70 con IDs únicos conservados. T06/T07/T08/T09/T16 conciliados; F09/T17 y capacidad de permisos reflejan la relación real. Plan padre/P02, matriz y checklist actualizados. Las descripciones anteriores permanecen como cortes históricos, sustituidos por131 en estos contratos.

## Fuera de este cierre local

P10: aceptación Windows/Android instalada, CSP/recursos y permisos del WebView empaquetado, Keystore/dispositivos reales, suspensión/actualización, cortes/espacio físicos, rendimiento representativo y regresión completa al terminar el programa. No se activa UI nativa Windows ni se reintenta Gradle mientras persista la incidencia registrada. Otros bloques mantienen portabilidad, edición, audio/OCR y UX restantes. T17 no dispone de calidad/coste/latencia reales medidos: campaña aplazada por decisión de no gastar. Sin garantía de inmunidad total, revocación externa o eliminación remota/forense.

Sin proveedores ni gasto IA; sin instalación/publicación, commit/push ni cambio de VERSION2.6.0.
