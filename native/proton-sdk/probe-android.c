/* QA executable only. Never distributed as a product helper process. */
#include <dlfcn.h>
#include <stdint.h>
#include <stddef.h>
#include <stdio.h>
#include <string.h>
typedef uint8_t* (*request_fn)(const uint8_t*,size_t);
typedef size_t (*length_fn)(uint8_t*);
typedef void (*free_fn)(uint8_t*);
int main(int argc,char** argv){
 if(argc<2||argc>3)return 2;
 void* lib=dlopen(argv[1],RTLD_NOW|RTLD_LOCAL);
 if(!lib){fprintf(stderr,"LOAD_FAIL: %s\n",dlerror());return 3;}
 request_fn request=(request_fn)dlsym(lib,"knownext_proton_request");
 length_fn length=(length_fn)dlsym(lib,"knownext_proton_response_length");
 free_fn release=(free_fn)dlsym(lib,"knownext_proton_free");
 if(!request||!length||!release)return 4;
 const char* inputs[]={"{\"operation\":\"bridge.info\"}","{\"operation\":\"diagnostics.crypto\"}","{\"operation\":\"auth.start\"}"};
 for(size_t i=0;i<(argc==3?3:2);i++){
  uint8_t* response=request((const uint8_t*)inputs[i],strlen(inputs[i]));
  if(!response)return 5;
  size_t n=length(response);if(n>8192)return 6;
  if(i<2){fwrite(response,1,n,stdout);fputc('\n',stdout);}
  int passed=0;for(size_t k=0;k+9<n;k++)if(!memcmp(response+k,"\"ok\":true",9)){passed=1;break;}
  if(i==2){
   int domain=0;const char* expected="https://account.proton.me/desktop/login?";
   for(size_t k=0;k+strlen(expected)<n;k++)if(!memcmp(response+k,expected,strlen(expected))){domain=1;break;}
   printf("AUTH_START_%s domainValidated=%s\n",passed&&domain?"PASS":"FAIL",domain?"true":"false");
   if(!passed){
    const char* prefix="\"code\":\"";
    for(size_t k=0;k+strlen(prefix)<n;k++)if(!memcmp(response+k,prefix,strlen(prefix))){
     fputs("AUTH_ERROR_CODE=",stdout);k+=strlen(prefix);
     for(size_t j=0;j<64&&k+j<n;j++){char c=(char)response[k+j];if(!((c>='a'&&c<='z')||(c>='0'&&c<='9')||c=='-'))break;fputc(c,stdout);}fputc('\n',stdout);break;
    }
   }
   passed=passed&&domain;
  }
  release(response);if(!passed)return 7;
 }
 puts("KNOWNEXT_NATIVE_BRIDGE_AND_CRYPTO_PASS");return 0;
}
