[← Documentación](README.md)

# Patrones de uso

Recetas para los flujos más comunes: qué necesitás, el comando y qué esperar. Las tablas completas de flags están en la [referencia del CLI](cli-reference.md); para errores, [Troubleshooting](troubleshooting.md). Todos los comandos sin `--emitir` solo previsualizan.

## Factura C simple

### Cuándo usarlo

Cuando querés emitir o previsualizar una factura básica para consumidor final.

### Requisitos

- `puntoVenta` resuelto por flag o config
- credenciales del entorno configuradas si vas a emitir

### Comando

```bash
arcli fc -m 15000 --cs --consumidor-final --ir-cf
```

### Resultado esperado

- vista previa de la solicitud, con estado `SIN EMITIR`
- agregá `--emitir` para emitir de verdad

### Errores comunes

- falta `--monto`
- falta `puntoVenta`
- `--consumidor-final` sin `--ir-cf`

## Factura usando config sin casi flags

### Cuándo usarlo

Cuando ya dejaste defaults guardados y querés un flujo más corto para uso diario.

### Requisitos

Tener configurado al menos:

- `puntoVenta`
- `concepto`
- `ivaReceptor`
- credenciales del entorno

### Comando

```bash
arcli config establecer puntoVenta 3
arcli config establecer concepto servicios
arcli config establecer ivaReceptor consumidor-final
arcli fc -m 15000 --consumidor-final
```

### Resultado esperado

- ARCLI completa el resto desde config
- el payload sale igual de explícito en la preview

### Errores comunes

- asumir que la config cubre todo cuando falta `cuit` o credenciales
- olvidar qué defaults quedaron guardados

## Factura A con CUIT

### Cuándo usarlo

Cuando el receptor está identificado por CUIT y la condición IVA corresponde a responsable inscripto.

### Requisitos

- CUIT receptor válido
- `--ir-ri`
- entorno configurado

### Comando

```bash
arcli fa -m 15000 --cs --cuit 20168598204 --ir-ri
```

### Resultado esperado

- payload con documento `cuit`
- cálculo automático de IVA
- preview o emisión según flags

### Errores comunes

- usar el mismo CUIT que el emisor
- omitir IVA receptor
- CUIT con longitud inválida

## Nota de crédito con comprobante asociado

### Cuándo usarlo

Cuando necesitás anular o ajustar una factura previa.

### Requisitos

- datos completos del asociado
- misma letra que la factura referenciada
- asociado del tipo factura, no otra nota

### Comando

```bash
arcli nca -m 5000 --cs --cuit 20168598204 --ir-ri \
  --ac fa \
  --apv 3 \
  --ar 120 \
  --acuit 20409509763
```

### Resultado esperado

- payload con `CbtesAsoc`
- validación previa del asociado
- emisión normal si agregás `--emitir`

### Errores comunes

- faltan `--apv`, `--ar` o `--acuit`
- usar `--ac` y `--at` juntos
- referenciar otra nota en lugar de una factura

## Factura de crédito electrónica (FCE)

### Cuándo usarlo

Cuando vendés a una empresa grande dentro del régimen FCE MiPyMEs y el comprobante tiene que ser de crédito electrónica.

### Requisitos

- CBU del emisor, por flag o configurado una vez
- receptor identificado con CUIT y IVA receptor válido para la letra

### Comando

```bash
arcli config establecer cbu 0110599520000012345678

arcli fcea -m 1500000 --cs --cuit 30709965812 --ir-ri \
  --vencimiento 30-10-2026 \
  --transferencia sca
```

Si después el comprador rechaza la factura, la nota de crédito de anulación es:

```bash
arcli ncea -m 1500000 --cs --cuit 30709965812 --ir-ri \
  --ac fcea --apv 3 --ar 15 --afecha 01-10-2026 \
  --anulacion
```

### Resultado esperado

- la factura lleva `Opcionales` con CBU (`2101`) y transferencia (`27`), además de `FchVtoPago`
- la nota lleva `Opcionales` con anulación (`22`) y `CbtesAsoc` con la fecha del asociado
- el CUIT del asociado se toma del emisor configurado

### Errores comunes

- falta el CBU en la factura
- falta `--afecha` en la nota
- pasar `--cbu` o `--transferencia` en una nota FCE: solo van en la factura

## Carga desde JSON

### Cuándo usarlo

Cuando ya tenés los datos preparados en un archivo o querés reutilizar payloads de prueba.

### Requisitos

- archivo JSON válido
- estructura compatible con el comando elegido

### Comando

```bash
arcli fc --cargar ./voucher.json
```

### Resultado esperado

- ARCLI mezcla flags, JSON y config usando esta prioridad:
  - flags
  - JSON
  - config
  - defaults internos

### Errores comunes

- nombres de campos incompatibles con el contrato JSON
- tipos inválidos
- lote con un item inválido que corta toda la ejecución

## Factura con PDF

### Cuándo usarlo

Cuando además de emitir querés el PDF con el QR de ARCA para mandarle al cliente.

### Requisitos

- datos del emisor en la config: `emisor.razonSocial`, `emisor.domicilio` y `emisor.inicioActividades`
- el plugin de PDF (`arcli pdf instalar`, o aceptar la descarga la primera vez en una terminal)

### Comando

```bash
arcli fc -m 150000 --cs --cfinal --emitir --exportar-pdf \
  --descripcion "Servicios de septiembre" --receptor-nombre "Cliente SA"
```

Si siempre querés el PDF, guardalo en la config y no hace falta el flag:

```bash
arcli config establecer pdf siempre
```

### Resultado esperado

- el comprobante emitido, con su CAE
- debajo, `PDF guardado en ~/arcli/comprobantes/20123456789/factura-c_0003-00000125.pdf` (una subcarpeta por CUIT; en testing, dentro de `testing/`)
- con `--json`, la clave `pdf` con la `ruta`

### Errores comunes

- faltan datos del emisor (`PDF_ISSUER_INCOMPLETE`): el comprobante se emite igual, sin PDF
- falta el plugin con `--json` o en un script (`PDF_PLUGIN_MISSING`): instalalo antes con `arcli pdf instalar`
- pasar `--descripcion` sin `--emitir`: en la vista previa no hay PDF

Detalle completo en [PDF de comprobantes](pdf.md).

## Batch con JSON

### Cuándo usarlo

Cuando querés procesar varios comprobantes del mismo comando en una sola corrida.

### Requisitos

- archivo con un array JSON (un array de un solo elemento también es un lote)
- cada item debe ser válido

### Comando

```bash
arcli fc --cargar ./voucher-batch.json --json --bruto
```

### Resultado esperado

- en texto: un bloque por item
- en JSON: un array de resultados con `indice`, `comprobante` y `atajo` (también con un solo elemento); con `--bruto`, cada uno suma `respuesta`

### Errores comunes

- un item inválido hace fallar el lote completo
- asumir que hay resultados parciales cuando la validación corta antes

## Caso de automatización

### Cuándo usarlo

Cuando querés consumir ARCLI desde un script o pipeline.

### Requisitos

- salida estructurada
- un formato fácil de parsear

### Comando

```bash
arcli fb -m 1 --cs --consumidor-final --ir-cf --emitir --json --bruto
```

### Ejemplo con `jq`

Cuando querés encadenar la salida con otros scripts, lo más práctico es combinar `--json` con `jq`:

```bash
arcli fb -m 1 --cs --consumidor-final --ir-cf --emitir --json \
  | jq '{estado, cae, comprobante, atajo, solicitud}'
```

### Resultado esperado

- JSON estable para scripts
- acceso directo a campos como `estado`, `cae`, `atajo` o `solicitud`

### Errores comunes

- intentar parsear la salida humana
- asumir que `--json` devuelve exactamente lo mismo que el modo texto

## Ver también

- [Modo interactivo](modo-interactivo.md): lo mismo, con preguntas en vez de flags.
- [Entrada y salida](input-output.md): formato del JSON y de los lotes.
- [Reglas de validación](validation-rules.md)
