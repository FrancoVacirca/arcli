import { type Command, Option } from 'commander';

import { EXCHANGE_RATE_DECIMALS } from '../../lib/numbers/argentine-amount';
import type { VoucherLetter } from '../../modules/billing/billing.types';
import { amountOption, cuitOption, documentNumberOption, integerOption } from '../option-parsers';

export function registerBillingOptions(command: Command): void {
  command
    .option(
      '-m, --monto <numero>',
      'importe total del comprobante, por ejemplo 15000 o 1.500,50',
      amountOption('--monto'),
    )
    .option(
      '--alicuota <tasa>',
      'alícuota de IVA para A y B: general (21), reducida (10.5), incrementada (27), cero (0), 5 o 2.5. Repetible como TASA:MONTO para varias alícuotas',
      (value: string, previous: string[] | undefined) => [...(previous ?? []), value],
    )
    .option('--exento <numero>', 'parte exenta del monto total (A y B)', amountOption('--exento'))
    // No puede llamarse --no-gravado: commander interpreta --no-* como negacion de un flag booleano.
    .option('--nogravado <numero>', 'parte no gravada del monto total (A y B)', amountOption('--nogravado'))
    .option('-d, --dia <numero>', 'día de vencimiento o referencia del servicio', integerOption('--dia'))
    .option('--punto-venta <numero>', 'punto de venta (alias: --pv)', integerOption('--punto-venta'))
    .option('--pv <numero>', 'alias de punto de venta', integerOption('--pv'))
    .option('--cargar <ruta>', 'cargar datos base desde un archivo JSON')
    .option('-f, --fecha <fecha>', 'fecha del comprobante; acepta D, D/M, D/M/YY o D/M/YYYY con - o /')
    .option('-c, --concepto <tipo>', 'productos, servicios o productos y servicios (alias: cs, cp, csp)')
    .option('--cs', 'usar concepto servicios')
    .option('--cp', 'usar concepto productos')
    .option('--csp', 'usar concepto productos y servicios')
    .option('--moneda <codigo>', 'código de moneda, por ejemplo ARS o USD (alias: --mda)')
    .option('--mda <codigo>', 'alias de moneda, por ejemplo ARS o USD')
    .option('--cm <numero>', 'alias de cotización de la moneda', amountOption('--cm', EXCHANGE_RATE_DECIMALS))
    .option(
      '--cotizacion-moneda <numero>',
      'cotización de la moneda, por ejemplo 1.452,50 (alias: --cm)',
      amountOption('--cotizacion-moneda', EXCHANGE_RATE_DECIMALS),
    )
    .option('--misma-moneda', 'el pago se cancela en la misma moneda extranjera; usa la cotización oficial de ARCA')
    .option('--cuit <numero>', 'usar CUIT del receptor', documentNumberOption('--cuit'))
    .option('--cuil <numero>', 'usar CUIL del receptor', documentNumberOption('--cuil'))
    .option('--dni <numero>', 'usar DNI del receptor', documentNumberOption('--dni'))
    .option('--consumidor-final', 'usar consumidor final con documento 0 (alias: --cfinal)')
    .option('--cfinal', 'alias de consumidor final con documento 0')
    .option(
      '--iva-receptor <tipo>',
      'condición IVA del receptor; con --cuit, sin este flag, se toma del padrón (alias: --ir)',
    )
    .option('--ir <tipo>', 'alias rápido de condición IVA del receptor')
    .option('--ir-ce', 'IVA receptor: cliente del exterior')
    .option('--ir-cf', 'IVA receptor: consumidor final')
    .option('--ir-il', 'IVA receptor: IVA liberado')
    .option('--ir-ina', 'IVA receptor: IVA no alcanzado')
    .option('--ir-ms', 'IVA receptor: monotributista social')
    .option('--ir-mtip', 'IVA receptor: monotributo trabajador independiente promovido')
    .option('--ir-pe', 'IVA receptor: proveedor del exterior')
    .option('--ir-ri', 'IVA receptor: responsable inscripto')
    .option('--ir-rm', 'IVA receptor: responsable monotributo')
    .option('--ir-se', 'IVA receptor: sujeto exento')
    .option('--ir-snc', 'IVA receptor: sujeto no categorizado')
    .option('--sd <fecha>', 'alias rápido de fecha de inicio de servicio')
    .option('--servicio-desde <fecha>', 'fecha de inicio de servicio (alias: --sd)')
    .option('--sh <fecha>', 'alias rápido de fecha de fin de servicio')
    .option('--servicio-hasta <fecha>', 'fecha de fin de servicio (alias: --sh)')
    .option('--vencimiento <fecha>', 'fecha de vencimiento del pago; por defecto el fin del servicio (alias: --vto)')
    .option('--vto <fecha>', 'alias de fecha de vencimiento del pago')
    .option('--at <numero>', 'tipo ARCA del comprobante asociado', integerOption('--at'))
    .option(
      '--apv <numero>',
      'punto de venta del comprobante asociado (alias: --asociado-punto-venta)',
      integerOption('--apv'),
    )
    .option(
      '--asociado-punto-venta <numero>',
      'punto de venta del comprobante asociado',
      integerOption('--asociado-punto-venta'),
    )
    .option('--ar <numero>', 'número del comprobante asociado', integerOption('--ar'))
    .option('--ac <atajo>', 'atajo del comprobante asociado, por ejemplo fc o fa')
    .option(
      '--acuit <numero>',
      'CUIT del comprobante asociado; en NC/ND FCE por defecto el CUIT emisor',
      cuitOption('--acuit'),
    )
    .option('--periodo-desde <fecha>', 'inicio del período asociado; alternativa a --ac en notas comunes (alias: --pd)')
    .option('--pd <fecha>', 'alias de inicio del período asociado')
    .option('--periodo-hasta <fecha>', 'fin del período asociado; alternativa a --ac en notas comunes (alias: --ph)')
    .option('--ph <fecha>', 'alias de fin del período asociado')
    .option('--afecha <fecha>', 'fecha del comprobante asociado; obligatoria en NC/ND FCE')
    .option('--cbu <cbu>', 'CBU del emisor para facturas FCE (22 digitos)')
    .option('--alias <alias>', 'alias del CBU del emisor para facturas FCE')
    .option('--transferencia <modalidad>', 'modalidad de transferencia FCE: sca o adc (por defecto sca)')
    .option('--anulacion', 'NC/ND FCE de anulación (la factura asociada fue rechazada por el comprador)')
    .option('--exportar-pdf', 'generar el PDF del comprobante emitido, aunque la config diga otra cosa (alias: --pdf)')
    .option('--pdf', 'alias de --exportar-pdf')
    .option('--sin-pdf', 'no generar el PDF, aunque la config diga otra cosa')
    .option('--descripcion <texto>', 'detalle del comprobante en el PDF; por defecto "Según detalle"')
    .option('--receptor-nombre <texto>', 'nombre o razón social del receptor en el PDF')
    .option('--receptor-domicilio <texto>', 'domicilio del receptor en el PDF')
    .option('--previsualizar', 'mostrar el payload antes de emitir en ARCA')
    .addOption(new Option('--emitir', 'emitir realmente en ARCA'));
}

/** Alias de otra opcion: se mencionan en la descripcion de la principal y no ocupan un renglon propio. */
const ALIAS_FLAGS = new Set([
  '--asociado-punto-venta',
  '--cfinal',
  '--cm',
  '--ir',
  '--mda',
  '--pd',
  '--pdf',
  '--ph',
  '--pv',
  '--sd',
  '--sh',
  '--vto',
]);

/** Que comprobantes cubre un comando: un atajo es una letra; una familia, las tres. */
export interface BillingOptionScope {
  readonly isElectronicCredit: boolean;
  readonly isNote: boolean;
  readonly letters: readonly VoucherLetter[];
}

const OPTION_APPLIES: Readonly<Record<string, (scope: BillingOptionScope) => boolean>> = {
  '--alicuota': (scope) => scope.letters.some((letter) => letter !== 'c'),
  '--exento': (scope) => scope.letters.some((letter) => letter !== 'c'),
  '--nogravado': (scope) => scope.letters.some((letter) => letter !== 'c'),
  '--at': (scope) => scope.isNote,
  '--apv': (scope) => scope.isNote,
  '--ar': (scope) => scope.isNote,
  '--ac': (scope) => scope.isNote,
  '--acuit': (scope) => scope.isNote,
  '--afecha': (scope) => scope.isNote,
  '--periodo-desde': (scope) => scope.isNote && !scope.isElectronicCredit,
  '--periodo-hasta': (scope) => scope.isNote && !scope.isElectronicCredit,
  '--cbu': (scope) => scope.isElectronicCredit && !scope.isNote,
  '--alias': (scope) => scope.isElectronicCredit && !scope.isNote,
  '--transferencia': (scope) => scope.isElectronicCredit && !scope.isNote,
  '--anulacion': (scope) => scope.isElectronicCredit && scope.isNote,
};

/**
 * Saca de la ayuda los alias y lo que no aplica a estos comprobantes. Solo se ocultan: siguen aceptandose y,
 * si no aplican, la validacion de siempre explica por que.
 */
export function hideInapplicableBillingOptions(command: Command, scope: BillingOptionScope): void {
  for (const option of command.options) {
    const flag = option.long ?? '';
    const applies = OPTION_APPLIES[flag];

    if (ALIAS_FLAGS.has(flag) || (applies && !applies(scope))) {
      option.hideHelp();
    }
  }
}
