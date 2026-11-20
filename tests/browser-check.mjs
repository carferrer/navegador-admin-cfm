import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {once} from 'node:events';
import {WebSocket,WebSocketServer} from 'ws';
import {encode,decode} from '@msgpack/msgpack';
import {chromium} from 'playwright';

const uid='a'.repeat(32), prefixes=['/api/hassio_ingress/test_A-123/','/api/hassio_ingress/changed_B-456/'];
const checks=[], fixture={visits:[],pasted:[],uploads:[]}, requests=[];
function pass(name,detail=true){checks.push({name,detail});console.log('PASS',name);}
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<120;i++){if(await fn())return;await delay(250);}throw Error('Timeout: '+label);}
const headers={ 'X-Remote-User-Id':uid,'X-Ingress-Path':prefixes[0].slice(0,-1)};
await until(async()=>{try{return (await fetch('http://browser:5800/',{headers,signal:AbortSignal.timeout(1000)})).status===200;}catch{return false;}},'container ready');
for(const h of [{},{'X-Ingress-Path':prefixes[0]},{...headers,'X-Remote-User-Id':'b'.repeat(32)},{...headers,'X-Ingress-Path':'bad'}]){
  assert.equal((await fetch('http://browser:5800/',{headers:h})).status,403);
}
pass('Missing/unknown user and invalid Ingress header denied');
assert.equal((await fetch('http://browser:5800/ws-terminal',{headers})).status,404);
pass('Web terminal route disabled');
const fixtureServer=http.createServer((req,res)=>{
  if(req.url==='/paste') {let b='';req.on('data',c=>b+=c);req.on('end',()=>{fixture.pasted.push(b);res.end('OK');});return;}
  if(req.url==='/remote-file') {let b='';req.on('data',c=>b+=c);req.on('end',()=>{fixture.uploads.push(b);res.end('OK');});return;}
  if(req.url==='/backup'){res.setHeader('Content-Disposition','attachment; filename="backup-device.txt"');res.end('Backup generado por el equipo de prueba — CFM');return;}
  fixture.visits.push({url:req.url,cookie:req.headers.cookie||''});
  res.setHeader('Content-Type','text/html;charset=utf-8');res.setHeader('Set-Cookie','fixture_session=local-test; SameSite=Lax');
  if(req.url==='/file-upload'){res.end('<!doctype html><title>Importar configuración</title><h1>Importar configuración</h1><input id="file" type="file" autofocus><script>file.onchange=async()=>fetch("/remote-file",{method:"POST",body:await file.files[0].text()})</script>');return;}
  res.end('<!doctype html><html lang="es"><title>Equipo local de prueba</title><h1>Equipo local de prueba</h1><textarea id="text" autofocus style="width:80%;height:160px">'+(req.url==='/copy-fixture'?'Texto originado en Firefox: ñ €':'')+'</textarea><script>text.oninput=()=>fetch("/paste",{method:"POST",body:text.value})</script></html>');
}).listen(9000,'0.0.0.0');await once(fixtureServer,'listening');

// A deliberately small Ingress simulator: strips prefix, replaces identity headers,
// accepts a test cookie, forwards HTTP and WS. It does not implement HA authentication.
const proxy=http.createServer((req,res)=>{
  if(req.url.startsWith('/panel')){
    const u=new URL(req.url,'http://localhost');
    if(u.searchParams.get('deny')==='1')res.setHeader('Permissions-Policy','clipboard-read=(), clipboard-write=()');
    res.setHeader('Content-Type','text/html');
    res.end(`<html><style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><iframe src="${prefixes[0]}?host_clipboard_sync=${u.searchParams.get('sync')==='1'}"></iframe></html>`);return;
  }
  const prefix=prefixes.find(p=>req.url.startsWith(p));
  if(!prefix){res.writeHead(404).end();return;}
  if(!req.headers.cookie?.includes('test_ingress=admin')){res.writeHead(401).end();return;}
  requests.push(req.url);
  const h={...req.headers,'x-remote-user-id':uid,'x-ingress-path':prefix.slice(0,-1)};
  delete h.cookie;
  const upstream=http.request({hostname:'browser',port:5800,path:'/'+req.url.slice(prefix.length),method:req.method,headers:h},r=>{
    res.writeHead(r.statusCode,r.headers);r.pipe(res);
  });upstream.on('error',()=>res.writeHead(502).end());req.pipe(upstream);
});
const wss=new WebSocketServer({noServer:true});
proxy.on('upgrade',(req,socket,head)=>{
  const prefix=prefixes.find(p=>req.url.startsWith(p));
  if(!prefix || !req.headers.cookie?.includes('test_ingress=admin')){socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');return;}
  const protocols=req.headers['sec-websocket-protocol']?.split(',').map(s=>s.trim())||[];
  const upstream=new WebSocket('ws://browser:5800/'+req.url.slice(prefix.length),protocols,{headers:{...headers,'X-Ingress-Path':prefix.slice(0,-1)}});
  upstream.on('error',()=>socket.destroy());
  upstream.once('open',()=>wss.handleUpgrade(req,socket,head,client=>{
    upstream.on('message',(data,binary)=>{if(client.readyState===WebSocket.OPEN)client.send(data,{binary});});
    client.on('message',(data,binary)=>{if(upstream.readyState===WebSocket.OPEN)upstream.send(data,{binary});});
    client.on('close',()=>upstream.close());upstream.on('close',()=>client.close());
  }));
});
proxy.listen(8099,'127.0.0.1');await once(proxy,'listening');
const origin='http://127.0.0.1:8099', auth={Cookie:'test_ingress=admin'};
for(const p of prefixes){
  assert.equal((await fetch(origin+p,{headers:auth})).status,200);
  const ws=new WebSocket(origin.replace('http','ws')+p+'websockify',['binary'],{headers:auth});
  const [rfb]=await once(ws,'message');assert.match(rfb.toString(),/^RFB 003\./);ws.close();
}
pass('Two Ingress prefixes: HTTP 200 and real RFB WebSocket handshake');
assert.equal((await fetch(origin+prefixes[0])).status,401);
pass('Simulated unauthenticated Ingress request rejected (not an HA authentication test)');

const fm=new WebSocket(origin.replace('http','ws')+prefixes[0]+'ws-filemanager',{headers:auth});await once(fm,'open');
async function command(msg){const response=once(fm,'message');fm.send(encode(msg));return decode((await response)[0]);}
const content=crypto.randomBytes(1024*1024+17), dest=`/data/exchange/roundtrip-${Date.now()}.bin`;
assert.equal((await command({type:'upload',path:dest,size:content.length})).type,'success');
for(let i=0;i<content.length;i+=65536)assert.equal((await command({type:'uploadBlock',path:dest,content:content.subarray(i,i+65536)})).type,'success');
const dl=await command({type:'download',path:dest});assert.equal(dl.type,'success');
const received=Buffer.from(await (await fetch(origin+prefixes[0]+'download/'+dl.uuid,{headers:auth})).arrayBuffer());
assert.deepEqual(received,content);pass('Binary file upload/download over prefixed WS/HTTP, SHA256 equal',crypto.createHash('sha256').update(content).digest('hex'));
for(const bad of ['/data/options.json','/etc/passwd','/data/exchange/../options.json','/config/profile/prefs.js','/data/exchange/outside-link','/data/profile-esr/prefs.js']){
  assert.equal((await command({type:'download',path:bad})).type,'error');
}
pass('File manager denies configuration, profile and traversal outside exchange');
fm.close();

const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext({viewport:{width:1360,height:900},acceptDownloads:true});
  const clientAssets=[];
  context.on('request',request=>{
    if(['script','stylesheet','image','font','fetch','xhr'].includes(request.resourceType())) clientAssets.push(request.url());
  });
  await context.addCookies([{name:'test_ingress',value:'admin',url:origin}]);
  const page=await context.newPage(); const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/panel');
  const frame=await (await page.waitForSelector('iframe')).contentFrame();
  await frame.waitForSelector('#noVNC_container canvas',{timeout:30000});
  await frame.evaluate(async()=>{
    const script=[...document.scripts].map(s=>s.textContent).find(t=>t.includes('import UI from'));
    const module=script.match(/import UI from "([^"]+)"/)[1];
    window.testUI=(await import(module)).default;
  });
  await frame.waitForFunction(()=>window.testUI.rfb?._rfbConnectionState==='connected');
  pass('noVNC client renders and connects inside same-origin iframe with no allow attribute');
  const capability=await frame.evaluate(()=>({secureContext:isSecureContext,clipboard:!!navigator.clipboard,
    readPolicy:document.featurePolicy?.allowsFeature('clipboard-read'),writePolicy:document.featurePolicy?.allowsFeature('clipboard-write')}));
  pass('Clipboard capability in simulated Ingress iframe',capability);
  async function chord(key){await frame.evaluate(key=>{const r=window.testUI.rfb;r.sendKey(0xffe3,'ControlLeft',true);r.sendKey(key.code,key.name,true);r.sendKey(key.code,key.name,false);r.sendKey(0xffe3,'ControlLeft',false);},key);await delay(300);}
  async function remotePaste(text){await frame.evaluate(t=>{document.querySelector('#noVNC_clipboard_text').value=t;window.testUI.clipboardSend();},text);await delay(300);await chord({code:118,name:'KeyV'});}
  async function navigate(url){
    await chord({code:108,name:'KeyL'});
    // Type addresses independently of the clipboard feature under test.
    await frame.evaluate(url=>{for(const c of url)window.testUI.rfb.sendKey(c.codePointAt(0));window.testUI.rfb.sendKey(0xff0d,'Enter');},url);
  }
  await navigate('http://172.30.32.2:9000/fixture');
  await until(()=>fixture.visits.some(x=>x.url==='/fixture'),'remote Firefox navigation');
  await delay(1200);
  const sample='Prueba CFM: áéíóú ñ € — texto remoto';
  await remotePaste(sample);await until(()=>fixture.pasted.includes(sample),'clipboard paste into Firefox');
  pass('Manual clipboard: Unicode text from client reaches remote Firefox');
  await navigate('http://172.30.32.2:9000/copy-fixture');
  await until(()=>fixture.visits.some(x=>x.url==='/copy-fixture'),'remote copy page');await delay(800);
  await frame.evaluate(()=>document.querySelector('#noVNC_clipboard_text').value='');
  await chord({code:97,name:'KeyA'});await chord({code:99,name:'KeyC'});
  await until(async()=> (await frame.locator('#noVNC_clipboard_text').inputValue())==='Texto originado en Firefox: ñ €','remote clipboard returned');
  pass('Manual clipboard: remote selection available in client text box');
  await page.screenshot({path:'/results/remote-browser.png'});
  await navigate('about:policies');await delay(1200);
  await frame.evaluate(()=>document.querySelector('#noVNC_clipboard_text').value='');
  await chord({code:97,name:'KeyA'});await chord({code:99,name:'KeyC'});
  await until(async()=> (await frame.locator('#noVNC_clipboard_text').inputValue()).includes('DNSOverHTTPS'),'Firefox active policies');
  const activePolicies=await frame.locator('#noVNC_clipboard_text').inputValue();
  fs.writeFileSync('/results/firefox-policies.txt',activePolicies);
  assert.ok(activePolicies.includes('ExtensionSettings') && activePolicies.includes('Permissions'));
  await page.screenshot({path:'/results/firefox-policies.png'});
  pass('Firefox reports active managed browser policies');
  await navigate('http://172.30.32.2:9000/session-check');
  await until(()=>fixture.visits.some(x=>x.url==='/session-check'&&x.cookie.includes('fixture_session=local-test')),'cookie preserved');
  pass('Remote navigation preserves device cookies');
  await page.screenshot({path:'/results/remote-session.png'});
  const transfer=new WebSocket(origin.replace('http','ws')+prefixes[0]+'ws-filemanager',{headers:auth});await once(transfer,'open');
  async function transferCommand(msg){const response=once(transfer,'message');transfer.send(encode(msg));return decode((await response)[0]);}
  const configText='Configuración de prueba desde el PC — ñ', configFile=`/data/exchange/config-${Date.now()}.txt`;
  const configBytes=Buffer.from(configText);
  assert.equal((await transferCommand({type:'upload',path:configFile,size:configBytes.length})).type,'success');
  assert.equal((await transferCommand({type:'uploadBlock',path:configFile,content:configBytes})).type,'success');
  await navigate('http://172.30.32.2:9000/file-upload');
  await until(()=>fixture.visits.some(x=>x.url==='/file-upload'),'file selection page');await delay(800);
  await frame.evaluate(()=>window.testUI.rfb.sendKey(0xff0d,'Enter'));await delay(800);
  await chord({code:108,name:'KeyL'});await remotePaste(configFile);
  await frame.evaluate(()=>window.testUI.rfb.sendKey(0xff0d,'Enter'));
  await until(()=>fixture.uploads.includes(configText),'remote website reads uploaded container file');
  pass('Complete PC → container → remote website file upload through Firefox file chooser');
  await navigate('http://172.30.32.2:9000/backup');
  let backup;
  await until(async()=>{backup=await transferCommand({type:'download',path:'/data/exchange/backup-device.txt'});return backup.type==='success';},'remote backup saved in exchange');
  const backupText=await (await fetch(origin+prefixes[0]+'download/'+backup.uuid,{headers:auth})).text();
  assert.equal(backupText,'Backup generado por el equipo de prueba — CFM');
  pass('Complete remote website → container → client backup download');transfer.close();
  // Firefox may still be opening its downloads panel after saving the response.
  await delay(1500);await frame.evaluate(()=>window.testUI.rfb.sendKey(0xff1b,'Escape'));
  await navigate('http://172.30.32.2:9000/automatic-clipboard');
  await until(()=>fixture.visits.some(x=>x.url==='/automatic-clipboard'),'automatic clipboard fixture navigation');await delay(800);
  // Use the actual file manager UI, not just its wire protocol.
  await frame.evaluate(()=>window.testUI.openControlbar());
  await frame.locator('#noVNC_file_manager_button').click();
  await frame.getByText('data',{exact:true}).click();
  await frame.getByText('exchange',{exact:true}).click();
  await frame.waitForFunction(()=>document.querySelector('.fmgr-current-path')?.textContent==='/data/exchange');
  const uiFile=`desde-pc-${Date.now()}.txt`;
  await frame.locator('.fmgr-file-input').setInputFiles({name:uiFile,mimeType:'text/plain',buffer:Buffer.from('Subida desde el navegador cliente — CFM')});
  await frame.getByText(uiFile,{exact:true}).waitFor();
  pass('File manager UI uploads a PC file into exchange');
  const downloadEvent=page.waitForEvent('download');
  await frame.locator(`[data-fmgr-file-name="${uiFile}"] [data-fmgr-file-action="download"]`).click();
  const download=await downloadEvent;await download.saveAs('/results/descargado-al-pc.txt');
  assert.equal(fs.readFileSync('/results/descargado-al-pc.txt','utf8'),'Subida desde el navegador cliente — CFM');
  pass('File manager UI downloads container file to client');
  await page.screenshot({path:'/results/file-manager.png'});
  await page.close();
  // Browser permission grants are automated in this isolated Chromium only.
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin});
  const clipboardPage=await context.newPage();await clipboardPage.goto(origin+'/panel?sync=1');
  const cf=await (await clipboardPage.waitForSelector('iframe')).contentFrame();
  await cf.waitForSelector('#noVNC_container canvas');
  await cf.evaluate(async()=>{const script=[...document.scripts].map(s=>s.textContent).find(t=>t.includes('import UI from'));window.testUI=(await import(script.match(/import UI from "([^"]+)"/)[1])).default;});
  await cf.waitForFunction(()=>window.testUI.rfb?._rfbConnectionState==='connected');
  await cf.evaluate(()=>window.testUI.openControlbar());
  const clipboardApi=await cf.evaluate(async()=>{await navigator.clipboard.writeText('CFM automatic API');return await navigator.clipboard.readText();});
  assert.equal(clipboardApi,'CFM automatic API');pass('Clipboard API read/write permitted in same-origin iframe with explicit browser grant');
  await cf.locator('#noVNC_container canvas').click({position:{x:700,y:220}});
  await cf.waitForFunction(()=>window.testUI.rfb.clipboardAutoSync==='granted');await delay(500);
  assert.equal(await cf.evaluate(()=>window.testUI.rfb._clipboardText),'CFM automatic API');
  async function autoChord(code,name){await cf.evaluate(({code,name})=>{const r=window.testUI.rfb;r.sendKey(0xffe3,'ControlLeft',true);r.sendKey(code,name,true);r.sendKey(code,name,false);r.sendKey(0xffe3,'ControlLeft',false);},{code,name});await delay(300);}
  await autoChord(118,'KeyV');
  await until(()=>fixture.pasted.includes('CFM automatic API'),'automatic clipboard into remote Firefox');
  await cf.evaluate(()=>window.testUI.rfb.sendKey(120,'KeyX'));await delay(300);
  await autoChord(97,'KeyA');await autoChord(99,'KeyC');
  await until(async()=>await cf.evaluate(()=>navigator.clipboard.readText())==='CFM automatic APIx','automatic clipboard from Firefox');
  pass('Automatic clipboard sync works in both directions after browser grant and focus');
  await clipboardPage.goto(origin+'/panel?deny=1');
  const deniedFrame=await (await clipboardPage.waitForSelector('iframe')).contentFrame();
  await deniedFrame.waitForSelector('#noVNC_clipboard_text',{state:'attached'});
  const denial=await deniedFrame.evaluate(async()=>{try{await navigator.clipboard.writeText('must-fail');return 'unexpected';}catch(e){return e.name;}});
  assert.equal(denial,'NotAllowedError');pass('Parent Permissions-Policy can deny clipboard despite grant; manual field still present');
  assert.ok(clientAssets.length>10);
  assert.deepEqual(clientAssets.filter(url=>!prefixes.some(p=>url.startsWith(origin+p)) && !url.startsWith('data:')),[]);
  pass('Client assets requested under Ingress prefix');
  fs.writeFileSync('/results/browser-errors.json',JSON.stringify(errors,null,2));
  await context.close();
} finally {
  for (const c of browser.contexts()) for (const p of c.pages()) {
    try { await p.screenshot({path:'/results/last-screen.png'}); fs.writeFileSync('/results/last-page.html',await p.content()); } catch {}
  }
  await browser.close();
  fs.writeFileSync('/results/checks.json',JSON.stringify({environment:'Docker simulation, not Home Assistant',checks},null,2));
  proxy.closeAllConnections();proxy.close();fixtureServer.closeAllConnections();fixtureServer.close();
}
