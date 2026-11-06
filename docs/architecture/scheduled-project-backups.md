# Copias locales programadas de proyectos

## Autoridad y alcance

Política por proyecto desactivada por defecto. La persona puede activar una copia diaria, elegir entre 1 y 16 copias verificadas conservadas e incluir el archivo privado. Retirar copias exige consentimiento separado. La programación vive en el proceso nativo, revisa vencimientos cada minuto y no depende de una ventana de ajustes abierta. No crea tareas del sistema operativo ni servicios externos. Una aplicación cerrada no ejecuta copias; al volver se admite una puesta al día, sin reconstruir todos los días omitidos.

El resultado es un paquete portable verificado de archivos compatibles guardados y, opcionalmente, borradores y datos privados ya persistidos. No incluye contenido que sólo existe en memoria del editor. La copia manual solicita antes proteger el trabajo abierto. El formato puede adaptar referencias para la restauración como proyecto nuevo; no es una imagen exacta del sistema de archivos. Las omisiones inesperadas producen una copia parcial, que no autoriza retención.

## Contratos

Base `/api/projects/:projectId/scheduled-backups`: GET observa inventario; PUT guarda política con revisión; POST `/run` consume `expectedGeneration` antes del efecto; GET `/:generation` observa su recibo; POST `/:generation/restore` prepara una importación convencional identificada. Ningún GET reanuda, repara ni repite operaciones. No hay ruta frontend para adelantar el reloj.

La identidad monotónica permanece aunque se retire un payload o una entrada histórica. Se conservan hasta 64 recibos activos; sólo los metadatos de copias retiradas y sin payload pueden dejar sitio a nuevos recibos. El acuse incierto se consulta por su generación. Restaurar reserva y conserva el identificador determinista del traslado antes de preparar el archivo. La interfaz abre exclusivamente ese identificador y exige revisión del destino en el flujo normal; no registra un proyecto automáticamente.

Política vinculada al perfil y raíz de origen. Cambiar ubicación o importar datos no activa copias. La persona debe confirmar explícitamente el nuevo vínculo. Un archivo histórico conocido puede restaurarse aunque el origen desaparezca, con confirmación de su procedencia y sin reactivar la programación. Restaurar una copia parcial requiere aceptar sus omisiones.

## Persistencia y concurrencia

Almacén privado `scheduled-backups/<sha256(projectId)>/state.json` y `backup-<generation>.zip`. Límite de 10 GiB por proyecto, incluyendo entradas desconocidas y preparaciones interrumpidas; los paquetes mantienen los límites portables de 512 MiB comprimido, 1 GiB expandido, 64 MiB por archivo y 10.000 entradas. No se eliminan entradas desconocidas para conseguir espacio. El inventario general muestra el consumo y el cupo por proyecto sin leer los contenidos.

La preparación y restauración se ejecutan fuera del mutex del editor, en la cola de transferencias. El servicio admite su propio trabajo de manera no bloqueante y participa en la protección de actividad privada y reinicio. La reserva compartida del origen evita cambiar su ubicación durante la copia sin impedir guardados ordinarios. Se excluyen nombres de coordinación antes de consultar metadatos. Las copias antiguas sólo se retiran después de persistir y verificar una copia nueva elegible, comprobar de nuevo el vínculo y verificar el payload conocido que se retirará. Si el historial ya contiene64recibos, una política de retención aceptada puede aplicar la conservación pendiente antes de crear otra generación: utiliza como ancla la copia compatible más reciente, vuelve a comprobar su SHA y tamaño y conserva siempre esa copia. Sin ancla válida o sin consentimiento, no se retira nada ni se consume el siguiente cursor. Las incompletas, parciales, alteradas y desconocidas permanecen.

## Verificación y límites

Las pruebas usan perfiles temporales y archivos sintéticos; no activan políticas del perfil real ni llaman a proveedores. La aceptación instalada y física sigue en P10. El comportamiento del planificador con la aplicación suspendida depende del ciclo de vida de cada plataforma: no se promete ejecución en segundo plano con el proceso detenido.
