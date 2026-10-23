# Video promocional (16:9, para redes): vista previa, emision con JSON y modo interactivo. Se graba con
# scripts/demo/record.sh y emite dos comprobantes reales en testing.
Output docs/assets/demo/promo.mp4

Require node
Require jq
Set Shell "bash"
Set FontSize 22
Set Width 1600
Set Height 900
Set Padding 28
Set Theme "TokyoNight"
Set WindowBar Colorful
Set TypingSpeed 45ms

Hide
Type "source scripts/demo/setup.sh" Enter
Sleep 500ms
Show

# 1. Que es
Type "# Facturá en ARCA desde la terminal" Sleep 400ms Enter
Sleep 1.2s
Type "# Facturas, notas de crédito y débito A, B y C, y FCE" Sleep 400ms Enter
Sleep 1.8s

# 2. Vista previa: nada se emite sin confirmar
Type "arcli fc -m 25000 --cs --cfinal --ir-cf --previsualizar" Sleep 500ms Enter
Sleep 5s
Hide
Type "clear" Enter
Show

# 3. Emitir y obtener el CAE en JSON, listo para scripts y agentes
Type "# Emití y obtené el CAE en JSON, listo para tus scripts" Sleep 400ms Enter
Sleep 1s
Type "arcli fc -m 25000 --cs --cfinal --ir-cf --emitir --json | jq '{estado, cae, caeVencimiento}'" Sleep 500ms Enter
Sleep 6s
Hide
Type "clear" Enter
Show

# 4. Sin acordarte de ningun flag: el modo interactivo
Type "# ¿Sin ganas de flags? Modo interactivo" Sleep 400ms Enter
Sleep 1s
Type "arcli" Sleep 600ms Enter
Sleep 3s
# Emitir factura
Enter
Sleep 1s
# Factura C
Enter
Sleep 1s
# Consumidor final
Enter
Sleep 1s
# Servicios
Enter
Sleep 1s
Type "150000" Sleep 600ms Enter
Sleep 1.2s
# Sin opcionales
Enter
Sleep 4s
# Emitir ahora
Enter
Sleep 5s
Escape
Sleep 1s

# 5. Cierre: placa centrada, sin prompt ni cursor
Hide
Type "PS1='' && clear && printf '\e[?25l\n\n\n\n\n\n\n\n\n\n\n                       \e[1;36marcli\e[0m  ·  facturación electrónica de ARCA desde la terminal\n\n\n                                       \e[1mnpm install -g arcli\e[0m\n\n\n                                \e[2mgithub.com/LcsGrz/arcli  ·  open source\e[0m'" Enter
Sleep 300ms
Show
Sleep 5s
