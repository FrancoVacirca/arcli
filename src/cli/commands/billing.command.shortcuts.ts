import { InputValidationError } from '../../lib/errors/app-error';
import type { BillingCommandInput } from '../../modules/billing/billing.schemas';

export function resolveIvaShortcut(
  commandOptions: Record<string, unknown>,
): BillingCommandInput['ivaCondition'] | undefined {
  const shortcuts = [
    commandOptions.irCe ? 'cliente-del-exterior' : null,
    commandOptions.irCf ? 'consumidor-final' : null,
    commandOptions.irIl ? 'iva-liberado' : null,
    commandOptions.irIna ? 'iva-no-alcanzado' : null,
    commandOptions.irMs ? 'monotributista-social' : null,
    commandOptions.irMtip ? 'monotributo-trabajador-independiente-promovido' : null,
    commandOptions.irPe ? 'proveedor-del-exterior' : null,
    commandOptions.irRi ? 'responsable-inscripto' : null,
    commandOptions.irRm ? 'responsable-monotributo' : null,
    commandOptions.irSe ? 'sujeto-exento' : null,
    commandOptions.irSnc ? 'sujeto-no-categorizado' : null,
  ].filter(Boolean) as BillingCommandInput['ivaCondition'][];

  if (shortcuts.length > 1) {
    throw new InputValidationError('Usá solo un flag de IVA receptor entre las opciones --ir-*.');
  }

  return shortcuts[0];
}

export function resolveDocumentIdentity(commandOptions: Record<string, unknown>): {
  readonly documentNumber?: number;
  readonly documentType?: BillingCommandInput['documentType'];
} {
  const candidates = [
    typeof commandOptions.cuit === 'number'
      ? { documentNumber: commandOptions.cuit, documentType: 'cuit' as const }
      : null,
    typeof commandOptions.cuil === 'number'
      ? { documentNumber: commandOptions.cuil, documentType: 'cuil' as const }
      : null,
    typeof commandOptions.dni === 'number'
      ? { documentNumber: commandOptions.dni, documentType: 'dni' as const }
      : null,
    commandOptions.cfinal || commandOptions.consumidorFinal
      ? { documentNumber: 0, documentType: 'consumidor-final' as const }
      : null,
  ].filter(Boolean) as Array<{
    readonly documentNumber: number;
    readonly documentType: BillingCommandInput['documentType'];
  }>;

  if (candidates.length > 1) {
    throw new InputValidationError(
      'Usá solo una identidad de receptor: --cuit, --cuil, --dni, --consumidor-final o --cfinal.',
    );
  }

  return candidates[0] ?? {};
}

export function resolveConceptShortcut(
  commandOptions: Record<string, unknown>,
): BillingCommandInput['concept'] | undefined {
  const shortcutConcepts = [
    commandOptions.cs ? 'servicios' : null,
    commandOptions.cp ? 'productos' : null,
    commandOptions.csp ? 'productos-servicios' : null,
  ].filter(Boolean) as BillingCommandInput['concept'][];

  if (shortcutConcepts.length > 1) {
    throw new InputValidationError('Usá solo un flag de concepto entre --cs, --cp o --csp.');
  }

  return shortcutConcepts[0];
}
