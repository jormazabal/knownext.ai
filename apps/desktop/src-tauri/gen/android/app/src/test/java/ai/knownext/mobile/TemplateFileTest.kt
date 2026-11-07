package ai.knownext.mobile
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.ByteArrayInputStream

class TemplateFileTest {
    @Test fun preservesUtf8IncludingAccentsAndVariables() {
        val text="Acta de reunión · {{asistentes}}"
        assertEquals(text,readTemplateUtf8(ByteArrayInputStream(text.toByteArray(Charsets.UTF_8))))
    }
    @Test(expected=IllegalArgumentException::class) fun rejectsActualBytesAboveLimit() {
        readTemplateUtf8(ByteArrayInputStream(ByteArray(MAX_TEMPLATE_FILE_BYTES+1)))
    }
    @Test(expected=java.nio.charset.CharacterCodingException::class) fun rejectsMalformedUtf8WithoutReplacement() {
        readTemplateUtf8(ByteArrayInputStream(byteArrayOf(0xc3.toByte(),0x28)))
    }
}
