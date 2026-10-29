[← Documentación](README.md)

# PDF de comprobantes

ARCLI puede generar el PDF de cada comprobante que emitís, con el QR de ARCA. Es el archivo que le mandás al cliente.

## Resumen

```bash
# Una sola vez: datos del emisor que ARCA no guarda
arcli config establecer emisor.razonSocial "Tu Nombre o Empresa"
arcli config establecer emisor.domicilio "Calle 123, Ciudad"
arcli config establecer emisor.inicioActividades 1/03/2020

# Emitir y generar el PDF
arcli fc -m 150000 --cs --cfinal --ir-cf --emitir --exportar-pdf --descripcion "Servicios de septiembre"
```

La primera vez, ARCLI ofrece descargar el plugin de PDF. El archivo queda en `~/arcli/comprobantes/20123456786/factura-c_0003-00000125.pdf`.

## El plugin de PDF

El PDF lo arma [`@arcasdk/pdf`](https://www.afipts.com/packages/pdf), que usa un navegador sin ventana (Chrome) para dibujarlo. Como pesa bastante, **no viene con ARCLI**: se descarga recién cuando alguien lo necesita. Si nunca generás un PDF, ARCLI sigue pesando lo mismo.

```bash
arcli pdf              # estado: instalado o no, versión, navegador
arcli pdf instalar     # descargar el plugin
arcli pdf desinstalar  # borrar el plugin y el navegador descargado
```

- **Tamaño:** unos 160 MB. Si no tenés Chrome, Chromium o Edge instalado, se descarga un navegador y se suman unos 200 MB.
- **Navegador:** ARCLI busca, en este orden, la config `pdfNavegador`, la variable `PUPPETEER_EXECUTABLE_PATH`, un Chrome, Chromium o Edge instalado en el sistema y, por último, el navegador que descargó el plugin.
- **Dónde se instala:** en `plugins/pdf/`, junto al archivo de configuración (ver `arcli config ruta`). `arcli pdf desinstalar` borra esa carpeta entera.
- **Cuándo se descarga solo:** solo en una terminal interactiva, y siempre preguntando antes. Con `--json` o sin terminal (scripts, CI, agentes) **nunca** se descarga solo: el comprobante sale con el error `PDF_PLUGIN_MISSING` en `pdf.error` y hay que correr `arcli pdf instalar` antes.
- **Versión:** ARCLI usa una versión fija del plugin, probada con ARCLI. Si cambia en una versión nueva de ARCLI, `arcli pdf` lo indica y `arcli pdf instalar` la actualiza.

## Cuándo se genera

La config `pdf` define qué pasa cuando no pasás ningún flag:

| `pdf`                     | En una terminal    | Con `--json` o sin terminal |
| ------------------------- | ------------------ | --------------------------- |
| `preguntar` (por defecto) | Pregunta al emitir | No genera                   |
| `siempre`                 | Genera             | Genera                      |
| `nunca`                   | No genera          | No genera                   |

```bash
arcli config establecer pdf siempre
```

Los flags ganan sobre la config en cada corrida:

- `--exportar-pdf` (alias `--pdf`): genera el PDF.
- `--sin-pdf`: no lo genera.

Nunca se genera un PDF de una vista previa (sin `--emitir`) ni de un comprobante rechazado, porque no tienen CAE. Un comprobante **observado** sí tiene CAE y sí lleva PDF.

En un lote (`--cargar` con un array) se genera un PDF por comprobante, y si hay que preguntar, se pregunta una sola vez para todo el lote. Cada ítem del JSON puede traer `"pdf": true` o `"pdf": false`.

## Si el PDF falla, el comprobante ya está emitido

El PDF se arma **después** de emitir. Si algo falla (falta el plugin, faltan datos del emisor, el navegador no arranca), el comprobante igual queda emitido: se muestra con su CAE, seguido de un aviso con el error y cómo resolverlo. No lo vuelvas a emitir para obtener el PDF: quedaría duplicado en ARCA. El código de salida no cambia. En JSON, el error va en `pdf.error`.

## Datos que ARCA no guarda

ARCA solo guarda números: no tiene el nombre del emisor, ni el del cliente, ni el detalle de lo que vendiste. Para el PDF hacen falta algunos datos más.

### Del emisor (config)

| Clave                      | Obligatoria | Nota                                                                                           |
| -------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| `emisor.razonSocial`       | sí          | Nombre o razón social                                                                          |
| `emisor.domicilio`         | sí          | Domicilio comercial                                                                            |
| `emisor.inicioActividades` | sí          | Fecha con año, por ejemplo `1/03/2020`                                                         |
| `emisor.iibb`              | no          | Número de Ingresos Brutos, o `Exento`. Si falta, sale "-"                                      |
| `emisor.condicionIva`      | no          | Por defecto sale de la letra: `A` y `B` → responsable inscripto, `C` → responsable monotributo |
| `emisor.logo`              | no          | Ruta a una imagen PNG o JPG                                                                    |

El CUIT es el de siempre (`cuit`). Si falta algún dato obligatorio, el PDF no se genera y el error `PDF_ISSUER_INCOMPLETE` lista los comandos para completarlos. En el modo interactivo se preguntan y se ofrece guardarlos.

### Del comprobante (flags opcionales)

| Flag                           | En el JSON de `--cargar` | Si no se pasa              |
| ------------------------------ | ------------------------ | -------------------------- |
| `--descripcion <texto>`        | `descripcion`            | "Segun detalle"            |
| `--receptor-nombre <texto>`    | `receptorNombre`         | "Consumidor Final" o `- -` |
| `--receptor-domicilio <texto>` | `receptorDomicilio`      | `- -`                      |

Al facturar con `--cuit` y sin `--ir` (con `consultarPadron` activo, como viene por defecto), el nombre y el domicilio del receptor que no pases salen del padrón de ARCA. Con `--ir` explícito no se consulta el padrón y valen los de la tabla.

Estos datos **solo van en el PDF**: ARCA no los recibe. Si los pasás y al final no se genera ningún PDF, ARCLI avisa que no quedaron en ningún lado.

El detalle del PDF tiene un renglón por alícuota de IVA con la descripción y su importe neto, o un solo renglón en las facturas `C`. Exento y no gravado van en renglones aparte.

## Leyendas obligatorias

ARCLI agrega al PDF las leyendas que pide la normativa y que la plantilla de `@arcasdk/pdf` no trae. Salen debajo del CAE, en la línea de "Observaciones":

- **Comprobantes B (RG 5614, Ley 27.743):** "Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)", con el **IVA Contenido** del comprobante y **Otros Impuestos Nacionales Indirectos** en `$ 0,00` (ARCLI no informa tributos).
- **Comprobantes A a un monotributista (RG 5003):** "El crédito fiscal discriminado en el presente comprobante, sólo podrá ser computado a efectos del Régimen de Sostenimiento e Inclusión Fiscal para Pequeños Contribuyentes de la Ley Nº 27.618". Aplica si la condición IVA del receptor es responsable monotributo, monotributista social o monotributo trabajador independiente promovido.

Las facturas C no llevan ninguna de las dos.

## Carpeta y nombre del archivo

- **Carpeta:** la config `pdfCarpeta`. Por defecto es `~/arcli/comprobantes`, una ruta fija para que los PDFs no queden repartidos según desde dónde corriste el comando.
- **Una subcarpeta por CUIT emisor:** `~/arcli/comprobantes/20123456786/`. Así dos emisores con el mismo punto de venta y número no se pisan.
- **Testing:** los PDFs de testing van a `testing/<CUIT>/` y llevan al pie "COMPROBANTE DE PRUEBA - SIN VALIDEZ FISCAL".
- **Nombre:** `<tipo>-<letra>_<punto de venta>-<número>.pdf`, con el punto de venta en 4 dígitos y el número en 8. Por ejemplo, `factura-c_0003-00000125.pdf` o `nota-credito-a_0003-00000007.pdf`.
- **Nunca se pisa un PDF:** si el archivo ya existe, el nuevo se guarda como `factura-c_0003-00000125-2.pdf`, `-3` y así.

```bash
arcli config establecer pdfCarpeta ~/Documentos/facturas
```

## Salida

En la terminal, debajo del comprobante:

```text
PDF guardado en /Users/vos/arcli/comprobantes/20123456786/factura-c_0003-00000125.pdf
```

En JSON, el resultado suma la clave `pdf` **solo si se intentó generar** el PDF:

```json
{ "pdf": { "ruta": "/Users/vos/arcli/comprobantes/20123456786/factura-c_0003-00000125.pdf" } }
```

```json
{
  "pdf": {
    "error": {
      "codigo": "PDF_PLUGIN_MISSING",
      "mensaje": "Para generar PDFs falta instalar el plugin de PDF.",
      "sugerencia": "Instalelo con `arcli pdf instalar`."
    }
  }
}
```

Códigos posibles: `PDF_PLUGIN_MISSING`, `PDF_PLUGIN_INSTALL_ERROR`, `PDF_ISSUER_INCOMPLETE` y `PDF_GENERATION_ERROR`. Ver [Troubleshooting](troubleshooting.md#pdf).

## Qué no hace (todavía)

- **Regenerar el PDF de un comprobante ya emitido.** La consulta de ARCA que usa el SDK no devuelve el detalle de IVA, los comprobantes asociados ni las fechas de servicio, así que el PDF saldría incompleto. Por ahora el PDF se genera al emitir.
- Ítems detallados (cantidad × precio unitario), duplicado y triplicado, plantilla propia y envío por mail.
- Completar los datos del emisor desde el padrón de ARCA (los del receptor sí se completan; ver [Del comprobante](#del-comprobante-flags-opcionales)).
