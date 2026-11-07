param([Parameter(Mandatory=$true)][string]$Library,[switch]$AnonymousAuthStart)
$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class ProtonProbe {
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate IntPtr Request(IntPtr p, UIntPtr n);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate UIntPtr Length(IntPtr p);
 [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate void Free(IntPtr p);
 public static string Call(string path,string json) {
  var crypto=NativeLibrary.Load(System.IO.Path.Combine(System.IO.Path.GetDirectoryName(path),"proton_crypto.dll"));
  var lib=NativeLibrary.Load(path);
  try {
   var request=Marshal.GetDelegateForFunctionPointer<Request>(NativeLibrary.GetExport(lib,"knownext_proton_request"));
   var length=Marshal.GetDelegateForFunctionPointer<Length>(NativeLibrary.GetExport(lib,"knownext_proton_response_length"));
   var free=Marshal.GetDelegateForFunctionPointer<Free>(NativeLibrary.GetExport(lib,"knownext_proton_free"));
   var bytes=Encoding.UTF8.GetBytes(json);var input=Marshal.AllocHGlobal(bytes.Length);
   try {Marshal.Copy(bytes,0,input,bytes.Length);var result=request(input,(UIntPtr)bytes.Length);
    try {var n=checked((int)length(result));var response=new byte[n];Marshal.Copy(result,response,0,n);return Encoding.UTF8.GetString(response);}
    finally {free(result);}
   } finally {Marshal.FreeHGlobal(input);}
  } finally { /* NativeAOT libraries cannot be safely unloaded; process exit releases them. */ }
 }
}
'@
$path=(Resolve-Path -LiteralPath $Library).Path
$info=[ProtonProbe]::Call($path,'{"operation":"bridge.info"}')|ConvertFrom-Json
if (!$info.ok -or $info.result.schemaVersion -ne 1){throw 'Bridge information failed'}
$notConnected=[ProtonProbe]::Call($path,'{"operation":"drive.root"}')|ConvertFrom-Json
if ($notConnected.ok -or $notConnected.error.code -ne 'not-connected'){throw 'Missing-session guard failed'}
$invalid=[ProtonProbe]::Call($path,'not-json')|ConvertFrom-Json
if ($invalid.ok){throw 'Malformed request accepted'}
$crypto=[ProtonProbe]::Call($path,'{"operation":"diagnostics.crypto"}')|ConvertFrom-Json
if (!$crypto.ok -or $crypto.result.crypto -ne 'passed' -or $crypto.result.cache -ne 'memory-passed'){throw 'Native crypto/cache failed'}
if($crypto.result.forkAesGcm -ne 'passed'){throw 'Native AES-GCM fork primitive failed'}
if($AnonymousAuthStart){
 $auth=[ProtonProbe]::Call($path,'{"operation":"auth.start"}')|ConvertFrom-Json
 $valid=$auth.ok -and $auth.result.signInUrl.StartsWith('https://account.proton.me/desktop/login?')
 [pscustomobject]@{anonymousAuthStartPassed=$valid;errorCode=$auth.error.code;secretsLogged=$false}|ConvertTo-Json
 $auth=$null
}
[pscustomobject]@{info='passed';missingSession='passed';invalidJson='passed';nativeCrypto='passed';nativeMemoryCache='passed';nativeForkAesGcm='passed';cloudCalls=[bool]$AnonymousAuthStart;sha256=(Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash}|ConvertTo-Json
