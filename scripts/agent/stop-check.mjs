#!/usr/bin/env node
// Hook Stop de Claude Code. Si src/ cambió desde la última verificación verde de la sesión, corre
// ESLint --fix y los tests relacionados sobre los archivos cambiados, y typecheck del proyecto.
// Si algo falla, sale con 2 y Claude sigue trabajando; nunca bloquea dos veces por el mismo diff.
// Detalle y cómo desactivarlo: docs/development.md#trabajar-con-agentes.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const MAX_LINES = 40;
const LINTABLE = /\.(?:[cm]?[jt]sx?|json)$/;
const TESTABLE = /\.(?:[cm]?[jt]sx?)$/;
const CONTRACT = /^src\/(?:cli|modules\/config)\/(?!(?:.*\/)?__tests__\/)/;
const DOCS = ['CHANGELOG.md', 'README.md', 'llms.txt', 'docs'];

const input = readInput();
const root = run('git', ['rev-parse', '--show-toplevel'], input.cwd ?? process.cwd()).stdout.trim();
if (!root) process.exit(0);

const changed = changedSourceFiles();
if (changed.length === 0) process.exit(0);

const stampPath = join(tmpdir(), `arcli-stop-check-${input.session_id ?? 'sin-sesion'}.json`);
const stamp = readJson(stampPath);
const before = fingerprint(changed);
if (stamp.green === before) process.exit(0);
if (stamp.failed === before) {
  // Ya se bloqueó una vez por este mismo diff: no insistir, avisarle a la persona.
  writeOutput({ systemMessage: 'La verificación de src/ sigue fallando con este diff (hook Stop).' });
  process.exit(0);
}

const existing = changed.filter((file) => existsSync(join(root, file)));
const lintable = existing.filter((file) => LINTABLE.test(file));
const testable = existing.filter((file) => TESTABLE.test(file));
const failures = [
  lintable.length > 0 && check('ESLint', 'eslint', ['--fix', ...lintable]),
  check('typecheck', 'tsc', ['--project', 'tsconfig.typecheck.json', '--pretty', 'false']),
  testable.length > 0 && check('tests relacionados', 'vitest', ['related', '--run', '--passWithNoTests', ...testable]),
].filter(Boolean);

// ESLint --fix puede haber reformateado: la huella que se guarda es la de después.
const after = fingerprint(changedSourceFiles());

if (failures.length > 0) {
  saveStamp({ ...stamp, failed: after });
  process.stderr.write(
    `Verificación de src/ fallida (hook Stop, scripts/agent/stop-check.mjs):\n\n${failures.join('\n\n')}\n`,
  );
  process.exit(2);
}

// El aviso de docs sale una sola vez por sesión: si el cambio era interno, no vuelve a molestar.
const remind = !stamp.reminded && needsDocsReminder(changed);
saveStamp({ ...stamp, green: after, reminded: stamp.reminded || remind });
if (remind) {
  writeOutput({
    hookSpecificOutput: {
      hookEventName: 'Stop',
      additionalContext:
        'Cambió src/cli o src/modules/config y en esta rama no se tocó ningún doc. Si el cambio afecta comandos, flags, ' +
        'claves de config, JSON, validaciones o mensajes, actualizá lo que pide la tabla de CONTRIBUTING.md#documentación ' +
        '(skill sincronizar-docs, si existe). Si es un cambio interno, decilo y seguí.',
    },
  });
}
process.exit(0);

function changedSourceFiles() {
  const tracked = lines(git('diff', '--name-only', 'HEAD', '--', 'src'));
  return [...new Set([...tracked, ...untracked('src')])].sort();
}

function fingerprint(files) {
  if (files.length === 0) return '';
  const hash = createHash('sha256').update(git('diff', 'HEAD', '--', 'src'));
  for (const file of untracked('src')) hash.update(file).update(readText(join(root, file)));
  return hash.digest('hex');
}

function needsDocsReminder(files) {
  if (!files.some((file) => CONTRACT.test(file))) return false;
  const base = git('merge-base', 'HEAD', 'origin/main').trim() || git('merge-base', 'HEAD', 'main').trim();
  if (!base) return false;
  return lines(git('diff', '--name-only', base, '--', ...DOCS)).length === 0 && untracked(...DOCS).length === 0;
}

function check(label, bin, args) {
  const result = run(join(root, 'node_modules', '.bin', bin), args, root);
  if (result.status === 0) return false;
  const output = `${result.stdout}${result.stderr}`.trim().split('\n');
  const shown = output.slice(0, MAX_LINES).join('\n');
  const rest = output.length > MAX_LINES ? `\n… ${output.length - MAX_LINES} líneas más` : '';
  return `## ${label}\n${shown || result.error?.message || 'falló sin salida'}${rest}`;
}

function untracked(...paths) {
  return lines(git('ls-files', '--others', '--exclude-standard', '--', ...paths));
}

function git(...args) {
  return run('git', args, root).stdout;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return { ...result, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function lines(text) {
  return text.split('\n').filter(Boolean);
}

function readInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function readText(path) {
  try {
    return readFileSync(path);
  } catch {
    return '';
  }
}

function saveStamp(value) {
  try {
    writeFileSync(stampPath, JSON.stringify(value));
  } catch {
    // Sin sello solo se pierde el atajo: la próxima vez se vuelve a verificar.
  }
}

function writeOutput(value) {
  process.stdout.write(JSON.stringify(value));
}
