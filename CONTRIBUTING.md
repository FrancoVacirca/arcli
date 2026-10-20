[← Volver al README](README.md)

# Contribuir a ARCLI

Gracias por querer mejorar ARCLI. Se aceptan bugs, mejoras de uso, documentación y features nuevas. Para estas últimas, o cualquier cambio grande, abrí primero un issue.

## Empezar

Requiere Node.js 22.22.1 o superior y Yarn. El setup, los scripts y los tests están en la [guía de desarrollo](docs/development.md); el mapa del código, en [Arquitectura](docs/architecture.md).

```bash
git clone https://github.com/LcsGrz/arcli.git
cd arcli
yarn install
yarn dev --ayuda
```

## Contrato del CLI

Los comandos, los flags, las claves de configuración y los formatos JSON son contrato público. No se cambian en silencio: primero se discute en un issue, y después se actualizan implementación, ayuda, tests y documentación. Si tocás alguno, avisalo en el PR.

El alcance de comprobantes es Factura, Nota de Crédito y Nota de Débito A, B y C, y sus versiones de Factura de Crédito Electrónica. Otros comprobantes quedan fuera salvo decisión explícita.

## Flujo

1. Creá una rama corta y descriptiva.
2. Hacé cambios chicos y fáciles de revisar.
3. Agregá o ajustá tests cuando cambie el comportamiento.
4. Actualizá la documentación que corresponda (ver abajo).
5. Abrí el PR con el checklist completo.

## Convenciones

- TypeScript estricto; la lógica de negocio va en `src/modules/`, no en `src/cli/`.
- Mensajes de error claros y en español.
- `testing` es el entorno por defecto.
- Nada de secretos: no subas certificados, claves, tokens ni configuraciones reales. Ver [SECURITY](SECURITY.md).

## Documentación

Actualizá la documentación que describe lo que cambiaste:

| Si cambia                                | Revisá                                                            |
| ---------------------------------------- | ----------------------------------------------------------------- |
| Comandos o flags                         | `README.md`, [referencia del CLI](docs/cli-reference.md), `llms.txt` |
| Claves de config o variables de entorno  | [configuración](docs/configuration.md)                            |
| JSON de entrada o salida, errores        | [entrada y salida](docs/input-output.md)                          |
| Validaciones                             | [reglas de validación](docs/validation-rules.md)                  |
| Flujos de uso o mensajes de error        | [patrones de uso](docs/usage-patterns.md), [troubleshooting](docs/troubleshooting.md) |
| Modo interactivo                         | [modo interactivo](docs/modo-interactivo.md)                      |
| Módulos, capas o gateways                | [arquitectura](docs/architecture.md)                              |
| Servicios de ARCA que hay que autorizar  | [obtención de certificados](docs/obtencion-certificados.md)       |

Un cambio suele caer en varias filas: un comando nuevo con `--json` es también JSON de salida y, si suma errores, mensajes de error.

Si el cambio le afecta a quien usa el CLI, sumá una entrada en "Sin publicar" de [CHANGELOG.md](CHANGELOG.md).

Un test (`docs-sync.test.ts`) falla si un comando, flag o clave de config falta en sus docs o en `llms.txt`. Con Claude Code, la skill `sincronizar-docs` recorre esta tabla por vos.

## Checklist del PR

- [ ] `yarn typecheck`
- [ ] `yarn lint`
- [ ] `yarn test`
- [ ] `yarn build` y `npm pack --dry-run` (`yarn open-source:check` corre typecheck, tests con cobertura, build y pack)
- [ ] Documentación y `CHANGELOG.md` al día
