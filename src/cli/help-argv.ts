/**
 * `arcli ayuda`, `arcli fc ayuda` y `arcli` solo. Sin argumentos, en una terminal interactiva se abre el
 * asistente; sin TTY sigue mostrando la ayuda.
 */
export function normalizeHelpArgv(argv: string[], interactive: boolean): string[] {
  const cliArgs = argv.slice(2);

  if (cliArgs.length === 0) {
    return interactive ? argv.concat('interactivo') : argv;
  }

  if (cliArgs[0] === 'ayuda') {
    const rest = cliArgs.slice(1);

    return argv.slice(0, 2).concat(rest.length > 0 ? [...rest, '--ayuda'] : ['--ayuda']);
  }

  // `--descripcion ayuda` es un valor, no un pedido de ayuda: solo cuenta si no viene despues de un flag.
  const previous = cliArgs[cliArgs.length - 2];

  if (cliArgs[cliArgs.length - 1] === 'ayuda' && !previous?.startsWith('-')) {
    return argv.slice(0, 2).concat([...cliArgs.slice(0, -1), '--ayuda']);
  }

  return argv;
}
