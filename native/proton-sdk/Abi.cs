using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

public static unsafe class Abi {
    [UnmanagedCallersOnly(EntryPoint="knownext_proton_request",CallConvs=[typeof(CallConvCdecl)])]
    public static nint Request(byte* input,nuint length) {
        JsonObject response;
        try {
            if(input==null || length==0 || length>96*1024*1024) throw new Bridge.Failure("invalid-request");
            var request=JsonNode.Parse(new ReadOnlySpan<byte>(input,checked((int)length)))?.AsObject() ?? throw new Bridge.Failure("invalid-request");
            response=Bridge.Execute(request).GetAwaiter().GetResult();
        } catch(Bridge.Failure e) { response=Error(e.Code,e.Retryable); }
        catch(OperationCanceledException) { response=Error("timeout",true); }
        catch(HttpRequestException) { response=Error("network",true); }
        catch { response=Error("native-operation-failed",false); }
        var bytes=Encoding.UTF8.GetBytes(response.ToJsonString());
        var memory=(byte*)NativeMemory.Alloc((nuint)bytes.Length+8);
        *(ulong*)memory=(ulong)bytes.Length;
        bytes.CopyTo(new Span<byte>(memory+8,bytes.Length));
        CryptographicOperations.ZeroMemory(bytes);
        return (nint)(memory+8);
    }
    [UnmanagedCallersOnly(EntryPoint="knownext_proton_response_length",CallConvs=[typeof(CallConvCdecl)])]
    public static nuint Length(nint ptr) => ptr==0 ? 0 : (nuint)(*(ulong*)((byte*)ptr-8));
    [UnmanagedCallersOnly(EntryPoint="knownext_proton_free",CallConvs=[typeof(CallConvCdecl)])]
    public static void Free(nint ptr) {
        if(ptr==0)return;
        var p=(byte*)ptr;var n=*(ulong*)(p-8);
        CryptographicOperations.ZeroMemory(new Span<byte>(p,checked((int)n)));
        NativeMemory.Free(p-8);
    }
    public static JsonObject Error(string code,bool retryable)=>new(){["ok"]=false,["error"]=new JsonObject{["code"]=code,["message"]="No se pudo completar la operación con Proton.",["retryable"]=retryable}};
}
