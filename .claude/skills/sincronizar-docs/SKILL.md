---
name: sincronizar-docs
description: Pone las docs de arcli al día con un cambio del CLI. Usala después de cambiar comandos, flags, claves de config, JSON de entrada o salida, validaciones, mensajes de error o el modo interactivo, cuando el hook Stop lo recuerde, o antes de abrir un PR con esos cambios.
---

# Sincronizar docs

Qué doc cubre qué está en la tabla de [CONTRIBUTING.md](../../../CONTRIBUTING.md#documentación). Esa tabla es la fuente: leela antes de empezar.

## 1. Qué cambió para quien usa el CLI

`git diff main...HEAD --stat` más `git status --short`; si te piden documentar un commit o rango puntual, `git show <commit> -- src` en su lugar. Para cada archivo de `src/` cambiado, leé el diff y anotá cada **cambio visible**: un comando, flag, clave, campo de JSON, validación, mensaje o pantalla que antes no existía, cambió o ya no está. Un refactor sin cambio visible no se anota.

**Listo cuando:** tenés la lista de cambios visibles, o sabés que no hay ninguno y lo decís.

## 2. Actualizar cada doc

Por cada cambio visible, buscá en la tabla todas las filas que le tocan y editá sus docs. Seguí el estilo que ya tiene cada doc (tablas de flags en `cli-reference.md`, una línea por flag en `llms.txt`, ejemplos que se pueden copiar; un JSON de salida que solo da ARCA se arma desde el presenter, con valores de ejemplo). Un dato vive en un solo lugar: si un doc ya enlaza a otro para ese tema, actualizá el destino del enlace.

Si el cambio le afecta a quien usa el CLI, sumá una entrada en `## [Sin publicar]` de `CHANGELOG.md` con el mismo formato que las anteriores. Si saca o renombra un comando, flag, clave o campo de `--json`, o cambia lo que hace un comando que alguien ya usa (mismo comando, otro resultado), avisale a la persona antes de seguir, para que decida si es versión mayor.

**Listo cuando:** cada cambio visible tiene sus docs actualizados o una razón para no tocarlos.

## 3. Verificar

- `yarn vitest run src/cli/__tests__/docs-sync.test.ts`: cada comando, flag y clave aparece en sus docs y en `llms.txt`. Solo mira nombres: los campos de JSON y los códigos de error los verificás vos contra el diff.
- `yarn lint:prettier`; si falla por tablas desalineadas, `yarn lint:prettier:fix`.
- Si cambió la ayuda del CLI, `yarn dev <comando> --ayuda` muestra lo mismo que dicen las docs.

**Listo cuando:** las verificaciones pasan y le reportás a la persona qué docs cambiaste y cuáles de la tabla revisaste sin que hiciera falta tocarlos.
