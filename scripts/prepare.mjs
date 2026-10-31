// npm corre `prepare` (no `prepack`) cuando instala arcli desde git, por ejemplo con
// "arcli": "github:usuario/arcli#<commit>": sin este build, el paquete llegaría sin `dist/`.
// En un clon para desarrollar, además instala los hooks de husky, como antes.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const run = (args) => execFileSync(process.execPath, args, { stdio: 'inherit' });

if (existsSync('.git') && existsSync('node_modules/husky/bin.js')) {
  run(['node_modules/husky/bin.js']);
}

// npm_execpath es el gestor que corre este script (yarn o npm): así no hace falta tener yarn instalado.
run([process.env.npm_execpath, 'run', 'build']);
