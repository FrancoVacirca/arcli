import { contentPanel, renderObject } from '../../ui';

import { formatEnvironmentBanner, formatPayloadPreview, formatResultPanel, formatStatusBadge } from './billing.display';
import { formatRawBillingResponse } from './billing.serialize';
import type { BillingExecutionResult } from './billing.types.internal';

interface BillingTextOptions {
  readonly environment?: 'produccion' | 'testing';
  readonly previewShown?: boolean;
  readonly raw?: boolean;
}

function formatObservationList(observaciones: readonly string[]): string {
  return observaciones.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function formatWarningsPanel(result: BillingExecutionResult): string[] {
  const warnings = result.warnings ?? [];

  if (warnings.length === 0) {
    return [];
  }

  return [
    contentPanel('Avisos', warnings.map((item) => `• ${item}`).join('\n'), 'wide', 'warning', 'left', 'attention'),
  ];
}

export function formatBillingResultAsText(result: BillingExecutionResult, options: BillingTextOptions = {}): string {
  const environmentLines = [
    ...(options.previewShown ? [] : formatEnvironmentBanner(options.environment ?? result.environment)),
    ...(options.previewShown ? [] : formatWarningsPanel(result)),
  ];

  if (result.dryRun) {
    return [...environmentLines, formatPayloadPreview(result)].join('\n\n');
  }

  const lines = [...environmentLines];

  if (!options.previewShown) {
    lines.push(formatPayloadPreview(result));
  }

  lines.push(formatResultPanel(result, formatStatusBadge(result)));

  if (result.response.observaciones.length > 0) {
    lines.push(
      contentPanel(
        'Observaciones',
        formatObservationList(result.response.observaciones),
        'wide',
        'warning',
        'left',
        'attention',
      ),
    );
  }

  if (result.response.events.length > 0) {
    lines.push(contentPanel('Eventos', renderObject(result.response.events), 'wide', 'subtle', 'left', 'data'));
  }

  if (result.response.errors.length > 0) {
    lines.push(contentPanel('Errores', renderObject(result.response.errors), 'wide', 'danger', 'left', 'error'));
  }

  const suggestions = result.response.suggestions ?? [];

  if (suggestions.length > 0) {
    lines.push(
      contentPanel('Sugerencias', suggestions.map((item) => `• ${item}`).join('\n'), 'wide', 'warning', 'left', 'tip'),
    );
  }

  // `--bruto` agrega la respuesta cruda al final; el resumen se muestra igual.
  if (options.raw) {
    lines.push(
      contentPanel('Respuesta bruta', renderObject(formatRawBillingResponse(result)), 'wide', 'subtle', 'left', 'data'),
    );
  }

  return lines.join('\n\n');
}
