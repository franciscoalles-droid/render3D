#!/bin/bash
# Abre el visor 3D del departamento en el navegador. Se puede ejecutar con doble clic desde Finder.
# El visor necesita un servidor local para leer datos/depto.json; este script lo levanta y lo apaga al cerrar la ventana.
cd "$(dirname "$0")" || exit 1
PUERTO=8765
URL="http://127.0.0.1:$PUERTO/visor/?v=$(date +%s)"   # el parámetro evita que el navegador muestre una versión vieja

if curl -s -o /dev/null "$URL"; then
  open "$URL"
  echo "El visor ya estaba en marcha: $URL"
  exit 0
fi

python3 -I herramientas/servidor.py "$PUERTO" >/dev/null 2>&1 &
SERVIDOR=$!
trap 'kill "$SERVIDOR" 2>/dev/null' EXIT
sleep 1
open "$URL"
echo "Visor abierto en $URL"
echo "Deja esta ventana abierta mientras lo usas; ciérrala (o pulsa Ctrl+C) para apagarlo."
wait "$SERVIDOR"
