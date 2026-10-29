import { Separator } from '@inquirer/select';

import { parseStrictInteger } from '../../lib/numbers/strict-integer';
import type { VoucherKindDefinition } from '../../modules/billing/billing.types';
import { BACK, type Back } from '../../modules/interactive/wizard';
import { type IssuedVoucher, listVouchersFrom, RECENT_VOUCHERS_LIMIT } from '../../modules/vouchers/voucher-history';
import { formatVoucherNumber, formatVoucherPickerRows } from '../../modules/vouchers/voucher-history.presenter';
import { colorize, noticePanel, statusBarWidth, writeTerminalOutput } from '../../ui';
import { startSpinner } from '../spinner';

import { askTextStep, type Choice, chooseStep, chooseStepWhileLoading, eraseLastAnswer, fitPageSize } from './prompts';
import type { InteractiveSession } from './session';

/** Comprobante elegido y el punto de venta donde se emitio (a mano puede ser otro que el configurado). */
export interface PickedInvoice {
  readonly invoice: IssuedVoucher;
  readonly pointOfSale: number;
}

interface PickInvoiceOptions {
  readonly message: string;
  /**
   * Modo explorar: en vez de devolver el elegido, lo pasa aca y vuelve a mostrar la lista sin perder lo cargado.
   * Solo se sale con "Volver".
   */
  readonly onPick?: (picked: PickedInvoice) => Promise<void> | void;
  readonly pointOfSale: number;
  readonly voucherKind: VoucherKindDefinition;
}

const LOAD_MORE = 'cargar-mas';
const BY_NUMBER = 'a-mano';

type PickerChoice = IssuedVoucher | typeof BY_NUMBER | typeof LOAD_MORE;

/** Separa las columnas de cada fila del listado. */
const COLUMN_SEPARATOR = ' · ';

/**
 * Linea punteada tenue que enmarca el listado, del mismo ancho que la barra de estado de ARCA.
 * @inquirer deja un espacio antes de cada separador; por eso se resta uno al ancho.
 */
function listRule(): Separator {
  return new Separator(colorize('┈'.repeat(statusBarWidth() - 1), 'muted'));
}

async function withSpinner<T>(text: string, run: () => Promise<T>): Promise<T> {
  const spinner = startSpinner(text);

  try {
    return await run();
  } finally {
    spinner?.stop();
  }
}

function validatePositiveInteger(label: string): (value: string) => string | true {
  return (value) => {
    const number = parseStrictInteger(value);

    return number !== undefined && number > 0 ? true : `${label} tiene que ser un número entero mayor a 0.`;
  };
}

/** Pide punto de venta y numero, y lo busca en ARCA. Volver o un comprobante inexistente vuelven a la lista. */
async function askVoucherByNumber(
  session: InteractiveSession,
  voucherKind: VoucherKindDefinition,
  defaultPointOfSale: number,
): Promise<Back | PickedInvoice> {
  const pointOfSaleAnswer = await askTextStep('Punto de venta:', {
    defaultValue: String(defaultPointOfSale),
    validate: validatePositiveInteger('El punto de venta'),
  });

  if (pointOfSaleAnswer === BACK) {
    return BACK;
  }

  const numberAnswer = await askTextStep('Número:', { validate: validatePositiveInteger('El número') });

  if (numberAnswer === BACK) {
    return BACK;
  }

  const pointOfSale = Number(pointOfSaleAnswer.trim());
  const number = Number(numberAnswer.trim());
  const invoice = await withSpinner('Buscando en ARCA...', () =>
    session.historyGateway.getVoucher(number, pointOfSale, voucherKind.arcaType),
  );

  if (!invoice) {
    writeTerminalOutput(
      noticePanel(`No existe la ${voucherKind.displayName} N° ${formatVoucherNumber(pointOfSale, number)}.`, 'warning'),
    );

    return BACK;
  }

  return { invoice, pointOfSale };
}

/**
 * Elegir un comprobante emitido: los ultimos del punto de venta configurado, con opciones para cargar mas
 * o ingresar el numero a mano (por ejemplo, uno viejo o de otro punto de venta).
 */
export async function pickInvoice(
  session: InteractiveSession,
  options: PickInvoiceOptions,
): Promise<Back | PickedInvoice> {
  const { message, onPick, pointOfSale, voucherKind } = options;
  const { historyGateway } = session;
  // Comprobantes por tanda: los primeros y cada "cargar mas".
  const pageSize = session.runtime.config.comprobantesPorLista ?? RECENT_VOUCHERS_LIMIT;
  const { invoices, lastNumber } = await withSpinner('Buscando en ARCA...', async () => {
    const last = await historyGateway.getLastNumber(pointOfSale, voucherKind.arcaType);

    return {
      invoices: await listVouchersFrom(historyGateway, pointOfSale, voucherKind.arcaType, last, { limit: pageSize }),
      lastNumber: last,
    };
  });
  // Proximo numero a consultar al cargar mas.
  let nextNumber = lastNumber - pageSize;
  let defaultChoice: PickerChoice | undefined;

  if (invoices.length === 0) {
    writeTerminalOutput(
      noticePanel(`No hay ${voucherKind.displayName} emitidas en el punto de venta ${pointOfSale}.`, 'warning'),
    );
  }

  // Tanda pedida a ARCA con "cargar mas" mientras la lista sigue en pantalla.
  let loading: Promise<IssuedVoucher[]> | undefined;

  for (;;) {
    const choices: Array<Choice<PickerChoice> | Separator> = [];

    // El listado y "cargar mas" van entre lineas punteadas; buscar a mano queda afuera.
    if (invoices.length > 0) {
      // Las filas llegan hasta el final de la linea punteada; el cursor "❯ " ocupa dos columnas.
      const rows = formatVoucherPickerRows(pointOfSale, invoices, COLUMN_SEPARATOR, statusBarWidth() - 2);

      choices.push(
        listRule(),
        ...invoices.map((item, index) => ({
          name: rows[index] ?? '',
          // Al elegirla queda solo el numero, no la fila entera.
          short: formatVoucherNumber(pointOfSale, item.number),
          value: item,
        })),
      );

      if (loading) {
        choices.push(new Separator(' '), new Separator(colorize(' Cargando…', 'muted')));
      } else if (nextNumber > 0) {
        choices.push(new Separator(' '), { name: '+ Cargar más…', value: LOAD_MORE });
      }

      choices.push(listRule(), new Separator(' '));
    }

    choices.push({
      description: 'Uno más viejo o de otro punto de venta',
      name: '# Ingresar el número a mano…',
      value: BY_NUMBER,
    });

    // +2: el separador y "Volver" que agrega chooseStep.
    const pageSizeOnScreen = fitPageSize(choices.length + 2);
    let answer: Back | PickerChoice;

    if (loading) {
      const result = await chooseStepWhileLoading(message, choices, defaultChoice, pageSizeOnScreen, loading);

      loading = undefined;

      if ('loaded' in result) {
        nextNumber -= pageSize;
        // El cursor queda en el primero nuevo; si no vino ninguno, en "cargar mas" o "a mano".
        defaultChoice = result.loaded[0] ?? (nextNumber > 0 ? LOAD_MORE : BY_NUMBER);
        invoices.push(...result.loaded);
        continue;
      }

      // Se eligio otra opcion antes de que terminara la carga: lo que llegue se descarta.
      answer = result.answer;
    } else {
      answer = await chooseStep(message, choices, defaultChoice, pageSizeOnScreen);
    }

    if (answer === BACK) {
      return BACK;
    }

    if (answer === LOAD_MORE) {
      // La misma lista se vuelve a dibujar en su lugar, con "Cargando…" en vez del boton.
      eraseLastAnswer();
      loading = listVouchersFrom(historyGateway, pointOfSale, voucherKind.arcaType, nextNumber, { limit: pageSize });
      defaultChoice = invoices.at(-1);
      continue;
    }

    let picked: PickedInvoice;

    if (answer === BY_NUMBER) {
      const byNumber = await askVoucherByNumber(session, voucherKind, pointOfSale);

      if (byNumber === BACK) {
        defaultChoice = BY_NUMBER;
        continue;
      }

      picked = byNumber;
    } else {
      picked = { invoice: answer, pointOfSale };
    }

    if (!onPick) {
      return picked;
    }

    await onPick(picked);
    defaultChoice = answer;
  }
}
