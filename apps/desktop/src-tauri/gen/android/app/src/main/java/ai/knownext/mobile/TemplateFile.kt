package ai.knownext.mobile

import java.io.InputStream
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction

internal const val MAX_TEMPLATE_FILE_BYTES = 16 * 1024 * 1024

/** Provider metadata is advisory. Bound actual bytes and reject malformed UTF-8. */
internal fun readTemplateUtf8(input: InputStream): String {
    val bytes = ByteArrayOutputStream()
    val buffer = ByteArray(16 * 1024)
    while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        require(bytes.size() + count <= MAX_TEMPLATE_FILE_BYTES) { "El archivo de plantilla supera 16 MiB" }
        bytes.write(buffer, 0, count)
    }
    return Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes.toByteArray())).toString()
}
