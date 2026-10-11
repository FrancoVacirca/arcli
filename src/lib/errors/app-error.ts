export class AppError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;
  /** Que hacer ahora; sale como "Sugerencia" en texto y `sugerencia` en JSON. */
  public readonly suggestion?: string;

  public constructor(
    message: string,
    options: { code: string; details?: Record<string, unknown>; suggestion?: string },
  ) {
    super(message);
    this.name = 'AppError';
    this.code = options.code;
    this.details = options.details;
    this.suggestion = options.suggestion;
  }
}

export class ConfigurationError extends AppError {
  public constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      code: 'CONFIGURATION_ERROR',
      details,
    });
    this.name = 'ConfigurationError';
  }
}

export class InputValidationError extends AppError {
  public constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      code: 'INPUT_VALIDATION_ERROR',
      details,
    });
    this.name = 'InputValidationError';
  }
}
