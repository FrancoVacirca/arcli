[← Documentación](README.md)

# Entrada y salida

Contrato formal de entrada y salida de ARCLI.

Este documento asume el flujo descrito en [mental-model.md](mental-model.md) (`Input -> Validación -> Solicitud -> ARCA -> Output`, con prioridad `flags > JSON > config > defaults`) y se enfoca en el contrato concreto de cada formato.

## Formato de input: objeto

Cuando usás `--cargar`, ARCLI espera un objeto JSON o un array de objetos.

```bash
arcli fc --cargar ./voucher.json
```

### Campos soportados

| Campo                 | Tipo    | Requerido                              | Descripción                                                                                                                                     |
| --------------------- | ------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `alicuotaIva`         | string  | no                                     | Alícuota de IVA: alias (`general`, `reducida`, `incrementada`, `cero`) o número (`0`, `2.5`, `5`, `10.5`, `21`, `27`); acepta `"10.5"` o `10.5` |
| `alicuotas`           | array   | no                                     | Varias alícuotas: `[{ "tasa": "general", "monto": 1210 }]`, monto con IVA incluido; con esto `montoTotal` es opcional                           |
| `aliasCbu`            | string  | no                                     | Alias del CBU (facturas FCE)                                                                                                                    |
| `anulacion`           | boolean | no                                     | NC/ND FCE de anulación                                                                                                                          |
| `cbu`                 | string  | en facturas FCE, salvo `config.cbu`    | CBU del emisor (facturas FCE)                                                                                                                   |
| `comprobanteAsociado` | object  | no                                     | Comprobante asociado                                                                                                                            |
| `concepto`            | string  | sí, salvo default por flags/config     | Concepto                                                                                                                                        |
| `codigoMoneda`        | string  | no                                     | Moneda                                                                                                                                          |
| `cotizacionMoneda`    | number  | en moneda extranjera sin `mismaMoneda` | Cotización de la moneda                                                                                                                         |
| `mismaMoneda`         | boolean | no                                     | El pago se cancela en la moneda extranjera                                                                                                      |
| `dia`                 | number  | no                                     | Día de vencimiento o referencia                                                                                                                 |
| `emitir`              | boolean | no                                     | Emisión real                                                                                                                                    |
| `fechaComprobante`    | string  | no                                     | Fecha del comprobante                                                                                                                           |
| `importeExento`       | number  | no                                     | Parte exenta del total (A y B)                                                                                                                  |
| `importeNoGravado`    | number  | no                                     | Parte no gravada del total (A y B)                                                                                                              |
| `ivaReceptor`         | string  | sí, salvo default por config           | Condición IVA del receptor                                                                                                                      |
| `montoTotal`          | number  | sí                                     | Importe total                                                                                                                                   |
| `periodoAsociado`     | object  | no                                     | `{ "desde": "01-09-2026", "hasta": "30-09-2026" }`; alternativa a `comprobanteAsociado` en notas comunes                                        |
| `numeroDocumento`     | number  | depende del tipo de documento          | Número de documento                                                                                                                             |
| `pdf`                 | boolean | no                                     | `true` genera el PDF y `false` no, como `--exportar-pdf` y `--sin-pdf`. Ver [PDF](pdf.md)                                                       |
| `descripcion`         | string  | no                                     | Detalle del comprobante en el PDF; ARCA no lo recibe                                                                                            |
| `receptorNombre`      | string  | no                                     | Nombre o razón social del receptor en el PDF; ARCA no lo recibe                                                                                 |
| `receptorDomicilio`   | string  | no                                     | Domicilio del receptor en el PDF; ARCA no lo recibe                                                                                             |
| `previsualizar`       | boolean | no                                     | Preview sin emitir                                                                                                                              |
| `puntoVenta`          | number  | no                                     | Punto de venta                                                                                                                                  |
| `servicioDesde`       | string  | no                                     | Fecha inicio de servicio                                                                                                                        |
| `servicioHasta`       | string  | no                                     | Fecha fin de servicio                                                                                                                           |
| `vencimientoPago`     | string  | no                                     | Fecha de vencimiento del pago                                                                                                                   |
| `tipoDocumento`       | string  | no                                     | `consumidor-final`, `cuit`, `cuil` o `dni`                                                                                                      |
| `transferencia`       | string  | no                                     | `sca` o `adc` (facturas FCE)                                                                                                                    |

### Claves desconocidas y tipos

Cada objeto se valida contra esta lista antes de mezclarlo con los flags y la config:

- **Una clave que no está en las tablas es un error** (`INPUT_VALIDATION_ERROR`) que la nombra y, si se parece a una válida o a un flag, sugiere la correcta: `"montototal"` → `montoTotal`, `"vencimiento"` → `vencimientoPago`, `"moneda"` → `codigoMoneda`. Vale también dentro de `comprobanteAsociado`, `periodoAsociado` y cada ítem de `alicuotas`.
- **Un tipo incorrecto es un error**, no se descarta: `"puntoVenta": "3"` falla con "tiene que ser un numero". Los números van sin comillas y los booleanos son `true` o `false`, no `"true"`. `null` tampoco vale: para no informar un campo, omití la clave. La única clave que acepta texto o número es la tasa de IVA (`alicuotaIva` y `tasa` en `alicuotas`).
- En un lote, cada ítem se valida por separado y el error sale en `BATCH_VALIDATION_ERROR` con su índice (ver [abajo](#validación-y-errores-del-lote)). Un array vacío también es error.

Con un solo comprobante, `detalles.campos` lista cada problema con su ruta en el JSON:

```json
{
  "codigo": "INPUT_VALIDATION_ERROR",
  "detalles": {
    "campos": [
      {
        "mensaje": "\"puntoVenta\" tiene que ser un numero y llego el texto \"3\". Escribilo sin comillas.",
        "ruta": ["puntoVenta"]
      },
      { "mensaje": "La clave \"vencimiento\" no existe: ¿quisiste decir \"vencimientoPago\"?", "ruta": ["vencimiento"] }
    ]
  },
  "error": "En el JSON de --cargar: ..."
}
```

### Flags y claves del JSON

Los nombres de las claves no siempre coinciden con los flags. Si pasás las dos cosas, gana el flag.

| Flag                                                          | Clave del JSON                      |
| ------------------------------------------------------------- | ----------------------------------- |
| `--monto`, `-m`                                               | `montoTotal`                        |
| `--alicuota TASA`                                             | `alicuotaIva`                       |
| `--alicuota TASA:MONTO` (repetido)                            | `alicuotas: [{ "tasa", "monto" }]`  |
| `--exento`                                                    | `importeExento`                     |
| `--nogravado`                                                 | `importeNoGravado`                  |
| `--dia`                                                       | `dia`                               |
| `--punto-venta`, `--pv`                                       | `puntoVenta`                        |
| `--fecha`                                                     | `fechaComprobante`                  |
| `--concepto`, `--cs`, `--cp`, `--csp`                         | `concepto`                          |
| `--moneda`, `--mda`                                           | `codigoMoneda`                      |
| `--cotizacion-moneda`, `--cm`                                 | `cotizacionMoneda`                  |
| `--misma-moneda`                                              | `mismaMoneda`                       |
| `--cuit`, `--cuil`, `--dni`, `--consumidor-final`, `--cfinal` | `tipoDocumento` y `numeroDocumento` |
| `--iva-receptor`, `--ir`, `--ir-*`                            | `ivaReceptor`                       |
| `--servicio-desde`, `--sd`                                    | `servicioDesde`                     |
| `--servicio-hasta`, `--sh`                                    | `servicioHasta`                     |
| `--vencimiento`, `--vto`                                      | `vencimientoPago`                   |
| `--ac`                                                        | `comprobanteAsociado.atajo`         |
| `--at`                                                        | `comprobanteAsociado.tipo`          |
| `--apv`, `--asociado-punto-venta`                             | `comprobanteAsociado.puntoVenta`    |
| `--ar`                                                        | `comprobanteAsociado.numero`        |
| `--acuit`                                                     | `comprobanteAsociado.cuit`          |
| `--afecha`                                                    | `comprobanteAsociado.fecha`         |
| `--periodo-desde`, `--pd`                                     | `periodoAsociado.desde`             |
| `--periodo-hasta`, `--ph`                                     | `periodoAsociado.hasta`             |
| `--cbu`                                                       | `cbu`                               |
| `--alias`                                                     | `aliasCbu`                          |
| `--transferencia`                                             | `transferencia`                     |
| `--anulacion`                                                 | `anulacion`                         |
| `--exportar-pdf`, `--pdf` / `--sin-pdf`                       | `pdf: true` / `pdf: false`          |
| `--descripcion`                                               | `descripcion`                       |
| `--receptor-nombre`                                           | `receptorNombre`                    |
| `--receptor-domicilio`                                        | `receptorDomicilio`                 |
| `--emitir`                                                    | `emitir`                            |
| `--previsualizar`                                             | `previsualizar`                     |

### Objeto `comprobanteAsociado`

| Campo        | Tipo   | Requerido       | Descripción                                                         |
| ------------ | ------ | --------------- | ------------------------------------------------------------------- |
| `atajo`      | string | sí\*            | Atajo del comprobante asociado                                      |
| `cuit`       | string | sí para notas   | CUIT del comprobante asociado (en NC/ND FCE, por defecto el emisor) |
| `fecha`      | string | sí en NC/ND FCE | Fecha del comprobante asociado                                      |
| `numero`     | number | sí para notas   | Número del comprobante asociado                                     |
| `puntoVenta` | number | sí para notas   | Punto de venta del comprobante asociado                             |
| `tipo`       | number | sí\*            | Tipo ARCA del comprobante asociado                                  |

\* Hay que informar `atajo` o `tipo`, pero no hace falta enviar ambos.

### Ejemplo de input simple

```json
{
  "concepto": "servicios",
  "codigoMoneda": "ARS",
  "cotizacionMoneda": 1,
  "emitir": false,
  "fechaComprobante": "27-03-2026",
  "ivaReceptor": "responsable-inscripto",
  "montoTotal": 15000,
  "numeroDocumento": 20168598204,
  "puntoVenta": 3,
  "servicioDesde": "27-03-2026",
  "servicioHasta": "27-03-2026",
  "tipoDocumento": "cuit"
}
```

### Ejemplo con asociado

```json
{
  "comprobanteAsociado": {
    "atajo": "fa",
    "cuit": "20409509763",
    "numero": 120,
    "puntoVenta": 3
  },
  "concepto": "servicios",
  "ivaReceptor": "responsable-inscripto",
  "montoTotal": 5000,
  "numeroDocumento": 20168598204,
  "tipoDocumento": "cuit"
}
```

## Formato de input: batch

Si el archivo contiene un array, ARCLI procesa un lote del mismo comando. **Un array es siempre un lote, aunque tenga un solo elemento**: la salida `--json` es un array y los errores son `BATCH_VALIDATION_ERROR` / `BATCH_EMISSION_ERROR` con el índice. Un objeto suelto es un solo comprobante: sale un objeto y los errores son los de siempre (`INPUT_VALIDATION_ERROR`, etc.).

```json
[
  {
    "concepto": "servicios",
    "ivaReceptor": "consumidor-final",
    "montoTotal": 1000,
    "numeroDocumento": 0,
    "tipoDocumento": "consumidor-final"
  },
  {
    "concepto": "servicios",
    "ivaReceptor": "responsable-inscripto",
    "montoTotal": 2000,
    "numeroDocumento": 20168598204,
    "tipoDocumento": "cuit"
  }
]
```

### Validación y errores del lote

**Antes de emitir el primer comprobante, ARCLI valida todos los del lote**: la forma del JSON, las consultas a ARCA que se hacen antes de emitir (IVA receptor desde el padrón, cotización oficial) y las reglas de negocio (IVA receptor por letra, fechas, FCE, montos…).

- Si alguno es inválido o falla su consulta, **no se emite ninguno** y el error `BATCH_VALIDATION_ERROR` lista **todos** los ítems con problemas, con su índice (desde 1) y el motivo.
- Si la emisión se corta a mitad del lote (red, ARCA), ARCLI **muestra primero los comprobantes ya procesados**, con su PDF si corresponde (según `pdf` o `--exportar-pdf`, igual que en un lote completo; en `--json`, cada uno con su campo `pdf`), y después el error `BATCH_EMISSION_ERROR`, que indica en qué ítem falló y cuáles quedaron sin procesar. **No vuelvas a cargar los ya emitidos**. El que falló puede haberse emitido igual (`detalles.sinConfirmar`): verificalo con `arcli ultimos` antes de reintentarlo, y después reintentá los que quedaron sin procesar.

```json
{
  "codigo": "BATCH_VALIDATION_ERROR",
  "detalles": {
    "comprobantes": [
      { "error": "Falta monto.", "indice": 2 },
      {
        "error": "La factura b de $10.000.000 o mas requiere identificar al consumidor final. Use --dni, --cuit o --cuil.",
        "indice": 3
      }
    ]
  },
  "error": "2 de 4 comprobantes del lote tienen errores. No se emitio ninguno.\n\n#2: ..."
}
```

```json
{
  "codigo": "BATCH_EMISSION_ERROR",
  "detalles": { "fallo": 3, "procesados": 2, "sinConfirmar": 3, "sinProcesar": [4], "total": 4 },
  "error": "El lote se interrumpio en el comprobante #3: ...\nProcesados: 2 de 4. Sin procesar: #4.\nEl #3 puede haberse emitido: verifiquelo con \"arcli ultimos\" antes de reintentarlo."
}
```

Con un solo comprobante (sin lote) los errores son los de siempre.

## Output humano

La salida humana está pensada para terminal y prioriza legibilidad.

Incluye, según el caso:

- banner de entorno
- solicitud amigable
- estado visual del resultado
- paneles secundarios para `Observaciones`, `Eventos`, `Errores` y `Sugerencias`
- panel `Respuesta bruta` al final, además de todo lo anterior, cuando se usa `--bruto` y hubo emisión real (en una previsualización no hay respuesta de ARCA y no se muestra)

### Estabilidad del contrato

La salida humana no debe tratarse como contrato estable para automatización. Para eso existe `--json`.

## Output JSON

### Caso simple

ARCLI serializa un resumen del resultado. Con `--bruto` se agrega además el campo `respuesta` (ver [abajo](#output-con---bruto)); el resto no cambia.

| Campo              | Tipo                                       | Descripción                                                                                                            |
| ------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `atajo`            | `string`                                   | Atajo del comprobante                                                                                                  |
| `avisos`           | `string[]`                                 | Avisos de ARCLI: régimen FCE, padrón o certificado por vencer (ver [abajo](#aviso-del-certificado))                    |
| `cae`              | `string \| null`                           | CAE informado por ARCA                                                                                                 |
| `caeVencimiento`   | `string \| null`                           | Vencimiento del CAE                                                                                                    |
| `comprobante`      | `string`                                   | Nombre visible del comprobante                                                                                         |
| `errores`          | `unknown[]`                                | Array de errores crudos                                                                                                |
| `estado`           | `"aprobado" \| "observado" \| "rechazado"` | Estado normalizado que arma ARCLI                                                                                      |
| `eventos`          | `unknown[]`                                | Array de eventos crudos                                                                                                |
| `observaciones`    | `string[]`                                 | Observaciones amigables                                                                                                |
| `observacion`      | `string \| null`                           | Observaciones unidas en una sola cadena                                                                                |
| `pdf`              | `object`, opcional                         | Solo si se intentó generar el PDF: `{ ruta }` o `{ error: { codigo, mensaje, sugerencia } }`. Ver [PDF](pdf.md#salida) |
| `previsualizacion` | `boolean`                                  | `true` si no hubo emisión real                                                                                         |
| `resultado`        | `string \| null`                           | Resultado original de ARCA, por ejemplo `A` o `R`                                                                      |
| `solicitud`        | `object`                                   | Solicitud enviada o previsualizada                                                                                     |
| `sugerencias`      | `string[]`                                 | Sugerencias generadas por ARCLI                                                                                        |
| `tipoArca`         | `number`                                   | Tipo ARCA del comprobante                                                                                              |

### Aviso del certificado

Si al certificado del entorno le quedan menos de 30 días, el aviso sale al principio del comando en **stderr** (stdout queda solo para el JSON) y, en los comandos de facturación, también como un texto más en `avisos`:

```json
{
  "avisos": [
    "El certificado de produccion vence el 20/11/2026 (en 10 días). Renovalo: https://github.com/LcsGrz/arcli/blob/main/docs/obtencion-certificados.md"
  ],
  "...": "..."
}
```

En texto sale solo el banner del principio, no se repite en el panel de avisos. Si ya venció, no hay resultado: sale el error [`CERTIFICATE_EXPIRED`](#certificado-vencido).

### `estado` vs `resultado`

No significan lo mismo:

- `resultado` es el valor original que llega de ARCA
- `estado` es una normalización que hace ARCLI

Ejemplo:

- ARCA puede devolver `resultado: "A"`
- ARCLI puede devolver:
  - `estado: "aprobado"` si no hay observaciones
  - `estado: "observado"` si hubo observaciones

```json
{
  "atajo": "fb",
  "cae": "86120020284412",
  "caeVencimiento": "20260329",
  "comprobante": "Factura B",
  "errores": [],
  "estado": "aprobado",
  "eventos": [],
  "observaciones": [],
  "observacion": null,
  "previsualizacion": false,
  "resultado": "A",
  "solicitud": {
    "...": "..."
  },
  "sugerencias": [],
  "tipoArca": 6
}
```

## Output batch en JSON

Cuando `--cargar` trae un array, ARCLI devuelve un array, aunque tenga un solo elemento. Con flags o un objeto devuelve un objeto.

Cada item agrega:

| Campo         | Tipo     | Descripción                         |
| ------------- | -------- | ----------------------------------- |
| `atajo`       | `string` | Atajo del comprobante               |
| `comprobante` | `string` | Nombre visible del comprobante      |
| `indice`      | `number` | Posición en el lote, empezando en 1 |

Y después incluye el resto del resultado serializado.

## Output con `--bruto`

`--bruto` (o `bruto=true` en la config) **agrega** el campo `respuesta` al JSON de siempre: `cae`, `estado`, `errores` y los demás campos del [caso simple](#caso-simple) siguen igual. En un lote, cada ítem trae su `respuesta`.

| Campo       | Tipo     | Descripción                                   |
| ----------- | -------- | --------------------------------------------- |
| `respuesta` | `object` | Respuesta cruda del SDK o un mensaje amigable |

```json
{
  "atajo": "fb",
  "cae": "86120020284412",
  "estado": "aprobado",
  "errores": [],
  "...": "el resto del resumen",
  "respuesta": {
    "cae": "86120020284412",
    "caeFchVto": "20260329",
    "response": { "FeCabResp": { "...": "..." }, "FeDetResp": { "...": "..." } }
  }
}
```

### Sin emisión real

Si no hubo emisión real, `respuesta` no se serializa como `null`. En su lugar:

```json
{
  "mensaje": "Sin emision real. Use --emitir para obtener una respuesta de ARCA."
}
```

## Comprobantes emitidos (`ultimos` y `consultar`)

`arcli ultimos <tipo> --json` devuelve el tipo de comprobante y la lista, del más nuevo al más viejo:

```json
{
  "atajo": "fb",
  "comprobante": "Factura B",
  "tipoArca": 6,
  "comprobantes": [
    {
      "cae": "86400940834444",
      "caeVencimiento": "20261011",
      "concepto": 2,
      "cotizacion": 1,
      "fecha": "20261001",
      "importes": { "exento": 50, "iva": 105.05, "neto": 1000.45, "noGravado": 25, "total": 1180.5, "tributos": 0 },
      "moneda": "PES",
      "numero": 12,
      "numeroDocumento": 0,
      "resultado": "A",
      "tipoDocumento": 99
    }
  ],
  "entorno": "testing",
  "puntoVenta": 3
}
```

`arcli consultar <tipo> <numero> --json` devuelve un solo comprobante, con los mismos campos al primer nivel (sin el array `comprobantes`).

| Campo                     | Tipo             | Descripción                                                           |
| ------------------------- | ---------------- | --------------------------------------------------------------------- |
| `fecha`, `caeVencimiento` | `string`         | Formato ARCA `yyyymmdd`                                               |
| `concepto`                | `number`         | `1` productos, `2` servicios, `3` productos y servicios               |
| `tipoDocumento`           | `number`         | Código de ARCA: `80` CUIT, `86` CUIL, `96` DNI, `99` consumidor final |
| `moneda`                  | `string`         | Código de ARCA (`PES`, `DOL`…)                                        |
| `importes`                | `object`         | `total`, `neto`, `iva`, `exento`, `noGravado` y `tributos`            |
| `resultado`               | `string \| null` | `A` aprobado, `R` rechazado                                           |

## Formato de errores

Los errores salen en JSON con `--json` o, sin el flag, si la config tiene `json=true`. Van a stderr y el proceso termina con exit code `1`.

Un comprobante **rechazado por ARCA no es un error del comando**: sale como resultado normal (stdout, `estado: "rechazado"`, con `errores` y `observaciones`), pero el exit code es `2`.

| Exit code | Cuándo                                                                                |
| --------- | ------------------------------------------------------------------------------------- |
| `0`       | Todo bien: comprobantes aprobados (también `observado`, que tiene CAE) o vista previa |
| `1`       | Error: entrada inválida, configuración, red o ARCA sin respuesta                      |
| `2`       | ARCA rechazó al menos un comprobante. En un lote, revisá `estado` de cada uno         |

### Errores JSON de validación

Cuando el error viene de Zod o de validación de entrada:

```json
{
  "codigo": "INPUT_VALIDATION_ERROR",
  "detalles": [
    {
      "mensaje": "Falta monto.",
      "ruta": ["montoTotal"]
    }
  ],
  "error": "Hay parametros invalidos o incompletos en la entrada."
}
```

### Errores JSON de uso

Una opción desconocida, un valor faltante o un comando que no existe también sale en JSON cuando corresponde (`--json` o `json=true` en la config), con exit code `1`. El mensaje es el de commander, en una sola línea. `--ayuda` y `--version` no son errores.

```json
{
  "codigo": "INPUT_VALIDATION_ERROR",
  "detalles": null,
  "error": "unknown option '--montoo' (Did you mean --monto?)",
  "sugerencia": "Usá \"arcli ayuda\" o \"arcli <comando> --ayuda\" para ver comandos y opciones."
}
```

### Errores JSON de configuración

```json
{
  "codigo": "CONFIGURATION_ERROR",
  "detalles": null,
  "error": "Falta la ruta del certificado para testing."
}
```

Si el `config.json` tiene JSON inválido, sale con el mismo código, la ruta del archivo y qué hacer:

```json
{
  "codigo": "CONFIGURATION_ERROR",
  "detalles": { "ruta": "/Users/ana/Library/Preferences/arcli/config.json" },
  "error": "El archivo de configuracion tiene JSON invalido y no se puede leer.",
  "sugerencia": "Corregilo a mano, o renombralo (por ejemplo, a config.json.bak) y volve a cargar los datos con `arcli config establecer` o desde \"Configuracion\" en `arcli`. ARCLI no lo borra ni lo pisa."
}
```

### Certificado vencido

Con el certificado del entorno vencido, los comandos que van a ARCA cortan antes de autenticar en WSAA: no se envió nada y no hay que verificar. Con `--json` no sale el banner, solo este error en stderr:

```json
{
  "codigo": "CERTIFICATE_EXPIRED",
  "detalles": { "entorno": "produccion", "vencimiento": "20/11/2026" },
  "error": "El certificado de produccion venció el 20/11/2026: ARCA no lo acepta.",
  "sugerencia": "Generá uno nuevo siguiendo la guía y cargalo con \"arcli config establecer cert.produccion <ruta>\": https://github.com/LcsGrz/arcli/blob/main/docs/obtencion-certificados.md"
}
```

### Emisión sin confirmar

Si falla la llamada que emite en ARCA (red, timeout, transacción activa), no se sabe si el comprobante quedó autorizado: pudo emitirse y perderse la respuesta. **No reintentes sin verificar**, porque se duplicaría.

Los pasos previos no cuentan: si falla el login en WSAA (por ejemplo, un certificado no autorizado; uno vencido corta antes, con [`CERTIFICATE_EXPIRED`](#certificado-vencido)) o el pedido del último número, no se envió nada y el error sale como `UNEXPECTED_ERROR` o `TRANSIENT_ERROR`.

```json
{
  "codigo": "EMISSION_UNCERTAIN",
  "detalles": { "causa": "socket hang up" },
  "error": "No se pudo confirmar la emision: socket hang up",
  "sugerencia": "Puede haberse emitido igual. Antes de reintentar, verifique con \"arcli ultimos fc --pv 3\": si figura, ya esta emitido y no hay que repetirlo."
}
```

En un lote, el mismo caso sale como `BATCH_EMISSION_ERROR` con `detalles.sinConfirmar` (el índice que hay que verificar).

### Errores transitorios o inesperados

```json
{
  "codigo": "TRANSIENT_ERROR",
  "detalles": null,
  "error": "ns1:coe.alreadyAuthenticated",
  "sugerencia": "WSAA informo que ya existe un TA valido para este servicio. Espere unos segundos y vuelva a intentar sin cambiar la solicitud."
}
```

### Errores del PDF

Un error del PDF **no** es un error del comando: el comprobante ya se emitió, así que el error va dentro del resultado, en `pdf.error`, y el código de salida no cambia. Los códigos son `PDF_PLUGIN_MISSING`, `PDF_PLUGIN_INSTALL_ERROR`, `PDF_ISSUER_INCOMPLETE` y `PDF_GENERATION_ERROR`. Ver [PDF de comprobantes](pdf.md#salida).

`arcli pdf instalar` sí falla como un comando, con `sugerencia`:

```json
{
  "codigo": "PDF_PLUGIN_INSTALL_ERROR",
  "detalles": { "salida": "npm error code ECONNREFUSED" },
  "error": "npm no pudo instalar @arcasdk/pdf.",
  "sugerencia": "Revise la conexion a internet o el proxy de npm y vuelva a correr `arcli pdf instalar`."
}
```

## Diferencias entre modos

| Modo              | Llama a ARCA | Devuelve solicitud | Devuelve respuesta real                        | Contrato recomendado               |
| ----------------- | ------------ | ------------------ | ---------------------------------------------- | ---------------------------------- |
| texto             | depende      | sí                 | depende                                        | uso humano                         |
| `--json`          | depende      | sí                 | resumen serializado                            | automatización                     |
| `--json --bruto`  | depende      | sí                 | resumen + cruda (`respuesta`), si hubo emisión | automatización con detalle técnico |
| `--previsualizar` | no           | sí                 | no                                             | revisión previa                    |
| `--emitir`        | sí           | sí                 | sí                                             | operación real                     |
