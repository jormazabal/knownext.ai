import {createHash} from "node:crypto";
import {cpSync,copyFileSync,existsSync,mkdirSync,readFileSync,realpathSync,writeFileSync} from "node:fs";
import {delimiter,dirname,join,resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const repo=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const pins=JSON.parse(readFileSync(join(repo,"native/proton-sdk/pins.json"),"utf8"));
const version=readFileSync(join(repo,"VERSION"),"utf8").trim();
const options=new Map();
for(let i=2;i<process.argv.length;i+=2)options.set(process.argv[i],process.argv[i+1]);
const work=resolve(options.get("--work-directory")??join(repo,"output",`release-${version}`,"android","proton"));
const abi=options.get("--abi")??"arm64-v8a";
const targets={"arm64-v8a":{rust:"aarch64-linux-android",triple:"aarch64-linux-android",rid:"linux-bionic-arm64",openssl:"android-arm64"},"x86_64":{rust:"x86_64-linux-android",triple:"x86_64-linux-android",rid:"linux-bionic-x64",openssl:"android-x86_64"}};
const target=targets[abi];
if(!target)throw Error("Unsupported native Android ABI");
if(process.platform!=="linux")throw Error("Prepare Android release SDK on the pinned Ubuntu CI toolchain; no unverified local binary fallback");
const sdk=process.env.ANDROID_HOME??process.env.ANDROID_SDK_ROOT;
if(!sdk)throw Error("ANDROID_HOME is required");
const ndk=process.env.NDK_HOME??join(sdk,"ndk","28.2.13676358");
if(!readFileSync(join(ndk,"source.properties"),"utf8").includes("28.2.13676358"))throw Error("Pinned Android NDK 28.2.13676358 required");
const bin=join(ndk,"toolchains/llvm/prebuilt/linux-x86_64/bin");
const dotnet=process.env.KNOWNEXT_DOTNET??"dotnet";
mkdirSync(work,{recursive:true});
const env={...process.env,DOTNET_CLI_TELEMETRY_OPTOUT:"1",PATH:[bin,process.env.PATH??""].join(delimiter)};
function run(command,args,cwd=repo,extra={}){
  const result=spawnSync(command,args,{cwd,env:{...env,...extra},stdio:"inherit"});
  if(result.status!==0)throw Error(`${command} failed (${result.status??result.signal??"launch"})`);
}
function sha(path){return createHash("sha256").update(readFileSync(path)).digest("hex");}
const bootstrap=join(work,"bootstrap");
run("pwsh",["-NoProfile","-File",join(repo,"native/proton-sdk/prepare-sources.ps1"),"-WorkDirectory",bootstrap,"-Dotnet",dotnet]);
const sources=JSON.parse(readFileSync(join(bootstrap,"sources.json"),"utf8").replace(/^\uFEFF/,""));
if(sources.schemaVersion!==1||sources.sdkRevision!==pins.sdk.revision||sources.cryptoRevision!==pins.crypto.revision||sources.dotnetVersion!==pins.dotnetSdk||!sources.sourcePackagePrepared)throw Error("Native bootstrap does not match committed source pins");
if(sha(join(dirname(sources.cryptoManifest),"Cargo.lock"))!==sources.cryptoCargoLockSha256)throw Error("Crypto Cargo.lock differs from bootstrap receipt");
if(typeof sources.nugetPackagesDirectory!=="string")throw Error("Pinned native NuGet cache receipt is missing");
env.NUGET_PACKAGES=sources.nugetPackagesDirectory;
const rustKey=target.rust.toUpperCase().replaceAll("-","_");
const cryptoTarget=join(work,"crypto-target");
run("cargo",[`+${pins.rustToolchain}`,"build","--manifest-path",sources.cryptoManifest,"--locked","--release","--target",target.rust],repo,{
  CARGO_TARGET_DIR:cryptoTarget,
  [`CARGO_TARGET_${rustKey}_LINKER`]:join(bin,`${target.triple}29-clang`),
  [`CC_${target.rust.replaceAll("-","_")}`]:join(bin,`${target.triple}29-clang`),
  [`AR_${target.rust.replaceAll("-","_")}`]:join(bin,"llvm-ar"),
  RUSTFLAGS:"-C link-arg=-Wl,-z,max-page-size=16384",
  CARGO_REGISTRIES_PROTON_INDEX:"sparse+https://rust-registry.proton.me/index/",
});
const published=join(work,"wrapper",abi);
const managedProperties=[`-p:ProtonSdkRoot=${sources.sdkRoot}`,`-p:ProtonAccountRoot=${sources.accountRoot}`,"-p:CryptoBackend=rust",`-p:ProtonCryptographyVersion=${pins.cryptoPackageVersion}`];
run("pwsh",["-NoProfile","-File",join(repo,"native/proton-sdk/prepare-restore.ps1"),"-SourcesReceipt",join(bootstrap,"sources.json"),"-Runtime",target.rid]);
run(dotnet,["restore",join(repo,"native/proton-sdk/KnownextProton.csproj"),"-r",target.rid,"--locked-mode","--configfile",sources.nugetConfig,...managedProperties],bootstrap);
run(dotnet,["publish",join(repo,"native/proton-sdk/KnownextProton.csproj"),"-c","Release","-r",target.rid,"--no-restore",...managedProperties,
  "-p:DisableUnsupportedError=true","-p:PublishAotUsingRuntimePack=true",`-p:CppCompilerAndLinker=${join(bin,`${target.triple}29-clang`)}`,"-p:CrossCompileAbi=android29","-p:StripSymbols=false",
  `-p:NativeOutputPath=${join(work,"wrapper-link",abi)}/`,"-o",published],bootstrap);

// Build only OpenSSL, directly from its Apache-licensed, hash-pinned source.
// No Kotlin SDK/classes or native libproton_sdk from the GPL-labelled AAR.
const openssl={version:"3.5.7",sha256:"a8c0d28a529ca480f9f36cf5792e2cd21984552a3c8e4aa11a24aa31aeac98e8"};
const archive=join(work,`openssl-${openssl.version}.tar.gz`);
if(!existsSync(archive)){
  const response=await fetch(`https://github.com/openssl/openssl/releases/download/openssl-${openssl.version}/openssl-${openssl.version}.tar.gz`,{signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error("Pinned OpenSSL source download failed");
  writeFileSync(archive,new Uint8Array(await response.arrayBuffer()));
}
if(sha(archive)!==openssl.sha256)throw Error("OpenSSL source archive hash mismatch");
const opensslRoot=join(work,`openssl-${openssl.version}-${abi}`);
mkdirSync(opensslRoot,{recursive:true});
run("tar",["xzf",archive,"--strip-components=1","-C",opensslRoot]);
run("perl",["Configure",target.openssl,"shared","no-tests","no-comp","no-engine","no-autoload-config","no-quic","no-ml-dsa","no-ml-kem","no-slh-dsa","no-sm2-precomp","-D__ANDROID_API__=29"],opensslRoot,{
  ANDROID_NDK_ROOT:ndk,CFLAGS:"-Wno-macro-redefined -Wl,-z,max-page-size=16384",LDFLAGS:"-Wl,-z,max-page-size=16384",
});
run("make",[`-j${process.env.KNOWNEXT_NATIVE_JOBS??"2"}`,"build_libs"],opensslRoot);

const destination=join(repo,"apps/desktop/src-tauri/resources/proton/android",abi);
mkdirSync(destination,{recursive:true});
const artifacts={"libknownext_proton.so":join(published,"Proton.Drive.Sdk.Account.so"),"libproton_crypto.so":join(cryptoTarget,target.rust,"release/libproton_crypto.so"),"libcrypto.so":join(opensslRoot,"libcrypto.so"),"libssl.so":join(opensslRoot,"libssl.so")};
for(const [name,source] of Object.entries(artifacts)){
  const path=join(destination,name);copyFileSync(source,path);run(join(bin,"llvm-strip"),["--strip-unneeded",path]);
}
const notices=join(repo,"apps/desktop/src-tauri/resources/proton/android-notices");
mkdirSync(notices,{recursive:true});cpSync(sources.noticesDirectory,notices,{recursive:true});
const metadata=spawnSync("cargo",[`+${pins.rustToolchain}`,"metadata","--manifest-path",sources.cryptoManifest,"--locked","--format-version","1"],{cwd:repo,env:{...env,CARGO_REGISTRIES_PROTON_INDEX:"sparse+https://rust-registry.proton.me/index/"},encoding:"utf8",maxBuffer:64*1024*1024});
if(metadata.status!==0)throw Error("Unable to inventory native dependency licenses");
writeFileSync(join(bootstrap,"crypto-metadata.json"),metadata.stdout);
run(process.execPath,[join(repo,"native/proton-sdk/write-notices.mjs"),join(bootstrap,"sources.json"),process.env.DOTNET_ROOT??dirname(realpathSync(spawnSync("which",[dotnet],{encoding:"utf8"}).stdout.trim())),join(notices,"THIRD-PARTY-NOTICES.txt")]);
copyFileSync(join(opensslRoot,"LICENSE.txt"),join(notices,"OpenSSL-Apache-2.0.txt"));
writeFileSync(join(notices,"Android-native-provenance.txt"),`Proton SDK ${sources.sdkRevision}\nProton Cryptography ${sources.cryptoRevision}\n.NET SDK ${sources.dotnetVersion}\nRust ${pins.rustToolchain}\nOpenSSL ${openssl.version}, source SHA256 ${openssl.sha256}\nAndroid NDK 28.2.13676358; provider minimum API 29; app minimum API 24.\nBuilt in process, no external Proton client or product service.\n`);
const receipt=join(work,"android-native.json");
run(process.env.PYTHON??"python3",[join(repo,"scripts/check-android-release.py"),"--native-dir",destination,"--notices-dir",notices,"--abi",abi,"--out",receipt]);
const sourceBundle=join(dirname(work),"knownext-proton-android-sources.zip");
run("pwsh",["-NoProfile","-File",join(repo,"native/proton-sdk/source-bundle.ps1"),"-SourcesReceipt",join(bootstrap,"sources.json"),"-OutputFile",sourceBundle]);
const result=JSON.parse(readFileSync(receipt,"utf8"));
result.provenance={sdkRevision:sources.sdkRevision,cryptoRevision:sources.cryptoRevision,cryptoCargoLockSha256:sources.cryptoCargoLockSha256,dotnetSdk:sources.dotnetVersion,rustToolchain:pins.rustToolchain,openssl,ndk:"28.2.13676358",providerApi:29,sourceBundleSha256:sha(sourceBundle)};
writeFileSync(receipt,JSON.stringify(result,null,2)+"\n");
console.log(`Android native SDK receipt: ${receipt}`);
