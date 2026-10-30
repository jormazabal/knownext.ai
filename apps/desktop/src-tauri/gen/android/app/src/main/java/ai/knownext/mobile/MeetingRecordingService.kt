package ai.knownext.mobile

import android.app.*
import android.content.Intent
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

class MeetingRecordingService:Service() {
    companion object {val replies=ConcurrentHashMap<String,Invoke>();private const val CHANNEL="knownext-recording";private const val NOTIFICATION=8102}
    private val commands=Executors.newSingleThreadExecutor()
    @Volatile private var capturing=false
    private var recorder:AudioRecord?=null
    private var reader:Thread?=null
    private var id:String?=null
    private var paused=false
    private var wakeLock:PowerManager.WakeLock?=null
    override fun onBind(intent:Intent?):IBinder?=null
    override fun onCreate(){super.onCreate();if(Build.VERSION.SDK_INT>=26)getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(CHANNEL,"Grabación de reuniones",NotificationManager.IMPORTANCE_LOW));startForeground(NOTIFICATION,notification("Preparando grabación"))}
    override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
        if(intent==null){stopSelf();return START_NOT_STICKY}
        commands.execute {
            val reply=intent.getStringExtra("requestId")?.let{replies.remove(it)}
            try {
                RecordingBridge.init(this)
                val action=intent.getStringExtra("action")?:"pause"
                val payload=JSONObject(intent.getStringExtra("payload")?:"{}")
                if(!payload.has("id")&&id!=null)payload.put("id",id)
                if(action in listOf("pause","stop","discard","inputs","preview-stop","start","preview"))stopCapture()
                val result=RecordingBridge.command(action,payload)
                if(action=="start")id=result.optString("captureOwner")
                if(action=="start"||action=="resume"||action=="preview"||(action=="inputs"&&result.optJSONArray("sessions")?.let {a->(0 until a.length()).any{a.getJSONObject(it).optString("id")==id&&a.getJSONObject(it).optString("status")=="recording"}}==true)) {startCapture();paused=false}
                if(action=="pause"||action=="inputs")paused=!capturing
                if(action=="preview-stop"){stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();reply?.resolve(JSObject(result.toString()));return@execute}
                if(action=="discard"){stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();reply?.resolve(JSObject(result.toString()));return@execute}
                if(action=="stop") {
                    val sessions=result.getJSONArray("sessions")
                    val session=(0 until sessions.length()).map{sessions.getJSONObject(it)}.firstOrNull{it.optString("id")==id}
                    if(session?.optString("status")=="ready") {RecordingBridge.command("queue",JSONObject().put("id",id));RecordingWorker.enqueue(this)}
                    getSystemService(NotificationManager::class.java).notify(NOTIFICATION,notification(if(session?.isNull("destination")==true)"Grabación guardada · Elegir carpeta" else "Grabación guardada",false))
                    stopForeground(STOP_FOREGROUND_DETACH);stopSelf()
                }else getSystemService(NotificationManager::class.java).notify(NOTIFICATION,notification(if(paused)"En pausa" else "Grabando"))
                reply?.resolve(JSObject(result.toString()))
            }catch(e:Exception){stopCapture();id?.let{runCatching{RecordingBridge.command("pause",JSONObject().put("id",it));RecordingBridge.command("job-update",JSONObject().put("id",it).put("error",e.message?:"Captura interrumpida"))}};reply?.reject(e.message?:"Captura interrumpida");getSystemService(NotificationManager::class.java).notify(NOTIFICATION,notification("Grabación interrumpida · Abre KnowNext.ai",false));stopForeground(STOP_FOREGROUND_DETACH);stopSelf()}
        }
        return START_NOT_STICKY
    }
    @Suppress("MissingPermission")
    private fun startCapture(){
        val minimum=AudioRecord.getMinBufferSize(24000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT)
        if(minimum<=0)throw IllegalStateException("El micrófono no admite PCM a 24 kHz")
        val audio=AudioRecord(MediaRecorder.AudioSource.MIC,24000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,maxOf(minimum,9600))
        if(audio.state!=AudioRecord.STATE_INITIALIZED){audio.release();throw IllegalStateException("Micrófono no disponible")}
        recorder=audio
        if(Build.VERSION.SDK_INT>=29)audio.registerAudioRecordingCallback(mainExecutor,object:android.media.AudioManager.AudioRecordingCallback(){override fun onRecordingConfigChanged(configs:MutableList<android.media.AudioRecordingConfiguration>){if(audio.activeRecordingConfiguration?.isClientSilenced==true){startService(Intent(this@MeetingRecordingService,MeetingRecordingService::class.java).putExtra("action","pause"))}}})
        audio.startRecording();capturing=true
        wakeLock=(getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"KnowNext:Meeting").apply{acquire()}
        reader=Thread({
            val bytes=ByteArray(2400)
            try{while(capturing){val n=audio.read(bytes,0,bytes.size,AudioRecord.READ_BLOCKING);if(!capturing)break;if(n<0)throw IllegalStateException("Micrófono desconectado ($n)");if(n>0)RecordingBridge.unwrap(RecordingBridge.nativeSamples(id?:"",bytes.copyOf(n-n%2)))}}
            catch(e:Exception){if(capturing)startService(Intent(this,MeetingRecordingService::class.java).putExtra("action","pause"))}
        },"knownext-microphone").also{it.start()}
    }
    private fun stopCapture(){capturing=false;wakeLock?.let{if(it.isHeld)it.release()};wakeLock=null;runCatching{recorder?.stop()};reader?.join(2000);reader=null;recorder?.release();recorder=null}
    private fun notification(text:String,controls:Boolean=true):Notification {
        val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java).putExtra("recordings",true),PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val builder=NotificationCompat.Builder(this,CHANNEL).setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("KnowNext.ai").setContentText(text).setContentIntent(open).setOnlyAlertOnce(true).setOngoing(controls)
        if(controls){for((request,action,label) in listOf(Triple(1,if(paused)"resume" else "pause",if(paused)"Continuar" else "Pausar"),Triple(2,"stop","Parar"))){val intent=Intent(this,MeetingRecordingService::class.java).putExtra("action",action);builder.addAction(0,label,PendingIntent.getService(this,request,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))}}
        else builder.addAction(0,"Abrir Grabaciones",open)
        return builder.build()
    }
    override fun onDestroy(){stopCapture();commands.shutdown();super.onDestroy()}
}
