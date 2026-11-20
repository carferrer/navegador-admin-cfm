# 0.1.1

- Firefox ESR 153.7.0, paquetes Alpine actualizados y nginx 1.30.7.
- Servicios web recompilados con Go 1.27.4 y dependencia criptográfica actualizada.
- Servidor gráfico y aplicaciones principales sustituidos por paquetes de Alpine.
- Filtro de operaciones del núcleo y prohibición de adquirir nuevos privilegios
  heredados por todos los servicios, incluso cuando Supervisor desactiva seccomp.
- Extensiones, WebRTC, peticiones especulativas y permisos de cámara, micrófono,
  ubicación y notificaciones restringidos.
- Perfil ESR separado: se conserva el anterior hasta restablecimiento explícito.
- Esta entrega se limita a amd64; ARM queda pendiente de validación específica.

# 0.1.0

- Primera versión local experimental con Firefox/noVNC.
- Acceso por Ingress, lista de administradores y sin puertos publicados.
- Marcadores, perfil temporal o persistente y restablecimiento explícito.
- Gestor de intercambio, limpieza configurable y portapapeles de texto.
- Pruebas Docker con proxy Ingress simulado y navegador cliente automatizado.
