# Seguridad y mantenimiento

## Protecciones previstas

- Acceso por Ingress con restricción a administradores y lista explícita de ID.
- Sin puertos publicados, red del host, acceso a las API de HA/Docker, dispositivos
  ni capacidades adicionales.
- Firefox y servicios web/gráficos como UID 1000, sin capacidades efectivas.
- Filtro seccomp propio y `no_new_privs` heredados desde el arranque. El filtro
  es una lista de operaciones bloqueadas, no un perfil general de permisos mínimos.
- AppArmor habilitado en el manifiesto; verificar su aplicación en el host real.
- Gestor de archivos limitado a `/data/exchange` y perfiles privados.
- Contraseñas, sincronización Firefox, extensiones y varios permisos del navegador
  restringidos mediante políticas.

El proceso de arranque conserva root dentro del contenedor. El contenedor
comparte el núcleo con HA y tiene salida a la red accesible desde HA. Todos los
usuarios autorizados comparten pantalla, portapapeles, cookies y sesiones.
Cerrar el panel de HA no cierra las sesiones de los equipos administrados.

## Validación de 0.1.1

La revisión del 20 de noviembre de 2026 incluyó análisis de la imagen con Trivy
0.76.2 y su base de datos de esa fecha. Se reconocieron 292 paquetes Alpine y dos
binarios Go: no se detectaron vulnerabilidades conocidas ni secretos en el
alcance reconocido. Se superaron 20 comprobaciones de navegador y 3 de
configuración, además de las comprobaciones de perfiles y aislamiento.

El análisis automático no cubre exhaustivamente auxiliares nativos estáticos,
JavaScript incorporado, código malicioso ni vulnerabilidades desconocidas. Los
componentes de terceros siguen necesitando mantenimiento. Un resultado sin
hallazgos no certifica la seguridad de la imagen ni de futuras reconstrucciones.

## Actualizaciones

Firefox ESR, nginx, Go y la base están fijados a versiones o hashes. No se
actualizan por reiniciar HA. Cada actualización requiere revisar las fuentes,
actualizar versiones, reconstruir sin reutilizar capas obsoletas, analizar la
imagen y repetir las pruebas antes de distribuirla. Consultar también los
[avisos de Mozilla](https://www.mozilla.org/en-US/security/known-vulnerabilities/firefox-esr/)
y [nginx](https://nginx.org/en/security_advisories.html).

No hay vigilancia ni publicación automática configurada en esta preparación.

## Información que no debe publicarse

No adjuntar tokens de Ingress o Supervisor, contraseñas, cookies, perfiles de
Firefox, opciones personales, copias de HA, certificados privados ni diagnósticos
completos de instalaciones. Revisar también nombres de usuario, dominios,
direcciones internas, capturas y registros antes de compartirlos.

El `.gitignore` es una ayuda; no elimina archivos ya añadidos al historial. Usar
un historial inicial limpio y revisar los archivos seleccionados antes de subirlos.
