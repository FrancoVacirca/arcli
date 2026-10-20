[← Documentación](README.md)

# Configuración

Cómo funciona la configuración persistente de ARCLI y qué conviene dejar guardado.

## Propósito

La config persistente existe para guardar:

- credenciales por entorno
- defaults funcionales
- defaults de salida

Eso evita repetir siempre el mismo `cuit`, `puntoVenta`, concepto, IVA receptor o flags de salida.

## Ubicación del archivo

ARCLI usa `conf` con:

- `projectName: arcli`
- `configName: config`

La ubicación exacta depende del sistema operativo. Para verla:

```bash
arcli config ruta
```

Si el archivo no existe, `arcli config` lo crea automáticamente.

`arcli config` muestra los datos agrupados en secciones: cuenta, certificados, al facturar, FCE, datos del emisor (PDF), PDF, y salida y listados. Son las mismas secciones, en el mismo orden, que "Modificar configuración" del [modo interactivo](modo-interactivo.md).

## Claves soportadas

| Clave                      | Tipo                            | Valor por defecto      | Descripción                                                                                                                                                        |
| -------------------------- | ------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cert.testing`             | string                          | ninguno                | Ruta al certificado de testing                                                                                                                                     |
| `cert.produccion`          | string                          | ninguno                | Ruta al certificado de producción                                                                                                                                  |
| `key.testing`              | string                          | ninguno                | Ruta a la clave privada de testing                                                                                                                                 |
| `key.produccion`           | string                          | ninguno                | Ruta a la clave privada de producción                                                                                                                              |
| `cuit`                     | string                          | ninguno                | CUIT del emisor                                                                                                                                                    |
| `alicuota`                 | string                          | `21`                   | Alícuota de IVA por defecto: alias (`general`, `reducida`, `incrementada`, `cero`) o número (solo letras A y B)                                                    |
| `cbu`                      | string                          | ninguno                | CBU del emisor (solo facturas FCE)                                                                                                                                 |
| `aliasCbu`                 | string                          | ninguno                | Alias del CBU (solo facturas FCE)                                                                                                                                  |
| `verificarFce`             | boolean                         | `false`                | Consultar el régimen FCE del receptor al facturar                                                                                                                  |
| `consultarPadron`          | boolean                         | `true`                 | Completar el IVA receptor desde el padrón al facturar con `--cuit` y sin `--ir`. Ver [IVA receptor desde el padrón](cli-reference.md#iva-receptor-desde-el-padrón) |
| `concepto`                 | string                          | ninguno                | Concepto por defecto                                                                                                                                               |
| `cotizacion`               | number                          | `1`                    | Cotización por defecto en moneda extranjera                                                                                                                        |
| `entorno`                  | `testing \| produccion`         | `testing`              | Entorno por defecto                                                                                                                                                |
| `emitir`                   | boolean                         | `false`                | Emisión por defecto                                                                                                                                                |
| `ivaReceptor`              | string                          | ninguno                | IVA receptor por defecto                                                                                                                                           |
| `json`                     | boolean                         | `false`                | Salida JSON por defecto                                                                                                                                            |
| `moneda`                   | string                          | `ARS`                  | Moneda por defecto                                                                                                                                                 |
| `bruto`                    | boolean                         | `false`                | Respuesta bruta por defecto                                                                                                                                        |
| `puntoVenta`               | number                          | ninguno                | Punto de venta por defecto                                                                                                                                         |
| `comprobantesPorLista`     | number                          | `15`                   | Cuántos comprobantes muestran `arcli ultimos` (si no pasás `--cantidad`) y las listas del modo interactivo, de 1 a 50                                              |
| `ticketPath`               | string                          | ver abajo              | Carpeta donde se guarda el ticket WSAA                                                                                                                             |
| `pdf`                      | `siempre \| preguntar \| nunca` | `preguntar`            | Cuándo generar el PDF del comprobante emitido. Ver [PDF](pdf.md)                                                                                                   |
| `pdfCarpeta`               | string                          | `~/arcli/comprobantes` | Carpeta donde se guardan los PDFs                                                                                                                                  |
| `pdfNavegador`             | string                          | automático             | Ruta a Chrome, Chromium o Edge para generar los PDFs                                                                                                               |
| `emisor.razonSocial`       | string                          | ninguno                | Nombre o razón social del emisor (solo PDF)                                                                                                                        |
| `emisor.domicilio`         | string                          | ninguno                | Domicilio comercial del emisor (solo PDF)                                                                                                                          |
| `emisor.inicioActividades` | fecha                           | ninguno                | Inicio de actividades, con año: `1/03/2020` (solo PDF)                                                                                                             |
| `emisor.iibb`              | string                          | `Exento`               | Ingresos Brutos del emisor (solo PDF)                                                                                                                              |
| `emisor.condicionIva`      | string                          | según la letra         | Condición de IVA del emisor (solo PDF)                                                                                                                             |
| `emisor.logo`              | string                          | ninguno                | Ruta a un logo PNG o JPG (solo PDF)                                                                                                                                |

> Para claves booleanas, ARCLI acepta `true` / `false`, `sí` / `no` o `1` / `0`.

### Ticket WSAA (`ticketPath`)

Para autenticarse contra ARCA, el SDK pide un ticket de acceso (WSAA) que dura 12 horas y tiene rate limit estricto (1 request cada 2 minutos en producción, cada 10 minutos en testing). Ese ticket se guarda en disco para reutilizarlo entre corridas.

Por defecto, ARCLI lo guarda en una carpeta `tickets/` junto al `config.json` (ver `arcli config ruta`), para que sobreviva a reinstalaciones o actualizaciones del paquete. Si preferís otra ubicación:

```bash
arcli config establecer ticketPath /ruta/que/prefieras
arcli config eliminar ticketPath
```

El ticket permite operar en ARCA como tu CUIT mientras dure, así que ARCLI deja la carpeta en `0700` (solo tu usuario). Si elegís otra ubicación, que no sea una carpeta compartida.

### PDF y datos del emisor

Las claves `pdf`, `pdfCarpeta`, `pdfNavegador` y `emisor.*` solo se usan para generar el PDF. ARCA no recibe los datos del emisor: van impresos en el PDF. Cómo completarlos y qué hace cada clave: [PDF de comprobantes](pdf.md#datos-que-arca-no-guarda).

## Prioridad de fuentes

ARCLI resuelve los datos en este orden:

1. flags
2. JSON cargado con `--cargar`
3. config persistente
4. defaults internos

Ejemplo:

- si pasás `--moneda USD`, gana eso
- si no pasás `--moneda` pero el JSON trae `codigoMoneda`, gana el JSON
- si no hay JSON, usa `moneda` de config
- si tampoco hay config, cae en el default interno

## Comandos de configuración

### Ver configuración actual

```bash
arcli config
```

### Ver ruta del archivo

```bash
arcli config ruta
```

### Revisar configuración activa

```bash
arcli config revisar
arcli config revisar --json
```

`config revisar` combina:

- el estado de la config persistente
- el vencimiento de los certificados de los dos entornos
- la validación real (CUIT, certificado y clave legibles) del entorno por defecto y de cualquier otro que tenga `cert` o `key` configurados

No recibe `--testing` ni `--produccion`: revisa los dos entornos de una vez.

### Guardar o eliminar valores

```bash
arcli config establecer puntoVenta 3
arcli config eliminar puntoVenta
```

### Validación al guardar credenciales

Cuando se guarda `cert.*` o `key.*`, ARCLI valida:

- que la ruta exista
- que el archivo tenga formato PEM válido

¿Todavía no tenés el certificado y la clave? Ver
[Cómo obtener los certificados de ARCA](obtencion-certificados.md).

## Variables de entorno

No son claves de config. Las de color y `ARCLI_ASCII` cambian solo cómo se ve la salida humana; el JSON no cambia.

| Variable                    | Efecto                                                                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `NO_COLOR`                  | Desactiva los colores                                                                                                                       |
| `FORCE_COLOR=1`             | Fuerza los colores aunque la salida no sea una terminal (por defecto, con la salida redirigida no hay colores)                              |
| `ARCLI_ASCII=1`             | Dibuja los paneles con ASCII puro (`+`, `-`, `\|`), para terminales o fuentes que no muestran los caracteres de caja Unicode                |
| `NO_UPDATE_NOTIFIER`        | Desactiva el aviso de nueva versión, también en el modo interactivo. Tampoco aparece con `CI`, con `--json` ni si stderr no es una terminal |
| `PUPPETEER_EXECUTABLE_PATH` | Ruta del navegador para el PDF (ver [PDF](pdf.md#el-plugin-de-pdf))                                                                         |

## Qué conviene guardar

Guardá en config lo que se repite en el uso diario: `cuit`, `puntoVenta`, `concepto`, `ivaReceptor`, `cbu` (si emitís facturas FCE) y `alicuota` (si casi siempre facturás con una alícuota distinta de 21%). Un flag siempre pisa lo guardado. Para una configuración inicial, ver [Configuración](../README.md#configuración).

## Advertencias

### `emitir=true`

Si guardás:

```bash
arcli config establecer emitir true
```

ARCLI va a emitir por defecto cuando no pases `--previsualizar`, sin preguntar. Es cómodo, pero también hace más fácil emitir sin querer en flujos repetitivos. Si no estás seguro, dejalo en `false`.

Combinado con `entorno produccion`, un comando sin flags emite un comprobante real en producción. Si usás esa combinación, pasá `--previsualizar` cuando solo quieras ver la solicitud.
