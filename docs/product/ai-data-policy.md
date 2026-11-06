# Datos y conservación de IA

Política de producto vigente descrita por GET /api/ai/data-policy, versión1. Corresponde al comportamiento local actual; no añade categorías de persistencia ni promete verificación de políticas externas. La autorización de implementar la revisión3.0 cubre hacerla visible, conservando la retención actual.

## Transmisión
Una acción de IA envía su solicitud y el contexto preparado según documento/selección, adjuntos, permisos y capacidades. Puede incluir fragmentos recuperados del índice local, imágenes o audio cuando se usa la capacidad correspondiente. Crear/consultar este contrato y consultar el índice no llaman a proveedores. La representación de cada petición y sus fuentes específicas siguen siendo responsabilidad del flujo de contexto.

## Conservación en el dispositivo
- Conversaciones por proyecto: prompts, respuestas y eventos de operaciones; ventana rodante de hasta2000eventos, retirando primero los antiguos. El número procede de AI_CONVERSATION_MAX_EVENTS y no representa días ni2000solicitudes.
- Fuentes de contexto: representación local de adjuntos/texto seleccionado para uso posterior; sin caducidad automática por fecha.
- Resultados para revisión: contenido generado y metadatos de continuidad; no se conservan sobres de solicitud ni claves dentro de este almacén. El contenido generado puede contener información documental y requiere el mismo cuidado que un documento. Sin caducidad automática.
- Índice textual: copia auxiliar de texto guardado, local. Los fragmentos recuperados pueden incorporarse al contexto de una acción. No es una copia de borradores ni OCR. Debe reconstruirse tras cambiar fuentes; sin caducidad por fecha.

## Eliminación y límites
Las categorías son independientes. Borrar eventos de conversación no borra adjuntos, resultados conservados, índices ni documentos. Retirar un índice o un resultado de revisión no borra documentos originales. Borrar datos en el dispositivo no acredita eliminar copias en un proveedor. La aplicación no verifica su retención ni ejecuta una eliminación remota por ese borrado local.

La explicación de Ajustes/IA es plegable, consulta el runtime al abrir y no muestra reglas no verificadas para un contrato incompatible. La vista web de desarrollo usa un fixture central tipado, no evidencia de retención nativa. Este contrato describe reglas; no lee documentos, conversaciones, credenciales ni configuración privada. Diagnóstico mantiene sus reglas independientes sin prompts/documentos.

Siguen pendientes: gestión integral/revisión de borrado concurrente de conversaciones, controles finos por proyecto/proveedor y demostración completa de todos los datos existentes. No hay una acción de borrar todo implícita, expiración nueva ni aceptación de políticas externas.
