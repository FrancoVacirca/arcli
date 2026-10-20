# AGENTS.md

Instrucciones para agentes que modifican el código de este repo. Para usar el CLI desde un agente, ver [llms.txt](llms.txt).

## Proyecto

`arcli` es un CLI de TypeScript (ESM, Node.js) para previsualizar y emitir comprobantes ARCA, publicado en npm. Usa `@arcasdk/core` para hablar con ARCA. Tiene dos formas de uso: comandos con flags y un modo interactivo (`arcli` sin argumentos).

Alcance de comprobantes (no ampliar sin pedido explícito): Factura, Nota de Crédito y Nota de Débito A, B y C, y sus versiones de Factura de Crédito Electrónica (FCE).

## Mapa del código

- `src/cli/`: registro de comandos, ayuda y modo interactivo (`interactive/`). Sin lógica de negocio.
- `src/modules/`: lógica por dominio (`billing`, `config`, `pdf`, `parameters`, `vouchers`, `fce`, etc.).
- `src/services/`: adaptadores sobre `@arcasdk/core` (`arca/`) y el plugin de PDF (`pdf/`).
- `src/ui/`: primitivas, componentes y presenters de terminal.
- `src/lib/`: utilidades puras.
- Tests colocados en `src/**/__tests__/`.

Detalle de capas y cómo extender: [docs/architecture.md](docs/architecture.md).

Imports de UI: fuera de `src/ui`, usá los barrels públicos (`src/ui`, `src/ui/primitives`, `src/ui/components`, `src/ui/presenters`). Dentro de `src/ui`, imports directos entre archivos.

## Comandos

Gestor de paquetes: `yarn` (no mezclar lockfiles).

- `yarn install`
- `yarn dev --ayuda`: correr el CLI desde `src/`
- `yarn typecheck`, `yarn lint`, `yarn test`
- `yarn open-source:check`: typecheck, tests con cobertura, build y `npm pack --dry-run`

Antes de dar por terminado un cambio significativo: `yarn typecheck`, `yarn lint` y `yarn test`. En Claude Code, un hook al terminar cada respuesta ya corre typecheck, ESLint y los tests relacionados si cambió `src/`, así que no hace falta correrlos a mano después de cada edición; la suite completa sí, antes de abrir un PR. Detalle en [docs/development.md](docs/development.md#trabajar-con-agentes).

- Editá archivos con la herramienta de edición del agente. `sed` o scripts solo para reemplazos mecánicos en muchos archivos: fallan sin aviso y no se ven en el diff hasta el final.
- Para esperar el CI de un PR, `gh pr checks <N> --watch` en segundo plano, no `sleep` en loop.

## Convenciones de código

- TypeScript estricto; validar explícitamente toda entrada del usuario.
- Mantener el parseo de la CLI separado de las llamadas a ARCA y de las reglas de negocio.
- Preferir funciones puras en `lib` y `modules`.
- Modelar tipos de comprobante y flags con constantes tipadas o uniones discriminadas, no con números mágicos.
- No hardcodear CUITs, certificados, rutas de tickets, puntos de venta ni defaults de comprobantes en módulos reutilizables.
- Antes de agregar una dependencia, revisar si `@arcasdk/core` o el toolchain actual ya lo cubre.
- Cambios incrementales y enfocados; el CLI tiene que seguir corriendo después de cada paso.

## Contrato público

Comandos, flags, claves de config y formatos JSON son contrato público y no cambian en silencio.

- Si un cambio rompería la sintaxis del CLI, pausá y documentá el tradeoff antes de implementarlo.
- La salida humana no es contrato; `--json` sí.
- Los cambios de comportamiento actualizan la documentación correspondiente (ver la tabla en [CONTRIBUTING.md](CONTRIBUTING.md#documentación)) y, si afectan a quien usa el CLI, [CHANGELOG.md](CHANGELOG.md).
- Las decisiones de arquitectura se registran en [docs/architecture.md](docs/architecture.md).

## Seguridad

- No commitear certificados, claves privadas, tokens ni `.env`.
- Los secretos se resuelven desde rutas de archivo configuradas por el usuario, nunca desde el código.
- No loguear respuestas de ARCA ni rutas sensibles sin necesidad.
- `testing` es el entorno por defecto y `emitir` es `false`: sin `--emitir`, en una terminal se pregunta antes de emitir. Con `entorno produccion` y `emitir true` en la config se emite en producción sin flags; es a propósito, para usuarios que no quieren confirmar cada vez.

## Notas

- Si el usuario pide planificar primero, no implementes: alineá antes diseño de comandos, módulos y seguridad.
- Verificá la estructura real antes de asumir que una ruta existe.
