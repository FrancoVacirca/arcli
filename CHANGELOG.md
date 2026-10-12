[← Volver al README](README.md)

# Changelog

Todos los cambios relevantes de ARCLI se documentan acá.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/). Como el contrato del CLI es público (comandos, flags, claves de config y JSON), cada entrada aclara qué cambia para quien ya lo usa.

## [Sin publicar]

### Cambiado

- **Enteros estrictos, y es un cambio que rompe:** `--pv`, `--punto-venta`, `--ar`, `--apv`, `--at`, `--dia` y `--cantidad` aceptan solo dígitos; antes `--pv 3a` se leía como 3. `--cuit`, `--cuil` y `--dni` aceptan además guiones y puntos (`20-11111111-2`), como el modo interactivo; antes `--cuit 20111111112xyz` pasaba.
- **`--dia` con `--fecha` o `--servicio-hasta` da error:** antes `--dia` se ignoraba sin aviso.
- **Montos del JSON con 2 decimales como máximo** (la cotización, 6), igual que los flags.
- **Varias alícuotas: la suma tiene que coincidir exacta** con `--monto`; antes se aceptaba un centavo de diferencia, y el `ImpTotal` enviado podía no coincidir con la suma de sus partes.
- **Montos en formato argentino, y es un cambio que rompe:** `--monto`, `--exento`, `--nogravado`, `--cotizacion-moneda`/`--cm`, el monto de `--alicuota TASA:MONTO` y `config establecer cotizacion` usan punto para miles y coma para decimales. `15.000` es quince mil y `1.500,50` es mil quinientos con cincuenta. Antes `-m 15.000` se leía como 15 y `-m 1500,50` como 1500, sin aviso. Ahora `1500.50` da error ("use coma para los decimales"), igual que el texto sobrante (`12abc`) y más de 2 decimales (la cotización acepta hasta 6). El JSON de `--cargar` no cambia: ahí los montos son números.
- **Modo interactivo:** los montos siguen la misma regla. `1500.50` ya no se acepta y más de 2 decimales da error en lugar de redondearse en silencio. El comando equivalente que muestra al final escribe los montos con coma.

### Corregido

- **PDF: textos escapados.** La plantilla de `@arcasdk/pdf` no escapa HTML y Chromium la renderiza con JavaScript: una razón social o descripción con `<script>` (por ejemplo, de un JSON de terceros) se ejecutaba, y un `&` legítimo se veía mal. Ahora todos los textos se escapan antes de generar el PDF.
- **Tickets de ARCA y config solo para tu usuario:** ARCLI crea sus archivos con permisos `0600`/`0700` (umask `077`), incluidos los tickets que escribe el SDK, y deja en `0700` la carpeta de config y la de tickets que ya existían. Antes quedaban `0644`/`0755`, y en Linux otro usuario del equipo podía leer un ticket y usarlo para emitir durante su validez. Los PDFs nuevos también quedan solo para tu usuario.
- **`config establecer` ya no guarda valores inválidos:** antes `config establecer cuit abc` lo guardaba igual y dejaba el CLI inutilizable, incluso `config eliminar`. Ahora se valida antes de guardar, y una config que ya estaba rota se arregla con `config establecer` o `config eliminar` de la clave que falla.
- **Fecha argentina siempre:** en un equipo con otra zona horaria (por ejemplo un servidor en UTC), entre las 21 y las 24 h la fecha del comprobante salía con el día siguiente. Ahora "hoy" es siempre el día en Argentina.
- **`ImpTotal` exacto:** se calcula como la suma de no gravado, exento, neto e IVA con aritmética decimal. Con varias alícuotas, el total ya no sale como `300.29999999999995`.
- **`--at` se valida como `--ac`:** una NC A ya no puede asociar una factura B por código; si `tipo` y `atajo` vienen juntos tienen que coincidir.
- **`ayuda` como valor de un flag** (`--descripcion ayuda`) ya no abre la ayuda.
- **Emisión sin confirmar:** si falla la llamada que emite en ARCA (red, timeout, transacción activa), el error ahora es `EMISSION_UNCERTAIN` y avisa que el comprobante puede haberse emitido igual, con el `arcli ultimos <tipo> --pv <n>` para verificarlo antes de reintentar. Antes salía como `TRANSIENT_ERROR` o `UNEXPECTED_ERROR` y sugería reintentar, lo que podía duplicarlo. En un lote, `BATCH_EMISSION_ERROR` suma `detalles.sinConfirmar`.
- **Ctrl+C en las preguntas del PDF**, que llegan después de emitir: el modo interactivo decía "Cancelado. No se emitio nada." aunque el comprobante ya estaba emitido, y el comando terminaba en "Error inesperado" con exit 1. Ahora se toma como "no generar el PDF" y se avisa que el comprobante quedó emitido.
- **Un flag escrito siempre gana:** `--previsualizar` ya no choca con `emitir=true` en la config o `"emitir": true` en el JSON, y `--emitir` gana a `"previsualizar": true`. Lo mismo con `--alicuota TASA` sobre las `alicuotas` del JSON, `--cm` sobre `"mismaMoneda"` y `--misma-moneda` sobre `"cotizacionMoneda"`. El error de "ambos a la vez" queda solo si los dos vienen del mismo lugar.
- **Errores en JSON con `json=true` en la config:** antes solo salían en JSON con el flag `--json`.
- **`cae` y `caeVencimiento` son `null` en un comprobante rechazado**, como dice la documentación; antes venían como `""`.
- Los errores con sugerencia la incluyen en `sugerencia` también en JSON (antes solo los del PDF).
- **Documentación de la emisión en producción:** decía que emitir en producción exige `--produccion --emitir`. En realidad el entorno sale de `config.entorno` y la emisión de `config.emitir` cuando no pasás flags: con `entorno produccion` y `emitir true` se emite en producción sin flags. El comportamiento no cambió; se corrigieron SECURITY.md, README, `llms.txt`, la ayuda y los docs.

## [1.8.0] - 2026-10-09

Suma la clave `comprobantesPorLista` y sube a 15 el default de `arcli ultimos`; el resto son cambios del modo interactivo. Ningún flag ni formato JSON cambia.

### Agregado

- **Modo interactivo, elegir factura:** en notas de crédito/débito, en "Repetir factura" y en "Consultar comprobantes", la lista ahora muestra los últimos 15, con el formato de `arcli ultimos`, y tiene **Cargar más…** para traer los anteriores e **Ingresar el número a mano…**, que pide punto de venta y número. Así se puede hacer una nota sobre una factura vieja o emitida desde otro punto de venta.
- **Nueva clave de config `comprobantesPorLista`** (1 a 50, por defecto 15): cuántos comprobantes muestran `arcli ultimos` y las listas del modo interactivo. `arcli config establecer comprobantesPorLista 25`.

### Cambiado

- **`arcli ultimos` muestra 15 comprobantes por defecto** (antes 10), o los de `config.comprobantesPorLista`. `--cantidad` sigue mandando. Si un script dependía de que vinieran 10, agregá `--cantidad 10`.
- **Modo interactivo:** "Nota de crédito o débito sobre una factura" se separó en **Emitir nota de crédito** y **Emitir nota de débito**, así el flujo ya no pregunta cuál.
- **Modo interactivo:** "Ver últimos comprobantes" y "Consultar un comprobante" se unificaron en **Consultar comprobantes**: elegís el tipo, la lista muestra los últimos y al elegir uno ves el detalle y volvés a la lista.
- **Modo interactivo:** **Esc** vuelve al paso anterior, en listas y en preguntas de texto (antes había que escribir `<`, que sigue funcionando). La pregunta abandonada no queda en pantalla. La ayuda de teclas de las listas pasó a castellano.
- **`arcli config` por secciones:** cuenta, certificados, al facturar, FCE, datos del emisor, PDF, y salida y listados. Cambia solo la salida en texto; `arcli config --json` queda igual.
- **Modo interactivo, configuración:** nueva opción **Ver configuración**. "Cambiar un dato" pasó a llamarse **Modificar configuración**: usa las mismas secciones que `arcli config`, suma moneda, cotización y carpeta de tickets, y vuelve a la lista después de cada cambio.
- **Docs:** GIF del modo interactivo regrabado y uno nuevo de "Consultar comprobantes" en la guía del modo interactivo. `scripts/demo/record.sh` acepta los guiones a grabar. README con el logo en alta resolución y los chips centrados.
- **Modo interactivo:** Esc en el menú principal cierra el asistente. Más aire entre preguntas: dos líneas arriba de la activa, una debajo de la pregunta y otra entre la descripción y la ayuda de teclas.
- **Modo interactivo:** la pregunta activa tiene una línea en blanco arriba, así se distingue de las ya respondidas, que quedan juntas. "← Volver" queda separado de las opciones por una línea en blanco.

## [1.7.1] - 2026-10-06

Versión de documentación. No cambia ningún comando, flag, clave de config ni JSON.

### Cambiado

- **Documentación reorganizada:** nuevo índice en `docs/README.md` y nueva guía de [arquitectura](https://github.com/LcsGrz/arcli/blob/main/docs/architecture.md). El README quedó más corto, con instalación, configuración y uso mínimos. Se eliminaron secciones duplicadas entre documentos y el checklist manual de UI, que usaba comandos que ya no existen.
- **Seguridad:** `SECURITY.md` apunta al reporte privado de vulnerabilidades de GitHub.

### Corregido

- **Docs:** el glosario decía que la alícuota de IVA era fija al 21%; la referencia del CLI citaba claves de config inexistentes; `llms.txt` documentaba un campo JSON (`confirmarProduccion`) que no existe; faltaban en la guía de configuración `NO_UPDATE_NOTIFIER` y `PUPPETEER_EXECUTABLE_PATH`.

## [1.7.0] - 2026-10-05

Esta versión completa el modo interactivo: configuración guiada la primera vez, cambiar cualquier dato desde un menú, repetir una factura anterior con fechas nuevas, consultar un comprobante y ver el estado de ARCA. También corrige el PDF de la Factura B, enlaza la guía de certificados desde la configuración y suma GIF e imágenes al README. No se rompe ningún comando, flag ni JSON existente.

### Corregido

- **PDF de la Factura B:** el renglón y el subtotal mostraban el importe neto y el total con IVA, sin el IVA en ningún lado, así que no cerraba. Ahora los renglones y el subtotal de la B van con IVA incluido, como corresponde a una B. La A y la C no cambian.

### Agregado

- **Modo interactivo:**
  - **Repetir una factura anterior:** copia receptor, concepto, monto y alícuota de una de las últimas emitidas, con fecha de hoy y el período que elijas (este mes, el mes pasado, hoy u otro).
  - **Configuración:** submenú con revisar, **configuración guiada** (CUIT, certificado, punto de venta y defaults, más los datos del PDF), **cambiar un dato** de una lista con su valor actual, y el **plugin de PDF**. Si falta algo obligatorio, el asistente ofrece la configuración guiada al abrirse.
  - **Consultar un comprobante** por tipo y número, y **Estado de ARCA** con la cotización del dólar.

### Cambiado

- **Guía de certificados en la configuración:** el asistente de configuración y `arcli config revisar` ahora muestran el link a [Cómo obtener los certificados de ARCA](https://github.com/LcsGrz/arcli/blob/main/docs/obtencion-certificados.md): en el mensaje inicial, justo antes de pedir el certificado de testing si todavía no hay uno cargado, y en el aviso de credenciales de testing faltantes. Antes el asistente apuntaba a una ruta relativa que no existe al instalar desde npm.

## [1.6.0] - 2026-10-05

Esta versión suma `arcli estado` y `arcli parametros` para consultar ARCA sin emitir, y simplifica la factura del modo interactivo: primero lo requerido y después todos los opcionales en una sola pregunta. No se rompe ningún comando, flag ni JSON existente.

### Agregado

- `arcli estado`: muestra si los servidores de ARCA responden, cuánto tardan y si el punto de venta configurado está habilitado para tu CUIT (en producción; en testing ARCA no informa puntos de venta). Con `--json`, `listo` dice si se puede emitir.
- `arcli parametros <tabla>`: consulta las tablas de ARCA vigentes (`puntos-venta`, `comprobantes`, `documentos`, `alicuotas`, `iva-receptor`, `monedas`, `conceptos`, `opcionales` y `tributos`). `arcli parametros cotizacion USD` muestra la cotización oficial. Sin tabla, lista las disponibles.

### Cambiado

- **Modo interactivo:** la factura pregunta primero solo lo requerido y después, en **una sola pregunta**, todos los opcionales: se marcan con espacio y Enter sigue. Sin marcar nada se usan los valores por defecto. La alícuota de IVA (A y B) y la modalidad de transferencia (FCE) pasan a ser opcionales: antes se preguntaban siempre, aunque casi siempre quedaban en 21% y SCA. Las opciones avanzadas ya no son un menú que se recorre de a una.

## [1.5.0] - 2026-10-04

Esta versión suma el PDF del comprobante con el QR de ARCA, para mandarle al cliente. El PDF lo genera un plugin que se descarga solo si lo usás, así que ARCLI no pesa más para quien no quiere PDFs. No se rompe ningún comando, flag ni JSON existente: todo lo nuevo es opcional, y el JSON suma la clave `pdf` solo cuando se intenta generar el PDF.

### Agregado

- **PDF del comprobante con el QR de ARCA**, para mandarle al cliente. Ver [PDF de comprobantes](docs/pdf.md).
  - `--exportar-pdf` (alias `--pdf`) lo genera después de emitir y `--sin-pdf` no. Sin flag decide la config `pdf`: `preguntar` (por defecto), `siempre` o `nunca`. Con `preguntar`, sin terminal o con `--json` no se genera.
  - Datos que solo van en el PDF, porque ARCA no los guarda: `--descripcion`, `--receptor-nombre` y `--receptor-domicilio`, y en el JSON de `--cargar`, `pdf`, `descripcion`, `receptorNombre` y `receptorDomicilio`.
  - Claves de config nuevas: `pdf`, `pdfCarpeta` (por defecto `~/arcli/comprobantes`), `pdfNavegador` y los datos del emisor: `emisor.razonSocial`, `emisor.domicilio`, `emisor.inicioActividades`, `emisor.iibb`, `emisor.condicionIva` y `emisor.logo`.
  - El archivo se llama `factura-c_0003-00000125.pdf`. Los de testing van a la subcarpeta `testing/` con un pie que dice que no tienen validez fiscal.
  - En JSON, cada resultado suma la clave `pdf` (`{ ruta }` o `{ error }`) **solo si se intentó generar**. Un error del PDF no cambia el código de salida, porque el comprobante ya está emitido.
  - El modo interactivo pregunta si generar el PDF después de emitir, y pide los datos del emisor que falten (ofrece guardarlos).
- **`arcli pdf`** (`estado`, `instalar`, `desinstalar`): el PDF lo genera [`@arcasdk/pdf`](https://www.afipts.com/packages/pdf), que **no viene con ARCLI** porque pesa unos 160 MB (más un navegador de unos 200 MB si no hay Chrome, Chromium o Edge instalado). Se descarga recién cuando alguien quiere PDFs: en una terminal, ARCLI lo ofrece la primera vez; sin terminal nunca se descarga solo.
- `config revisar` avisa si `pdf` es `siempre` y faltan datos del emisor.

## [1.4.0] - 2026-10-02

Esta versión suma dos comandos para ver lo emitido (`ultimos` y `consultar`), facturas con varias alícuotas de IVA y un modo interactivo más completo. Los lotes ahora se validan enteros antes de emitir. No se rompe ningún comando, flag ni JSON existente: `--alicuota` con un solo número funciona igual que antes.

### Agregado

- **Modo interactivo:**
  - **Volver al paso anterior** con "← Volver" en las opciones o `<` en los textos.
  - **Opciones avanzadas** antes de la vista previa: moneda extranjera (incluida la cotización oficial si te pagan en dólares), exento y no gravado, período del servicio y vencimiento del pago.
  - Las notas comunes se pueden asociar **a un período** en lugar de a una factura.
- **Varias alícuotas por comprobante:** repetí `--alicuota TASA:MONTO` con el monto IVA incluido de cada una, por ejemplo `--alicuota general:1210 --alicuota reducida:552.50`. El total se calcula solo y se envía una entrada de IVA por alícuota. En JSON: `alicuotas: [{tasa, monto}]`.
- **Alias de alícuotas:** `general` (21), `reducida` (10.5), `incrementada` (27) y `cero` (0). Se aceptan igual que el número en `--alicuota`, `alicuotaIva` y `config alicuota`.
- `arcli ultimos <tipo>`: lista los últimos comprobantes emitidos en ARCA (`--cantidad` de 1 a 50, por defecto 10).
- `arcli consultar <tipo> <numero>`: muestra el detalle de un comprobante emitido, con CAE, vencimiento, importes y receptor.
- Los dos tienen `--json` y `--pv`. Antes esto solo se podía ver desde el modo interactivo.

### Cambiado

- **Lotes (`--cargar` con un array):**
  - Se validan **todos** los comprobantes antes de emitir el primero. Si alguno es inválido, no se emite ninguno y el error `BATCH_VALIDATION_ERROR` los lista a todos con su índice.
  - Antes, las reglas de negocio se validaban mientras se emitía: si el #3 era inválido, el #1 y el #2 ya estaban emitidos y sus resultados no se mostraban.
  - Si la emisión se corta a mitad (red, ARCA), se muestran los comprobantes ya procesados y después el error `BATCH_EMISSION_ERROR`, con el ítem que falló y los que quedaron sin procesar.

### Corregido

- El comando equivalente del modo interactivo no incluía la moneda extranjera (`--moneda`, `--cm`, `--misma-moneda`).
- **La salida `--json` traía códigos de color ANSI cuando se redirigía** (`arcli ... --json | jq` fallaba con `parse error`). Ahora solo hay colores si la salida es una terminal real. `FORCE_COLOR=1` los fuerza y `NO_COLOR` los apaga.
- En el modo interactivo, el logo ahora tiene 3 líneas en blanco abajo, igual que arriba. Antes la barra de estado quedaba pegada.

## [1.3.0] - 2026-10-02

Esta versión suma el modo interactivo para quien factura de vez en cuando y renueva la salida de la terminal: bordes según el tipo de panel, paneles que se ajustan a ventanas angostas y varios bugs de color corregidos. No se rompe ningún comando, flag ni JSON existente. El único cambio de comportamiento es que `arcli` sin argumentos, en una terminal interactiva, abre el asistente en lugar de la ayuda.

### Agregado

- `ARCLI_ASCII=1` dibuja los paneles con ASCII puro, para terminales que no muestran caracteres de caja.
- **Modo interactivo.** `arcli` sin argumentos en una terminal interactiva abre un asistente paso a paso (también `arcli interactivo`):
  - Emitir facturas A, B o C, comunes o FCE.
  - Notas de crédito y débito eligiendo la factura de una lista de las últimas emitidas, consultadas a ARCA.
  - Ver los últimos comprobantes y revisar la configuración.
  - Antes de emitir muestra la vista previa y el comando equivalente. En producción pide una segunda confirmación.
  - Usa las mismas validaciones y la misma emisión que los comandos con flags. Ver [Modo interactivo](docs/modo-interactivo.md).

### Cambiado

- **Bordes según el tipo de panel**, para reconocerlo antes de leerlo:
  - Comprobantes: la línea antes del estado ahora es de puntos y llega al borde (`├┄┄┤`).
  - Errores del CLI y de ARCA: `╭─╮`, con una franja gruesa `┃` a la izquierda.
  - Observaciones y avisos del régimen FCE: la misma forma, con la franja a trazos `╏`. Sugerencias: franja fina `┆`.
  - Configuración y régimen FCE: ficha `┌─┐` con el título a la izquierda.
  - Revisión de configuración: `╓─╖` con el veredicto en el pie (`╟──╢`).
  - Últimos comprobantes (modo interactivo): solo reglas `══` arriba y abajo, sin costados.
  - Avisos simples ("No se emitió nada"): solo las esquinas `┌ ┐ └ ┘`.
  - Banner de TESTING: `┌╌┐`. Aviso de nueva versión: `╭─╮`. JSON y respuestas crudas: `┌┈┐`.
  - Encabezado del modo interactivo: una barra de estado de una línea (`━━ MODO INTERACTIVO ━━ testing · PV 3 ━━`).
  - Títulos de `arcli ejemplos`: una línea de sección (`── FACTURA C ──`) en lugar de una caja.
  - "Esto equivale a:" del modo interactivo: solo `▎` a la izquierda, sin borde derecho, para que el comando se copie limpio.
  - `arcli storybook bordes` muestra cada estilo con el panel donde se usa.
- Las etiquetas de las tablas, los pies de los paneles y el "CLI" del logo usan el color por defecto de la terminal en lugar de blanco fijo, que casi no se leía en terminales con fondo claro.
- Los títulos de los paneles de JSON, respuesta bruta y eventos pasan de celeste a gris, para que no compitan con los paneles informativos.
- Los errores muestran **Detalles** en cian y **Sugerencia** en amarillo, como dice la paleta. Antes estaban al revés. El panel "Sugerencias" de la respuesta también pasa a amarillo.
- `arcli` sin argumentos en una terminal interactiva abre el asistente en lugar de la ayuda. Sin terminal (pipes, CI, agentes) o con `--json` sigue mostrando la ayuda. `arcli ayuda` y `arcli --ayuda` no cambian.

### Corregido

- Los títulos de los paneles ignoraban el color pedido desde la primera versión. Ahora el comprobante sale verde si fue aprobado, amarillo si quedó observado y rojo si fue rechazado; los errores, en rojo.
- El texto atenuado dejaba el atenuado prendido y apagaba lo que se imprimía después: el comando del "Esto equivale a:" y el comienzo del panel siguiente hasta el título.
- En terminales angostas los paneles medían al menos 68 columnas y se rompían. Ahora se ajustan al ancho de la ventana: las filas etiqueta/valor parten el valor debajo de su columna y, si no hay lugar, apilan etiqueta y valor. El logo se reemplaza por el nombre si no entra.
- El README decía que alcanzaba con Node.js 20. El mínimo es Node.js 22.22.1, como pide `engines`.

### Dependencias

- `boxen` 8 → 9, `zod` 4.4 → 4.6 y `@inquirer/select` 5.2.2 → 5.2.5. No cambia la salida de la terminal.
- Herramientas de desarrollo: `vitest` y `@vitest/coverage-v8` 4 → 5 (ahora requieren `vite` como dependencia explícita), `eslint`, `typescript-eslint`, `prettier`, `lint-staged` y `tsx`.
- Se mantienen `typescript` 6, porque `typescript-eslint` todavía no soporta TypeScript 7, y `@types/node` 22, para no usar APIs que no existen en Node 22, la versión mínima soportada.

## [1.2.0] - 2026-10-02

Esta versión revisa el payload que ARCLI envía a ARCA contra el manual de WSFEv1 y corrige los casos en que ARCA rechazaba el comprobante. Además completa el soporte de Factura de Crédito Electrónica (FCE) y suma alícuotas, importes exentos y no gravados, y período asociado.

### ⚠️ Puede afectar comandos o scripts existentes

Ninguno de estos cambios quita flags. Todos convierten en un error local, con el motivo en castellano, algo que antes llegaba a ARCA y ARCA rechazaba:

- **Moneda extranjera sin cotización:** `--moneda USD` sin `--cotizacion-moneda` da error. Antes se enviaba cotización `1`. En pesos, una cotización distinta de `1` también da error.
- **IVA receptor según la letra:** `fa` con `--ir-cf`, o `fb` con `--ir-ri`, da error y sugiere la letra correcta. Se usa la tabla de `FEParamGetCondicionIvaReceptor`.
- **Consumidor final desde $10.000.000:** `--consumidor-final` da error desde ese monto (RG 5700/2025). Hay que identificar al receptor con `--dni`, `--cuit` o `--cuil`.
- **Fecha del comprobante:** `--fecha` fuera de la ventana de ARCA da error. La ventana es ±5 días en productos, ±10 en servicios y de −5 a +1 en FCE. En productos y FCE, una fecha futura tiene que caer en el mes actual.
- **FCE:** las facturas FCE sin CBU, y las NC/ND FCE sin `--afecha`, dan error.
- **Flags de FCE fuera de FCE:** `--cbu`, `--alias`, `--transferencia` y `--anulacion` dan error en comprobantes que no son FCE.
- **Salida JSON:** la salida de facturación suma el campo `avisos` (siempre presente, vacío si no hay avisos).

### Agregado

- `--misma-moneda` para comprobantes en moneda extranjera que se cobran en esa moneda. Consulta la cotización oficial a ARCA y envía `CanMisMonExt = S`. Clave JSON: `mismaMoneda`.
- `--vencimiento <fecha>` (alias `--vto`) para separar el vencimiento de pago del período de servicio. Clave JSON: `vencimientoPago`.
- Soporte completo de FCE:
  - Facturas: `--cbu`, `--alias` y `--transferencia sca|adc`.
  - NC/ND: `--anulacion` y `--afecha`. El CUIT del asociado se toma del emisor.
  - Claves de config `cbu` y `aliasCbu`, aplicadas solo a facturas FCE.
  - Claves JSON `cbu`, `aliasCbu`, `transferencia`, `anulacion` y `comprobanteAsociado.fecha`.
- `--afecha` también disponible, opcional, en notas comunes.
- `--alicuota 0|2.5|5|10.5|21|27` para letras A y B, y la clave de config `alicuota` para fijarla por defecto. Clave JSON: `alicuotaIva`.
- `--exento <monto>` y `--nogravado <monto>`: reparten el total en importe exento (`ImpOpEx`) y no gravado (`ImpTotConc`). Claves JSON: `importeExento` e `importeNoGravado`.
- `--periodo-desde` / `--periodo-hasta` (alias `--pd` / `--ph`): período asociado en notas comunes, como alternativa a `--ac`. Clave JSON: `periodoAsociado`.
- Comando `arcli fce-obligado <cuit>`: consulta en ARCA (`wsfecred`) si un receptor está obligado a recibir FCE y desde qué monto.
- Clave de config `verificarFce` (opt-in): hace esa consulta en cada factura con CUIT y avisa si corresponde FCE en lugar de factura común, o al revés. No frena la emisión.
- La vista previa muestra CBU, transferencia, anulación, fecha y período asociado, alícuota, importe no gravado y avisos.
- Los errores de valores no soportados listan los valores válidos.

### Corregido

- Dólar se enviaba como `USD`; ahora se envía `DOL`, el código de ARCA.
- La factura A a un receptor que no era responsable inscripto salía sin IVA discriminado. Ahora A y B siempre discriminan IVA.
- Las facturas FCE de productos no enviaban `FchVtoPago`, y las NC/ND FCE lo enviaban cuando no correspondía.
- Un servicio facturado después de su fin enviaba un vencimiento de pago anterior a la fecha del comprobante. Ahora nunca es anterior.
- La fecha por defecto del comprobante se calculaba en UTC: después de las 21 hs en Argentina salía con el día siguiente.
- `arcli ejemplos` usaba fechas fijas que quedaban fuera de la ventana de ARCA. Ahora son relativas a hoy e incluyen los datos de FCE.
- Con `config cotizacion` configurada, las facturas en pesos ya no toman esa cotización.

### Dependencias

- `@arcasdk/core` 2.0.0 → 2.0.2. La 2.0.0 validaba el total sin sumar exento ni no gravado ([ralcorta/arcasdk#190](https://github.com/ralcorta/arcasdk/issues/190)). La 2.0.2 además expone `wsfecred` y tipa `PeriodoAsoc`.

### Documentación

- Secciones nuevas en reglas de validación: moneda y cotización, IVA receptor por letra, vencimiento de pago, fecha del comprobante, crédito electrónico (FCE) y régimen FCE del receptor.
- La guía de certificados explica cómo autorizar `wsfecred`.
- Se actualizaron la referencia del CLI, entrada y salida, configuración, patrones de uso (con uno de FCE), troubleshooting, glosario, checklist de testing y `llms.txt`.

## [1.1.0] - 2026-08-24

Primera versión publicada en npm.

- Facturas, notas de crédito y notas de débito A, B y C, comunes y de crédito electrónica, por shortcut (`fc`, `nca`…) o por familia y letra (`factura c`…).
- Configuración persistente (`arcli config`), revisión del entorno (`arcli config revisar`) y `testing` como entorno por defecto.
- Vista previa antes de emitir, carga desde JSON (`--cargar`, también por lotes) y salida humana, `--json` o `--bruto`.
- `arcli ejemplos` con comandos listos para copiar.
- `llms.txt`: referencia condensada para que un agente de IA con acceso a terminal ejecute el CLI.
- Publicación con npm Trusted Publishers (OIDC).

[Sin publicar]: https://github.com/LcsGrz/arcli/compare/v1.8.0...HEAD
[1.8.0]: https://github.com/LcsGrz/arcli/compare/v1.7.1...v1.8.0
[1.7.1]: https://github.com/LcsGrz/arcli/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/LcsGrz/arcli/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/LcsGrz/arcli/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/LcsGrz/arcli/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/LcsGrz/arcli/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/LcsGrz/arcli/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/LcsGrz/arcli/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/LcsGrz/arcli/releases/tag/v1.1.0
