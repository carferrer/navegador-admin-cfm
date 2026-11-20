import fs from 'node:fs';
const report=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
if(!report.Results?.length)throw Error('El análisis no contiene resultados.');
if(!report.Results.some(r=>r.Class==='os-pkgs'&&r.Type==='alpine'))throw Error('No se han reconocido los paquetes de Alpine.');
for(const name of ['webauth','webservices'])
  if(!report.Results.some(r=>r.Type==='gobinary'&&r.Target.endsWith('/'+name)))throw Error('No se ha analizado el binario '+name);
let vulnerabilities=0,secrets=0;
for(const result of report.Results) {
  vulnerabilities+=(result.Vulnerabilities||[]).filter(v=>['HIGH','CRITICAL'].includes(v.Severity)).length;
  secrets+=(result.Secrets||[]).length;
}
console.log(JSON.stringify({highOrCritical:vulnerabilities,secrets}));
if(vulnerabilities||secrets)throw Error('La imagen no supera el control de seguridad.');
