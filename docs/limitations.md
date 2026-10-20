[← Documentación](README.md)

# Limitaciones actuales

Limitaciones y decisiones de diseño que hoy forman parte del comportamiento real del proyecto.

## Limitaciones funcionales

### Lotes sin emisión parcial controlada

Un lote se valida entero antes de emitir, pero si la emisión se corta a mitad (red, ARCA) los comprobantes ya emitidos quedan emitidos: no hay "deshacer". ARCLI los muestra antes del error para que no se carguen dos veces. Ver [input-output.md](input-output.md#validación-y-errores-del-lote).

### Salida humana no estable

La salida humana es para terminal y puede cambiar. Para integraciones usá `--json` (o `--json --bruto`).

### Dependencia de ARCA y WSAA

Hay errores que no dependen de la solicitud sino del entorno remoto, por ejemplo:

- `coe.alreadyAuthenticated`
- `Transacción Activa`

ARCLI los trata mejor en la salida, pero no los elimina.

### PDF solo al emitir

El PDF se genera en el momento de emitir. Todavía no se puede regenerar el de un comprobante ya emitido: la consulta de ARCA que usa el SDK (`FECompConsultar`) no devuelve el detalle de IVA, los comprobantes asociados ni las fechas de servicio. Tampoco hay ítems detallados: el PDF lleva un renglón por alícuota con la descripción que pases. Ver [PDF de comprobantes](pdf.md#qué-no-hace-todavía).

## Decisiones de diseño

### `testing` por defecto

Se eligió `testing` como entorno por defecto para reducir errores accidentales.

### IVA automático y tributos

En letras `A` y `B` el CLI calcula el IVA a partir del total, con una o varias alícuotas, y admite importes exentos y no gravados. Ver [IVA automático](validation-rules.md#iva-automático).

Todavía no se soportan los tributos (`Tributos` / `ImpTrib`), como las percepciones de IIBB.

## Inconsistencias o bordes ya detectados

### Observaciones de padrón

Algunos CUITes de testing aprueban y devuelven observaciones como:

- `10217`
- `10017`

No siempre indican un error del CLI.

### Casos sensibles al paralelismo

En pruebas reales apareció el error `10016` cuando se forzaron varias emisiones `A` en paralelo. Probando de forma serial, el caso volvió a aprobar.

### `respuesta` cambia según el modo

Con `--bruto` se agrega `respuesta` al resumen de siempre (no reemplaza ningún campo):

- si hubo emisión real, `respuesta` contiene la respuesta cruda del SDK
- si no hubo emisión, `respuesta` pasa a ser un objeto con `mensaje`

Eso está documentado, pero conviene tenerlo presente si alguien consume JSON desde scripts.
