import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function validate(input) {
  const o = {admin_user_ids: [], bookmarks: [], persist_profile: false,
    reset_profile: false, exchange_cleanup: 'on_start', clipboard_sync: true,
    display_width: 1280, display_height: 800, ...input};
  if (!Array.isArray(o.admin_user_ids) || o.admin_user_ids.some(x =>
    typeof x !== 'string' || !/^[a-f0-9]{32}$/.test(x))) throw Error('admin_user_ids no válidos');
  if (!Array.isArray(o.bookmarks) || o.bookmarks.length > 100) throw Error('Máximo 100 marcadores');
  o.bookmarks = o.bookmarks.map(b => {
    if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 120 ||
        typeof b.url !== 'string' || b.url.length > 2048 || /[\x00-\x20]/.test(b.url))
      throw Error('Marcador no válido');
    const u = new URL(b.url);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
      throw Error('Los marcadores requieren HTTP/HTTPS sin credenciales en la URL');
    return {name: b.name, url: u.href};
  });
  for (const k of ['persist_profile', 'reset_profile', 'clipboard_sync'])
    if (typeof o[k] !== 'boolean') throw Error(`${k} debe ser booleano`);
  for (const [k, min, max] of [['display_width',800,2560],['display_height',600,1600]])
    if (!Number.isInteger(o[k]) || o[k] < min || o[k] > max) throw Error(`${k} fuera de rango`);
  if (!['on_start','manual'].includes(o.exchange_cleanup)) throw Error('Limpieza no válida');
  return o;
}

const escape = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function render(o) {
  return {
    accessMap: `map $http_x_remote_user_id $cfm_user_allowed {\n default 0;\n${o.admin_user_ids.map(id => ` "${id}" 1;`).join('\n')}\n}\n`,
    accessServer: `# The upstream nginx omits http_access_module. A server-level return checks the actual peer before any location.\n# Never trust X-Forwarded-For here.\nif ($remote_addr != 172.30.32.2) { return 403; }\nif ($cfm_user_allowed = 0) { return 403; }\nif ($http_x_ingress_path !~ "^/api/hassio_ingress/[A-Za-z0-9_-]+/?$") { return 403; }\n`,
    policies: {policies: {
      ManagedBookmarks: [{toplevel_name: 'Administración'}, ...o.bookmarks],
      Homepage: {URL:'file:///opt/cfm/home.html', Locked:true, StartPage:'homepage'},
      DisplayBookmarksToolbar: 'always',
      DownloadDirectory: '/data/exchange',
      PromptForDownloadLocation: false,
      PasswordManagerEnabled: false,
      DisableFirefoxAccounts: true,
      DisableTelemetry: true,
      DisableFirefoxStudies: true,
      OfferToSaveLogins: false,
      ExtensionSettings: {'*': {installation_mode:'blocked'}},
      DNSOverHTTPS: {Enabled:false, Locked:true},
      CaptivePortal: false,
      Permissions: {
        Camera: {BlockNewRequests:true, Locked:true},
        Microphone: {BlockNewRequests:true, Locked:true},
        Location: {BlockNewRequests:true, Locked:true},
        Notifications: {BlockNewRequests:true, Locked:true}
      },
      Preferences: {
        'browser.shell.checkDefaultBrowser': {Value:false,Status:'locked'},
        'browser.aboutwelcome.enabled': {Value:false,Status:'locked'},
        'browser.sessionstore.resume_from_crash': {Value:false,Status:'locked'},
        'network.prefetch-next': {Value:false,Status:'locked'},
        'network.dns.disablePrefetch': {Value:true,Status:'locked'},
        'network.predictor.enabled': {Value:false,Status:'locked'},
        'network.http.speculative-parallel-limit': {Value:0,Status:'locked'},
        'media.peerconnection.enabled': {Value:false,Status:'locked'}
      }
    }},
    home: `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Administración de red</title><style>body{font:18px system-ui;max-width:850px;margin:60px auto;padding:24px;background:#10212d;color:#e9f2f6}a{display:block;padding:16px;margin:12px 0;border:1px solid #426574;border-radius:8px;color:#87ddec;text-decoration:none}small{color:#b2c5ce}code{color:#87ddec}</style><h1>Administración de red</h1><p>Este Firefox se ejecuta dentro de Home Assistant.</p>${o.bookmarks.map(b => `<a href="${escape(b.url)}">${escape(b.name)}<br><small>${escape(b.url)}</small></a>`).join('') || '<p>Añade marcadores en la configuración del complemento y reinícialo.</p>'}<h2>Archivos y sesiones</h2><p>Carpeta de intercambio: <code>/data/exchange</code> (también <code>/intercambio</code>). El icono de carpeta del panel lateral permite transferir archivos entre tu PC y esta carpeta. El selector de una web remota ve los archivos del contenedor.</p><p>Todos los usuarios autorizados comparten esta pantalla, las cookies y las sesiones abiertas. Cerrar el panel no cierra la sesión del equipo.</p><p>Perfil: ${o.persist_profile ? 'persistente' : 'se limpia al arrancar'}. Intercambio: ${o.exchange_cleanup === 'on_start' ? 'se borra al arrancar' : 'limpieza manual'}.</p><p>No guardes contraseñas aquí. Comprueba los certificados de los equipos antes de aceptar excepciones.</p></html>`,
    env: `export DISPLAY_WIDTH=${o.display_width}\nexport DISPLAY_HEIGHT=${o.display_height}\nexport WEB_HOST_CLIPBOARD_SYNC=${o.clipboard_sync ? 1 : 0}\n`
  };
}

function ensureDirectory(p, mode, uid=0, gid=0) {
  if (fs.existsSync(p) && (!fs.lstatSync(p).isDirectory() || fs.lstatSync(p).isSymbolicLink()))
    throw Error(`Se esperaba un directorio real: ${p}`);
  fs.mkdirSync(p,{recursive:true,mode}); fs.chmodSync(p,mode); fs.chownSync(p,uid,gid);
}
function clearManagedDirectory(p) {
  // Only fixed add-on-owned directories; never follow a substituted root symlink.
  if (!['/config','/data/profile','/data/profile-esr','/data/exchange'].includes(p)) throw Error('Destino de limpieza no permitido');
  if (!fs.existsSync(p)) return;
  if (!fs.lstatSync(p).isDirectory() || fs.lstatSync(p).isSymbolicLink()) throw Error('Destino inseguro');
  for (const item of fs.readdirSync(p)) fs.rmSync(path.join(p,item),{recursive:true,force:true});
}
export function configure() {
  const o = validate(JSON.parse(fs.readFileSync('/data/options.json','utf8')));
  const r = render(o);
  // The file manager must enumerate /data to reach exchange; files remain protected.
  ensureDirectory('/data',0o755);
  fs.chmodSync('/data/options.json',0o600); fs.chownSync('/data/options.json',0,0);
  ensureDirectory('/config',0o700,1000,1000);
  clearManagedDirectory('/config');
  // A regular Firefox 160 profile cannot safely be opened by ESR 153. Keep the
  // earlier persistent profile untouched unless the user explicitly requests reset.
  ensureDirectory('/data/profile-esr',0o700,1000,1000);
  if (o.reset_profile) {
    clearManagedDirectory('/data/profile');
    clearManagedDirectory('/data/profile-esr');
  }
  if (o.persist_profile) fs.symlinkSync('/data/profile-esr','/config/profile');
  ensureDirectory('/data/exchange',0o700,1000,1000);
  if (o.exchange_cleanup === 'on_start') clearManagedDirectory('/data/exchange');
  if (!fs.existsSync('/intercambio')) fs.symlinkSync('/data/exchange','/intercambio');
  for (const [p,content] of [
    ['/opt/cfm/access-map.conf',r.accessMap], ['/opt/cfm/access-server.conf',r.accessServer],
    ['/etc/firefox/policies/policies.json',JSON.stringify(r.policies,null,2)],
    ['/opt/cfm/home.html',r.home], ['/run/cfm-env',r.env]]) {
    fs.writeFileSync(p,content,{mode:0o644}); fs.chmodSync(p,0o644);
  }
  if (!o.admin_user_ids.length) console.warn('Acceso cerrado: configura admin_user_ids con los ID de administradores de HA.');
  console.log(`CFM: perfil ${o.persist_profile ? 'persistente' : 'temporal'}, limpieza de intercambio ${o.exchange_cleanup}.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { configure(); } catch (e) { console.error(`Configuración rechazada: ${e.message}`); process.exit(1); }
}
