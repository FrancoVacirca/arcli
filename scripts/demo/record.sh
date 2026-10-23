#!/usr/bin/env bash
# Regenera los GIF y PNG del README en docs/assets/demo/.
#
# Requiere vhs y freeze (brew install vhs charmbracelet/tap/freeze) y una config con credenciales de testing:
#   ARCLI_DEMO_CONFIG=~/Library/Preferences/arcli/config.json scripts/demo/record.sh
#
# Sin argumentos graba todos los guiones de docs/assets/tapes/; para grabar solo algunos, pasalos:
#   ARCLI_DEMO_CONFIG=... scripts/demo/record.sh docs/assets/tapes/consultar.tape
#
# Usa un HOME temporal con una copia de esa config, asi la grabacion no muestra tus rutas ni toca tu config.
# Emite comprobantes reales en testing (homologacion), que no tienen validez fiscal.
set -euo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
config="${ARCLI_DEMO_CONFIG:?Indique la config con ARCLI_DEMO_CONFIG=/ruta/config.json}"
demo_home="$(mktemp -d)"
trap 'rm -rf "${demo_home:?}"' EXIT

# macOS guarda la config de arcli en ~/Library/Preferences/arcli; Linux en ~/.config/arcli.
for dir in "$demo_home/Library/Preferences/arcli" "$demo_home/.config/arcli"; do
  mkdir -p "$dir"
  node -e '
    const fs = require("fs");
    const [source, target, tickets] = process.argv.slice(1);
    const config = JSON.parse(fs.readFileSync(source, "utf8"));
    // Testing siempre, sin preguntar por el PDF, y reutilizando el ticket WSAA (rate limit).
    Object.assign(config, { entornoPorDefecto: "testing", pdf: "nunca", ticketPath: config.ticketPath ?? tickets });
    // Sin las credenciales de produccion: la demo no las usa, y si ese certificado esta por vencer su aviso
    // saldria en cada grabacion.
    delete config.cert?.produccion;
    delete config.key?.produccion;
    fs.writeFileSync(target, JSON.stringify(config, null, 2));
  ' "$config" "$dir/config.json" "$(dirname "$config")/tickets"
done

# Rutas absolutas antes del cd, asi los guiones pasados como argumento se pueden indicar desde cualquier carpeta.
tapes=()
for tape in "$@"; do
  tapes+=("$(cd "$(dirname "$tape")" && pwd)/$(basename "$tape")")
done

cd "$repo"
if [ "${#tapes[@]}" -eq 0 ]; then
  tapes=(docs/assets/tapes/*.tape)
fi
yarn -s build >/dev/null

export ARCLI_DEMO_HOME="$demo_home" ARCLI_REPO="$repo"

for tape in "${tapes[@]}"; do
  echo "Grabando $tape"
  vhs "$tape"
done

echo "Listo: docs/assets/demo/"
