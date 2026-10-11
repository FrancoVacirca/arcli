[← Documentación](README.md)

# Modelo mental

Si algún término te resulta desconocido (CAE, WSAA, padrón, punto de venta...), el [Glosario](glossary.md) los explica en una página.

La forma más útil de pensar ARCLI es esta:

```text
Input -> Validación -> Solicitud -> ARCA -> Output
```

## Flujo completo

### 1. Input

Los datos pueden venir de:

- flags
- JSON con `--cargar`
- config persistente
- defaults internos

### 2. Validación

ARCLI valida primero lo que puede resolver localmente:

- combinaciones de flags
- tipos y formatos
- reglas básicas del comprobante

### 3. Solicitud

Si la entrada pasa validación, ARCLI arma la solicitud que va a usar con ARCA.

Esa solicitud es la que ves en:

- la preview humana
- `--json`
- `--bruto`

### 4. ARCA

Si usás `--emitir`, ARCLI llama a ARCA.

Si usás `--previsualizar`, no llama a ARCA: solo arma y muestra la solicitud. Sin ninguno de los dos flags, en una terminal muestra la vista previa y pregunta si emitir; con `--json` o sin terminal no emite.

### 5. Output

Después de la solicitud, ARCLI puede devolver tres tipos de salida:

- humana
- JSON
- `--bruto`

### 6. PDF (opcional)

Si el comprobante se emitió y tiene CAE, ARCLI puede generar su PDF con el QR de ARCA. Es un paso posterior a la emisión: si falla, el comprobante ya está emitido y no se deshace. Ver [PDF de comprobantes](pdf.md).

## Prioridad de datos

ARCLI resuelve así:

```text
flags > JSON > config > defaults
```

Si un flag está presente, pisa lo demás.

## Modos

ARCLI tiene dos formas de usarse:

- **Comandos con flags** (`arcli fc -m 1000 …`): el contrato público, pensado para scripts, agentes y uso frecuente.
- **Modo interactivo** (`arcli` sin argumentos): un asistente que pregunta paso a paso, arma la misma entrada que los flags y la pasa por las mismas validaciones. Ver [Modo interactivo](modo-interactivo.md).

Con flags, `--previsualizar` arma y muestra la solicitud sin llamar a ARCA, y `--emitir` emite de verdad. Son excluyentes. El entorno es el de la config (`testing` por defecto) salvo que pases `--testing` o `--produccion`.

## Formatos de salida

- **Humana** (por defecto): paneles para la terminal. No es un contrato estable.
- **`--json`**: resumen serializado, estable, para scripts.
- **`--bruto`**: agrega la respuesta cruda de ARCA para inspección técnica; sin emisión, `respuesta` trae un `mensaje`.

El detalle y la comparación entre modos están en [Entrada y salida](input-output.md#diferencias-entre-modos).

## ARCLI no reemplaza a ARCA

ARCLI ordena el flujo y valida lo que puede localmente, pero la decisión sobre un comprobante real es de ARCA. Un comprobante bien armado igual puede salir observado, rechazado o con un error transitorio. Ver [Troubleshooting](troubleshooting.md).
