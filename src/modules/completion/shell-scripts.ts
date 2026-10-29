export const COMPLETION_SHELLS = ['bash', 'zsh', 'fish'] as const;

export type CompletionShell = (typeof COMPLETION_SHELLS)[number];

/** Comando oculto que el script del shell llama en cada Tab. */
export const COMPLETE_COMMAND = '__completar';

/**
 * Scripts minimos: cada Tab le pregunta a `arcli __completar` que sigue, asi la lista sale siempre de la version
 * instalada. Sin candidatos, el shell completa rutas de archivo (para `--cargar` y las rutas de config).
 */
const SCRIPTS: Readonly<Record<CompletionShell, string>> = {
  bash: `# Autocompletado de arcli para bash. Activalo con: eval "$(arcli completado bash)"
_arcli_completar() {
  # Copiadas antes de cambiar IFS: bash 3.2 (el de macOS) junta "\${arr[@]:1:n}" en una palabra si IFS cambio.
  local palabras=("\${COMP_WORDS[@]:1:COMP_CWORD}")
  local IFS=$'\\n'
  COMPREPLY=($(arcli ${COMPLETE_COMMAND} -- "\${palabras[@]}" 2>/dev/null))
}
complete -o default -F _arcli_completar arcli
`,
  fish: `# Autocompletado de arcli para fish. Activalo con: arcli completado fish | source
function __arcli_completar
    set -l palabras (commandline -opc)[2..-1] (commandline -ct)
    set -l candidatos (arcli ${COMPLETE_COMMAND} -- $palabras 2>/dev/null)
    if test (count $candidatos) -gt 0
        printf '%s\\n' $candidatos
    else
        __fish_complete_path (commandline -ct)
    end
end
complete -c arcli -f -a '(__arcli_completar)'
`,
  zsh: `# Autocompletado de arcli para zsh. Activalo con: eval "$(arcli completado zsh)"
(( $+functions[compdef] )) || { autoload -Uz compinit && compinit; }
_arcli() {
  local -a candidatos
  candidatos=("\${(@f)$(arcli ${COMPLETE_COMMAND} -- "\${(@)words[2,CURRENT]}" 2>/dev/null)}")
  if (( \${#candidatos} )) && [[ -n "\${candidatos[1]}" ]]; then
    compadd -- "\${candidatos[@]}"
  else
    _files
  fi
}
compdef _arcli arcli
`,
};

export function buildCompletionScript(shell: CompletionShell): string {
  return SCRIPTS[shell];
}
