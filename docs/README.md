# Documentación de ARCLI

[← README](../README.md)

## Para empezar

1. [Instalación y primeros pasos](../README.md#instalación): instalar y configurar.
2. [Cómo obtener los certificados de ARCA](obtencion-certificados.md): CUIT, certificado y clave para testing y producción.
3. [Modo interactivo](modo-interactivo.md): el asistente que se abre con `arcli`, sin recordar flags.
4. [Modelo mental](mental-model.md): cómo fluye un comando, de la entrada a ARCA.

## Guías

- [Patrones de uso](usage-patterns.md): facturas, notas, FCE, lotes, PDF y automatización, con el comando de cada caso.
- [PDF de comprobantes](pdf.md): plugin, datos del emisor, carpeta y nombre de los archivos.
- [Troubleshooting](troubleshooting.md): errores frecuentes, causa y solución.
- [Modo librería](libreria.md): emitir desde código con `arcli/api`, sin la config de la CLI.

## Referencia

- [Referencia del CLI](cli-reference.md): comandos y flags.
- [Configuración](configuration.md): claves, ubicación del archivo y variables de entorno.
- [Entrada y salida](input-output.md): JSON de entrada, JSON de salida y formato de errores.
- [Reglas de validación](validation-rules.md): qué valida ARCLI y qué rechaza ARCA.
- [Glosario](glossary.md): CAE, WSAA, punto de venta y demás términos.
- [Limitaciones](limitations.md): qué no hace y por qué.
- [llms.txt](../llms.txt): referencia condensada para agentes de IA con acceso a terminal.

## Para contribuir

- [Guía de desarrollo](development.md): entorno local, scripts, tests, CI y releases.
- [Arquitectura](architecture.md): capas, flujo de una emisión y cómo extender el CLI.
- [CONTRIBUTING](../CONTRIBUTING.md): flujo de trabajo y reglas del contrato público.
- [CHANGELOG](../CHANGELOG.md) y [SECURITY](../SECURITY.md).
