#!/usr/bin/env python3
"""Servidor local del visor 3D.

Funciona como `python3 -m http.server`, pero le pide al navegador que no guarde nada en caché,
para que siempre muestre la última versión de los archivos (datos y código del visor).

Además guarda las versiones de las distribuciones: el botón «Guardar versión» del visor manda los
cambios a POST /api/versiones y este servidor los agrega a datos/versiones.json.
Y recibe la escena exportada para los renders fotorrealistas (POST /api/glb → salidas/fotorrealista/escena/).

Uso: python3 -I herramientas/servidor.py [puerto]     (por defecto 8765)
"""
import functools
import http.server
import json
import math
import os
import re
import sys
import threading
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DISTRIBUCIONES = RAIZ / 'datos' / 'distribuciones.json'
VERSIONES = RAIZ / 'datos' / 'versiones.json'
NOTA_VERSIONES = (
    'Versiones guardadas desde el visor con «Guardar versión» (servidor local). El visor arranca cada '
    'distribución desde su última versión. items = estado de los muebles que difieren de '
    'datos/distribuciones.json; movimientos = lo que cambió respecto de la versión anterior de la misma '
    'distribución (antes y después). pos = centro en el plano [x, y] en metros; giro en grados; '
    'guardado = sacado de la distribución. aplicadas = versiones que ya pasaron a datos/distribuciones.json: '
    'quedan como historial y el visor no las aplica.'
)
MAX_CUERPO = 1_000_000
ESCENAS = RAIZ / 'salidas' / 'fotorrealista' / 'escena'
MAX_GLB = 300_000_000
candado = threading.Lock()


def es_numero(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def estado_mueble(v):
    """Valida y normaliza {pos, giro, guardado}."""
    if not isinstance(v, dict):
        raise ValueError('estado de mueble inválido')
    pos, giro, guardado = v.get('pos'), v.get('giro', 0), v.get('guardado', False)
    if not (isinstance(pos, list) and len(pos) == 2 and all(es_numero(x) for x in pos)):
        raise ValueError('pos inválida')
    if not es_numero(giro) or not isinstance(guardado, bool):
        raise ValueError('giro o guardado inválidos')
    return {'pos': [round(pos[0], 3), round(pos[1], 3)], 'giro': round(giro, 1), 'guardado': guardado}


def guardar_version(pedido):
    if not isinstance(pedido, dict):
        raise ValueError('pedido inválido')
    datos = json.loads(DISTRIBUCIONES.read_text(encoding='utf-8'))
    dist = next((d for d in datos['distribuciones'] if d['id'] == pedido.get('distribucion')), None)
    if not dist:
        raise ValueError('distribución desconocida')
    ids = {i['id'] for i in datos.get('comunes', []) + dist['items']}

    items, movimientos, nota = pedido.get('items'), pedido.get('movimientos'), pedido.get('nota', '')
    if not isinstance(items, dict) or not isinstance(movimientos, list) or not movimientos or not isinstance(nota, str):
        raise ValueError('faltan items, movimientos o nota')
    if not set(items) <= ids:
        raise ValueError('hay muebles que no son de esta distribución')
    limpios = []
    for m in movimientos[:500]:
        if not isinstance(m, dict) or m.get('id') not in ids or not isinstance(m.get('mueble', ''), str):
            raise ValueError('movimiento inválido')
        limpios.append({'id': m['id'], 'mueble': m.get('mueble', '')[:120],
                        'antes': estado_mueble(m.get('antes')), 'despues': estado_mueble(m.get('despues'))})

    with candado:
        base = json.loads(VERSIONES.read_text(encoding='utf-8')) if VERSIONES.exists() else {}
        base.setdefault('versiones', [])
        base['nota'] = NOTA_VERSIONES
        # la numeración sigue después de las versiones que ya pasaron a distribuciones.json
        previas = [v.get('version', 0) for v in base['versiones'] + base.get('aplicadas', []) if v.get('distribucion') == dist['id']]
        version = {
            'distribucion': dist['id'],
            'version': max(previas, default=0) + 1,
            'fecha': time.strftime('%Y-%m-%d %H:%M'),
            'nota': nota.strip()[:500],
            'movimientos': limpios,
            'items': {k: estado_mueble(v) for k, v in items.items()},
        }
        base['versiones'].append(version)
        temporal = VERSIONES.with_suffix('.json.tmp')
        temporal.write_text(formatear(base), encoding='utf-8')
        os.replace(temporal, VERSIONES)
    return version


def formatear(base):
    """JSON legible: una línea por movimiento y por mueble, como los otros archivos de datos/."""
    linea = lambda v: json.dumps(v, ensure_ascii=False)

    def lista(versiones):
        bloques = []
        for v in versiones:
            cabecera = ', '.join(f'{linea(k)}: {linea(x)}' for k, x in v.items() if k not in ('movimientos', 'items'))
            movimientos = ',\n'.join(f'      {linea(m)}' for m in v.get('movimientos', []))
            items = ',\n'.join(f'      {linea(k)}: {linea(e)}' for k, e in v.get('items', {}).items())
            bloques.append(f'    {{{cabecera},\n     "movimientos": [\n{movimientos}\n     ],\n     "items": {{\n{items}\n     }}}}')
        return '[\n' + ',\n'.join(bloques) + ('\n' if bloques else '') + '  ]'

    texto = '{\n  "nota": ' + linea(base['nota']) + ',\n  "versiones": ' + lista(base['versiones'])
    if base.get('aplicadas'):
        texto += ',\n  "aplicadas": ' + lista(base['aplicadas'])
    texto += '\n}\n'
    json.loads(texto)   # por las dudas: tiene que seguir siendo JSON válido
    return texto


class SinCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):
        pass

    def responder(self, codigo, cuerpo):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode('utf-8')
        self.send_response(codigo)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def do_POST(self):
        ruta, _, consulta = self.path.partition('?')
        if ruta not in ('/api/versiones', '/api/glb'):
            return self.responder(404, {'error': 'no existe'})
        # solo desde el propio visor: otra página del navegador no puede escribir en el proyecto
        puerto = self.server.server_address[1]
        if self.headers.get('Origin') not in (f'http://127.0.0.1:{puerto}', f'http://localhost:{puerto}'):
            return self.responder(403, {'error': 'origen no permitido'})
        if ruta == '/api/glb':
            return self.recibir_glb(consulta)
        if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
            return self.responder(415, {'error': 'se espera JSON'})
        try:
            largo = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            largo = 0
        if not 0 < largo <= MAX_CUERPO:
            return self.responder(413, {'error': 'pedido vacío o demasiado grande'})
        try:
            version = guardar_version(json.loads(self.rfile.read(largo)))
        except ValueError as err:   # incluye JSON mal formado
            return self.responder(400, {'error': str(err)})
        self.responder(200, version)

    def recibir_glb(self, consulta):
        if self.headers.get('Content-Type', '').split(';')[0].strip() != 'model/gltf-binary':
            return self.responder(415, {'error': 'se espera un GLB'})
        try:
            nombre = nombre_escena(consulta)
            largo = int(self.headers.get('Content-Length') or 0)
        except ValueError as err:
            return self.responder(400, {'error': str(err)})
        if not 0 < largo <= MAX_GLB:
            return self.responder(413, {'error': 'escena vacía o demasiado grande'})
        datos = self.rfile.read(largo)
        if datos[:4] != b'glTF':
            return self.responder(400, {'error': 'no es un GLB'})
        # si el navegador se cierra a mitad del envío llega cortado: no se guarda (Blender no lo puede abrir)
        if len(datos) != largo or len(datos) < 12 or int.from_bytes(datos[8:12], 'little') != len(datos):
            return self.responder(400, {'error': 'GLB incompleto'})
        ESCENAS.mkdir(parents=True, exist_ok=True)
        destino = ESCENAS / f'{nombre}.glb'
        temporal = destino.with_suffix('.glb.tmp')
        temporal.write_bytes(datos)
        os.replace(temporal, destino)
        self.responder(200, {'archivo': str(destino.relative_to(RAIZ)), 'bytes': len(datos)})


def nombre_escena(consulta):
    """Nombre de archivo seguro para la escena: letras minúsculas, números y guión bajo."""
    from urllib.parse import parse_qs
    nombre = (parse_qs(consulta).get('nombre') or [''])[0]
    if not re.fullmatch(r'[a-z0-9_]{1,40}', nombre):
        raise ValueError('nombre de escena inválido')
    return nombre


def main():
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    manejador = functools.partial(SinCache, directory=str(RAIZ))
    with http.server.ThreadingHTTPServer(('127.0.0.1', puerto), manejador) as servidor:
        print(f'Visor en http://127.0.0.1:{puerto}/visor/ (Ctrl+C para apagarlo)', flush=True)
        servidor.serve_forever()


if __name__ == '__main__':
    main()
