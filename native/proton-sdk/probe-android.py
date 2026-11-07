"""Bounded native ABI QA on the dedicated emulator; never a product helper."""
from pathlib import Path
import json, os, subprocess, time

root=Path(__file__).resolve().parents[2]
out=root/'output/sc01-proton-p1/native'
sdk=Path(os.environ['LOCALAPPDATA'])/'Android/Sdk'
adb=sdk/'platform-tools/adb.exe'
serial='emulator-5580'
remote='/data/local/tmp/knownext-proton-p1'
log=[]
result={'bootReady':False,'abiAndCryptoPassed':False,'cloudCalls':'anonymous-auth-start-attempted','closedOwnAvd':False}
def run(args,timeout=15):
    try:
        p=subprocess.run([str(adb),'-s',serial,*args],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=timeout)
        log.append({'args':args,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr})
        return p.returncode,p.stdout,p.stderr
    except subprocess.TimeoutExpired:
        log.append({'args':args,'timeout':timeout})
        return -1,'','timeout'
try:
    deadline=time.monotonic()+180
    while time.monotonic()<deadline:
        code,stdout,_=run(['shell','getprop','sys.boot_completed'],8)
        if code==0 and stdout.strip()=='1':result['bootReady']=True;break
        time.sleep(4)
    if result['bootReady']:
        code,_,_=run(['shell','mkdir','-p',remote])
        if code!=0:raise RuntimeError('Cannot create QA scope')
        items=[out/'probe-android-x64',out/'delivery-aes/android-x86_64/libknownext_proton.so',out/'delivery-aes/android-x86_64/libproton_crypto.so']
        for path in items:
            code,_,_=run(['push',str(path),remote+'/'+path.name],120)
            if code!=0:raise RuntimeError('Cannot stage QA artifact')
        run(['shell','chmod','700',remote+'/probe-android-x64'])
        command='LD_LIBRARY_PATH='+remote+' '+remote+'/probe-android-x64 '+remote+'/libknownext_proton.so auth'
        code,stdout,stderr=run(['shell',command],60)
        (out/'probe-android-before-openssl.log').write_text(stdout+stderr,encoding='utf-8')
        result['beforeOpenSslAuthPassed']=code==0 and 'AUTH_START_PASS' in stdout
        for name in ('libssl.so','libcrypto.so'):
            source=root/'output/sc01-proton-p0/android/probe-app/native'/name
            code,_,_=run(['push',str(source),remote+'/'+name],90)
            if code!=0:raise RuntimeError('Cannot stage OpenSSL dependency')
        code,certdir,_=run(['shell','if [ -d /apex/com.android.conscrypt/cacerts ]; then echo /apex/com.android.conscrypt/cacerts; else echo /system/etc/security/cacerts; fi'])
        certdir=certdir.strip()
        if certdir not in ('/apex/com.android.conscrypt/cacerts','/system/etc/security/cacerts'):raise RuntimeError('Unexpected trust directory')
        code,stdout,stderr=run(['shell','SSL_CERT_DIR='+certdir+' '+command],60)
        (out/'probe-android-output.log').write_text(stdout+stderr,encoding='utf-8')
        result['abiAndCryptoPassed']='"crypto":"passed"' in stdout
        result['forkAesGcmPassed']='"forkAesGcm":"passed"' in stdout
        result['authStartPassed']=code==0 and 'AUTH_START_PASS' in stdout
        result['certificateDirectory']=certdir
except Exception as e:
    result['qaError']=type(e).__name__
finally:
    code,_,_=run(['emu','kill'])
    result['closedOwnAvd']=code==0
    (out/'probe-android-calls.json').write_text(json.dumps(log,indent=2),encoding='utf-8')
    (out/'probe-android-result.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result))
