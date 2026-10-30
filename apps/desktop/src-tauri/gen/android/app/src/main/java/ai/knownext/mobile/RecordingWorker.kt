package ai.knownext.mobile

import android.content.Context
import androidx.work.*
import java.util.concurrent.TimeUnit

/** One bounded API fragment per WorkManager job, without a WebView or microphone service. */
class RecordingWorker(context:Context,params:WorkerParameters):Worker(context,params) {
    override fun doWork():Result = try {
        RecordingBridge.init(applicationContext)
        val result=RecordingBridge.unwrap(RecordingBridge.nativeWork())
        if(result.optBoolean("more"))enqueue(applicationContext)
        Result.success()
    }catch(e:Exception){Result.failure()}
    companion object {
        fun enqueue(context:Context){
            val request=OneTimeWorkRequestBuilder<RecordingWorker>().setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build()
            WorkManager.getInstance(context).enqueueUniqueWork("knownext-transcription",ExistingWorkPolicy.APPEND_OR_REPLACE,request)
        }
    }
}
