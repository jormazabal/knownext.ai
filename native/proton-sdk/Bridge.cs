using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

public static partial class Bridge {
    const string Api="https://drive-api.proton.me/";
    const string App="external-drive-knownext@3.0.0-alpha";
    const int MaxContent=64*1024*1024;
    static readonly HttpClient Http=new(new HttpClientHandler{AllowAutoRedirect=false}){Timeout=TimeSpan.FromSeconds(45)};
    public sealed class Failure(string code,bool retryable=false):Exception {public string Code=code;public bool Retryable=retryable;}
    static string Text(JsonObject o,string key)=>o[key]?.GetValue<string>() is {Length:>0} value?value:throw new Failure("invalid-request");
    static JsonObject Ok(JsonNode result,JsonObject? session=null)=>new(){["ok"]=true,["result"]=result,["session"]=session?.DeepClone()};
    static async Task<JsonObject> Call(string method,string path,JsonObject? s=null,JsonObject? body=null){
        using var r=new HttpRequestMessage(new HttpMethod(method),new Uri(new Uri(Api),path));
        r.Headers.Add("x-pm-appversion",App);
        if(s?["uid"]!=null){r.Headers.Add("x-pm-uid",Text(s,"uid"));r.Headers.Authorization=new AuthenticationHeaderValue("Bearer",Text(s,"accessToken"));}
        if(body!=null)r.Content=new StringContent(body.ToJsonString(),Encoding.UTF8,"application/json");
        using var response=await Http.SendAsync(r);
        if(response.StatusCode==HttpStatusCode.UnprocessableEntity&&path.Contains("sessions/forks/"))throw new Failure("auth-pending",true);
        if(response.StatusCode==HttpStatusCode.Unauthorized)throw new Failure("session-expired");
        if(response.StatusCode==HttpStatusCode.Forbidden)throw new Failure("permission-denied");
        if((int)response.StatusCode==429)throw new Failure("rate-limited",true);
        if(!response.IsSuccessStatusCode)throw new Failure((int)response.StatusCode>=500?"provider-unavailable":"provider-rejected",(int)response.StatusCode>=500);
        await using var stream=await response.Content.ReadAsStreamAsync();
        using var bytes=new MemoryStream();var buffer=new byte[8192];int n;
        while((n=await stream.ReadAsync(buffer))>0){if(bytes.Length+n>4*1024*1024)throw new Failure("response-too-large");bytes.Write(buffer,0,n);}
        return JsonNode.Parse(bytes.ToArray())?.AsObject()??throw new Failure("invalid-response");
    }
    static async Task Refresh(JsonObject s){
        JsonObject r;
        try{r=await Call("POST","auth/v4/refresh",s,new(){["ResponseType"]="token",["GrantType"]="refresh_token",["RefreshToken"]=Text(s,"refreshToken")});}
        catch(Failure e)when(e.Code is "session-expired" or "permission-denied" or "provider-rejected"){throw new Failure("session-expired");}
        s["accessToken"]=Text(r,"AccessToken");s["refreshToken"]=r["RefreshToken"]?.DeepClone()??s["refreshToken"]?.DeepClone();
        if(r["UID"] is JsonValue uid && uid.TryGetValue<string>(out var value) && !string.IsNullOrEmpty(value))s["uid"]=value;
    }
    sealed class Context { public JsonObject? Session; }
    public static async Task<JsonObject> Execute(JsonObject request){
        var context=new Context{Session=request["session"]?.DeepClone()?.AsObject()};
        try{return await ExecuteCore(request,context);}
        catch(Failure e){var result=Abi.Error(e.Code,e.Retryable);result["session"]=context.Session?.DeepClone();return result;}
        catch(OperationCanceledException){var result=Abi.Error("timeout",true);result["session"]=context.Session?.DeepClone();return result;}
        catch(HttpRequestException){var result=Abi.Error("network",true);result["session"]=context.Session?.DeepClone();return result;}
        catch(Proton.Sdk.Api.ProtonApiException e){
            var code=e.TransportCode==401?"session-expired":e.TransportCode==403?"permission-denied":e.TransportCode==429?"rate-limited":"sdk-provider-rejected";
            var result=Abi.Error(code,e.TransportCode==429||e.TransportCode>=500);result["session"]=context.Session?.DeepClone();return result;
        }
        catch{var result=Abi.Error("native-operation-failed",false);result["session"]=context.Session?.DeepClone();return result;}
    }
    static async Task<JsonObject> ExecuteCore(JsonObject request,Context context){
        var op=Text(request,"operation");var session=context.Session;var p=request["payload"] as JsonObject??new();
        if(op=="bridge.info")return Ok(new JsonObject{["schemaVersion"]=1,["sdk"]="official-native"});
        if(op=="diagnostics.crypto"){
            using var key=Proton.Cryptography.Srp.SrpClient.GetDefaultModulusVerificationKey();
            using var output=new MemoryStream();key.Export(output,Proton.Cryptography.Pgp.PgpEncoding.AsciiArmor);
            var armored=Encoding.ASCII.GetString(output.ToArray());
            if(!armored.Contains("BEGIN PGP PUBLIC KEY BLOCK"))throw new Failure("crypto-verification-failed");
            var aesKey=RandomNumberGenerator.GetBytes(32);var nonce=RandomNumberGenerator.GetBytes(12);
            var original=Encoding.UTF8.GetBytes("knownext-synthetic-fork");var encrypted=new byte[original.Length];var tag=new byte[16];var decoded=new byte[original.Length];
            try{
                using var aes=new AesGcm(aesKey,16);var aad=Encoding.UTF8.GetBytes("fork");
                aes.Encrypt(nonce,original,encrypted,tag,aad);aes.Decrypt(nonce,encrypted,tag,decoded,aad);
                if(!CryptographicOperations.FixedTimeEquals(original,decoded))throw new Failure("fork-crypto-verification-failed");
                tag[0]^=1;var rejected=false;try{aes.Decrypt(nonce,encrypted,tag,decoded,aad);}catch(CryptographicException){rejected=true;}
                if(!rejected)throw new Failure("fork-crypto-verification-failed");
            }finally{CryptographicOperations.ZeroMemory(aesKey);CryptographicOperations.ZeroMemory(original);CryptographicOperations.ZeroMemory(decoded);}
            await using Proton.Sdk.Caching.ICacheRepository cache=new Proton.Sdk.Caching.InMemoryCacheRepository();
            await cache.EnsureValueFormatVersionAsync("knownext-probe1",CancellationToken.None);
            await cache.SetAsync("probe",new byte[]{1,2,3},CancellationToken.None);
            var value=await cache.TryGetAsync("probe",CancellationToken.None);
            if(value==null||!value.SequenceEqual(new byte[]{1,2,3}))throw new Failure("cache-verification-failed");
            return Ok(new JsonObject{["crypto"]="passed",["publicKeyBytes"]=output.Length,["cache"]="memory-passed",["forkAesGcm"]="passed"});
        }
        if(op=="auth.start"){
            var init=await Call("GET","auth/v4/sessions/forks");var key=RandomNumberGenerator.GetBytes(32);var expires=DateTimeOffset.UtcNow.AddMinutes(10).ToString("O");
            var raw="0:"+Text(init,"UserCode")+":"+Convert.ToBase64String(key)+":external-drive";
            return Ok(new JsonObject{["state"]="waiting",["expiresAt"]=expires,["signInUrl"]="https://account.proton.me/desktop/login?app=drive&pv=3#payload="+Uri.EscapeDataString(raw)},new JsonObject{["kind"]="pending",["selector"]=Text(init,"Selector"),["encryptionKey"]=Convert.ToBase64String(key),["expiresAt"]=expires});
        }
        if(session==null)throw new Failure("not-connected");
        if(op=="auth.poll"){
            if(Text(session,"kind")=="connected"){context.Session=session;
            await HydrateWithRefresh(session);return Ok(Account(session),session);}
            if(Text(session,"kind")!="pending")throw new Failure("invalid-session");
            if(DateTimeOffset.Parse(Text(session,"expiresAt"))<DateTimeOffset.UtcNow)throw new Failure("auth-expired");
            JsonObject r;try{r=await Call("GET","auth/v4/sessions/forks/"+Uri.EscapeDataString(Text(session,"selector")));}catch(Failure e)when(e.Code=="auth-pending"){return Ok(new JsonObject{["state"]="waiting"},session);}
            var blob=Convert.FromBase64String(Text(r,"Payload"));if(blob.Length<28)throw new Failure("invalid-response");
            var key=Convert.FromBase64String(Text(session,"encryptionKey"));var plain=new byte[blob.Length-28];
            using(var aes=new AesGcm(key,16))aes.Decrypt(blob.AsSpan(0,12),blob.AsSpan(12,blob.Length-28),blob.AsSpan(blob.Length-16),plain,Encoding.UTF8.GetBytes("fork"));
            var secret=JsonNode.Parse(plain)?.AsObject()??throw new Failure("invalid-response");CryptographicOperations.ZeroMemory(key);CryptographicOperations.ZeroMemory(plain);
            session=new(){["kind"]="connected",["uid"]=Text(r,"UID"),["accessToken"]=Text(r,"AccessToken"),["refreshToken"]=Text(r,"RefreshToken"),["keyPassword"]=Text(secret,"keyPassword")};
            context.Session=session;
            await Hydrate(session);return Ok(Account(session),session);
        }
        if(Text(session,"kind")!="connected")throw new Failure("not-connected");
        if(op=="auth.refresh"){await Refresh(session);return Ok(Account(session),session);}
        if(op=="account.status"){
            await HydrateWithRefresh(session);return Ok(Account(session),session);
        }
        return await Drive(op,p,session);
    }
    static JsonObject Account(JsonObject s)=>new(){["state"]="connected",["accountId"]=s["userId"]?.DeepClone(),["label"]=s["username"]?.DeepClone()};
    static async Task HydrateWithRefresh(JsonObject session){
        try{await Hydrate(session);}catch(Failure e)when(e.Code=="session-expired"){await Refresh(session);await Hydrate(session);}
    }
    static async Task Hydrate(JsonObject s){
        var data=await Call("GET","core/v4/users",s);var user=data["User"]?.AsObject()??throw new Failure("invalid-response");
        var keys=user["Keys"]?.AsArray()??throw new Failure("missing-account-key");
        var primary=keys.OfType<JsonObject>().FirstOrDefault(k=>k["Primary"]?.GetValue<int>()==1&&k["Active"]?.GetValue<int>()==1)??throw new Failure("missing-account-key");
        s["userId"]=Text(user,"ID");s["username"]=user["Name"]?.DeepClone()??user["Email"]?.DeepClone()??JsonValue.Create("Proton");s["keyId"]=Text(primary,"ID");
        var scopes=await Call("GET","auth/v4/scopes",s);s["scopes"]=scopes["Scopes"]?.DeepClone()??new JsonArray();
        // No data-password derivation: the web flow supplied the key secret.
        // Zero represents an unobserved password mode, never a single-password assertion.
        s["passwordMode"]=0;
    }
}
