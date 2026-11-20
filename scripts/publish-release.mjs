import {execFileSync,spawnSync} from 'node:child_process';
import {versionParts} from './release.mjs';

const {VERSION:version,TARGET_SHA:target,GH_REPO,GITHUB_REPOSITORY}=process.env;
versionParts(version);
if(!/^[a-f0-9]{40}$/.test(target||''))throw Error('Commit de publicación no válido.');
const repo=GH_REPO||GITHUB_REPOSITORY;
if(repo!=='carferrer/navegador-admin-cfm')throw Error('Repositorio de publicación inesperado.');
const gh=(...args)=>execFileSync('gh',args,{encoding:'utf8'}).trim();
const response=spawnSync('gh',['api',`repos/${repo}/releases/tags/${version}`],{encoding:'utf8'});
if(response.status===0) {
  const release=JSON.parse(response.stdout);
  if(!release.draft) {
    console.log('La release ya está publicada; se conserva sin cambios: '+release.html_url);
    process.exit(0);
  }
  if(release.target_commitish!==target)throw Error('El borrador corresponde a otro commit. No se sobrescribe.');
} else if(!response.stderr.includes('HTTP 404')) {
  throw Error('No se ha podido comprobar si la release ya existe.');
}
// An existing tag must identify exactly the commit that passed this CI run.
const tag=spawnSync('gh',['api',`repos/${repo}/git/ref/tags/${version}`],{encoding:'utf8'});
if(tag.status===0) {
  let object=JSON.parse(tag.stdout).object;
  while(object.type==='tag')object=JSON.parse(gh('api',`repos/${repo}/git/tags/${object.sha}`)).object;
  if(object.type!=='commit'||object.sha!==target)throw Error('La etiqueta ya apunta a otro commit. No se sobrescribe.');
} else if(!tag.stderr.includes('HTTP 404'))throw Error('No se ha podido comprobar la etiqueta.');
if(response.status!==0)gh('release','create',version,'--repo',repo,'--target',target,'--title',version,'--notes-file','dist/release-notes.md','--draft');
gh('release','upload',version,`dist/navegador-admin-cfm-${version}.zip`,'dist/SHA256SUMS','--repo',repo,'--clobber');
gh('release','edit',version,'--repo',repo,'--notes-file','dist/release-notes.md','--draft=false','--latest');
console.log(gh('release','view',version,'--repo',repo,'--json','url','--jq','.url'));
