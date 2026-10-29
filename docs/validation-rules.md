[← Documentación](README.md)

# Reglas de validación

Resumen rápido:

- primero ARCLI valida flags, tipos y combinaciones
- después aplica reglas de negocio del comprobante
- por último pueden aparecer restricciones o errores propios de ARCA

La idea de esta guía es separar esas tres capas para que sea más fácil entender dónde se rompió el flujo.

## 1. Validaciones del CLI

### Flags mutuamente excluyentes

- `--testing` y `--produccion`
- `--emitir` y `--previsualizar`
- `--concepto` y cualquiera de `--cs`, `--cp`, `--csp`
- `--iva-receptor`, `--ir` y cualquier `--ir-*`
- `--ac` y `--at`
- `--misma-moneda` y `--cotizacion-moneda` / `--cm`
- combinaciones múltiples de identidad del receptor:
  - `--cuit`
  - `--cuil`
  - `--dni`
  - `--consumidor-final`
  - `--cfinal`

### Tipos y formatos

- `--monto` debe ser un número positivo
- `--dia` debe ser un entero entre `1` y `31`, y no se combina con `--fecha` ni con `--servicio-hasta` (con esas fechas no se usaría)
- `--dia` cae en este mes si todavía no pasó y si no, en el siguiente; si ese mes no tiene ese día (`--dia 31` en abril), da error: usá `--servicio-hasta` con la fecha exacta
- `--punto-venta`, `--pv`, `--at`, `--apv`, `--ar` deben ser enteros positivos, escritos solo con dígitos (`3a` da error)
- `--cuit`, `--cuil`, `--acuit` y `--dni` aceptan guiones y puntos (`20-40950976-3`), pero nada más. Lo mismo el CUIT de `arcli padron`, `arcli fce-obligado`, `config establecer cuit` y `comprobanteAsociado.cuit` en el JSON
- `--at` se valida igual que `--ac`: una NC A no puede asociar una factura B. Si en el JSON vienen `tipo` y `atajo`, tienen que coincidir
- `--cotizacion-moneda` y `--cm` deben ser números positivos
- Todo CUIT o CUIL debe tener 11 dígitos y un dígito verificador válido: un número mal tipeado da error antes de llegar a ARCA
- `--dni` debe tener 7 u 8 dígitos
- En el JSON de `--cargar`, una clave desconocida o un tipo incorrecto (`"puntoVenta": "3"`) es error: ver [claves desconocidas y tipos](input-output.md#claves-desconocidas-y-tipos)

### Fechas aceptadas

ARCLI interpreta las fechas en formato argentino (día primero), con mes y año opcionales:

- `D` o `DD`
- `D-MM` o `D/MM`
- `D-MM-YY` o `D/MM/YY`
- `D-MM-YYYY` o `D/MM/YYYY`

Reglas de interpretación:

- "hoy" es siempre el día en Argentina, aunque el equipo esté en otra zona horaria (por ejemplo un servidor en UTC después de las 21 h)
- si omitís el año, ARCLI usa el año actual
- si omitís mes y año, ARCLI usa el mes y año actuales
- un año de 2 dígitos se interpreta como `20YY`
- no se pueden mezclar separadores dentro de la misma fecha (por ejemplo, `5-3/26` no es válido)

Formatos como `YYYY-MM-DD` no son válidos.

Si el formato no coincide, ARCLI corta antes de armar el payload.

### Emisión en producción

ARCLI no tiene una regla aparte para producción: emite si `--emitir` lo pide o, sin `--emitir` ni `--previsualizar`, si lo pide `"emitir"` del JSON de `--cargar` o `config.emitir`. Con `entorno produccion` y `emitir true` en la config, un comando sin flags emite en producción sin preguntar. Si nada pide emitir, en una terminal se muestra la vista previa y se pregunta; con `--json` o sin terminal no se emite. Detalle en [Emisión en producción](cli-reference.md#emisión-en-producción).

## 2. Reglas de negocio

### Punto de venta

- Puede venir por flags o por config.
- Si falta en ambos lugares, el flujo falla antes de emitir.

### Concepto y fechas de servicio

#### `productos`

- no usa `--servicio-desde`
- no usa `--servicio-hasta`
- no usa `--dia`
- no usa `--vencimiento`, salvo en facturas FCE

#### `servicios` y `productos-servicios`

- si informás una fecha de servicio, tenés que informar ambas
- la fecha de inicio no puede ser posterior a la de fin

#### Vencimiento de pago (`FchVtoPago`)

| Comprobante                                                | ¿Se envía? | Default sin `--vencimiento`                                     | Mínimo                                 |
| ---------------------------------------------------------- | ---------- | --------------------------------------------------------------- | -------------------------------------- |
| Servicios / productos y servicios                          | sí         | el fin del servicio, o la fecha del comprobante si es posterior | fecha del comprobante (10036)          |
| Factura FCE (`fcea`, `fceb`, `fcec`), incluso de productos | sí (10163) | la fecha del comprobante o hoy, la que sea posterior            | la fecha del comprobante o hoy (10164) |
| NC/ND FCE                                                  | no (10175) | —                                                               | `--vencimiento` da error               |
| Productos (no FCE)                                         | no         | —                                                               | `--vencimiento` da error               |

`--vencimiento` permite separar el vencimiento del período facturado. Por ejemplo, un servicio de febrero facturado el 18/03 que vence el 10/04.

### Fecha del comprobante

ARCA solo acepta una `CbteFch` cercana a la fecha de envío (errores 10016 y 10152). ARCLI lo valida antes de llamar al servicio:

| Comprobante                       | Desde         | Hasta         | Fecha futura               |
| --------------------------------- | ------------- | ------------- | -------------------------- |
| Productos                         | hoy − 5 días  | hoy + 5 días  | solo dentro del mes actual |
| Servicios / productos y servicios | hoy − 10 días | hoy + 10 días | sin restricción de mes     |
| FCE (facturas y notas)            | hoy − 5 días  | hoy + 1 día   | solo dentro del mes actual |

ARCA además exige que la fecha no sea anterior a la del último comprobante emitido para ese tipo y punto de venta. Esa regla no se valida localmente, porque depende de lo ya emitido.

### Identidad del receptor

#### Consumidor final

Si usás consumidor final:

- el documento debe ser `0`
- el IVA receptor debe ser `consumidor-final`
- el total en pesos tiene que ser menor a `$10.000.000`. Desde ese monto hay que identificarlo con `--dni`, `--cuit` o `--cuil` ([RG 5700/2025](https://www.consejosalta.org.ar/wp-content/uploads/ARCA-5700.pdf)). En moneda extranjera se compara `monto × cotización`.

#### CUIT, CUIL y DNI

- si el tipo de documento no es `consumidor-final`, ARCLI exige `numeroDocumento`

### IVA receptor

ARCLI exige una única fuente de IVA receptor:

- `--iva-receptor <tipo>`
- `--ir <tipo>`
- un solo `--ir-*`
- o un default configurado

Además, la condición tiene que ser válida para la letra del comprobante. ARCLI aplica la misma tabla que devuelve ARCA en `FEParamGetCondicionIvaReceptor` (error 10243):

| Letra | IVA receptor admitido                                                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `A`   | `responsable-inscripto`, `responsable-monotributo`, `monotributista-social`, `monotributo-trabajador-independiente-promovido`                       |
| `B`   | `sujeto-exento`, `consumidor-final`, `sujeto-no-categorizado`, `proveedor-del-exterior`, `cliente-del-exterior`, `iva-liberado`, `iva-no-alcanzado` |
| `C`   | todas                                                                                                                                               |

Si la combinación no es válida, el error sugiere la letra que corresponde. Ejemplo: `fb` con `--ir-ri` sugiere usar letra `A`.

### Comprobantes asociados

Aplica a:

- `nota-credito`
- `nota-debito`
- `nota-credito-electronica`
- `nota-debito-electronica`

No aplica a:

- `factura`
- `factura-credito-electronica`

Para notas, ARCLI acepta un comprobante asociado **o** un período asociado (`PeriodoAsoc`), pero no ambos (10197).

Período asociado (`--periodo-desde` y `--periodo-hasta`):

- solo en notas comunes: en facturas (10198) y en notas FCE (10196) da error
- requiere las dos fechas
- desde ≤ hasta (10207), y ambas posteriores al 01/01/2006 (10206)
- hasta ≤ fecha de la nota (10208)

Comprobante asociado (si no se usa el período), que necesita:

- `--ac` o `--at`
- `--apv` o `--asociado-punto-venta`
- `--ar`
- `--acuit`, salvo en NC/ND FCE, donde se puede omitir y toma el CUIT emisor

Con período asociado no hace falta ninguno de estos flags, `--acuit` incluido.

Además:

- el asociado debe ser una factura, no otra nota
- la letra debe coincidir
- la categoría electrónica debe coincidir
- `--afecha` es opcional, salvo en NC/ND FCE, y no puede ser posterior a la fecha de la nota (10159)

### Crédito electrónico (FCE)

ARCLI arma `Opcionales` (los "Adicionales por R.G.") según el comprobante:

| Comprobante                          | `Opcionales`                                                 | Reglas                                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Factura FCE (`fcea`, `fceb`, `fcec`) | `2101` CBU, `2102` alias (si se informa), `27` transferencia | El CBU es obligatorio (10168) y tiene 22 dígitos (10165). El alias tiene de 6 a 20 caracteres (10166). La transferencia es `SCA` o `ADC`, por defecto `SCA` (10216). `--anulacion` da error (10171).    |
| NC/ND FCE (`ncea`…`ndec`)            | `22` anulación: `S` con `--anulacion`, si no `N`             | Obligatorio (10173). `--cbu`, `--alias` y `--transferencia` dan error (10172). `--afecha` es obligatoria (10158). El asociado tiene que ser del CUIT emisor (10155), así que `--acuit` se puede omitir. |
| Resto                                | ninguno                                                      | `--cbu`, `--alias`, `--transferencia` y `--anulacion` dan error (10169).                                                                                                                                |

### Régimen FCE del receptor

Con `config.verificarFce` en `true`, ARCLI consulta `wsfecred` (`consultarMontoObligadoRecepcion`) antes de la vista previa. La consulta corre en facturas comunes y FCE con `--cuit` del receptor, usando la fecha del comprobante. Los avisos posibles son:

| Comprobante            | Receptor                             | Aviso                               |
| ---------------------- | ------------------------------------ | ----------------------------------- |
| `fa`, `fb`, `fc`       | obligado y monto (en pesos) ≥ mínimo | Corresponde `fcea`, `fceb` o `fcec` |
| `fcea`, `fceb`, `fcec` | no obligado                          | Corresponde `fa`, `fb` o `fc`       |
| `fcea`, `fceb`, `fcec` | obligado, pero monto < mínimo        | Corresponde `fa`, `fb` o `fc`       |

Los avisos aparecen en la salida de texto (panel "Avisos") y en el campo `avisos` del JSON. No frenan la emisión. Si la consulta falla, por ejemplo porque el certificado no tiene autorizado `wsfecred`, el motivo también llega como aviso.

`config.cbu` y `config.aliasCbu` solo se aplican a facturas FCE. ARCA además exige que el CBU esté registrado a nombre del emisor (10174), cosa que no se puede validar localmente.

### Moneda y cotización

ARCLI convierte el código de moneda al de ARCA: `ARS` → `PES` y `USD` → `DOL`. Otros códigos de 3 letras se envían tal cual.

| Caso                                | `MonCotiz`            | `CanMisMonExt` | Regla                                                                                                                                       |
| ----------------------------------- | --------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Pesos                               | `1`                   | no se envía    | Una cotización distinta de `1` da error (ARCA 10039 y 10241). `--misma-moneda` da error.                                                    |
| Moneda extranjera, pago en pesos    | `--cotizacion-moneda` | `N`            | La cotización es obligatoria y no puede ser `1`. ARCA la acepta entre el 2% y el 400% de la oficial (10119).                                |
| Moneda extranjera, `--misma-moneda` | la oficial de ARCA    | `S`            | ARCLI la consulta antes de la vista previa porque ARCA exige el valor exacto (10038). La fecha del comprobante no puede ser anterior a hoy. |

`config.cotizacion` solo se usa como default en moneda extranjera sin `--misma-moneda`.

### IVA automático

ARCLI calcula IVA automáticamente en todos los comprobantes letra `A` y `B`, sea cual sea el IVA receptor. Los letra `C` no informan IVA.

El total se reparte así (ARCA 10048):

```
ImpTotal = ImpTotConc (--nogravado) + ImpOpEx (--exento) + ImpNeto + ImpIVA
```

- `ImpNeto` e `ImpIVA` salen del resto del total con la alícuota de `--alicuota`, o la de `config.alicuota`, o `21`. Se redondean a 2 decimales. `config.alicuota` no se aplica a letra `C`.
- `--exento` + `--nogravado` no pueden superar el total. Si lo igualan, no hay neto gravado ni array `Iva`.
- Con neto mayor a cero siempre se envía el array `Iva`, también al 0% (10070).
- En letra `C`, `--alicuota`, `--exento` y `--nogravado` dan error, porque ARCA exige que esos importes sean cero.

| Alias          | Número | Id ARCA |
| -------------- | ------ | ------- |
| `cero`         | `0`    | `3`     |
| —              | `2.5`  | `9`     |
| —              | `5`    | `8`     |
| `reducida`     | `10.5` | `4`     |
| `general`      | `21`   | `5`     |
| `incrementada` | `27`   | `6`     |

`--alicuota` acepta el alias o el número, con coma o punto decimal y un `%` final (`reducida`, `10,5`, `10.5`, `10.5%`).

#### Varias alícuotas en un comprobante

Repetí `--alicuota TASA:MONTO`, con el importe de cada alícuota **IVA incluido**, igual que `--monto`:

```bash
arcli fa --cs --cuit 30709965812 --ir-ri --alicuota general:1210 --alicuota reducida:552,50
```

- Cada monto se parte en neto e IVA según su tasa, y se envía una entrada de `Iva` por alícuota. La suma de los netos es `ImpNeto` (10061).
- `--monto` pasa a ser opcional. Sin él, el total es la suma de las alícuotas más `--exento` y `--nogravado`. Si lo pasás, tiene que coincidir exactamente con esa suma.
- Si la misma alícuota aparece dos veces, se suman sus montos.
- No se puede mezclar `--alicuota TASA` con `--alicuota TASA:MONTO`, ni repetir `--alicuota TASA` sin monto.
- En JSON: `"alicuotas": [{ "tasa": "general", "monto": 1210 }, { "tasa": "10.5", "monto": 552.5 }]`.

## 3. Restricciones y errores de ARCA

Hay rechazos que ARCLI no puede anticipar: errores transitorios de WSAA (`coe.alreadyAuthenticated`, `Transacción Activa`), receptor igual al emisor, observaciones de padrón y fechas anteriores al último comprobante emitido. Ver [Troubleshooting](troubleshooting.md#arca) y [Limitaciones](limitations.md).
