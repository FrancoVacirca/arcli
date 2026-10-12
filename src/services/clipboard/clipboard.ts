import { spawnSync } from 'node:child_process';

type ClipboardCommand = readonly [command: string, ...args: string[]];

/** Herramientas del sistema para copiar, en orden de preferencia. En Linux depende de lo que este instalado. */
function clipboardCommands(platform: NodeJS.Platform): readonly ClipboardCommand[] {
  if (platform === 'darwin') return [['pbcopy']];
  if (platform === 'win32') return [['clip']];

  return [['wl-copy'], ['xclip', '-selection', 'clipboard'], ['xsel', '--clipboard', '--input']];
}

/** Copia el texto al portapapeles. Devuelve `false` si ninguna herramienta funciono. */
export function copyToClipboard(text: string, platform: NodeJS.Platform = process.platform): boolean {
  return clipboardCommands(platform).some(([command, ...args]) => {
    const result = spawnSync(command, args, { input: text, stdio: ['pipe', 'ignore', 'ignore'], timeout: 2000 });

    return !result.error && result.status === 0;
  });
}
