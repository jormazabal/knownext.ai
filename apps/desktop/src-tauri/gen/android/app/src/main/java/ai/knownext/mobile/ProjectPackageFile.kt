package ai.knownext.mobile

import java.io.InputStream
import java.io.OutputStream

/** No in-memory archive or URI is returned to JavaScript. Cancellation is checked between reads. */
internal fun copyProjectPackage(input:InputStream,output:OutputStream,cancelled:()->Boolean,limit:Long=512L*1024*1024):Long {
    val buffer=ByteArray(64*1024);var total=0L
    while(true){
        check(!cancelled()) {"Cancelación solicitada"}
        val count=input.read(buffer)
        if(count<0)break
        if(count==0)continue
        total+=count
        require(total<=limit) {"El paquete supera el límite permitido"}
        output.write(buffer,0,count)
    }
    return total
}
