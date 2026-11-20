import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parse} from 'yaml';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const write=(file,text)=>fs.writeFileSync(path.join(root,file),text);
const config=()=>parse(read('admin_browser/config.yaml'));

export function versionParts(version) {
  if(typeof version!=='string' || version.trim()!==version || !/^20\d{2}\.(0[1-9]|1[0-2])\.(0[1-9]|[1-9]\d+)$/.test(version))
    throw Error('La versión debe tener formato AAAA.MM.NN, por ejemplo 2026.11.01.');
  return version.split('.').map(Number);
}

export function releaseNotes(changelog,version) {
  versionParts(version);
  const heading=`# Versión ${version} (`;
  const sections=changelog.split(/(?=^# )/m);
  const matches=sections.filter(section=>section.startsWith(heading));
  if(matches.length!==1)throw Error('Debe haber una única entrada de changelog para '+version);
  const notes=matches[0].split('\n').slice(1).join('\n').trim();
  if(!notes)throw Error('La entrada del changelog está vacía.');
  return notes+'\n';
}

export function prepare(version,notes) {
  const parts=versionParts(version), current=config().version;
  if(!notes.trim())throw Error('Las notas no pueden estar vacías.');
  if(/^# /m.test(notes))throw Error('Usa encabezados de segundo nivel dentro de las notas.');
  const old=current.split('.').map(Number);
  const difference=parts.map((value,i)=>value-(old[i]||0)).find(value=>value!==0)||0;
  if(difference<=0)throw Error('La nueva versión debe ser posterior a '+current);
  if(read('admin_browser/CHANGELOG.md').includes(`# Versión ${version} (`))throw Error('La versión ya está en el changelog.');
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date());
  write('admin_browser/config.yaml',read('admin_browser/config.yaml').replace(/^version:.*$/m,`version: "${version}"`));
  for(const file of ['README.md','admin_browser/README.md'])
    write(file,read(file).replace(`Versión ${current}`,`Versión ${version}`));
  write('admin_browser/CHANGELOG.md',`# Versión ${version} (${date})\n\n${notes.trim()}\n\n${read('admin_browser/CHANGELOG.md')}`);
  return version;
}

export function validate() {
  const c=config();
  versionParts(c.version);
  if(c.stage!=='stable'||c.slug!=='admin_browser_cfm'||JSON.stringify(c.arch)!=='["amd64"]')throw Error('Metadatos del complemento inesperados.');
  for(const key of ['host_network','homeassistant_api','hassio_api','auth_api','docker_api'])
    if(c[key]!==false)throw Error('Permiso no permitido: '+key);
  for(const key of ['ingress','ingress_stream','panel_admin','apparmor'])
    if(c[key]!==true)throw Error('Protección requerida: '+key);
  if(c.privileged?.length||c.full_access||c.ports)throw Error('El complemento no debe ampliar privilegios ni publicar puertos.');
  if(c.options.admin_user_ids.length||c.options.bookmarks.length)throw Error('La configuración publicada debe estar vacía.');
  if(c.options.persist_profile!==false||c.options.reset_profile!==false)throw Error('Valores iniciales de perfil incorrectos.');
  if(!read('admin_browser/CHANGELOG.md').startsWith(`# Versión ${c.version} (`))throw Error('El changelog no comienza por la versión actual.');
  releaseNotes(read('admin_browser/CHANGELOG.md'),c.version);
  for(const file of ['README.md','admin_browser/README.md'])
    if(!read(file).includes(`Versión ${c.version}`))throw Error('Versión desactualizada en '+file);
  for(const name of ['icon','logo']) {
    const png=fs.readFileSync(path.join(root,`admin_browser/${name}.png`));
    if(png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.readUInt32BE(16)!==png.readUInt32BE(20))throw Error('PNG cuadrado no válido: '+name);
  }
  for(const file of fs.readdirSync(path.join(root,'.github/workflows'))) {
    const workflow=parse(read('.github/workflows/'+file));
    if(!workflow.on||!workflow.jobs)throw Error('Workflow no válido: '+file);
    for(const job of Object.values(workflow.jobs))for(const step of job.steps||[])
      if(step.uses&&!/@[a-f0-9]{40}$/.test(step.uses))throw Error('La acción debe fijarse a un commit: '+step.uses);
  }
  return c.version;
}

export function packageRelease() {
  const version=validate(), dir=path.join(root,'dist');
  const committed=parse(execFileSync('git',['show','HEAD:admin_browser/config.yaml'],{cwd:root,encoding:'utf8'}));
  if(committed.version!==version)throw Error('La versión debe estar confirmada en Git antes de empaquetar.');
  fs.mkdirSync(dir,{recursive:true});
  const filename=`navegador-admin-cfm-${version}.zip`;
  // Only reviewed sources and documentation belong in a release archive.
  execFileSync('git',['archive','--format=zip',`--prefix=navegador-admin-cfm-${version}/`,`--output=${path.join(dir,filename)}`,'HEAD','admin_browser','repository.yaml','README.md','NOTICE.md','SECURITY.md','RELEASING.md'],{cwd:root});
  const hash=createHash('sha256').update(fs.readFileSync(path.join(dir,filename))).digest('hex');
  fs.writeFileSync(path.join(dir,'SHA256SUMS'),`${hash}  ${filename}\n`);
  fs.writeFileSync(path.join(dir,'release-notes.md'),releaseNotes(read('admin_browser/CHANGELOG.md'),version));
  return version;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const command=process.argv[2];
  if(command==='validate')console.log(validate());
  else if(command==='prepare')console.log(prepare(process.argv[3],fs.readFileSync(process.argv[4],'utf8')));
  else if(command==='package')console.log(packageRelease());
  else throw Error('Uso: release.mjs validate | prepare VERSION NOTAS | package');
}
