[← Volver al README](README.md)

# Seguridad

## Reportar una vulnerabilidad

No abras un issue público. Usá el [reporte privado de GitHub](https://github.com/LcsGrz/arcli/security/advisories/new) (pestaña **Security** → **Report a vulnerability**) y esperá confirmación antes de publicar detalles.

## Qué no subir nunca

Ni a issues, ni a PRs, ni a capturas:

- certificados `.crt` y claves `.key`
- tickets WSAA
- archivos de configuración con rutas o datos de producción
- respuestas crudas de ARCA (`--bruto`) sin revisar

## Qué es sensible en ARCLI

- Certificados y claves privadas: ARCLI guarda solo las rutas en su configuración, no el contenido.
- Tickets WSAA: se guardan en disco junto a la configuración (ver [`ticketPath`](docs/configuration.md#ticket-wsaa-ticketpath)).
- Los archivos que crea ARCLI (tickets de ARCA, config, PDFs) quedan solo para tu usuario (`0600`/`0700`). Un ticket permite operar en ARCA como tu CUIT durante unas horas.
- La emisión real: con la config por defecto, `testing` es el entorno y nada se emite sin `--emitir` o sin confirmar la pregunta en la terminal. Si guardás `entorno produccion` y `emitir true`, ARCLI emite en producción sin flags ni confirmación (ver [Configuración](docs/configuration.md#advertencias)).

Buenas prácticas: usá `testing` siempre que puedas y revisá el comando antes de emitir en producción.
