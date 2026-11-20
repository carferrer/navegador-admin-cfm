// Read-only diagnostic. No command lines, environment variables, URLs or profiles.
import fs from 'node:fs';
function read(p){try{return fs.readFileSync(p,'utf8').trim();}catch{return null;}}
function processInfo(pid){
  const status=read(`/proc/${pid}/status`); if(!status)return null;
  const values=Object.fromEntries(status.split('\n').map(l=>l.split(/:\s+/,2)));
  const namespaces={};
  for(const n of ['user','pid','net','mnt'])try{namespaces[n]=fs.readlinkSync(`/proc/${pid}/ns/${n}`);}catch{namespaces[n]=null;}
  return Object.fromEntries(Object.entries({pid:Number(pid),name:values.Name,uid:values.Uid,
    noNewPrivileges:values.NoNewPrivs,seccomp:values.Seccomp,seccompFilters:values.Seccomp_filters,
    capabilities:values.CapEff,capabilitiesPermitted:values.CapPrm,
    apparmor:read(`/proc/${pid}/attr/current`),namespaces}));
}
const processes=fs.readdirSync('/proc').filter(n=>/^\d+$/.test(n)).map(processInfo).filter(Boolean);
console.log(JSON.stringify({date:new Date().toISOString(),kernel:read('/proc/sys/kernel/osrelease'),
  alpine:read('/etc/alpine-release'),unprivilegedUserns:read('/proc/sys/kernel/unprivileged_userns_clone'),
  maxUserNamespaces:read('/proc/sys/user/max_user_namespaces'),processes},null,2));
