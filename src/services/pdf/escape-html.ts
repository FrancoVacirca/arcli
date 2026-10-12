const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '"': '&quot;',
  '&': '&amp;',
  "'": '&#39;',
  '<': '&lt;',
  '>': '&gt;',
};

/**
 * La plantilla de `@arcasdk/pdf` compila con `noEscape: true` y Chromium la renderiza con JS: una razon social
 * con `<script>` se ejecutaria. Se escapan todos los textos antes de pasarlos; codigos, fechas y numeros no
 * tienen esos caracteres, asi que no cambian.
 */
export function escapeHtmlStrings<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(/[&<>"']/g, (char) => HTML_ENTITIES[char] ?? char) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => escapeHtmlStrings(item)) as T;
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, escapeHtmlStrings(item)])) as T;
  }

  return value;
}
