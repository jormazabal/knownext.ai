package ai.knownext.mobile

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread

@InvokeArg
class ExportSaveArgs { lateinit var sourcePath:String; lateinit var fileName:String; lateinit var mimeType:String }
@InvokeArg
class ExportOpenArgs { lateinit var exportId:String }
@InvokeArg
class ProjectPickArgs { lateinit var destinationPath:String }

@TauriPlugin
class ExportPlugin(private val activity:Activity):Plugin(activity) {
    private val pending=AtomicReference<Invoke?>(null)
    private data class Saved(val uri:Uri,val mime:String)
    private val saved=ConcurrentHashMap<String,Saved>()

    @Command
    fun pickProject(invoke:Invoke) {
        if(!pending.compareAndSet(null,invoke)){invoke.reject("Otro archivo está esperando selección");return}
        try {
            projectDestination(invoke.parseArgs(ProjectPickArgs::class.java))
            val intent=Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE);type="*/*"
                putExtra(Intent.EXTRA_MIME_TYPES,arrayOf("application/zip","application/x-zip-compressed","application/octet-stream"))
            }
            startActivityForResult(invoke,intent,"projectResult")
        }catch(error:Exception){pending.set(null);invoke.reject("No se pudo abrir el selector de proyectos")}
    }
    private fun projectDestination(args:ProjectPickArgs):File {
        val file=File(args.destinationPath)
        val root=File(activity.applicationInfo.dataDir,"project-transfers").canonicalFile
        val actual=file.canonicalFile
        require(actual.parentFile?.parentFile==root && actual.parentFile?.name?.matches(Regex("[a-f0-9]{64}"))==true && actual.name=="payload.zip") {"La importación necesita una reserva privada"}
        val meta=android.system.Os.lstat(file.path)
        require(android.system.OsConstants.S_ISREG(meta.st_mode) && actual.isFile && actual.length()==0L) {"La reserva ya contiene datos o no es regular"}
        return actual
    }
    @ActivityCallback
    fun projectResult(invoke:Invoke,result:ActivityResult) {
        if(result.resultCode==Activity.RESULT_CANCELED){pending.set(null);val reply=JSObject();reply.put("status","cancelled");invoke.resolve(reply);return}
        val uri=result.data?.data
        if(result.resultCode!=Activity.RESULT_OK || uri==null || uri.scheme!="content"){pending.set(null);invoke.reject("El selector no devolvió un paquete válido");return}
        thread(name="knownext-project-read") {
            try {
                val destination=projectDestination(invoke.parseArgs(ProjectPickArgs::class.java))
                val cancelled=File(destination.parentFile,"cancel-requested")
                val count=activity.contentResolver.openInputStream(uri)?.use {input->
                    java.io.FileOutputStream(destination).use {output->
                        val bytes=copyProjectPackage(input,output,cancelled={cancelled.exists()});output.fd.sync();bytes
                    }
                }?:throw IllegalStateException("No se puede abrir el paquete")
                val name=runCatching {activity.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use {cursor->if(cursor.moveToFirst())cursor.getString(0)?.take(200) else null}}.getOrNull()?:"Proyecto.knownext-project.zip"
                val reply=JSObject();reply.put("status","selected");reply.put("fileName",name);reply.put("byteLength",count);invoke.resolve(reply)
            }catch(error:Exception){invoke.reject("No se pudo leer el paquete completo dentro de 512 MiB. El original se conserva")}
            finally{pending.set(null)}
        }
    }

    @Command
    fun pickRecoveryArchive(invoke:Invoke) {
        if(!pending.compareAndSet(null,invoke)){invoke.reject("Otro archivo está esperando selección");return}
        try {
            recoveryDestination(invoke.parseArgs(ProjectPickArgs::class.java))
            val intent=Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE);type="*/*"
                putExtra(Intent.EXTRA_MIME_TYPES,arrayOf("application/zip","application/x-zip-compressed","application/octet-stream"))
            }
            startActivityForResult(invoke,intent,"recoveryResult")
        }catch(error:Exception){pending.set(null);invoke.reject("No se pudo abrir el selector de respaldos")}
    }
    private fun recoveryDestination(args:ProjectPickArgs):File {
        val file=File(args.destinationPath)
        val root=File(activity.cacheDir,"knownext-exports").canonicalFile
        val actual=file.canonicalFile
        require(actual.parentFile?.parentFile==root && actual.parentFile?.name?.matches(Regex("job-[A-Za-z0-9_-]{1,100}"))==true && actual.name=="payload.zip") {"La comprobación necesita una reserva privada"}
        val meta=android.system.Os.lstat(file.path)
        val parent=android.system.Os.lstat(file.parentFile!!.path)
        require(android.system.OsConstants.S_ISREG(meta.st_mode) && android.system.OsConstants.S_ISDIR(parent.st_mode) && actual.isFile && actual.length()==0L) {"La reserva ya contiene datos o no es regular"}
        return actual
    }
    @ActivityCallback
    fun recoveryResult(invoke:Invoke,result:ActivityResult) {
        if(result.resultCode==Activity.RESULT_CANCELED){pending.set(null);val reply=JSObject();reply.put("status","cancelled");invoke.resolve(reply);return}
        val uri=result.data?.data
        if(result.resultCode!=Activity.RESULT_OK || uri==null || uri.scheme!="content"){pending.set(null);invoke.reject("El selector no devolvió un respaldo válido");return}
        thread(name="knownext-recovery-read") {
            try {
                val destination=recoveryDestination(invoke.parseArgs(ProjectPickArgs::class.java))
                val count=activity.contentResolver.openInputStream(uri)?.use {input->
                    java.io.FileOutputStream(destination).use {output->
                        val bytes=copyProjectPackage(input,output,cancelled={false},limit=40L*1024*1024);output.fd.sync();bytes
                    }
                }?:throw IllegalStateException("No se puede abrir el respaldo")
                val name=runCatching {activity.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use {cursor->if(cursor.moveToFirst())cursor.getString(0)?.take(200) else null}}.getOrNull()?:"Respaldo.knownext-variants.zip"
                val reply=JSObject();reply.put("status","selected");reply.put("fileName",name);reply.put("byteLength",count);invoke.resolve(reply)
            }catch(error:Exception){invoke.reject("No se pudo leer el respaldo completo dentro de40MiB. El original permanece")}
            finally{pending.set(null)}
        }
    }

    @Command
    fun pickTemplate(invoke:Invoke) {
        if(!pending.compareAndSet(null,invoke)){invoke.reject("Otro archivo está esperando selección");return}
        try {
            val intent=Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type="*/*"
                putExtra(Intent.EXTRA_MIME_TYPES,arrayOf("application/json","text/plain","application/octet-stream"))
            }
            startActivityForResult(invoke,intent,"templateResult")
        }catch(error:Exception){pending.set(null);invoke.reject("No se pudo abrir el selector de plantillas")}
    }
    @ActivityCallback
    fun templateResult(invoke:Invoke,result:ActivityResult) {
        if(result.resultCode==Activity.RESULT_CANCELED){pending.set(null);val reply=JSObject();reply.put("status","cancelled");invoke.resolve(reply);return}
        val uri=result.data?.data
        if(result.resultCode!=Activity.RESULT_OK || uri==null || uri.scheme!="content") {
            pending.set(null);invoke.reject("El selector no devolvió un archivo válido");return
        }
        thread(name="knownext-template-read") {
            try {
                val content=activity.contentResolver.openInputStream(uri)?.use {readTemplateUtf8(it)}?:throw IllegalStateException("No se puede leer el archivo elegido")
                val name=runCatching {activity.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use {cursor->if(cursor.moveToFirst())cursor.getString(0)?.takeIf {it.isNotBlank() && it.length<=1024} else null}}.getOrNull()?:"Plantilla.json"
                val reply=JSObject();reply.put("status","selected");reply.put("fileName",name);reply.put("content",content);invoke.resolve(reply)
            }catch(error:Exception){invoke.reject("No se pudo leer la plantilla como UTF-8 dentro de 2 MiB. El original se conserva. ${error.message?:""}")}
            finally{pending.set(null)}
        }
    }

    private fun source(args:ExportSaveArgs):File {
        val source=File(args.sourcePath).canonicalFile
        val cache=activity.cacheDir.canonicalFile
        require(source.path.startsWith(cache.path+File.separator) && source.parentFile?.parentFile?.name=="knownext-exports") {"La entrega necesita una conversión privada de esta aplicación"}
        require(source.isFile && source.length()<=512L*1024*1024 && source.name.startsWith("payload.")) {"El resultado convertido no está disponible o supera el límite"}
        return source
    }
    @Command
    fun saveFile(invoke:Invoke) {
        if(!pending.compareAndSet(null,invoke)){invoke.reject("Otra exportación está esperando destino");return}
        try {
            val args=invoke.parseArgs(ExportSaveArgs::class.java)
            source(args)
            require(args.fileName.isNotBlank() && !args.fileName.contains('/') && !args.fileName.contains('\\')) {"Nombre de exportación no válido"}
            val intent=Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type=args.mimeType
                putExtra(Intent.EXTRA_TITLE,args.fileName)
            }
            startActivityForResult(invoke,intent,"saveResult")
        }catch(error:Exception){pending.set(null);invoke.reject(error.message?:"No se puede elegir el destino de exportación")}
    }
    @ActivityCallback
    fun saveResult(invoke:Invoke,result:ActivityResult) {
        if(result.resultCode==Activity.RESULT_CANCELED){pending.set(null);val reply=JSObject();reply.put("status","cancelled");invoke.resolve(reply);return}
        val uri=result.data?.data
        if(result.resultCode!=Activity.RESULT_OK || uri==null || uri.scheme!="content"){
            pending.set(null);invoke.reject("El selector no devolvió un destino válido; el documento original se conserva");return
        }
        thread(name="knownext-export-write") {
            try {
                val args=invoke.parseArgs(ExportSaveArgs::class.java)
                val source=source(args)
                val count=source.inputStream().use {input->
                    val output=activity.contentResolver.openOutputStream(uri,"wt")?:throw IllegalStateException("No se puede abrir el destino elegido")
                    output.use {input.copyTo(it,64*1024)}
                }
                require(count==source.length()) {"La escritura del destino no está completa"}
                val deliveredName=runCatching {
                    activity.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use {cursor->
                        if(cursor.moveToFirst())cursor.getString(0)?.takeIf {it.isNotBlank() && it.length<=1024} else null
                    }
                }.getOrNull()?:args.fileName
                val id=UUID.randomUUID().toString()
                if(saved.size>=16)saved.clear()
                saved[id]=Saved(uri,args.mimeType)
                val reply=JSObject();reply.put("status","saved");reply.put("exportId",id);reply.put("fileName",deliveredName);reply.put("byteLength",count)
                invoke.resolve(reply)
            }catch(error:Exception){invoke.reject("No se pudo completar la exportación. El original se conserva; revisa el archivo del destino. ${error.message?:""}")}
            finally{pending.set(null)}
        }
    }
    @Command
    fun openSaved(invoke:Invoke) {
        val args=invoke.parseArgs(ExportOpenArgs::class.java)
        val file=saved[args.exportId]
        if(file==null){invoke.reject("El acceso directo ha caducado. Abre el archivo desde el destino donde lo guardaste");return}
        activity.runOnUiThread {
            try {
                activity.startActivity(Intent(Intent.ACTION_VIEW).apply {setDataAndType(file.uri,file.mime);addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)})
                val reply=JSObject();reply.put("opened",true);invoke.resolve(reply)
            }catch(error:Exception){invoke.reject("El archivo está guardado, pero no se pudo abrir con una aplicación de este dispositivo")}
        }
    }
}
