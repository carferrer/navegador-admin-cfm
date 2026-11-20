// Runs isolated Docker tests with no published ports and no Docker socket mounts.
import {execFileSync,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'yaml';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version=parse(fs.readFileSync(path.join(root,'admin_browser/config.yaml'),'utf8')).version;
const image=`cfm-admin-browser:${version}`;
const docker=process.env.DOCKER_BIN || (process.platform==='win32' ?
  path.join(process.env.LOCALAPPDATA,'Programs/DockerDesktop/resources/bin/docker.exe') : 'docker');
const stamp=Date.now(), name=`cfm-test-${stamp}`, net=`${name}-net`, volume=`${name}-data`;
const results=path.resolve(process.env.CFM_RESULTS_DIR || path.join(root,'test-results'));
fs.mkdirSync(results,{recursive:true});
const options={admin_user_ids:['a'.repeat(32)],bookmarks:[{name:'Equipo de prueba',url:'http://172.30.32.2:9000/fixture'}],persist_profile:false,exchange_cleanup:'manual',clipboard_sync:true,display_width:1280,display_height:800};
fs.writeFileSync(path.join(results,'options.test.json'),JSON.stringify(options));
function d(...args){return execFileSync(docker,args,{encoding:'utf8',maxBuffer:5e6}).trim();}
let success=false;
try {
  console.log('Building add-on');
  d('build',...(process.env.CFM_FRESH_BUILD==='1' ? ['--pull','--no-cache'] : []),'-t',image,path.join(root,'admin_browser'));
  d('network','create','--subnet','172.30.32.0/24',net);
  d('volume','create',volume);
  const hostSecurity=process.env.CFM_HA_SECCOMP==='1' ? ['--security-opt','seccomp=unconfined'] : [];
  d('create',...hostSecurity,'--name',name,'--network',net,'--ip','172.30.32.3','--network-alias','browser',
    '--shm-size','256m','--mount',`type=volume,source=${volume},target=/data`,image);
  d('cp',path.join(results,'options.test.json'),`${name}:/data/options.json`);
  d('start',name);
  d('exec',name,'sh','-c','mkdir -p /data/exchange; ln -s /data/options.json /data/exchange/outside-link');
  fs.writeFileSync(path.join(results,'containers.json'),JSON.stringify({name,net,volume}));
  const r=spawnSync(docker,['run','--rm','--name',`${name}-runner`,'--network',net,'--ip','172.30.32.2',
    '--shm-size','256m','--mount',`type=bind,source=${root},target=/suite,readonly`,
    '--mount',`type=bind,source=${results},target=/results`,
    '-w','/suite','mcr.microsoft.com/playwright:v1.58.2-noble@sha256:6446946a1d9fd62d9ae501312a2d76a43ee688542b21622056a372959b65d63d','node','tests/browser-check.mjs'],
    {stdio:'inherit',timeout:240000});
  if(r.status!==0) throw Error('Browser integration checks failed');
  const inspect=JSON.parse(d('inspect',name))[0];
  if(Object.keys(inspect.HostConfig.PortBindings||{}).length) throw Error('Published app port');
  if(inspect.HostConfig.Privileged) throw Error('Privileged container');
  const isolation=JSON.parse(d('exec',name,'node','/opt/cfm/isolation-report.mjs'));
  fs.writeFileSync(path.join(results,'isolation.json'),JSON.stringify(isolation,null,2));
  const firefox=isolation.processes.filter(p=>p.name.startsWith('firefox'));
  const content=isolation.processes.filter(p=>/Isolated Web Co|Web Content/.test(p.name));
  if(!firefox.length || !content.length)throw Error('Browser processes missing from isolation check');
  for(const p of [...firefox,...content]){
    if(p.uid.split(/\s+/).some(id=>id!=='1000') || p.capabilities!=='0000000000000000' ||
       p.noNewPrivileges!=='1' || p.seccomp!=='2')throw Error('Browser isolation check failed: '+JSON.stringify(p));
  }
  const parentFilters=Math.min(...firefox.map(p=>Number(p.seccompFilters)));
  if(content.some(p=>Number(p.seccompFilters)<=parentFilters))throw Error('Firefox content seccomp filter missing');
  fs.writeFileSync(path.join(results,'filter-self-test.txt'),d('run','--rm','--network','none',
    '--security-opt','seccomp=unconfined','--entrypoint','/opt/cfm/secure-launch',
    image,'--self-test'));
  fs.writeFileSync(path.join(results,'runtime.json'),JSON.stringify({
    publishedPorts:inspect.HostConfig.PortBindings,privileged:inspect.HostConfig.Privileged,
    extraCapabilities:inspect.HostConfig.CapAdd,
    imageId:inspect.Image,securityOptions:inspect.HostConfig.SecurityOpt,
    processes:d('exec',name,'ps','-o','user,pid,args'),
    nginx:d('exec',name,'/opt/base/sbin/nginx','-t','-c','/opt/base/etc/nginx/nginx.conf')
  },null,2));
  // Deny connections from inside the browser container, even with forged headers.
  const denial=d('exec',name,'node','--input-type=module','-e',
    'const r=await fetch("http://127.0.0.1:5800/",{headers:{"X-Remote-User-Id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","X-Ingress-Path":"/api/hassio_ingress/test","X-Forwarded-For":"172.30.32.2"}});console.log(r.status)');
  if(denial!=='403') throw Error('IP restriction failed: '+denial);
  // Check cleanup and persistent profile with marker files, not by guessing state.
  d('exec',name,'node','-e','require("fs").writeFileSync("/config/profile/test-marker","temporary")');
  d('restart',name);
  for(let i=0;i<40;i++){
    await new Promise(r=>setTimeout(r,500));
    try{if(d('exec',name,'test','-f','/run/cfm-env')==='')break;}catch{}
  }
  const ephemeral=d('exec',name,'node','-e','console.log(require("fs").existsSync("/config/profile/test-marker"))');
  if(ephemeral!=='false') throw Error('Ephemeral profile survived startup');
  d('stop',name);
  d('start',name);
  d('exec',name,'node','-e','const fs=require("fs");fs.mkdirSync("/data/profile",{recursive:true});fs.writeFileSync("/data/profile/legacy-marker","preserved");');
  d('stop',name);
  options.persist_profile=true;
  fs.writeFileSync(path.join(results,'options.test.json'),JSON.stringify(options));
  d('cp',path.join(results,'options.test.json'),`${name}:/data/options.json`);d('start',name);
  await new Promise(r=>setTimeout(r,3000));
  d('exec',name,'node','-e','require("fs").writeFileSync("/data/profile-esr/test-marker","persistent")');
  d('restart',name);await new Promise(r=>setTimeout(r,3000));
  if(d('exec',name,'node','-e','console.log(require("fs").readFileSync("/config/profile/test-marker","utf8"))')!=='persistent')throw Error('Persistent profile lost');
  if(d('exec',name,'node','-e','console.log(require("fs").readFileSync("/data/profile/legacy-marker","utf8"))')!=='preserved')throw Error('Legacy profile was changed');
  d('stop',name); options.reset_profile=true;options.exchange_cleanup='on_start';
  fs.writeFileSync(path.join(results,'options.test.json'),JSON.stringify(options));
  d('cp',path.join(results,'options.test.json'),`${name}:/data/options.json`);d('start',name);
  await new Promise(r=>setTimeout(r,3000));
  if(d('exec',name,'node','-e','console.log(require("fs").existsSync("/data/profile-esr/test-marker"))')!=='false')throw Error('Profile reset failed');
  if(d('exec',name,'node','-e','console.log(require("fs").existsSync("/data/profile/legacy-marker"))')!=='false')throw Error('Legacy profile reset failed');
  if(d('exec',name,'node','-e','console.log(require("fs").readdirSync("/data/exchange").length)')!=='0')throw Error('Exchange cleanup failed');
  fs.writeFileSync(path.join(results,'lifecycle.json'),JSON.stringify({directIpDenied:true,ephemeralProfileCleared:true,persistentProfileRetained:true,legacyProfilePreservedUntilReset:true,resetProfileCleared:true,legacyProfileReset:true,exchangeClearedOnStart:true},null,2));
  success=true;console.log('Docker checks passed. Results:',results);
} finally {
  try{fs.writeFileSync(path.join(results,'container.log'),d('logs',name));}catch{}
  if(process.env.CFM_KEEP_TESTS!=='1') {
    for(const args of [['rm','-f',`${name}-runner`],['rm','-f','-v',name],['volume','rm',volume],['network','rm',net]])try{d(...args);}catch{}
  } else console.log('Kept test resources:',{name,net,volume});
  if(!success)process.exitCode=1;
}
