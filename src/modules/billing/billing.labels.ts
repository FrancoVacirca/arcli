export function formatDateLabel(value: string | undefined): string {
  if (!value) {
    return 'N/D';
  }

  if (/^\d{8}$/.test(value)) {
    return `${value.slice(6, 8)}/${value.slice(4, 6)}/${value.slice(0, 4)}`;
  }

  return value.replaceAll('-', '/');
}

export function formatMoneyLabel(value: number | undefined): string {
  if (typeof value !== 'number') {
    return 'N/D';
  }

  const hasDecimals = !Number.isInteger(value);

  return `${new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 2,
    minimumFractionDigits: hasDecimals ? 2 : 0,
  }).format(value)}$`;
}

export function formatConceptLabel(value: number | undefined): string {
  switch (value) {
    case 1:
      return 'Productos';
    case 2:
      return 'Servicios';
    case 3:
      return 'Productos y servicios';
    default:
      return value ? String(value) : 'N/D';
  }
}

export function formatDocumentTypeLabel(value: number | undefined): string {
  switch (value) {
    case 80:
      return 'CUIT';
    case 86:
      return 'CUIL';
    case 96:
      return 'DNI';
    case 99:
      return 'Consumidor final';
    default:
      return value ? String(value) : 'N/D';
  }
}

export function formatIvaConditionLabel(value: number | undefined): string {
  switch (value) {
    case 1:
      return 'Responsable inscripto';
    case 4:
      return 'Sujeto exento';
    case 5:
      return 'Consumidor final';
    case 6:
      return 'Responsable monotributo';
    case 7:
      return 'Sujeto no categorizado';
    case 8:
      return 'Proveedor del exterior';
    case 9:
      return 'Cliente del exterior';
    case 10:
      return 'IVA liberado';
    case 13:
      return 'Monotributista social';
    case 15:
      return 'IVA no alcanzado';
    case 16:
      return 'Monotributo trabajador independiente promovido';
    default:
      return value ? String(value) : 'N/D';
  }
}

export function formatCurrencyLabel(value: string | undefined): string {
  switch (value) {
    case 'PES':
      return 'Pesos argentinos (ARS)';
    case 'DOL':
      return 'Dólares estadounidenses (USD)';
    default:
      return value ?? 'N/D';
  }
}

export function formatNumericLabel(value: number | undefined): string {
  if (typeof value !== 'number') {
    return 'N/D';
  }

  return new Intl.NumberFormat('es-AR').format(value);
}

export function formatTaxIdLabel(value: string | number | undefined): string {
  if (value === undefined || value === null || value === '') {
    return 'No informado';
  }

  const normalizedValue = String(value).replace(/\D/g, '');

  if (!/^\d{11}$/.test(normalizedValue)) {
    return String(value);
  }

  return `${normalizedValue.slice(0, 2)}-${normalizedValue.slice(2, 10)}-${normalizedValue.slice(10)}`;
}

export function formatDecimalLabel(value: number | undefined): string {
  if (typeof value !== 'number') {
    return 'N/D';
  }

  return new Intl.NumberFormat('es-AR', {
    maximumFractionDigits: 6,
  }).format(value);
}
