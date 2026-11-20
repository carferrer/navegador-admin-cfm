# Versiones y releases

La versión del complemento está en `admin_browser/config.yaml` y usa
`AAAA.MM.NN`: año, mes y número de entrega dentro del mes. Por ejemplo,
`2026.11.01`, `2026.11.02` y `2026.12.01`. No es el día del mes. Se conserva
como texto entre comillas; el paquete npm privado es solo el entorno de pruebas.

## Preparar una versión

En GitHub, abrir **Actions → Preparar release → Run workflow** e indicar la
nueva versión. El flujo genera notas con GitHub, actualiza `config.yaml`, los
dos README y `admin_browser/CHANGELOG.md`, y crea una propuesta en una rama
`release/AAAA.MM.NN`. El encabezado sigue el formato
`# Versión 2026.11.01 (2026-11-20)`, con fecha de Europe/Madrid.

Revisar las notas generadas, especialmente los cambios incompatibles y los
requisitos de actualización, antes de fusionar. El repositorio debe permitir
que GitHub Actions cree pull requests. Este flujo usa el token temporal de
GitHub; no requiere guardar tokens personales ni datos de Home Assistant.

También puede prepararse localmente:

```sh
npm ci --ignore-scripts
node scripts/release.mjs prepare 2026.11.02 /ruta/notas.md
npm test
node scripts/release.mjs validate
```

## Comprobaciones CI

Se ejecutan en las propuestas de cambios y antes de publicar desde `main`:

- Validación de versión, changelog, iconos, configuración y permisos del add-on.
- Pruebas de validación de opciones y del proceso de versiones.
- Construcción amd64 desde fuentes con `--pull --no-cache`.
- Pruebas Docker de Ingress, WebSocket, portapapeles, archivos, perfiles y
  aislamiento, incluida la ejecución sin el filtro seccomp de Docker.
- Análisis de fuentes y dependencias con Trivy y análisis completo de la imagen.
  Se bloquean las vulnerabilidades HIGH/CRITICAL y los secretos detectados.
- Informe de resultados e inventario de componentes (SBOM) en los artefactos
  del flujo. Los datos y direcciones de las pruebas son sintéticos.

Las pruebas Docker simulan HA: no sustituyen la comprobación en una instalación
real. Un análisis sin hallazgos no demuestra ausencia de vulnerabilidades.

## Publicar

Cada cambio en `main` ejecuta **Publicar release**, que fija el commit y pasa
las comprobaciones CI sobre ese mismo commit. Si pasan y la versión todavía
no está publicada, genera un ZIP de fuentes y su SHA-256, crea un borrador y
lo publica con las notas extraídas del changelog. También puede ejecutarse
manualmente desde Actions sobre `main`.

Una release publicada no se sobrescribe. Para distribuir otro cambio se
prepara una versión nueva. Un borrador incompleto puede reintentarse únicamente
si su etiqueta apunta al mismo commit que se ha comprobado.

La release incluye fuentes revisadas; no contiene perfiles, contraseñas,
marcadores personales, copias de HA ni registros de instalaciones. La imagen
se sigue construyendo en Home Assistant al instalar o actualizar. La base de
paquetes puede cambiar entre la construcción de CI y la de HA; el SBOM describe
la imagen de CI, no garantiza una imagen idéntica en cada reconstrucción.

En HA, usar **Comprobar actualizaciones** y actualizar el complemento desde el
repositorio. No es necesario desinstalarlo para actualizar.

## Renovate

`renovate.json` configura propuestas de actualización para imágenes Docker y
sus hashes, Firefox ESR de Alpine 3.24, módulos Go, dependencias npm, Playwright,
Trivy y acciones de GitHub. No se fusionan automáticamente. La aplicación
Renovate de GitHub debe tener acceso a este repositorio; la conexión de GitHub
usada por Codex y la instalación de Renovate son independientes.

Tras revisar y fusionar una actualización, ejecutar **Preparar release** con
una versión nueva. Cambiar una dependencia no modifica automáticamente la
versión del complemento ni reemplaza una release ya publicada.

Los archivos fuente de nginx y de su módulo websockify, sus sumas de comprobación
y las adaptaciones copiadas de terceros requieren revisión manual. Renovate no
actualiza esos archivos comprimidos. Si cambia la versión base de Alpine, revisar
también el repositorio APK configurado para Firefox antes de fusionar.
