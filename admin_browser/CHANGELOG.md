# Versión 2026.11.03 (2026-11-21)

- Añade ampliación local para pantallas táctiles con gestos de dos dedos y botones +, − y Ajustar a pantalla.
- Permite mover el encuadre ampliado y pulsar conservando las coordenadas, sin cambiar el zoom de Firefox ni la resolución remota.
- Añade pruebas móviles de Chromium y WebKit para ampliación, desplazamiento, pulsaciones y giro de pantalla.
- Conserva la configuración y los marcadores. Pendiente de confirmar el comportamiento en Safari y la aplicación HA de un iPhone real.

# Versión 2026.11.02 (2026-11-20)

- Actualiza la dependencia D-Bus de los servicios web (`github.com/godbus/dbus/v5`) de 5.2.2 a 5.2.4 mediante [Renovate #1](https://github.com/carferrer/navegador-admin-cfm/pull/1).
- Actualiza Playwright de 1.58.2 a 1.65.1 y su imagen de pruebas Docker a la misma versión, fijada por SHA-256, mediante [Renovate #2](https://github.com/carferrer/navegador-admin-cfm/pull/2).
- Conserva Firefox ESR 153.7.0, las opciones del complemento y los marcadores configurados; no requiere cambios de configuración.

# Versión 2026.11.01 (2026-11-20)

- Inicia la numeración `AAAA.MM.NN` con la versión `2026.11.01`.
- Mantiene el canal estable, el nombre «Navegador» en la barra lateral y el icono propio.
- Añade CI para configuración, versiones y pruebas Docker de Ingress, WebSocket, portapapeles, transferencia de archivos, perfiles y aislamiento.
- Analiza fuentes e imagen con Trivy y bloquea la publicación ante secretos o vulnerabilidades HIGH/CRITICAL.
- Añade «Preparar release» para generar versión y changelog, y «Publicar release» para publicar el commit comprobado con sus notas, ZIP y SHA-256.
- Configura Renovate para proponer actualizaciones mediante pull requests, sin fusión automática; la versión informativa de Firefox se obtiene del paquete instalado.
- Conserva Firefox ESR y las opciones del complemento. La imagen continúa construyéndose en Home Assistant; arquitectura admitida: amd64.

# 0.1.2

- Nombre de la barra lateral abreviado a «Navegador».
- Icono y logo propios para Home Assistant y la portada del repositorio.
- Canal estable y documentación actualizada.

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

- Primera versión local con Firefox/noVNC.
- Acceso por Ingress, lista de administradores y sin puertos publicados.
- Marcadores, perfil temporal o persistente y restablecimiento explícito.
- Gestor de intercambio, limpieza configurable y portapapeles de texto.
- Pruebas Docker con proxy Ingress simulado y navegador cliente automatizado.
