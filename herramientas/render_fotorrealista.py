"""Renders fotorrealistas de una distribución con Blender (etapa 1 de plan_fotorrealista.md).

Uso:
    python3 -I herramientas/render_fotorrealista.py                      # todas las vistas, de día y de noche
    python3 -I herramientas/render_fotorrealista.py --vistas living,cocina --modos dia
    python3 -I herramientas/render_fotorrealista.py --sin-exportar --muestras 64 --escala 50   # prueba rápida
    python3 -I herramientas/render_fotorrealista.py --solo-galeria

Pasos:
1. Exporta la escena del visor (Chrome sin ventana + servidor local) a salidas/fotorrealista/escena/<dist>_altos.glb
   y, si alguna vista lo pide, <dist>_bajos.glb (maqueta con los muros cortados).
2. Renderiza cada vista y modo con Blender (herramientas/blender_render.py) → salidas/fotorrealista/<vista>_<modo>.png,
   más una copia .jpg liviana para la galería.
3. Arma la galería salidas/fotorrealista.html, con selector de día y noche.
Cámaras, luz y muestras: datos/render.json.
"""
import argparse
import html
import json
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.stdout.reconfigure(line_buffering=True)   # que el avance se vea mientras renderiza
SALIDA = RAIZ / "salidas" / "fotorrealista"
GALERIA = RAIZ / "salidas" / "fotorrealista.html"
PUERTO = 8765
NAVEGADORES = ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
               "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]


def leer(nombre):
    return json.loads((RAIZ / "datos" / nombre).read_text(encoding="utf-8"))


def servidor_activo():
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{PUERTO}/visor/", timeout=2)
        return True
    except OSError:
        return False


def exportar(dist, muros, bajar=()):
    """Abre el visor sin ventana con ?exportar=…; el visor manda el GLB al servidor.
    bajar: ids de cuadros o espejos que, con los muros bajos, se cuelgan justo debajo del corte en vez de ocultarse."""
    navegador = next((n for n in NAVEGADORES if Path(n).exists()), None)
    if not navegador:
        sys.exit("No encontré Chrome ni Edge para exportar la escena.")
    destino = SALIDA / "escena" / f"{dist}_{muros}.glb"
    antes = destino.stat().st_mtime if destino.exists() else 0
    consulta = urllib.parse.urlencode({"exportar": dist, "muros": muros, **({"bajar": ",".join(bajar)} if bajar else {})})
    # Chrome a veces se cierra antes de terminar de mandar el GLB y llega cortado: se verifica y se reintenta
    for intento in range(3):
        with tempfile.TemporaryDirectory() as perfil:
            subprocess.run([navegador, "--headless=new", f"--user-data-dir={perfil}", "--enable-unsafe-swiftshader",
                            "--use-angle=swiftshader", "--virtual-time-budget=60000", "--dump-dom",
                            f"http://127.0.0.1:{PUERTO}/visor/?{consulta}"],
                           capture_output=True, timeout=180)
        if destino.exists() and destino.stat().st_mtime > antes and glb_completo(destino):
            print(f"Escena exportada: {destino.relative_to(RAIZ)} ({destino.stat().st_size / 1e6:.1f} MB)")
            return destino
        print(f"  la exportación de {destino.name} no llegó completa (intento {intento + 1} de 3)")
    sys.exit(f"No se exportó {destino.name}: revisa el visor (consola) con ?{consulta}.")


def glb_completo(ruta):
    """El encabezado del GLB dice cuántos bytes tiene: si el archivo es más corto, llegó cortado."""
    datos = ruta.read_bytes()
    return datos[:4] == b"glTF" and len(datos) >= 12 and int.from_bytes(datos[8:12], "little") == len(datos)


def renderizar(blender, escena, vista, modo, muestras, escala):
    png = SALIDA / f"{vista['id']}_{modo}.png"
    comando = [blender, "-b", "--factory-startup", "--python", str(RAIZ / "herramientas" / "blender_render.py"), "--",
               "--escena", str(escena), "--vista", vista["id"], "--modo", modo, "--salida", str(png), "--escala", str(escala)]
    if muestras:
        comando += ["--muestras", str(muestras)]
    inicio = time.time()
    r = subprocess.run(comando, capture_output=True, text=True)
    if "RENDER_OK" not in r.stdout:
        print(r.stdout[-3000:], r.stderr[-2000:], sep="\n")
        sys.exit(f"Falló el render de {vista['id']} ({modo}).")
    jpg = png.with_suffix(".jpg")
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "85", str(png), "--out", str(jpg)],
                   check=True, capture_output=True)
    print(f"  {vista['nombre']} · {modo}: {time.time() - inicio:.0f} s")


def galeria(cfg):
    """Galería estática: una tarjeta por vista, selector día/noche y visor a pantalla completa."""
    tarjetas = []
    con_ia = 0
    for v in cfg["vistas"]:
        fotos = {m: f"fotorrealista/{v['id']}_{m}.jpg" for m in ("dia", "noche") if (SALIDA / f"{v['id']}_{m}.jpg").exists()}
        if not fotos:
            continue
        # fotos con IA (etapa 2): ia/<vista>_<modo>_ia.png o .jpg → copia liviana fotorrealista/<vista>_<modo>_ia.jpg
        for m in ("dia", "noche"):
            origen = next((SALIDA / "ia" / f"{v['id']}_{m}_ia.{ext}" for ext in ("png", "jpg", "jpeg", "webp")
                           if (SALIDA / "ia" / f"{v['id']}_{m}_ia.{ext}").exists()), None)
            if origen:
                destino = SALIDA / f"{v['id']}_{m}_ia.jpg"
                if not destino.exists() or destino.stat().st_mtime < origen.stat().st_mtime:
                    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "88", str(origen), "--out", str(destino)],
                                   check=True, capture_output=True)
                fotos[f"{m}Ia"] = f"fotorrealista/{v['id']}_{m}_ia.jpg"
                con_ia += 1
        # diaIa → data-dia-ia (en JS: dataset.diaIa)
        atributos = " ".join(f'data-{m.replace("Ia", "-ia")}="{html.escape(src)}"' for m, src in fotos.items())
        inicial = fotos.get("dia") or fotos.get("noche")
        tarjetas.append(f'''    <figure class="tarjeta" {atributos}>
      <button type="button" class="abrir" aria-label="Ver {html.escape(v['nombre'])} en grande"><img src="{inicial}" alt="{html.escape(v['nombre'])}" loading="lazy"><span class="marca"></span></button>
      <figcaption>{html.escape(v['nombre'])}</figcaption>
    </figure>''')
    dist = cfg["distribucion"].upper()
    GALERIA.write_text(f'''<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Departamento · distribución {dist} · fotorrealista</title>
<style>
  :root {{ --texto: #1f2328; --suave: #646a73; --borde: #dcdfe3; --acento: #185fa5; --fondo: #f4f3ef; }}
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--texto); background: var(--fondo); }}
  header {{ display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 16px 24px; background: #fff; border-bottom: 1px solid var(--borde); position: sticky; top: 0; z-index: 2; }}
  h1 {{ font-size: 18px; margin: 0; flex: 1; }}
  .volver {{ color: var(--acento); text-decoration: none; }}
  .selector {{ display: inline-flex; border: 1px solid var(--borde); border-radius: 999px; overflow: hidden; }}
  .selector button {{ font: inherit; font-size: 14px; border: 0; background: #fff; padding: 7px 16px; cursor: pointer; color: var(--texto); }}
  .selector button[aria-pressed="true"] {{ background: var(--acento); color: #fff; }}
  main {{ padding: 24px; max-width: 1500px; margin: 0 auto; }}
  .nota {{ color: var(--suave); margin: 0 0 20px; max-width: 75ch; }}
  .grilla {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 20px; }}
  .tarjeta {{ margin: 0; background: #fff; border: 1px solid var(--borde); border-radius: 12px; overflow: hidden; }}
  .abrir {{ display: block; width: 100%; padding: 0; border: 0; background: #ddd; cursor: zoom-in; }}
  .abrir {{ position: relative; }}
  .abrir img {{ display: block; width: 100%; aspect-ratio: 3 / 2; object-fit: cover; }}
  .marca {{ position: absolute; top: 10px; left: 10px; font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 999px; background: rgba(255, 255, 255, 0.9); color: var(--texto); }}
  .marca:empty {{ display: none; }}
  .marca.ia {{ background: var(--acento); color: #fff; }}
  figcaption {{ padding: 10px 14px; font-weight: 600; }}
  dialog {{ border: 0; padding: 0; background: #000; max-width: 96vw; max-height: 96vh; }}
  dialog::backdrop {{ background: rgba(0, 0, 0, 0.85); }}
  dialog img {{ display: block; max-width: 96vw; max-height: 90vh; }}
  dialog p {{ color: #eee; margin: 0; padding: 8px 12px; font-size: 14px; }}
</style>
</head>
<body>
<header>
  <h1>Distribución {dist} · fotorrealista</h1>
  <div class="selector" role="group" aria-label="Luz">
    <button type="button" data-modo="dia" aria-pressed="true">Día</button>
    <button type="button" data-modo="noche" aria-pressed="false">Noche</button>
  </div>
  <div class="selector" role="group" aria-label="Versión">
    <button type="button" data-version="blender" aria-pressed="false">Blender</button>
    <button type="button" data-version="ia" aria-pressed="true">Con IA</button>
  </div>
  <a class="volver" href="departamento_3d.html">Volver al 3D</a>
</header>
<main>
  <p class="nota"><strong>Blender:</strong> renders con la geometría exacta del modelo (medidas, aberturas, materiales y la luz real del ventanal), con los muebles del visor 3D. <strong>Con IA:</strong> el mismo render, convertido en foto con Nano Banana 2.1 a partir de las fotos de tus muebles. Hay {con_ia} de 16; las vistas que todavía no la tienen muestran el render.</p>
  <div class="grilla">
{chr(10).join(tarjetas)}
  </div>
</main>
<dialog id="grande"><img alt=""><p></p></dialog>
<script>
  let modo = 'dia', version = 'ia';
  const tarjetas = [...document.querySelectorAll('.tarjeta')];
  const conIa = (t) => version === 'ia' && t.dataset[modo + 'Ia'];
  const fuente = (t) => conIa(t) || t.dataset[modo] || t.dataset.dia || t.dataset.noche;
  const pintar = () => {{
    for (const t of tarjetas) {{
      t.querySelector('img').src = fuente(t);
      const marca = t.querySelector('.marca');
      marca.textContent = version === 'ia' ? (conIa(t) ? 'Foto IA' : 'Render (sin IA todavía)') : '';
      marca.classList.toggle('ia', !!conIa(t));
    }}
  }};
  for (const b of document.querySelectorAll('[data-modo]')) {{
    b.addEventListener('click', () => {{
      modo = b.dataset.modo;
      for (const o of document.querySelectorAll('[data-modo]')) o.setAttribute('aria-pressed', String(o === b));
      pintar();
    }});
  }}
  for (const b of document.querySelectorAll('[data-version]')) {{
    b.addEventListener('click', () => {{
      version = b.dataset.version;
      for (const o of document.querySelectorAll('[data-version]')) o.setAttribute('aria-pressed', String(o === b));
      pintar();
    }});
  }}
  pintar();
  const grande = document.getElementById('grande');
  for (const t of tarjetas) {{
    t.querySelector('.abrir').addEventListener('click', () => {{
      grande.querySelector('img').src = fuente(t);
      grande.querySelector('p').textContent = t.querySelector('figcaption').textContent;
      grande.showModal();
    }});
  }}
  grande.addEventListener('click', () => grande.close());
</script>
</body>
</html>
''', encoding="utf-8")
    print(f"Galería: {GALERIA.relative_to(RAIZ)} ({len(tarjetas)} vistas)")


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--vistas", help="ids separados por coma (por defecto, todas)")
    a.add_argument("--modos", default="dia,noche")
    a.add_argument("--muestras", type=int)
    a.add_argument("--escala", type=int, default=100)
    a.add_argument("--sin-exportar", action="store_true", help="usa las escenas ya exportadas")
    a.add_argument("--solo-galeria", action="store_true")
    args = a.parse_args()

    cfg = leer("render.json")
    SALIDA.mkdir(parents=True, exist_ok=True)
    if args.solo_galeria:
        return galeria(cfg)
    vistas = cfg["vistas"]
    if args.vistas:
        pedidas = args.vistas.split(",")
        vistas = [v for v in vistas if v["id"] in pedidas]
    modos = [m for m in args.modos.split(",") if m in ("dia", "noche")]
    dist = cfg["distribucion"]
    escenas = {v.get("escena", "altos") for v in vistas}

    if not args.sin_exportar:
        propio = None
        if not servidor_activo():
            propio = subprocess.Popen([sys.executable, "-I", str(RAIZ / "herramientas" / "servidor.py"), str(PUERTO)],
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            for _ in range(20):
                if servidor_activo():
                    break
                time.sleep(0.5)
        try:
            for muros in sorted(escenas):
                bajar = sorted({i for v in cfg["vistas"] if v.get("escena", "altos") == muros for i in v.get("bajar", [])})
                exportar(dist, muros, bajar)
        finally:
            if propio:
                propio.terminate()

    blender = shutil.which("blender") or "/Applications/Blender.app/Contents/MacOS/Blender"
    print(f"Renderizando {len(vistas)} vistas × {len(modos)} modos con Blender…")
    for v in vistas:
        escena = SALIDA / "escena" / f"{dist}_{v.get('escena', 'altos')}.glb"
        if not escena.exists():
            sys.exit(f"Falta {escena.relative_to(RAIZ)}: corre sin --sin-exportar.")
        for modo in modos:
            renderizar(blender, escena, v, modo, args.muestras, args.escala)
    galeria(cfg)


if __name__ == "__main__":
    main()
