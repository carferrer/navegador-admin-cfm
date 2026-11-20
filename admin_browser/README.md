# Navegador de administración

Firefox remoto para abrir pfSense y otros equipos desde Home Assistant mediante
Ingress. Incluye marcadores configurables, portapapeles manual y sincronización
condicionada a permisos, y transferencia de archivos mediante una carpeta privada.

Versión 2026.11.01, para amd64. Configura `admin_user_ids` antes de abrir el panel.
Todos los usuarios autorizados comparten el mismo navegador y las mismas sesiones.
El perfil se limpia al arrancar por defecto. Consulta DOCS.md antes de activarlo.

Esta actualización utiliza Firefox ESR y abre un perfil nuevo. Conserva el perfil
antiguo sin utilizarlo hasta que se solicite un restablecimiento explícito.
