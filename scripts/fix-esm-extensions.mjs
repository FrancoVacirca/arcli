import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const distPath = resolve(process.cwd(), 'dist');
const importExportPattern = /((?:^|\n)\s*(?:import|export)(?:\s+type)?\s+(?:[^'"]+?\s+from\s+)?)(['"])(\.\.?\/[^'"]+)\2/g;

function resolveSpecifier(fileDir, specifier) {
  const target = join(fileDir, specifier);

  if (existsSync(target) && statSync(target).isFile()) {
    return specifier;
  }

  if (existsSync(`${target}.js`)) {
    return `${specifier}.js`;
  }

  if (existsSync(target) && statSync(target).isDirectory() && existsSync(join(target, 'index.js'))) {
    return `${specifier}/index.js`;
  }

  throw new Error(`No se pudo resolver el import "${specifier}" en ${fileDir}`);
}

function fixFile(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const fileDir = dirname(filePath);

  const fixed = source.replace(
    importExportPattern,
    (match, prefix, quote, specifier) => `${prefix}${quote}${resolveSpecifier(fileDir, specifier)}${quote}`,
  );

  if (fixed !== source) {
    writeFileSync(filePath, fixed, 'utf8');
  }
}

function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.d.ts')) {
      fixFile(fullPath);
    }
  }
}

walk(distPath);
