[← Documentación](README.md)

# Modo interactivo

`arcli` sin argumentos abre un asistente que pregunta paso a paso qué querés emitir. Está pensado para quien factura de vez en cuando y no quiere recordar flags. Usa las mismas validaciones y la misma vista previa que el resto del CLI, y antes de emitir muestra el **comando equivalente**, así podés copiarlo y la próxima vez hacerlo directo.

```bash
arcli               # en una terminal interactiva abre el asistente
arcli interactivo   # lo mismo, explícito
```

## Cuándo se abre y cuándo no

| Situación                                              | Qué pasa                                                |
| ------------------------------------------------------ | ------------------------------------------------------- |
| `arcli` en una terminal (stdin y stdout son TTY)       | Se abre el asistente                                    |
| `arcli interactivo`                                    | Se abre el asistente; sin terminal interactiva da error |
| `arcli` sin terminal (pipe, CI, agente) o con `--json` | Muestra la ayuda, igual que antes                       |
| Cualquier comando con flags (`arcli fc -m 1000 …`)     | Sin cambios: el asistente nunca se mete en esos flujos  |

El modo interactivo no agrega comandos de emisión ni cambia flags, claves de config ni el JSON. Es una capa encima del CLI.

## Menú principal

1. **Emitir factura**
2. **Repetir una factura anterior**
3. **Emitir nota de crédito**
4. **Emitir nota de débito**
5. **Consultar comprobantes**
6. **Estado de ARCA**
7. **Configuración**
8. **Salir**

Si hay una versión nueva de ARCLI, el menú suma arriba de todo **Actualizar a la versión X.Y.Z** (ver [Actualizar](#actualizar)).

Debajo del logo va la versión de ARCLI. Arriba del menú, la barra de estado muestra a la izquierda quién emite (la razón social de `emisor.razonSocial` o, si no está, el CUIT) y el punto de venta, y a la derecha cómo está ARCA y el entorno (`TESTING` en naranja o `PRODUCCION` en celeste):

| Estado                 | Cuándo                                                                           |
| ---------------------- | -------------------------------------------------------------------------------- |
| **ARCA funcionando**   | Los servidores de facturación (app, base de datos y autenticación) responden OK  |
| **ARCA con demoras**   | Responden OK, pero tardaron más de 3 segundos                                    |
| **ARCA con problemas** | Alguno de los servidores no responde OK                                          |
| **ARCA sin respuesta** | Error de red, o ARCA no contestó en 5 segundos                                   |
| **ARCA sin verificar** | Falta completar la configuración o el certificado venció, así que no se consulta |

La consulta es la misma de `arcli estado` sin el punto de venta (no pide autenticación) y se hace al abrir el asistente. **Si falta algo obligatorio** (CUIT, certificado y clave de testing o punto de venta), al abrir el asistente propone hacer la [configuración guiada](#configuración).

**Certificado por vencer.** Si a alguno de los certificados configurados (de testing o de producción, sin importar el entorno activo) le quedan menos de 30 días, debajo de la barra va un recuadro amarillo, con una línea por certificado, la fecha, los días que faltan y el link a la [guía para renovarlo](obtencion-certificados.md). Queda arriba de todo lo que hagas en la sesión. Si alguno ya venció, el recuadro es rojo. Si es el del entorno activo, además la barra dice `certificado vencido` y `ARCA SIN VERIFICAR`, y emitir o consultar muestra el error `Certificado vencido` sin llegar a ARCA. La configuración sigue disponible para cargar el certificado nuevo.

## Actualizar

Al abrir el asistente se consulta npm por una versión nueva (no aparece con `CI` ni `NO_UPDATE_NOTIFIER`). Si hay, **Actualizar a la versión X.Y.Z** es la primera opción del menú, en naranja. Adentro muestra tu versión, la nueva y las novedades de cada versión intermedia (de las 3 más nuevas, sacadas del [CHANGELOG](../CHANGELOG.md)), y el comando para actualizar.

- **Cerrar para actualizar**: copia `npm install -g arcli@latest` al portapapeles y cierra el asistente, para que lo pegues y lo ejecutes. ARCLI no se actualiza solo porque no puede reemplazarse mientras corre, y porque no sabe si lo instalaste con npm, yarn o pnpm. Si no puede copiar (en Linux usa `wl-copy`, `xclip` o `xsel`), muestra el comando para escribirlo.
- **Volver atrás**: vuelve al menú.

Con el asistente, el aviso de nueva versión no se repite al salir. En los comandos con flags sigue apareciendo al final, como antes.

## Emitir factura

Primero pregunta solo lo **requerido**:

| Paso | Pregunta         | Detalle                                                                                    |
| ---- | ---------------- | ------------------------------------------------------------------------------------------ |
| 1    | Comprobante      | Factura A, B o C, comunes o de crédito electrónica (FCE)                                   |
| 2    | Receptor         | Consumidor final, CUIT o DNI. En la A solo CUIT, porque la A no admite consumidor final    |
| 3    | IVA del receptor | Solo las condiciones válidas para la letra elegida. Con consumidor final no se pregunta    |
| 4    | Concepto         | Servicios, productos o ambos. Arranca en `config.concepto` si está configurado             |
| 5    | Monto total      | Acepta `150000`, `150.000`, `1500,50` o `1.500,50` (punto para miles, coma para decimales) |
| 6    | CBU              | Solo en facturas FCE y si no hay `config.cbu`                                              |

Después, **una sola pregunta con todos los opcionales** (ver abajo). Enter sin marcar nada sigue con los valores por defecto.

Después muestra la vista previa (la misma de `--previsualizar`), el comando equivalente y pregunta si emitir. En **producción** pide una segunda confirmación.

### PDF

Después de emitir, si `config.pdf` es `preguntar` (el valor por defecto), pregunta **"¿Generamos el PDF del comprobante?"**. Con `siempre` lo genera sin preguntar y con `nunca` no pregunta nada. Lo mismo vale para las notas de crédito y débito.

Si respondés que sí, pregunta tres datos opcionales que solo van en el PDF (Enter para omitirlos): la descripción, el nombre y el domicilio del receptor. Si faltan datos del emisor (razón social, domicilio, inicio de actividades), los pregunta una vez y ofrece guardarlos en la config. Si falta el plugin, ofrece instalarlo. Ver [PDF de comprobantes](pdf.md).

El comando equivalente se muestra antes de emitir, así que no incluye los flags del PDF. Siempre lleva el entorno (`--testing` o `--produccion`): si después cambiás el entorno en la config, el comando pegado sigue emitiendo donde lo armaste.

### Opcionales

Antes de la vista previa aparece **"¿Agregamos algún opcional?"**: una lista donde marcás con **espacio** lo que querés cambiar y confirmás con **Enter**. Cada opción muestra el valor que se va a usar si no la marcás. Después pregunta solo lo que marcaste, en orden.

| Opción                      | Qué pregunta                                                                                                                   | Cuándo aparece                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| Alícuota de IVA             | La alícuota. Por defecto `config.alicuota` o 21%                                                                               | A y B                               |
| Moneda extranjera           | Pesos o dólares. En dólares, si te pagan en pesos (ingresás la cotización) o en dólares (se usa la cotización oficial de ARCA) | Siempre                             |
| Importe exento o no gravado | La parte exenta y la no gravada del monto total                                                                                | A y B                               |
| Período del servicio        | Desde y hasta                                                                                                                  | Si el concepto no es solo productos |
| Vencimiento del pago        | La fecha                                                                                                                       | En servicios y en facturas FCE      |
| Modalidad de transferencia  | SCA (por defecto) o ADC                                                                                                        | Facturas FCE                        |

"Volver" en una de esas preguntas vuelve a la lista, con lo marcado y lo ya respondido. "← Volver" en la lista vuelve al monto.

Lo que no se elige usa los valores por defecto, igual que el CLI sin esos flags.

## Nota de crédito o débito

Se elige desde el menú: **Emitir nota de crédito** (descuento, devolución o anulación) o **Emitir nota de débito** (cargo adicional). Las dos siguen los mismos pasos.

| Paso | Pregunta                    | Detalle                                                                                                                                                                                                                                                                                                                                                                                    |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Tipo de la factura original | Factura A, B o C, comunes o FCE                                                                                                                                                                                                                                                                                                                                                            |
| 2    | Factura o período           | En notas comunes, se elige si asociarla a una factura o a un período (desde y hasta). Con período, se pregunta además el receptor y el concepto. Las notas FCE siempre van sobre una factura                                                                                                                                                                                               |
| 3    | Factura                     | Lista las últimas 15 facturas de ese tipo emitidas en el punto de venta configurado (la cantidad se cambia con `config.comprobantesPorLista`), consultadas a ARCA, con número, fecha, receptor, total y CAE. Abajo de la lista: **Cargar más…** trae las anteriores, e **Ingresar el número a mano…** pide punto de venta y número (sirve para una factura vieja o de otro punto de venta) |
| 4    | Monto                       | En crédito: anular el total o ingresar un monto parcial (no puede superar el total de la factura). En débito: el monto a sumar                                                                                                                                                                                                                                                             |
| 5    | IVA del receptor            | Solo si la factura no era a consumidor final: ARCA no devuelve la condición IVA, así que se pregunta, filtrada por la letra                                                                                                                                                                                                                                                                |
| 6    | Anulación                   | Solo en NC/ND FCE: si la factura fue rechazada por el comprador                                                                                                                                                                                                                                                                                                                            |

La nota hereda de la factura el concepto, el receptor (tipo y número de documento), la fecha y la alícuota de IVA cuando se puede deducir de los importes. El comprobante asociado se completa solo: tipo, punto de venta (el de la factura, aunque sea otro que el configurado), número, CUIT del emisor y fecha.

## Repetir una factura anterior

Para quien factura lo mismo seguido. Elegís el tipo de factura y una de las últimas 15 emitidas, y se copian el receptor, el concepto, el monto y la alícuota (cuando se puede deducir de los importes). **Las fechas no se copian:** la factura sale con fecha de hoy.

| Paso | Pregunta             | Detalle                                                                                                                                                       |
| ---- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Tipo de factura      | Factura A, B o C, comunes o FCE                                                                                                                               |
| 2    | Factura              | Una de las últimas emitidas en el punto de venta configurado. Como en las notas, se pueden cargar más o ingresar el número a mano                             |
| 3    | IVA del receptor     | Solo si no era consumidor final: ARCA no devuelve la condición IVA de la factura                                                                              |
| 4    | Monto                | El mismo o uno nuevo                                                                                                                                          |
| 5    | Período del servicio | Este mes, el mes pasado, solo hoy u otro. No se pregunta si el concepto es solo productos                                                                     |
| 6    | CBU                  | Solo en FCE sin `config.cbu`                                                                                                                                  |
| 7    | Opcionales           | La misma selección múltiple de "Emitir factura". Si la original era en dólares, arranca con la moneda marcada, porque la cotización hay que volver a cargarla |

Después sigue igual que una factura nueva: vista previa, comando equivalente y confirmación.

## Consultar comprobantes

![Consultar comprobantes: lista, cargar más y detalle de una Factura C](assets/demo/consultar.gif)

Elegís el tipo (cualquiera de los 18) y aparece la lista de los últimos 15 emitidos en el punto de venta configurado, con el mismo formato que `arcli ultimos`: número, fecha, receptor, total y CAE. Igual que al elegir la factura de una nota, abajo están **Cargar más…** e **Ingresar el número a mano…** (punto de venta y número).

Al elegir uno se muestra lo mismo que `arcli consultar`: CAE, vencimiento, importes y receptor. Después vuelve a la lista, con lo que ya estaba cargado, para ver otro. **Esc** o **"← Volver"** sale al menú.

## Configuración

| Opción                  | Qué hace                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ver configuración       | Todos los datos guardados, igual que `arcli config`                                                                                                                                                                                                                                                                                                                          |
| Revisar configuración   | Lo mismo que `arcli config revisar`: defaults, credenciales y validación contra ARCA                                                                                                                                                                                                                                                                                         |
| Configuración guiada    | Pregunta CUIT, certificado y clave de testing, punto de venta, concepto e IVA del receptor por defecto, y si querés, los datos del emisor para el PDF. Propone lo que ya está guardado                                                                                                                                                                                       |
| Modificar configuración | Lista los datos con las mismas secciones y el mismo orden que `arcli config` (cuenta, certificados, al facturar, FCE, datos del emisor, PDF y salida), con el valor actual abajo del marcado. No incluye `emitir`, `json` ni `bruto`, que solo cambian el CLI con flags. Elegís uno y lo cambiás; en los de texto, `-` lo borra. Después vuelve a la lista, hasta "← Volver" |
| Plugin de PDF           | Estado del plugin; instalarlo, actualizarlo o desinstalarlo                                                                                                                                                                                                                                                                                                                  |

Cada respuesta se valida igual que en `arcli config establecer` y se guarda en el momento: si cortás a mitad, lo ya respondido queda guardado.

## Estado de ARCA

Muestra lo mismo que `arcli estado` (servidores, tiempo de respuesta y punto de venta) y la cotización oficial del dólar.

## Volver, cancelar y salir

- **Volver al paso anterior:** **Esc**, en las listas y en las preguntas de texto. En las listas también está la opción **"← Volver"**, y en las de texto escribir **`<`** hace lo mismo, por si la terminal no manda Esc. Si volvés desde la primera pregunta, volvés al menú. Al volver se descarta lo que respondiste después, así un cambio de camino (por ejemplo, de CUIT a consumidor final) no deja datos viejos.
- `Ctrl+C` durante una pregunta cancela el flujo actual y vuelve al menú. Nada se emite hasta confirmar en el último paso.
- **Esc** o `Ctrl+C` en el menú principal, o elegir **Salir**, cierra el asistente.

## Qué no hace (todavía)

- Varias alícuotas en un mismo comprobante: se resuelven con el comando equivalente y `--alicuota TASA:MONTO`.
- Facturas por lote: siguen siendo `--cargar` con un JSON.

## Ver también

- [Arquitectura](architecture.md#decisiones-de-diseño): por qué es un asistente y no una pantalla completa.
- [Referencia del CLI](cli-reference.md): los comandos equivalentes.
