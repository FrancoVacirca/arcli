import type { VoucherLetter } from '../billing/billing.types';
import type { ArcliConfig } from '../config/config.schemas';

import { PdfError } from './pdf.errors';
import type { InvoicePdfIssuer } from './pdf.types';

const REQUIRED_ISSUER_KEYS = [
  ['razonSocial', 'emisor.razonSocial', '"Tu Nombre o Empresa"'],
  ['domicilio', 'emisor.domicilio', '"Calle 123, Ciudad"'],
  ['inicioActividades', 'emisor.inicioActividades', '1/03/2020'],
] as const;

/** "responsable-inscripto" -> "Responsable Inscripto". */
export function formatIvaConditionName(value: string): string {
  return value
    .split('-')
    .map((word) => (word === 'iva' ? 'IVA' : `${word.charAt(0).toUpperCase()}${word.slice(1)}`))
    .join(' ');
}

/** Claves obligatorias del emisor que faltan en la config, como se escriben en `arcli config establecer`. */
export function listMissingIssuerKeys(config: Pick<ArcliConfig, 'cuit' | 'emisor'>): string[] {
  const missing: string[] = REQUIRED_ISSUER_KEYS.filter(([field]) => !config.emisor[field]).map(([, key]) => key);

  return config.cuit ? missing : ['cuit', ...missing];
}

export function resolvePdfIssuer(
  config: Pick<ArcliConfig, 'cuit' | 'emisor'>,
  letter: VoucherLetter,
): InvoicePdfIssuer {
  const missing = listMissingIssuerKeys(config);
  const { emisor } = config;

  if (missing.length > 0 || !config.cuit || !emisor.razonSocial || !emisor.domicilio || !emisor.inicioActividades) {
    const commands = missing.map((key) => {
      const example = REQUIRED_ISSUER_KEYS.find(([, configKey]) => configKey === key)?.[2] ?? '<valor>';

      return `arcli config establecer ${key} ${example}`;
    });

    throw new PdfError('PDF_ISSUER_INCOMPLETE', `Faltan datos del emisor para el PDF: ${missing.join(', ')}.`, {
      details: { faltan: missing },
      suggestion: `Configuralos una vez con:\n${commands.join('\n')}`,
    });
  }

  // La letra alcanza para la condicion habitual: A y B las emite un responsable inscripto, C un monotributista.
  const condition = emisor.condicionIva ?? (letter === 'c' ? 'responsable-monotributo' : 'responsable-inscripto');

  return {
    condicionIva: formatIvaConditionName(condition),
    cuit: config.cuit,
    domicilioComercial: emisor.domicilio,
    fechaInicioActividades: emisor.inicioActividades,
    // Sin el dato no se afirma nada: "Exento" seria declarar una exencion que nadie informo.
    iibb: emisor.iibb ?? '-',
    razonSocial: emisor.razonSocial,
  };
}
