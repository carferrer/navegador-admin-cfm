# Configuración y uso

## Acceso

El complemento no define `ports`, no usa red del host y no habilita acceso a las
API de HA, Supervisor o Docker. Solo el Supervisor (`172.30.32.2`) puede alcanzar
su servidor HTTP. La comprobación usa la dirección real de conexión, no una
cabecera `X-Forwarded-For` suministrada por el cliente. VNC TCP está desactivado;
la pantalla se transmite por WebSocket mediante un socket Unix interno.

`panel_admin: true` solicita la restricción nativa de administradores. Además,
`admin_user_ids` exige un ID que el Supervisor inyecta en `X-Remote-User-Id`.
Ausencia de ID, ID no listado o prefijo Ingress inválido → 403. La lista vacía
no permite el acceso. No es una lista de nombres de usuario ni de direcciones IP.

En el código del Supervisor **2026.11.0** se ha comprobado que `panel_admin`
rechaza usuarios no administradores en el servidor, antes de HTTP/WebSocket,
y que elimina las cabeceras de identidad aportadas por el cliente. La prueba
con una cuenta no administradora en la instalación real continúa siendo obligatoria.
La lista del complemento no consulta roles por sí misma ni sustituye la
comprobación del Supervisor; conserva solo ID de administradores vigentes.

La imagen ejecuta Firefox y los servicios gráficos como UID/GID 1000. El proceso
de arranque necesita root **dentro del contenedor** para preparar sus directorios;
no se solicita modo privilegiado, capacidades adicionales, dispositivos, GPU,
terminal web, Docker del host ni carpetas de HA. El diagnóstico de HA confirmó
AppArmor `docker-default` activo, pero Supervisor desactiva el filtro seccomp del
contenedor. La versión 0.1.1 instala su propio filtro antes de arrancar servicios:
bloquea operaciones sensibles del núcleo y sockets de paquetes/raw, y activa
`no_new_privs`. Si no puede instalarlo, se niega a arrancar. Es una lista de
operaciones bloqueadas, no un sustituto completo del perfil de Docker. Firefox
añade su propio filtro a los procesos de contenido. No se utilizan `--no-sandbox`
ni opciones para ignorar certificados. No se afirma que todos los mecanismos
internos de aislamiento de Firefox estén disponibles en este entorno.

El navegador conserva salida a la red: puede alcanzar los equipos accesibles
desde HA. No existe una lista de destinos permitidos ni aislamiento entre los
sitios abiertos. Usarlo para administración, cerrar sesiones al terminar y
mantener HA y este complemento actualizados sigue siendo necesario.

## Opciones

| Opción | Valor inicial | Significado |
|---|---|---|
| `admin_user_ids` | `[]` | ID de los administradores autorizados; obligatorio para entrar |
| `bookmarks` | `[]` | Lista de `name` y `url`, HTTP/HTTPS, sin usuario o contraseña en URL |
| `persist_profile` | `false` | Conservar cookies, certificados aceptados e historial entre reinicios |
| `reset_profile` | `false` | Borrar el perfil persistente en cada arranque mientras esté activado |
| `exchange_cleanup` | `on_start` | `on_start`: borrar intercambio al arrancar; `manual`: conservar |
| `clipboard_sync` | `true` | Permitir sincronización de texto si el navegador cliente la admite |
| `display_width` | `1280` | Anchura inicial, 800–2560 |
| `display_height` | `800` | Altura inicial, 600–1600 |

Los cambios requieren reiniciar el complemento. El navegador muestra una página
inicial con los marcadores y la carpeta «Administración» en su barra de marcadores.
No hay bloqueo de navegación a esos marcadores: un administrador puede introducir
cualquier URL alcanzable desde el contenedor. No es un navegador para usuarios
no confiables ni un entorno de navegación pública aislado por usuario.

## Ampliación en móviles

En dispositivos táctiles aparece una barra con **+**, **−** y **Ajustar a pantalla**.
La ampliación va de una a cuatro veces el encuadre inicial y solo afecta a ese
cliente: no cambia el zoom de Firefox ni la resolución del escritorio remoto.

- Separa o junta dos dedos sobre la pantalla remota para ampliar o reducir.
- Con la vista ampliada, arrastra un dedo para mover el encuadre; toca sin
  arrastrar para pulsar. Una pulsación de más de 600 ms realiza un clic derecho.
- En el encuadre ajustado, arrastrar un dedo desplaza el contenido de la web.
- **Ajustar a pantalla** restaura el encuadre completo. Al reconectar o abrir
  otro cliente se comienza de nuevo en ese encuadre.

Los gestos se aplican a la pantalla remota; los menús y el teclado conservan sus
controles habituales. El arrastre táctil se dedica a mover la vista o desplazar
la página, no a arrastrar objetos remotos. El ratón de escritorio no cambia.
Las pruebas automáticas incluyen Chromium y WebKit con pantalla táctil simulada;
la confirmación en Safari y en la aplicación HA de un iPhone real queda pendiente.

## Portapapeles

La sincronización solo maneja **texto**. Abre HA mediante HTTPS, permite acceso al
portapapeles cuando el navegador lo solicite y activa la sincronización en los
ajustes del panel lateral si está desactivada. El cliente comprueba capacidad,
permisos y foco. Cambiar el portapapeles mientras el canvas ya tiene foco puede
requerir salir de él y volver a enfocarlo; no equivale a una sincronización continua.

Si falla, abre el panel lateral de noVNC y usa **Clipboard**:

1. PC → Firefox: pega el texto en ese campo y cambia el foco para enviarlo; vuelve
   a la pantalla remota y pega con Ctrl+V.
2. Firefox → PC: selecciona y copia en Firefox; el texto aparece en el campo
   Clipboard. Selecciónalo y cópialo desde el navegador del PC.

Un `Permissions-Policy` restrictivo de la página padre, HA servido por HTTP sin
contexto seguro, permisos denegados, Safari, Firefox cliente, Android/iOS o la app
Companion pueden cambiar o impedir el comportamiento automático. El complemento
no puede concederse permisos que el padre o el navegador niegan. No se modifica
el frontend de HA ni se promete paridad entre navegadores y móviles.

## Archivos: dos transferencias distintas

La carpeta de intercambio es **`/data/exchange`**, accesible también desde el
selector remoto como `/intercambio`. En el gestor del panel lateral, entra en
`data` → `exchange` (el alias puede mostrarse como enlace/archivo).

Para importar una configuración:

1. Pulsa el icono de carpeta del panel lateral y **Upload Files**. Elige el archivo
   en tu PC y súbelo a `/data/exchange`.
2. En pfSense u otra web abierta en Firefox remoto, pulsa su botón para seleccionar
   archivo. **Ese selector ve el contenedor, no tu PC.** Elige el archivo de
   `/data/exchange`. La confirmación de importación del equipo es un paso aparte.

Para recuperar un backup:

1. Descárgalo desde la web remota. Firefox lo guarda por defecto en `/data/exchange`.
2. En el gestor del panel lateral, pulsa **Download** junto al archivo para llevarlo
   al PC. Comprueba que puedes abrir el archivo descargado antes de borrar el original.

El gestor permite listar los padres necesarios para llegar a la carpeta, pero
restringe lectura/escritura a intercambio. No permite descargar el perfil,
`options.json` ni rutas externas mediante `..`. Esto restringe el **gestor web**;
Firefox sigue pudiendo leer archivos a los que tenga acceso su usuario dentro del
contenedor. No hay acceso al filesystem del PC ni a `/config` de Home Assistant.

## Persistencia y limpieza

- Perfil temporal (predeterminado): `/config` es privado del contenedor y se limpia
  al arrancar; se pierden cookies, historial y excepciones de certificados del
  perfil temporal. «Temporal» no significa memoria RAM ni borrado forense seguro.
- Perfil persistente: `/config/profile` apunta a `/data/profile-esr`, conservado por
  HA entre reconstrucciones. Puede entrar en las copias de seguridad de HA.
- La actualización 0.1.1 utiliza Firefox ESR y abre un perfil nuevo. El perfil de
  Firefox 160 en `/data/profile` se conserva sin abrirlo; no se fuerza una
  conversión a una versión menor. Será necesario volver a iniciar sesión.
  `reset_profile: true` elimina tanto el perfil anterior como el nuevo.
- Desactivar `persist_profile` deja de usar el perfil persistente pero **no borra
  una copia persistente anterior**. Para borrarla, activa `reset_profile`, arranca,
  y luego vuelve a dejar `reset_profile: false`. Mientras siga en `true`, cada
  arranque vuelve a borrarla. Las copias antiguas de HA no se borran con esta opción.
- Intercambio `on_start` (predeterminado): se borra todo su contenido antes de
  arrancar Firefox. Un reinicio, actualización o arranque de HA puede perder archivos
  aún no recuperados al PC. No se elimina un archivo mientras se transfiere durante
  la sesión. En `manual`, usa el botón Delete del gestor después de recuperarlo.
- Intercambio se excluye de las copias del add-on mediante `backup_exclude`; no debe
  usarse como archivo permanente. No hay papelera, cuota de disco ni caducidad horaria.
  El límite del gestor upstream es 4 GiB por archivo; HA, el proxy y el espacio libre
  pueden imponer límites menores. No se ha probado ese tamaño máximo.
- Los directorios de perfil/intercambio tienen modo 0700 para UID 1000; las opciones
  se dejan en 0600 para root. El directorio padre permite enumeración, pero el gestor
  filtra sus hijos. Los servicios heredan una máscara privada de creación de archivos.

Todos los accesos comparten pantalla, perfil, portapapeles y archivos. Una sesión
iniciada en pfSense queda disponible para otro administrador autorizado. Cerrar la
pestaña de HA **no** cierra esas sesiones. Usa «Cerrar sesión» en cada equipo y
detén el complemento cuando acabes. El gestor de contraseñas y Firefox Sync están
deshabilitados, pero las cookies y los tokens de sesión también son credenciales.
Protege las copias de HA y limita cuidadosamente los administradores y la lista de ID.

## Certificados y red

Firefox conecta directamente a cada equipo y muestra sus avisos de certificado.
Una CA privada que ya confía tu PC no se transfiere automáticamente al contenedor.
Importa la CA confiable en Firefox si procede o verifica el certificado del equipo
antes de aceptar una excepción puntual. Un perfil temporal pierde esa decisión al
reiniciar. No se realizan excepciones globales ni autologin por fabricante.

La resolución DNS, VLAN, rutas y firewall vistos desde HA pueden diferir de los del
PC. El hostname debe resolver y ser alcanzable **desde HA**. La imagen incorpora
software de terceros que puede realizar sus propias comprobaciones de red; no
implementa un cortafuegos de salida restringido a la LAN.

## Arquitecturas y recursos

Esta entrega declara y valida amd64. ARM queda pendiente de validación específica.
Se transmite por CPU, sin GPU o dispositivos del host. La resolución inicial es
1280×800. Medir CPU/RAM y espacio libre con las interfaces reales antes de ampliar
la resolución o activar el arranque automático.

## Problemas frecuentes

- **403:** confirmar ID de administrador, sesión de HA y versión del Supervisor.
  Abrir siempre mediante Ingress; una conexión directa debe fallar.
- **Pantalla negra:** comprobar la conexión WebSocket `websockify` en las herramientas
  del navegador y los registros. Revisar que el proxy externo de HA admite WebSocket.
- **Certificado:** se muestra en Firefox remoto, independientemente del certificado
  HTTPS con el que accedes a HA.
- **No aparece un archivo:** comprobar `/data/exchange`, actualizar el gestor y
  recordar si se ha reiniciado con limpieza `on_start`.
- **Portapapeles automático sin respuesta:** reenfocar la pantalla remota o usar el
  campo manual. No cambiar políticas globales del navegador para forzarlo.
