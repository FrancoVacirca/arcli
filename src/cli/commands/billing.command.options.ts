import { type Command, Option } from 'commander';

import { EXCHANGE_RATE_DECIMALS } from '../../lib/numbers/argentine-amount';
import { amountOption, cuitOption, documentNumberOption, integerOption } from '../option-parsers';

export function registerBillingOptions(command: Command): void {
  command
    .option(
      '-m, --monto <number>',
      'importe total del comprobante, por ejemplo 15000 o 1.500,50',
      amountOption('--monto'),
    )
    .option(
      '--alicuota <tasa>',
      'alicuota de IVA para A y B: general (21), reducida (10.5), incrementada (27), cero (0), 5 o 2.5. Repetible como TASA:MONTO para varias alicuotas',
      (value: string, previous: string[] | undefined) => [...(previous ?? []), value],
    )
    .option('--exento <number>', 'parte exenta del monto total (A y B)', amountOption('--exento'))
    // No puede llamarse --no-gravado: commander interpreta --no-* como negacion de un flag booleano.
    .option('--nogravado <number>', 'parte no gravada del monto total (A y B)', amountOption('--nogravado'))
    .option('-d, --dia <number>', 'dia de vencimiento o referencia del servicio', integerOption('--dia'))
    .option('--punto-venta <number>', 'punto de venta', integerOption('--punto-venta'))
    .option('--pv <number>', 'alias de punto de venta', integerOption('--pv'))
    .option('--cargar <path>', 'cargar datos base desde un archivo JSON')
    .option('-f, --fecha <fecha>', 'fecha del comprobante; acepta D, D/M, D/M/YY o D/M/YYYY con - o /')
    .option('-c, --concepto <tipo>', 'productos, servicios o productos y servicios (alias: cs, cp, csp)')
    .option('--cs', 'usar concepto servicios')
    .option('--cp', 'usar concepto productos')
    .option('--csp', 'usar concepto productos y servicios')
    .option('--moneda <codigo>', 'codigo de moneda, por ejemplo ARS o USD')
    .option('--mda <codigo>', 'alias de moneda, por ejemplo ARS o USD')
    .option('--cm <number>', 'alias de cotizacion de la moneda', amountOption('--cm', EXCHANGE_RATE_DECIMALS))
    .option(
      '--cotizacion-moneda <number>',
      'cotizacion de la moneda, por ejemplo 1.452,50',
      amountOption('--cotizacion-moneda', EXCHANGE_RATE_DECIMALS),
    )
    .option('--misma-moneda', 'el pago se cancela en la misma moneda extranjera; usa la cotizacion oficial de ARCA')
    .option('--cuit <number>', 'usar CUIT del receptor', documentNumberOption('--cuit'))
    .option('--cuil <number>', 'usar CUIL del receptor', documentNumberOption('--cuil'))
    .option('--dni <number>', 'usar DNI del receptor', documentNumberOption('--dni'))
    .option('--consumidor-final', 'usar consumidor final con documento 0')
    .option('--cfinal', 'alias de consumidor final con documento 0')
    .option('--iva-receptor <tipo>', 'condicion IVA del receptor; con --cuit, sin este flag, se toma del padron')
    .option('--ir <tipo>', 'alias rapido de condicion IVA del receptor')
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
    .option('--sd <fecha>', 'alias rapido de fecha de inicio de servicio')
    .option('--servicio-desde <fecha>', 'fecha de inicio de servicio')
    .option('--sh <fecha>', 'alias rapido de fecha de fin de servicio')
    .option('--servicio-hasta <fecha>', 'fecha de fin de servicio')
    .option('--vencimiento <fecha>', 'fecha de vencimiento del pago; por defecto el fin del servicio')
    .option('--vto <fecha>', 'alias de fecha de vencimiento del pago')
    .option('--at <number>', 'tipo ARCA del comprobante asociado', integerOption('--at'))
    .option('--apv <number>', 'punto de venta del comprobante asociado', integerOption('--apv'))
    .option(
      '--asociado-punto-venta <number>',
      'punto de venta del comprobante asociado',
      integerOption('--asociado-punto-venta'),
    )
    .option('--ar <number>', 'numero del comprobante asociado', integerOption('--ar'))
    .option('--ac <shortcut>', 'atajo del comprobante asociado, por ejemplo fc o fa')
    .option(
      '--acuit <number>',
      'CUIT del comprobante asociado; en NC/ND FCE por defecto el CUIT emisor',
      cuitOption('--acuit'),
    )
    .option('--periodo-desde <fecha>', 'inicio del periodo asociado; alternativa a --ac en notas comunes')
    .option('--pd <fecha>', 'alias de inicio del periodo asociado')
    .option('--periodo-hasta <fecha>', 'fin del periodo asociado; alternativa a --ac en notas comunes')
    .option('--ph <fecha>', 'alias de fin del periodo asociado')
    .option('--afecha <fecha>', 'fecha del comprobante asociado; obligatoria en NC/ND FCE')
    .option('--cbu <cbu>', 'CBU del emisor para facturas FCE (22 digitos)')
    .option('--alias <alias>', 'alias del CBU del emisor para facturas FCE')
    .option('--transferencia <modalidad>', 'modalidad de transferencia FCE: sca o adc (por defecto sca)')
    .option('--anulacion', 'NC/ND FCE de anulacion (la factura asociada fue rechazada por el comprador)')
    .option('--exportar-pdf', 'generar el PDF del comprobante emitido, aunque la config diga otra cosa')
    .option('--pdf', 'alias de --exportar-pdf')
    .option('--sin-pdf', 'no generar el PDF, aunque la config diga otra cosa')
    .option('--descripcion <texto>', 'detalle del comprobante en el PDF; por defecto "Segun detalle"')
    .option('--receptor-nombre <texto>', 'nombre o razon social del receptor en el PDF')
    .option('--receptor-domicilio <texto>', 'domicilio del receptor en el PDF')
    .option('--previsualizar', 'mostrar el payload antes de emitir en ARCA')
    .addOption(new Option('--emitir', 'emitir realmente en ARCA'));
}
