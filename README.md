# render3D

Render 3D del departamento de Pedro Goyena.

- **Visor 3D:** https://franciscoalles-droid.github.io/render3D/
- **Imágenes fotorrealistas:** https://franciscoalles-droid.github.io/render3D/salidas/fotorrealista.html

## Contenido

- `visor/`: visor 3D en el navegador (Three.js 0.170 desde un CDN). Permite comparar distribuciones de muebles, abrir y cerrar puertas y bajar los muros en la vista aérea.
- `datos/depto.json`: la geometría del departamento en metros. Es la fuente única: el plano y el visor salen de acá.
- `datos/muebles.json`, `distribuciones.json` y `versiones.json`: los muebles, dónde va cada uno y las versiones guardadas desde el visor. `render.json` tiene las cámaras de las imágenes fotorrealistas.
- `herramientas/`: el servidor local (`servidor.py`), el plano en SVG (`plano.py`), el HTML autónomo (`exportar_html.py`) y los renders con Blender (`render_fotorrealista.py` y `blender_render.py`).
- `salidas/fotorrealista.html`: galería de imágenes de Blender y retocadas con IA, de día y de noche.

## Usarlo en la compu

```bash
python3 -I herramientas/servidor.py
```

y abrir http://127.0.0.1:8765/visor/ (en Mac, también con doble clic en `abrir_visor.command`). Con el servidor local se pueden mover los muebles y guardar versiones. En GitHub Pages el visor es de solo lectura.

Las fotos del departamento vacío, el plano original y los archivos pesados de los renders no están en el repositorio.
