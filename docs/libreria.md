[← Documentación](README.md)

# Modo librería

`arcli/api` sirve para emitir desde código, por ejemplo desde un panel web o un backend. Hace lo mismo que `arcli <comprobante> --emitir`: valida con las mismas reglas, arma la solicitud igual y emite en dos pasos. Lo que cambia es de dónde salen los datos:

- No lee la config de la CLI (`conf`) ni archivos. El certificado y la clave llegan como texto PEM.
- El ticket de WSAA se guarda donde diga quien llama, con `ticketStorage`.
- No genera el PDF. ARCA no recibe ítems ni datos del receptor, así que el PDF queda a cargo de la aplicación.

## Instalación

```bash
npm install arcli
```

Requiere Node.js 22.22.1 o superior y ESM (`import`).

## Uso

```ts
import { createArcli, EmissionUncertainError } from 'arcli/api';

const arcli = createArcli({
  cuit: '20-11111111-2',
  cert: process.env.ARCA_CERT, // contenido PEM, no una ruta
  key: process.env.ARCA_KEY,
  production: false, // testing (homologación) por defecto
  pointOfSale: 3,
  ticketStorage: miStorage, // ver abajo
});

const preview = await arcli.previewInvoice({
  shortcut: 'fc',
  concept: 'productos',
  documentType: 'cuit',
  documentNumber: 30500010912,
  ivaCondition: 'responsable-inscripto',
  totalAmount: 15000,
});
// preview.payload es lo que se mandaría a ARCA. No se llamó a ARCA.

try {
  const result = await arcli.emitInvoice({ ...mismosDatos });
  // result.voucherNumber, result.response.cae, result.response.caeVencimiento, result.response.status
} catch (error) {
  if (error instanceof EmissionUncertainError) {
    // Puede haberse emitido igual: verificá antes de reintentar.
  }
}
```

El pedido usa los mismos campos que el [JSON de entrada](input-output.md), con los nombres internos (`shortcut`, `concept`, `totalAmount`…). Están tipados como `InvoiceRequest`.

## Métodos

| Método                                    | Qué hace                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `previewInvoice(pedido)`                  | Valida y arma la solicitud, sin ir a ARCA.                                                                 |
| `emitInvoice(pedido)`                     | Login en WSAA, último número + 1 y `FECAESolicitar`. Devuelve el resultado, aprobado o rechazado por ARCA. |
| `getTaxpayer(cuit)`                       | Constancia de inscripción: nombre, domicilio fiscal y condición IVA (`null` si el CUIT no existe).         |
| `lastVoucherNumber(atajo, puntoVenta?)`   | Último número autorizado (0 si no hay).                                                                    |
| `findVoucher(atajo, numero, puntoVenta?)` | El comprobante emitido con ese número, o `undefined`.                                                      |
| `certificate()`                           | Vencimiento del certificado, leído del PEM sin red.                                                        |

### Errores

- **Rechazo de ARCA:** no es una excepción. `emitInvoice` devuelve `response.status: 'rechazado'` con `observaciones` y `errors`.
- **Error antes de enviar:** login, certificado vencido (`CertificateExpiredError`) o punto de venta inválido (`ARCA_LAST_VOUCHER_ERROR`). Se tira tal cual y no se emitió nada.
- **`EmissionUncertainError`:** falló la llamada que emite (red, timeout). ARCA pudo haber autorizado el comprobante. No reintentes sin verificar: compará `lastVoucherNumber` con el número esperado y revisá con `findVoucher` que el importe y el receptor coincidan.
- **`InputValidationError`:** el pedido no pasa las validaciones. Es la misma regla que en la CLI.

## El ticket de WSAA

WSAA da un ticket válido por 12 horas y **rechaza un login nuevo mientras el anterior siga vigente**. Un proceso que pierde el ticket queda sin poder emitir hasta que venza. Pasa, por ejemplo, con un contenedor que se reinicia o con varias instancias. Por eso `ticketStorage` es obligatorio: guardalo en algo que sobreviva al proceso.

```ts
import { AccessTicket, type ITicketStoragePort } from 'arcli/api';

const miStorage: ITicketStoragePort = {
  async get(service) {
    const row = await db.tickets.find(service);
    return row ? AccessTicket.create(row.credentials) : null;
  },
  async save(ticket, service) {
    await db.tickets.upsert(service, ticket.toLoginCredentials(), ticket.getExpiration());
  },
  async delete(service) {
    await db.tickets.remove(service);
  },
};
```

El ticket da acceso a ARCA como ese CUIT hasta que vence: guardalo con el mismo cuidado que la clave. Para scripts y tests alcanza con `MemoryTicketStorage`.
