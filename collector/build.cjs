'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const here=__dirname,bin=path.resolve(here,'../vitals/bin');
const componentVersion='1.0.0';
const csc=path.join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const presentMon=path.join(here,'vendor/PresentMon-2.6.0-x64.exe');
const expected='b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af';
if(hash(presentMon)!==expected)throw Error('PresentMon hash mismatch.');
fs.mkdirSync(path.join(here,'build'),{recursive:true});
const collector=path.join(here,'build/OnbunFpsCollector.exe'),setup=path.join(bin,'OnbunFpsSetup.exe');
const compile=args=>execFileSync(csc,['/nologo','/optimize+','/platform:x64',...args],{stdio:'inherit',windowsHide:true});
compile(['/target:exe','/out:'+collector,'/r:System.ServiceProcess.dll','/r:System.Web.Extensions.dll',path.join(here,'Collector.cs')]);
// Optional existing Onbun signing configuration; release builds can require it.
async function build(){
  const hook=process.env.ONBUN_SIGNING_HOOK || path.resolve(here,'../../../scripts/sign-windows.cjs');
  let warned=false;
  const sign=fs.existsSync(hook) ? require(path.resolve(hook)) : async ({path:file})=>{
    const thumbprint=process.env.ONBUN_SIGN_THUMBPRINT;
    if(!thumbprint){
      if(process.env.ONBUN_REQUIRE_SIGNING)throw Error('Configure ONBUN_SIGNING_HOOK or ONBUN_SIGN_THUMBPRINT for this release.');
      if(!warned){console.warn('Unsigned development build: configure code signing before production distribution.');warned=true;}
      return;
    }
    if(!/^[a-fA-F0-9]{40}$/.test(thumbprint))throw Error('Signing thumbprint must contain 40 hexadecimal characters.');
    execFileSync(process.env.ONBUN_SIGNTOOL || 'signtool.exe',['sign','/fd','SHA256','/td','SHA256','/tr',process.env.ONBUN_SIGN_TIMESTAMP || 'http://timestamp.digicert.com','/sha1',thumbprint,...(process.env.ONBUN_SIGN_MACHINE_STORE?['/sm']:[]),file],{stdio:'inherit',windowsHide:true});
  };
  await sign({path:collector});
  fs.writeFileSync(path.join(here,'build/Payload.cs'),`namespace Onbun.Fps.Setup { internal static class Payload { internal const string Version="${componentVersion}", CollectorHash="${hash(collector)}", PresentMonHash="${expected}"; } }\n`);
  compile(['/target:winexe','/out:'+setup,'/win32manifest:'+path.join(here,'setup.manifest'),'/r:System.ServiceProcess.dll','/r:System.Windows.Forms.dll',
    '/resource:'+collector+',Collector','/resource:'+presentMon+',PresentMon','/resource:'+path.join(bin,'PresentMon-LICENSE.txt')+',License',
    path.join(here,'Setup.cs'),path.join(here,'build/Payload.cs')]);
  await sign({path:setup});
  fs.writeFileSync(path.join(bin,'collector-build.json'),JSON.stringify({version:componentVersion,collectorSha256:hash(collector),setupSha256:hash(setup),presentMonSha256:expected},null,2)+'\n');
  if(!process.argv.includes('--skip-native-test')) execFileSync(collector,['--self-test'],{stdio:'inherit',windowsHide:true});
  console.log('Built demand-start collector and fixed-payload setup; no service installed.');
}
build().catch(error=>{console.error(error.message);process.exitCode=1;});
