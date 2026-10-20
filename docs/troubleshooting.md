[← Documentación](README.md)

# Troubleshooting

Errores frecuentes agrupados por categoría: síntoma, causa y solución.

## Debug rápido

Si algo no cierra, estas son las tres corridas que más ayudan:

```bash
arcli config revisar
arcli fc ayuda
arcli fc -m 1000 --cs --consumidor-final --ir-cf --emitir --json --bruto --testing
```

Con eso normalmente ves:

- si falta configuración
- si el comando está mal armado
- si el problema viene de la solicitud o de ARCA

Si la salida humana no alcanza para entender qué pasó, agregá `--json`, `--bruto` o ambos al mismo comando.

Formatos: [Entrada y salida](input-output.md).

## Config

### Falta CUIT del emisor

- **Severidad:** común
- **Síntoma:** error de configuración indicando que falta el CUIT.
- **Causa:** no existe `cuit` en la config persistente.
- **Solución:**

```bash
arcli config establecer cuit 20168598204
arcli config revisar
```

- **Documentación relacionada:** [Configuración](configuration.md)

### Falta punto de venta

- **Severidad:** común
- **Síntoma:** el flujo corta antes de emitir con un mensaje sobre punto de venta.
- **Causa:** no llegó `puntoVenta` por flags ni por config.
- **Solución:**

```bash
arcli config establecer puntoVenta 3
```

o bien:

```bash
arcli fc -m 1000 --pv 3 --cs --consumidor-final --ir-cf
```

- **Documentación relacionada:** [Configuración](configuration.md), [Referencia del CLI](cli-reference.md)

### El punto de venta no existe o está bloqueado

- **Síntoma:** ARCA rechaza el comprobante por el punto de venta, o `arcli estado` dice que no existe, está bloqueado o dado de baja.
- **Causa:** el punto de venta tiene que estar dado de alta en ARCA para tu CUIT y para factura electrónica por web service.
- **Solución:** `arcli parametros puntos-venta --produccion` lista los habilitados. Guardá uno con `arcli config establecer puntoVenta <numero>`. En testing ARCA no informa puntos de venta y cualquier número sirve.

### Certificado o clave PEM inválidos

- **Severidad:** crítico
- **Síntoma:** error indicando que la ruta apunta a un archivo con formato PEM inválido.
- **Causa:** el archivo existe, pero el contenido no parece un PEM válido.
- **Solución:** volver a guardar la ruta correcta.

```bash
arcli config establecer cert.testing /ruta/al/certificado.crt
arcli config establecer key.testing /ruta/a/la/clave.key
```

- **Documentación relacionada:** [Configuración](configuration.md), [Cómo obtener los certificados de ARCA](obtencion-certificados.md)

### `config.json` con JSON inválido

- **Severidad:** crítico
- **Síntoma:** cualquier comando falla con `Error de configuracion` ("El archivo de configuracion tiene JSON invalido y no se puede leer."), con la ruta del archivo en `Ruta` (`detalles.ruta` con `--json`). Antes salía como "Error inesperado".
- **Causa:** el `config.json` quedó mal escrito, casi siempre por una edición a mano (una coma de más, comillas sin cerrar) o un archivo vacío.
- **Solución:** corregir el JSON a mano en esa ruta, o renombrar el archivo y volver a cargar los datos. ARCLI no lo borra ni lo pisa: lo que tenía sigue ahí para recuperarlo.

```bash
mv "<ruta>" "<ruta>.bak"
arcli config establecer cuit 20168598204
arcli config establecer cert.testing /ruta/al/certificado.crt
arcli config establecer key.testing /ruta/a/la/clave.key
```

O abrí `arcli` y elegí "Configuracion" para la configuración guiada.

- **Documentación relacionada:** [Configuración](configuration.md)

## Validación

### Falta un dato obligatorio

- **Severidad:** común
- **Síntoma:** `INPUT_VALIDATION_ERROR` o mensaje como `Falta monto.`
- **Causa:** falta un dato obligatorio en flags o JSON.
- **Solución:** revisar `ayuda` del comando puntual y completar los campos faltantes.

```bash
arcli fc ayuda
```

- **Documentación relacionada:** [Reglas de validación](validation-rules.md)

### Clave desconocida o tipo incorrecto en el JSON de `--cargar`

- **Severidad:** común
- **Síntoma:** `INPUT_VALIDATION_ERROR` (o `BATCH_VALIDATION_ERROR` en un lote) con `La clave "montototal" no existe` o `"puntoVenta" tiene que ser un numero y llego el texto "3"`.
- **Causa:** el JSON trae una clave que ARCLI no conoce (un typo o el nombre de un flag, como `vencimiento` en vez de `vencimientoPago`) o un valor con otro tipo (un número entre comillas, `"true"` en vez de `true`, `null`).
- **Solución:** usá la clave que sugiere el mensaje y escribí los números sin comillas. La lista completa está en [entrada y salida](input-output.md#campos-soportados).

### Se mezclan identidades del receptor

- **Severidad:** frecuente
- **Síntoma:** error pidiendo usar una sola identidad de receptor.
- **Causa:** se combinaron `--cuit`, `--cuil`, `--dni` o `--consumidor-final`.
- **Solución:** dejar una sola forma de identificar al receptor.
- **Documentación relacionada:** [Reglas de validación](validation-rules.md)

### Se mezclan formas de indicar IVA receptor

- **Severidad:** frecuente
- **Síntoma:** error pidiendo usar `--iva-receptor`, `--ir` o un solo `--ir-*`.
- **Causa:** se combinaron varias formas de indicar IVA receptor.
- **Solución:** dejar una sola fuente.
- **Documentación relacionada:** [Reglas de validación](validation-rules.md)

### Falta la cotización en moneda extranjera

- **Severidad:** frecuente
- **Síntoma:** `Falta la cotizacion de USD.`
- **Causa:** se pasó `--moneda USD` sin `--cotizacion-moneda`, o con cotización `1`.
- **Solución:** pasar `--cm <cotización>` si te pagan en pesos, o `--misma-moneda` si te pagan en dólares.
- **Documentación relacionada:** [Moneda y cotización](validation-rules.md#moneda-y-cotización)

### El comprobante no admite el IVA receptor

- **Severidad:** frecuente
- **Síntoma:** `La factura b no admite IVA receptor "responsable-inscripto". Use un comprobante letra A.`
- **Causa:** ARCA solo acepta ciertas condiciones IVA para cada letra. Por ejemplo, la `A` es para responsables inscriptos y monotributistas, y la `B` para el resto.
- **Solución:** usar la letra que sugiere el error, o corregir el IVA receptor.
- **Documentación relacionada:** [IVA receptor](validation-rules.md#iva-receptor)

### Consumidor final sin identificar desde $10.000.000

- **Severidad:** ocasional
- **Síntoma:** `... de $10.000.000 o mas requiere identificar al consumidor final.`
- **Causa:** la RG 5700/2025 obliga a identificar al consumidor final desde ese monto.
- **Solución:** reemplazar `--consumidor-final` por `--dni`, `--cuit` o `--cuil`, manteniendo `--ir-cf`.
- **Documentación relacionada:** [Consumidor final](validation-rules.md#consumidor-final)

### Fecha del comprobante fuera de rango

- **Severidad:** ocasional
- **Síntoma:** `La fecha ... esta fuera de rango ...` o `... es futura y cae en otro mes.`
- **Causa:** ARCA solo acepta fechas cercanas a hoy: ±5 días en productos, ±10 en servicios y de −5 a +1 en FCE.
- **Solución:** usar una fecha dentro de la ventana, o no pasar `--fecha` para usar la de hoy.
- **Documentación relacionada:** [Fecha del comprobante](validation-rules.md#fecha-del-comprobante)

### Vencimiento de pago anterior a la fecha

- **Severidad:** ocasional
- **Síntoma:** `El vencimiento de pago (...) no puede ser anterior al ...`
- **Causa:** `FchVtoPago` tiene que ser igual o posterior a la fecha del comprobante. En FCE, también a la de hoy.
- **Solución:** pasar un `--vencimiento` posterior.
- **Documentación relacionada:** [Vencimiento de pago](validation-rules.md#vencimiento-de-pago-fchvtopago)

### Factura FCE sin CBU

- **Severidad:** frecuente
- **Síntoma:** `La factura de credito electronica ... requiere el CBU del emisor.`
- **Causa:** ARCA exige el CBU del emisor en toda factura FCE (10168).
- **Solución:** pasar `--cbu <22 dígitos>` o configurarlo una vez con `arcli config establecer cbu <22 dígitos>`.
- **Documentación relacionada:** [Crédito electrónico (FCE)](validation-rules.md#crédito-electrónico-fce)

### NC/ND FCE sin fecha del asociado

- **Severidad:** frecuente
- **Síntoma:** `La nota de credito electronica ... requiere la fecha del comprobante asociado.`
- **Causa:** en NC/ND FCE, ARCA exige la fecha de la factura asociada (10158).
- **Solución:** agregar `--afecha <fecha>` con la fecha de la factura FCE original.
- **Documentación relacionada:** [Crédito electrónico (FCE)](validation-rules.md#crédito-electrónico-fce)

### La suma de las alícuotas no coincide con el total

- **Severidad:** ocasional
- **Síntoma:** `La suma de las alicuotas (...) no coincide con lo gravado del monto total (...)`.
- **Causa:** con varias `--alicuota TASA:MONTO`, cada monto lleva el IVA incluido, y la suma más `--exento` y `--nogravado` tiene que dar `--monto`.
- **Solución:** sacar `--monto` (el total se calcula solo) o corregir los montos.
- **Documentación relacionada:** [Varias alícuotas](validation-rules.md#varias-alícuotas-en-un-comprobante)

### Exento o no gravado mayor al total

- **Severidad:** ocasional
- **Síntoma:** `El importe exento mas el no gravado no puede superar el monto total.`
- **Causa:** `--monto` es el total del comprobante, y `--exento` y `--nogravado` son partes de ese total.
- **Solución:** pasar en `--monto` el total, incluidos exento y no gravado.
- **Documentación relacionada:** [IVA automático](validation-rules.md#iva-automático)

### `wsfecred` no autorizado

- **Severidad:** frecuente si usás `fce-obligado` o `verificarFce`
- **Síntoma:** `El certificado no esta autorizado para el servicio wsfecred ...` (ARCA responde `coe.notAuthorized`).
- **Causa:** el certificado solo tiene autorizado `wsfe`. La consulta del régimen FCE usa otro servicio.
- **Solución:** crear la autorización para `wsfecred` igual que la de `wsfe`, en WSASS (testing) o en el Administrador de Relaciones (producción). Si no la necesitás, desactivá el chequeo con `arcli config eliminar verificarFce`.
- **Documentación relacionada:** [Autorizar el servicio web](obtencion-certificados.md#3-autorizar-el-servicio-web)

### `ws_sr_constancia_inscripcion` no autorizado

- **Severidad:** frecuente si usás `arcli padron` o facturás con `--cuit` sin `--ir`
- **Síntoma:** `arcli padron` falla con `El certificado no esta autorizado para el servicio ws_sr_constancia_inscripcion ...`. Al facturar no corta: aparece el aviso `No se pudo consultar el padron de ARCA` y se usa el `ivaReceptor` de la config.
- **Causa:** el certificado solo tiene autorizado `wsfe`. El padrón usa otro servicio.
- **Solución:** crear la autorización para `ws_sr_constancia_inscripcion` igual que la de `wsfe`. Si no la necesitás, desactivá la consulta con `arcli config establecer consultarPadron false`.
- **Documentación relacionada:** [IVA receptor desde el padrón](cli-reference.md#iva-receptor-desde-el-padrón)

## ARCA

### `coe.alreadyAuthenticated`

- **Severidad:** frecuente
- **Síntoma:** error WSAA con `coe.alreadyAuthenticated`.
- **Causa:** ya existe un ticket válido para ese servicio.
- **Solución:** esperar unos segundos y reintentar sin cambiar la solicitud.
- **Documentación relacionada:** [Reglas de validación](validation-rules.md), [Limitaciones actuales](limitations.md)

### `Transacción Activa`

- **Severidad:** frecuente
- **Síntoma:** error ARCA con referencia a transacción activa.
- **Causa:** ARCA informa una operación transitoria en curso.
- **Solución:** esperar unos segundos y reintentar antes de modificar el comprobante. Si apareció al emitir, sale como `EMISSION_UNCERTAIN`: verificá primero con `arcli ultimos` (ver abajo).
- **Documentación relacionada:** [Reglas de validación](validation-rules.md), [Limitaciones actuales](limitations.md)

### No se pudo confirmar la emisión (`EMISSION_UNCERTAIN`)

- **Severidad:** crítico
- **Síntoma:** "No se pudo confirmar la emision: …" al emitir.
- **Causa:** falló la llamada que emite en ARCA (red, timeout, transacción activa). ARCA pudo haber autorizado el comprobante y perderse la respuesta. Si el error es del login en WSAA (certificado vencido o no autorizado) o del pedido del último número, no sale este error sino el original: ahí no se emitió nada y alcanza con corregir y reintentar.
- **Solución:** **no reintentes todavía**. Corré el `arcli ultimos <tipo> --pv <n>` que muestra la sugerencia: si el comprobante figura, ya está emitido y no hay que repetirlo; si no figura, reintentá.
- **Documentación relacionada:** [Entrada y salida](input-output.md#emisión-sin-confirmar)

### El receptor coincide con el emisor

- **Severidad:** crítico
- **Síntoma:** error ARCA `Campo DocNro no puede ser igual al del emisor.`
- **Causa:** se está usando el mismo CUIT como emisor y receptor.
- **Solución:** usar otro CUIT válido de testing como receptor.
- **Documentación relacionada:** [Reglas de validación](validation-rules.md)

### Observaciones de padrón

- **Severidad:** frecuente
- **Síntoma:** el comprobante aprueba, pero devuelve observaciones como `10217` o `10017`.
- **Causa:** condición del receptor o del entorno de testing.
- **Solución:** revisar si el caso es aceptable para tu flujo y distinguirlo de un rechazo real.
- **Documentación relacionada:** [Limitaciones actuales](limitations.md)

## Batch

### El lote tiene comprobantes inválidos

- **Severidad:** frecuente
- **Síntoma:** `BATCH_VALIDATION_ERROR` con la lista de ítems inválidos (`#2: Falta monto.`…). No se emitió ninguno.
- **Causa:** ARCLI valida todo el lote antes de emitir el primero, incluidas las consultas al padrón (IVA receptor desde `--cuit`) y a la cotización oficial.
- **Solución:** corregir esos ítems en el JSON y volver a correr el lote completo. Si el motivo es una consulta a ARCA que no respondió, reintentá en unos minutos.
- **Documentación relacionada:** [Entrada y salida](input-output.md#validación-y-errores-del-lote)

### El lote se interrumpió a mitad

- **Severidad:** crítico
- **Síntoma:** se ven los resultados de algunos comprobantes (con su PDF, si corresponde) y después `BATCH_EMISSION_ERROR` ("El lote se interrumpio en el comprobante #3…").
- **Causa:** la emisión falló a mitad del lote (red, ARCA, transacción activa).
- **Solución:** **no vuelvas a cargar los comprobantes que ya se procesaron**, porque se duplicarían. El que falló puede haberse emitido igual (`sinConfirmar` en el JSON): verificalo con `arcli ultimos` y sumalo solo si no figura. Armá un lote con ese y los que figuran en "Sin procesar" (`sinProcesar`) y reintentá. Si el que falló fue por "Transacción Activa", esperá unos segundos.
- **Documentación relacionada:** [Entrada y salida](input-output.md#validación-y-errores-del-lote)

## Terminal

### Los bordes de los paneles se ven como `?` o cuadraditos

- **Severidad:** ocasional (terminales viejas, por ejemplo el `cmd` clásico de Windows, o fuentes sin caracteres de caja)
- **Síntoma:** los bordes de los paneles muestran `?`, `�` o cuadrados en lugar de líneas.
- **Causa:** la terminal o la fuente no tiene los caracteres de caja Unicode que usa ARCLI (`╒`, `┃`, `╏`, `╓`, `╌`, `┈`, `━`, `▎`…).
- **Solución:** usar una terminal moderna (Windows Terminal, iTerm2, la de VS Code) o activar los bordes ASCII con `ARCLI_ASCII=1`.

```bash
ARCLI_ASCII=1 arcli fc -m 1000 --cs --cfinal --ir-cf
```

- **Documentación relacionada:** [Variables de entorno](configuration.md#variables-de-entorno)

## PDF

Un error del PDF no deshace la emisión: el comprobante ya tiene CAE. **No lo vuelvas a emitir para obtener el PDF**, porque quedaría duplicado en ARCA. Arreglá la causa para los próximos. Regenerar el PDF de un comprobante ya emitido todavía no está disponible. Ver [PDF de comprobantes](pdf.md#qué-no-hace-todavía).

### `PDF_PLUGIN_MISSING`

- **Síntoma:** "Para generar PDFs falta instalar el plugin de PDF".
- **Causa:** el plugin no se descarga solo con `--json` o sin terminal. También aparece si una versión nueva de ARCLI usa otra versión del plugin.
- **Solución:** `arcli pdf instalar`. Para ver qué hay instalado: `arcli pdf`.

### `PDF_PLUGIN_INSTALL_ERROR`

- **Síntoma:** `arcli pdf instalar` falla y muestra las últimas líneas de npm.
- **Causa:** sin internet, un proxy corporativo o un registro de npm privado.
- **Solución:** revisá `npm config get proxy` y `npm config get registry` y volvé a correr `arcli pdf instalar`. Si lo que falla es la descarga del navegador y ya tenés Chrome, Chromium o Edge, indicá su ruta:

```bash
arcli config establecer pdfNavegador "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

### `PDF_ISSUER_INCOMPLETE`

- **Síntoma:** "Faltan datos del emisor para el PDF".
- **Causa:** ARCA no guarda el nombre, el domicilio ni el inicio de actividades del emisor, y el PDF los necesita.
- **Solución:** completalos una vez con los comandos que muestra el error:

```bash
arcli config establecer emisor.razonSocial "Tu Nombre o Empresa"
arcli config establecer emisor.domicilio "Calle 123, Ciudad"
arcli config establecer emisor.inicioActividades 1/03/2020
```

### `PDF_GENERATION_ERROR`

- **Síntoma:** "No se pudo generar el PDF".
- **Causa habitual:** el navegador no arranca. Pasa en servidores sin entorno gráfico o con un Chrome muy viejo.
- **Solución:** probá con otro navegador (`arcli config establecer pdfNavegador <ruta>`) o borrá esa config para que ARCLI use el que descargó el plugin.
