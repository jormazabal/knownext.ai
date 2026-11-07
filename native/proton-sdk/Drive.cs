using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Proton.Drive.Sdk;
using Proton.Drive.Sdk.Account;
using Proton.Drive.Sdk.Account.Authentication;
using Proton.Drive.Sdk.Account.Users;
using Proton.Drive.Sdk.Nodes;
using Proton.Drive.Sdk.Events;

public static partial class Bridge {
    static JsonObject NodeDto(Node n){
        if(!n.Name.TryGetValueElseError(out var name,out _))throw new Failure("unverified-node-name");
        return new(){["id"]=n.Uid.ToString(),["nodeId"]=n.Uid.ToString(),["name"]=name,["type"]=n is FileNode?"file":"folder"};
    }
    static async Task<JsonObject> Drive(string op,JsonObject p,JsonObject s){
        var scopes=s["scopes"]?.AsArray().Select(x=>x?.GetValue<string>()??"").ToArray()??[];
        var api=ProtonApiSession.Resume((SessionId)Text(s,"uid"),Text(s,"username"),(UserId)Text(s,"userId"),Text(s,"accessToken"),Text(s,"refreshToken"),scopes,false,(PasswordMode)0,new Uri(Api),App);
        api.TokenCredential.TokensRefreshed+=(access,refresh)=>{s["accessToken"]=access;s["refreshToken"]=refresh;};
        await api.SetAccountKeyPassphraseAsync(Text(s,"keyId"),Encoding.UTF8.GetBytes(Text(s,"keyPassword")),CancellationToken.None);
        var c=api.ClientConfiguration;
        var account=new ProtonAccountClient(api.CreateHttpClientFactory(),c.CacheRepository,api.SessionSecretCache,c.Telemetry);
        var drive=new ProtonDriveClient(api.CreateHttpClientFactory(),account,c.CacheRepository,c.FeatureFlagProvider,c.Telemetry);
        using var timeout=new CancellationTokenSource(TimeSpan.FromMinutes(3));var ct=timeout.Token;
        JsonNode result;
        switch(op){
            case "drive.root":result=NodeDto(await drive.GetMyFilesFolderAsync(ct));break;
            case "drive.events":
                var root=await drive.GetMyFilesFolderAsync(ct);
                var previousCursor=p["cursor"]?.GetValue<string>();
                DriveEventId? cursor=string.IsNullOrEmpty(previousCursor)?null:(DriveEventId)previousCursor;
                var nextCursor=previousCursor;var changed=false;var refresh=cursor==null;var count=0;
                await foreach(var e in drive.EnumerateEventsAsync(root.TreeEventScopeId,cursor,ct)){
                    if(++count>10000)throw new Failure("event-limit");
                    nextCursor=e.Id.ToString();
                    if(e is EventsContinuityLostEvent || e is EventsScopeAccessLostEvent){refresh=true;changed=true;}
                    else if(e is not EventsCursorAdvancedEvent)changed=true;
                }
                result=new JsonObject{["cursor"]=nextCursor,["changed"]=changed,["requiresRefresh"]=refresh};break;
            case "drive.list":
                var items=new JsonArray();
                await foreach(var id in drive.EnumerateFolderChildrenNodeUidsAsync(NodeUid.Parse(Text(p,"parentId")),ct)){
                    if(items.Count>=10000)throw new Failure("inventory-limit");
                    var n=await drive.GetNodeAsync(id,ct)??throw new Failure("incomplete-inventory");items.Add((JsonNode)NodeDto(n));
                }
                result=new JsonObject{["items"]=items,["complete"]=true};break;
            case "drive.createFolder":
                var parent=NodeUid.Parse(Text(p,"parentId"));var folderName=Text(p,"name");
                var existing=await Find(drive,parent,folderName,ct);
                if(existing!=null){if(existing is FileNode)throw new Failure("name-conflict");result=NodeDto(existing);}
                else result=NodeDto(await drive.CreateFolderAsync(parent,folderName,null,ct));break;
            case "drive.readFile":
                var file=await drive.GetNodeAsync(NodeUid.Parse(Text(p,"nodeId")),ct) as FileNode??throw new Failure("not-file");
                result=new JsonObject{["contentBase64"]=Convert.ToBase64String(await Read(drive,file,ct))};break;
            case "drive.writeFile":
                var encoded=p["contentBase64"]?.GetValue<string>()??throw new Failure("invalid-request");
                if(encoded.Length>MaxContent*4L/3+4)throw new Failure("file-too-large");
                var content=Convert.FromBase64String(encoded);if(content.Length>MaxContent)throw new Failure("file-too-large");
                var target=NodeUid.Parse(Text(p,"parentId"));var name=Text(p,"name");
                var previous=await Find(drive,target,name,ct);
                if(previous!=null){
                    if(previous is not FileNode same || !CryptographicOperations.FixedTimeEquals(SHA256.HashData(await Read(drive,same,ct)),SHA256.HashData(content)))throw new Failure("content-conflict");
                    result=NodeDto(same);result["bytes"]=content.Length;result["revisionId"]=same.ActiveRevision.Uid.ToString();break;
                }
                using(var input=new MemoryStream(content)){
                    using var uploader=await drive.GetFileUploaderAsync(target,name,p["mediaType"]?.GetValue<string>()??"application/octet-stream",content.Length,new FileUploadMetadata(),false,ct);
                    await using var controller=uploader.UploadFromStream(input,[],null,()=>SHA1.HashData(content),ct);
                    var uploaded=await controller.Completion;result=new JsonObject{["id"]=uploaded.NodeUid.ToString(),["nodeId"]=uploaded.NodeUid.ToString(),["name"]=name,["type"]="file",["bytes"]=content.Length,["revisionId"]=uploaded.RevisionUid.ToString()};
                }break;
            default:throw new Failure("unsupported-operation");
        }
        var tokens=await api.TokenCredential.GetTokensAsync(ct);s["accessToken"]=tokens.AccessToken;s["refreshToken"]=tokens.RefreshToken;
        return Ok(result,s);
    }
    static async Task<Node?> Find(ProtonDriveClient drive,NodeUid parent,string name,CancellationToken ct){
        Node? match=null;var count=0;
        await foreach(var id in drive.EnumerateFolderChildrenNodeUidsAsync(parent,ct)){
            if(++count>10000)throw new Failure("inventory-limit");
            var n=await drive.GetNodeAsync(id,ct)??throw new Failure("incomplete-inventory");
            if(!n.Name.TryGetValueElseError(out var nname,out _))throw new Failure("unverified-node-name");
            if(nname==name){if(match!=null)throw new Failure("ambiguous-name");match=n;}
        }
        return match;
    }
    static async Task<byte[]> Read(ProtonDriveClient drive,FileNode file,CancellationToken ct){
        using var output=new BoundedStream(MaxContent);
        using var downloader=await drive.GetFileDownloaderAsync(file.ActiveRevision.Uid,ct);
        await using var controller=downloader.DownloadToStream(output,(_,_)=>{},ct);
        await controller.Completion;
        if(controller.GetIsDownloadCompleteWithVerificationIssue())throw new Failure("content-verification-failed");
        return output.ToArray();
    }
    sealed class BoundedStream(int limit):MemoryStream{
        void Check(int n){if(Position+n>limit)throw new Failure("file-too-large");}
        public override void Write(byte[] b,int o,int n){Check(n);base.Write(b,o,n);}
        public override void Write(ReadOnlySpan<byte> b){Check(b.Length);base.Write(b);}
        public override Task WriteAsync(byte[] b,int o,int n,CancellationToken ct){Check(n);return base.WriteAsync(b,o,n,ct);}
        public override ValueTask WriteAsync(ReadOnlyMemory<byte> b,CancellationToken ct=default){Check(b.Length);return base.WriteAsync(b,ct);}
    }
}
