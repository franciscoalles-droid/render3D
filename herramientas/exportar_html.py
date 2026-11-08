"""Arma un único HTML autónomo del visor 3D que se abre con doble clic, sin servidor.

Mete adentro del archivo los estilos, el código del visor, los JSON de `datos/` (incluidas las
versiones guardadas, si las hay) y las fotos de los muebles (achicadas con `sips`). La biblioteca Three.js se sigue cargando desde el CDN, así que
hace falta conexión a internet.

Uso: python3 -I herramientas/exportar_html.py          → salidas/departamento_3d.html

Es una copia: después de cambiar datos o visor, hay que volver a correrlo.
"""
import base64
import json
import pathlib
import re
import subprocess
import sys
import tempfile

RAIZ = pathlib.Path(__file__).resolve().parent.parent
VISOR = RAIZ / "visor"
SALIDA = RAIZ / "salidas" / "departamento_3d.html"
LADO_FOTO = 700   # px del lado mayor de las fotos de los muebles


def leer(ruta):
    return ruta.read_text(encoding="utf-8")


def fotos_muebles():
    """Fotos achicadas en base64, por id (m01, m02...)."""
    fotos = {}
    with tempfile.TemporaryDirectory() as tmp:
        for jpg in sorted((RAIZ / "fotos" / "muebles").glob("*.jpg")):
            chica = pathlib.Path(tmp, jpg.name)
            subprocess.run(["sips", "-Z", str(LADO_FOTO), "-s", "formatOptions", "70", str(jpg), "--out", str(chica)],
                           check=True, capture_output=True)
            fotos[jpg.stem] = base64.b64encode(chica.read_bytes()).decode("ascii")
    return fotos


def script_seguro(codigo):
    """Evita que un '</script' dentro del código cierre la etiqueta."""
    return re.sub(r"</(script)", r"<\\/\1", codigo, flags=re.I)


def main():
    html = leer(VISOR / "index.html")
    app = leer(VISOR / "app.js")
    muebles_js = leer(VISOR / "muebles.js")
    datos = {n: json.loads(leer(RAIZ / "datos" / n)) for n in ("depto.json", "muebles.json", "distribuciones.json")}
    # versiones guardadas desde el visor: el HTML arranca cada distribución desde la última (solo para mirar)
    versiones = RAIZ / "datos" / "versiones.json"
    if versiones.exists():
        datos["versiones.json"] = json.loads(leer(versiones))

    # Las fotos se piden con una función que las arma como blob (los data: no se abren en otra pestaña)
    ruta_foto = "`../fotos/muebles/${f}.jpg`"
    if app.count(ruta_foto) != 2:
        sys.exit("No encontré las dos rutas de fotos en app.js: revisa el exportador.")
    app = app.replace(ruta_foto, "(window.__foto?.(f) || " + ruta_foto + ")")

    # muebles.js va como módulo data: dentro del importmap, con el mismo especificador que usa app.js
    m = re.search(r"from '(\./muebles\.js[^']*)'", app)
    if not m:
        sys.exit("No encontré el import de muebles.js en app.js.")
    muebles_url = "data:text/javascript;base64," + base64.b64encode(muebles_js.encode("utf-8")).decode("ascii")

    m_map = re.search(r'<script type="importmap">\s*(\{.*?\})\s*</script>', html, flags=re.S)
    importmap = json.loads(m_map.group(1))
    importmap["imports"][m.group(1)] = muebles_url
    html = html.replace(m_map.group(0), '<script type="importmap">\n' + json.dumps(importmap, indent=2) + "\n</script>")

    # El botón «Fotorrealista» abre la galería, que en salidas/ queda al lado de este HTML
    enlace = 'href="../salidas/fotorrealista.html"'
    if enlace not in html:
        sys.exit("No encontré el enlace a la galería fotorrealista en index.html.")
    html = html.replace(enlace, 'href="fotorrealista.html"')

    # Estilos en línea
    html = re.sub(r'<link rel="stylesheet" href="estilo\.css[^"]*">',
                  lambda _: "<style>\n" + leer(VISOR / "estilo.css") + "\n</style>", html)

    # Datos y fotos antes del visor; fetch devuelve los JSON embebidos
    embebidos = f"""<script>
window.__DATOS__ = {json.dumps(datos, ensure_ascii=False, separators=(",", ":"))};
const __FOTOS__ = {json.dumps(fotos_muebles(), separators=(",", ":"))};
const __blobs = {{}};
window.__foto = (id) => {{
  if (!__FOTOS__[id]) return null;
  if (!__blobs[id]) {{
    const b = atob(__FOTOS__[id]), bytes = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
    __blobs[id] = URL.createObjectURL(new Blob([bytes], {{ type: 'image/jpeg' }}));
  }}
  return __blobs[id];
}};
const __fetch = window.fetch.bind(window);
window.fetch = (url, opciones) => {{
  const nombre = String(url).split('?')[0].split('/').pop();
  if (window.__DATOS__[nombre]) {{
    return Promise.resolve(new Response(JSON.stringify(window.__DATOS__[nombre]), {{ headers: {{ 'Content-Type': 'application/json' }} }}));
  }}
  return __fetch(url, opciones);
}};
</script>"""
    m_app = re.search(r'<script type="module" src="app\.js[^"]*"></script>', html)
    if not m_app:
        sys.exit("No encontré el <script> de app.js en index.html.")
    html = html.replace(m_app.group(0), embebidos + '\n<script type="module">\n' + script_seguro(app) + "\n</script>")

    SALIDA.parent.mkdir(exist_ok=True)
    SALIDA.write_text(html, encoding="utf-8")
    print(f"HTML generado: {SALIDA} ({SALIDA.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
