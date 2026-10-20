import { noticePanel } from './noticePanel';

export interface CertificateBannerProps {
  readonly expired: boolean;
  readonly guideUrl: string;
  /** Que pasa con el certificado, sin el link: "El certificado de produccion vence el 20/11/2026 (en 10 días)." */
  readonly summary: string;
}

/**
 * Aviso del certificado por vencer (amarillo) o vencido (rojo), con el link en su propia linea para que no se
 * corte. Unico lugar que lo arma: lo usan los comandos, el modo interactivo y el storybook.
 */
export function certificateBanner({ expired, guideUrl, summary }: CertificateBannerProps): string {
  return noticePanel(`${summary}\nRenovalo: ${guideUrl}`, expired ? 'danger' : 'warning', 'warning');
}
