<p align="center">
  <img src="https://raw.githubusercontent.com/LcsGrz/arcli/main/docs/assets/imagenes/arcliChip.png" alt="ARCLI" width="560">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/arcli"><img src="https://img.shields.io/npm/v/arcli.svg" alt="npm version"></a>
  <a href="https://github.com/LcsGrz/arcli/actions/workflows/ci.yml"><img src="https://github.com/LcsGrz/arcli/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/LcsGrz/arcli/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/arcli.svg" alt="license: MIT"></a>
</p>

CLI para previsualizar y emitir comprobantes electrónicos de ARCA (ex AFIP) desde la terminal. Sin emitir hasta que lo pedís, con validaciones locales y salida lista para automatizar.

<p align="center"><img src="https://raw.githubusercontent.com/LcsGrz/arcli/main/docs/assets/demo/interactivo.gif" alt="Modo interactivo de arcli emitiendo una Factura C en testing" width="760"></p>

## Características

- **Modo interactivo:** `arcli` sin argumentos abre un asistente que guía la emisión, repite facturas anteriores, arma notas de crédito y débito, consulta comprobantes y configura el CLI. Cada paso muestra el comando equivalente.
- **Vista previa por defecto:** sin `--emitir`, muestra la solicitud y, en una terminal, pregunta antes de emitir.
- **Comprobantes:** Factura, Nota de Crédito y Nota de Débito A, B y C, y sus versiones de Factura de Crédito Electrónica (FCE), con CBU, transferencia, anulación y consulta del régimen del receptor.
- **Entrada y salida flexibles:** flags o JSON (incluso lotes); salida legible, `--json` o respuesta bruta de ARCA.
- **Validaciones locales** basadas en el manual de ARCA, para detectar errores antes de llamar al servicio.
- **Consultas sin emitir:** últimos comprobantes, detalle de uno, estado de los servidores, tablas de parámetros y cotización oficial.
- **PDF con el QR de ARCA** mediante un plugin que se descarga solo si lo usás.

## Instalación

Requiere Node.js 22.22.1 o superior.

```bash
npm install -g arcli
```

## Configuración

Necesitás tu CUIT, un punto de venta y un certificado con su clave privada de ARCA. Si todavía no los tenés, seguí [Cómo obtener los certificados](docs/obtencion-certificados.md).

Lo más simple es correr `arcli` y seguir la configuración guiada. Para hacerlo por comandos (por ejemplo, en un servidor):

```bash
arcli config establecer cuit 20168598204
arcli config establecer puntoVenta 3
arcli config establecer cert.testing /ruta/al/certificado.crt
arcli config establecer key.testing /ruta/a/la/clave.key
arcli config revisar
```

`arcli config revisar` verifica que el entorno activo esté listo para emitir. Todas las claves disponibles están en [Configuración](docs/configuration.md).

## Uso

```bash
arcli fc -m 15000 --cs --consumidor-final --ir-cf            # vista previa de una Factura C
arcli fc -m 15000 --cs --consumidor-final --ir-cf --emitir   # emitir
arcli fc --cargar ./facturas.json --emitir --json            # lote desde JSON, salida JSON
arcli fc -m 15000 --cs --consumidor-final --ir-cf --emitir --exportar-pdf
```

Otras consultas: `arcli ultimos`, `arcli consultar`, `arcli estado`, `arcli parametros`, `arcli fce-obligado`. Para ver todos los comprobantes y ejemplos: `arcli --ayuda` y `arcli ejemplos`.

<p align="center"><img src="https://raw.githubusercontent.com/LcsGrz/arcli/main/docs/assets/demo/comandos.gif" alt="Vista previa de una Factura C y emisión con salida JSON filtrada con jq" width="760"></p>

La prioridad de los valores es `flags > JSON > config > defaults`. Ver el [modelo mental](docs/mental-model.md) y la [referencia del CLI](docs/cli-reference.md).

### Testing y producción

Por defecto se usa el entorno `testing`, con `cert.testing` y `key.testing`. Para emitir en producción hay que configurar `cert.produccion` y `key.produccion` y pasar `--produccion` (o guardar `entorno produccion`). Con la config por defecto, además hace falta `--emitir` o confirmar la pregunta.

## Documentación

El índice completo está en [docs/](docs/README.md). Lo principal:

- [Modo interactivo](docs/modo-interactivo.md) y [Patrones de uso](docs/usage-patterns.md)
- [Referencia del CLI](docs/cli-reference.md) y [Configuración](docs/configuration.md)
- [Entrada y salida](docs/input-output.md): formato del JSON
- [PDF de comprobantes](docs/pdf.md)
- [Cómo obtener los certificados](docs/obtencion-certificados.md)
- [Troubleshooting](docs/troubleshooting.md), [Reglas de validación](docs/validation-rules.md) y [Limitaciones](docs/limitations.md)
- [llms.txt](llms.txt): referencia condensada para agentes de IA con acceso a terminal
- [Changelog](CHANGELOG.md)

## Desarrollo

```bash
git clone https://github.com/LcsGrz/arcli.git
cd arcli
yarn install
yarn dev --ayuda
```

Antes de abrir un PR: `yarn typecheck`, `yarn lint` y `yarn test`. Más en la [guía de desarrollo](docs/development.md) y la [arquitectura](docs/architecture.md).

## Contribuir

Leé [CONTRIBUTING.md](CONTRIBUTING.md). Para vulnerabilidades, ver [SECURITY.md](SECURITY.md); no subas certificados, claves ni tokens reales a issues ni PRs.

## Agradecimientos

- [`@arcasdk/core`](https://github.com/ralcorta/arcasdk) y [`@arcasdk/pdf`](https://www.afipts.com/packages/pdf), de [Rodrigo Alcorta](https://github.com/ralcorta).
- [Arpit Bhayani](https://github.com/arpitbbhayani), por ceder el nombre `arcli` en npm.

Si el proyecto te resulta útil, podés dejar una estrella o invitarme un [Cafecito](https://cafecito.app/lcsgrz).

## Licencia

MIT © [LcsGrz](https://github.com/LcsGrz). Ver [LICENSE](LICENSE).
