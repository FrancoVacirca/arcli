[← Documentación](README.md)

# Arquitectura

Cómo está organizado el código de ARCLI y dónde tocar para extenderlo. Pensado para contributors; para usar el CLI no hace falta.

Stack: TypeScript estricto (ESM), Node.js, [commander](https://github.com/tj/commander.js), [zod](https://zod.dev), [`@arcasdk/core`](https://github.com/ralcorta/arcasdk) para hablar con ARCA, `conf` para la configuración persistente y `@inquirer` para el modo interactivo.

## Flujo de una emisión

```text
src/cli (commander)
  -> parseo de flags y carga del JSON (--cargar)
  -> src/modules/billing: mezcla flags > JSON > config > defaults, valida, arma la solicitud
  -> src/services/arca: gateway contra ARCA (solo con --emitir)
  -> src/modules/pdf + src/services/pdf: PDF opcional, después de emitir
  -> src/ui: presenters y componentes de terminal (o JSON)
```

El comportamiento visible de cada paso está en el [modelo mental](mental-model.md).

## Capas

| Carpeta                   | Responsabilidad                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/`                | Contrato del programa: registro de comandos (`program.ts`, `commands/`), ayuda en español y flags. Sin lógica de negocio.                                                                                                                                                                                                                 |
| `src/cli/interactive/`    | Modo interactivo: flujos con prompts (`invoice`, `note`, `repeat`, `history`, `status`, `config`, `pdf`, `update`), la barra con el estado de ARCA, el selector de comprobantes (`invoice-picker`) y los prompts compartidos (`prompts`: Esc para volver, espaciado). Arma la misma entrada que los flags y llama a los mismos servicios. |
| `src/modules/billing/`    | Negocio de comprobantes: esquemas, validaciones, importes e IVA, FCE, comprobantes asociados, lotes, serialización JSON y `BillingService`.                                                                                                                                                                                               |
| `src/modules/config/`     | Esquema de la config pública, almacenamiento (`conf`), parseo de valores y `config revisar`.                                                                                                                                                                                                                                              |
| `src/modules/pdf/`        | Mapeo puro de un comprobante emitido a los datos del PDF: emisor, nombre de archivo, decisión de generar o no, errores.                                                                                                                                                                                                                   |
| `src/modules/*`           | `parameters` (`estado`, `parametros`), `vouchers` (`ultimos`, `consultar`), `fce` (`fce-obligado`), `padron` (`padron` y el IVA receptor automático), `examples`, `interactive` (helpers del asistente), `update-check`, `storybook`.                                                                                                     |
| `src/services/arca/`      | Adaptadores sobre `@arcasdk/core`: contexto y credenciales, cliente, gateways de facturación, parámetros, historial y régimen FCE.                                                                                                                                                                                                        |
| `src/services/clipboard/` | Copiar al portapapeles con la herramienta del sistema (`pbcopy`, `clip`, `wl-copy`, `xclip`, `xsel`).                                                                                                                                                                                                                                     |
| `src/services/pdf/`       | Plugin de PDF: instalación, carga en tiempo de ejecución, búsqueda del navegador y render.                                                                                                                                                                                                                                                |
| `src/ui/`                 | Primitivas, componentes y presenters de terminal, tema y stream de salida.                                                                                                                                                                                                                                                                |
| `src/lib/`                | Utilidades puras: fechas argentinas, errores de la app, lectura de JSON, rutas enmascaradas, validación de PEM y certificados.                                                                                                                                                                                                            |

Reglas de dependencia:

- La lógica de negocio vive en `modules/`, nunca en `cli/`.
- Solo `services/` conoce `@arcasdk/core`.
- Fuera de `src/ui`, importá la UI desde `src/ui` o sus barrels públicos (`primitives`, `components`, `presenters`). Dentro de `src/ui`, usá imports directos entre archivos para evitar dependencias circulares.

## El plugin de PDF

`@arcasdk/pdf` renderiza con Puppeteer y descarga un navegador, así que **no es dependencia de ARCLI**. Se instala con `npm install --ignore-scripts` en `<carpeta de config>/plugins/pdf` y se carga con `createRequire` (`src/services/pdf/pdf-plugin.ts`). ARCLI fija una versión del plugin; si cambia, `arcli pdf` lo avisa. Comportamiento para usuarios: [PDF de comprobantes](pdf.md).

## Cómo extender

### Agregar un comprobante

Dentro del alcance del proyecto (A, B y C de factura, nota de crédito y débito, y sus versiones FCE):

1. Definilo en `src/modules/billing/voucher-kind-map.ts` (`VOUCHER_KIND_MAP`): tipo ARCA, familia, letra y si requiere comprobante asociado.
2. Los comandos se registran solos desde ese mapa (`registerBillingShortcutCommands` y `registerBillingFamilyCommands`).
3. Si cambia una regla de negocio, ajustala en `src/modules/billing/`.
4. Actualizá tests y docs ([cli-reference](cli-reference.md), [validation-rules](validation-rules.md)).

### Agregar una clave de configuración

1. Sumala a `configPublicKeySchema` y al esquema en `src/modules/config/config.schemas.ts`.
2. Mapeala en `ConfigService` (`config.service.ts`) y validala en `config-value-parser.ts`.
3. Ubicala en una sección y ponele nombre en `config.sections.ts`: de ahí salen el orden de `arcli config` y de "Modificar configuración" (un test exige que cada clave esté en una sola sección). Agregá cómo se muestra su valor en `config.presenter.ts`.
4. Documentala en [configuración](configuration.md) y, si el modo interactivo la expone, en `src/modules/interactive/config-fields.ts`.

### Cambiar el contrato

Comandos, flags, claves de config y JSON son contrato público. Antes de cambiarlos, mirá [CONTRIBUTING](../CONTRIBUTING.md#contrato-del-cli) y actualizá [entrada y salida](input-output.md) y los tests de serialización.

## Decisiones de diseño

- **CLI primero.** El flujo principal se piensa desde la terminal; el modo interactivo es una capa encima y no agrega comandos de emisión.
- **Una sola ruta de validación.** El asistente arma `BillingCommandInput` y pasa por `BillingService`, igual que los flags: mismas validaciones, vista previa y emisión.
- **Wizard, no pantalla completa.** Prompts encadenados con `@inquirer`.
- **`testing` por defecto.** Con la config por defecto, emitir en producción pide `--produccion` y además `--emitir` o confirmar en la terminal. Quien guarda `entorno produccion` y `emitir true` emite sin flags: es a propósito.
- **Todo visible.** Lo que ARCLI envía a ARCA se puede ver en la vista previa, en `--json` o en `--bruto`.
- **Lo escrito gana.** Cada dato se resuelve por nivel: el flag del comando, después el JSON de `--cargar` y por último la config. El primer nivel que dice algo decide; solo es error que un mismo nivel pida dos cosas opuestas (por ejemplo `--emitir --previsualizar`).
- **Formato argentino para montos escritos.** Flags, modo interactivo y config usan `src/lib/numbers/argentine-amount.ts`: punto para miles, coma para decimales. El JSON usa números.
- **Fecha argentina.** "Hoy" sale de `toArgentineCalendarDate` (`src/lib/dates/arca-date.ts`), con la zona `America/Argentina/Buenos_Aires`, sin importar la del equipo. Las cuentas de calendario se hacen en un solo sistema (UTC o local), nunca mezclando.
- **Ante la duda, no duplicar.** Si falla la llamada que emite, no se sabe si ARCA autorizó: `BillingService` lo informa como `EMISSION_UNCERTAIN` con el `arcli ultimos` para verificar, en vez de sugerir reintentar.
