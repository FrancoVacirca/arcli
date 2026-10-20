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

| Campo                 | Tipo    | Requerido                              | Descripción                                                                                                           |
| --------------------- | ------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `alicuotaIva`         | string  | no                                     | Alícuota de IVA: alias (`general`, `reducida`, `incrementada`, `cero`) o número (`0`, `2.5`, `5`, `10.5`, `21`, `27`) |
| `alicuotas`           | array   | no                                     | Varias alícuotas: `[{ "tasa": "general", "monto": 1210 }]`, monto con IVA incluido; con esto `montoTotal` es opcional |
| `aliasCbu`            | string  | no                                     | Alias del CBU (facturas FCE)                                                                                          |
| `anulacion`           | boolean | no                                     | NC/ND FCE de anulación                                                                                                |
| `cbu`                 | string  | en facturas FCE, salvo `config.cbu`    | CBU del emisor (facturas FCE)                                                                                         |
| `comprobanteAsociado` | object  | no                                     | Comprobante asociado                                                                                                  |
| `concepto`            | string  | sí, salvo default por flags/config     | Concepto                                                                                                              |
| `codigoMoneda`        | string  | no                                     | Moneda                                                                                                                |
| `cotizacionMoneda`    | number  | en moneda extranjera sin `mismaMoneda` | Cotización de la moneda                                                                                               |
| `mismaMoneda`         | boolean | no                                     | El pago se cancela en la moneda extranjera                                                                            |
| `dia`                 | number  | no                                     | Día de vencimiento o referencia                                                                                       |
| `emitir`              | boolean | no                                     | Emisión real                                                                                                          |
| `fechaComprobante`    | string  | no                                     | Fecha del comprobante                                                                                                 |
| `importeExento`       | number  | no                                     | Parte exenta del total (A y B)                                                                                        |
| `importeNoGravado`    | number  | no                                     | Parte no gravada del total (A y B)                                                                                    |
| `ivaReceptor`         | string  | sí, salvo default por config           | Condición IVA del receptor                                                                                            |
| `montoTotal`          | number  | sí                                     | Importe total                                                                                                         |
| `periodoAsociado`     | object  | no                                     | `{ "desde": "01-09-2026", "hasta": "30-09-2026" }`; alternativa a `comprobanteAsociado` en notas comunes              |
| `numeroDocumento`     | number  | depende del tipo de documento          | Número de documento                                                                                                   |
| `pdf`                 | boolean | no                                     | `true` genera el PDF y `false` no, como `--exportar-pdf` y `--sin-pdf`. Ver [PDF](pdf.md)                             |
| `descripcion`         | string  | no                                     | Detalle del comprobante en el PDF; ARCA no lo recibe                                                                  |
| `receptorNombre`      | string  | no                                     | Nombre o razón social del receptor en el PDF; ARCA no lo recibe                                                       |
| `receptorDomicilio`   | string  | no                                     | Domicilio del receptor en el PDF; ARCA no lo recibe                                                                   |
| `previsualizar`       | boolean | no                                     | Preview sin emitir                                                                                                    |
| `puntoVenta`          | number  | no                                     | Punto de venta                                                                                                        |
| `servicioDesde`       | string  | no                                     | Fecha inicio de servicio                                                                                              |
| `servicioHasta`       | string  | no                                     | Fecha fin de servicio                                                                                                 |
| `vencimientoPago`     | string  | no                                     | Fecha de vencimiento del pago                                                                                         |
| `tipoDocumento`       | string  | no                                     | `consumidor-final`, `cuit`, `cuil` o `dni`                                                                            |
| `transferencia`       | string  | no                                     | `sca` o `adc` (facturas FCE)                                                                                          |

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

Si el archivo contiene un array, ARCLI procesa un lote del mismo comando.

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

**Antes de emitir el primer comprobante, ARCLI valida todos los del lote**: la forma del JSON y las reglas de negocio (IVA receptor por letra, fechas, FCE, montos…).

- Si alguno es inválido, **no se emite ninguno** y el error `BATCH_VALIDATION_ERROR` lista **todos** los ítems con problemas, con su índice (desde 1) y el motivo.
- Si la emisión se corta a mitad del lote (red, ARCA), ARCLI **muestra primero los comprobantes ya procesados** y después el error `BATCH_EMISSION_ERROR`, que indica en qué ítem falló y cuáles quedaron sin procesar. **No vuelvas a cargar los ya emitidos**. El que falló puede haberse emitido igual (`detalles.sinConfirmar`): verificalo con `arcli ultimos` antes de reintentarlo, y después reintentá los que quedaron sin procesar.

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
- panel `Respuesta bruta` cuando se usa `--bruto`

### Estabilidad del contrato

La salida humana no debe tratarse como contrato estable para automatización. Para eso existe `--json`.

## Output JSON

### Caso simple

Sin `--bruto`, ARCLI serializa un resumen del resultado.

| Campo              | Tipo                                       | Descripción                                                                                                            |
| ------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `atajo`            | `string`                                   | Atajo del comprobante                                                                                                  |
| `avisos`           | `string[]`                                 | Avisos de ARCLI, por ejemplo del régimen FCE                                                                           |
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

Cuando hay varios resultados, ARCLI devuelve un array.

Cada item agrega:

| Campo         | Tipo     | Descripción                         |
| ------------- | -------- | ----------------------------------- |
| `atajo`       | `string` | Atajo del comprobante               |
| `comprobante` | `string` | Nombre visible del comprobante      |
| `indice`      | `number` | Posición en el lote, empezando en 1 |

Y después incluye el resto del resultado serializado.

## Output con `--bruto`

Cuando se usa `--bruto`, el contrato cambia para priorizar inspección técnica.

| Campo              | Tipo       | Descripción                                   |
| ------------------ | ---------- | --------------------------------------------- |
| `atajo`            | `string`   | Atajo del comprobante                         |
| `avisos`           | `string[]` | Avisos de ARCLI, por ejemplo del régimen FCE  |
| `comprobante`      | `string`   | Nombre visible del comprobante                |
| `previsualizacion` | `boolean`  | `true` si no hubo emisión real                |
| `respuesta`        | `object`   | Respuesta cruda del SDK o un mensaje amigable |
| `solicitud`        | `object`   | Solicitud enviada o previsualizada            |
| `sugerencias`      | `string[]` | Sugerencias generadas por ARCLI               |

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

### Errores JSON de configuración

```json
{
  "codigo": "CONFIGURATION_ERROR",
  "detalles": null,
  "error": "Falta la ruta del certificado para testing."
}
```

### Emisión sin confirmar

Si falla la llamada que emite en ARCA (red, timeout, transacción activa), no se sabe si el comprobante quedó autorizado: pudo emitirse y perderse la respuesta. **No reintentes sin verificar**, porque se duplicaría.

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

| Modo              | Llama a ARCA | Devuelve solicitud | Devuelve respuesta real | Contrato recomendado |
| ----------------- | ------------ | ------------------ | ----------------------- | -------------------- |
| texto             | depende      | sí                 | depende                 | uso humano           |
| `--json`          | depende      | sí                 | resumen serializado     | automatización       |
| `--json --bruto`  | depende      | sí                 | sí, si hubo emisión     | depuración técnica   |
| `--previsualizar` | no           | sí                 | no                      | revisión previa      |
| `--emitir`        | sí           | sí                 | sí                      | operación real       |
