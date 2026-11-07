package ai.knownext.mobile

import org.junit.Assert.*
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

class ProjectPackageFileTest {
    @Test fun copiesBytesExactlyAndChecksCancellationBetweenChunks(){
        val bytes=ByteArray(130000){(it%251).toByte()};val output=ByteArrayOutputStream();var checks=0
        assertEquals(bytes.size.toLong(),copyProjectPackage(ByteArrayInputStream(bytes),output,{checks++;false}));assertArrayEquals(bytes,output.toByteArray());assertTrue(checks>=3)
        val partial=ByteArrayOutputStream();var reads=0
        try{copyProjectPackage(ByteArrayInputStream(bytes),partial,{reads++;reads==2});fail("must stop") }catch(expected:IllegalStateException){assertEquals(65536,partial.size())}
    }
    @Test fun recoveryLimitPreservesTheOriginalStreamAndWritesNoOverflowChunk(){
        val bytes=ByteArray(65537){(it%251).toByte()};val output=ByteArrayOutputStream()
        try{copyProjectPackage(ByteArrayInputStream(bytes),output,{false},65536);fail("must reject recovery overflow")}catch(expected:IllegalArgumentException){assertEquals(65536,output.size());assertArrayEquals(bytes.copyOf(65536),output.toByteArray())}
    }
    @Test fun rejectsBytesOverLimitBeforeWritingTheOverflowChunk(){
        val output=ByteArrayOutputStream()
        try{copyProjectPackage(ByteArrayInputStream(ByteArray(50)),output,{false},49);fail("must reject") }catch(expected:IllegalArgumentException){assertEquals(0,output.size())}
    }
}
