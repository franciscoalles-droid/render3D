"""Render fotorrealista de una vista con Blender (Cycles, GPU Metal).

Lo llama herramientas/render_fotorrealista.py; a mano:
    blender -b --factory-startup --python herramientas/blender_render.py -- \
        --escena salidas/fotorrealista/escena/a_altos.glb --vista living --modo dia \
        --salida salidas/fotorrealista/living_dia.png [--muestras 256] [--escala 100]

La escena es la que exporta el visor (misma geometría y muebles). Acá se mejoran los materiales,
se arma la luz de día o de noche y la cámara según datos/render.json.
Coordenadas: plano (x, y) y altura h → Blender (x, -y, h).
"""
import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

RAIZ = Path(__file__).resolve().parent.parent


def leer(nombre):
    return json.loads((RAIZ / "datos" / nombre).read_text(encoding="utf-8"))


def P(x, y, h):
    return Vector((x, -y, h))


def argumentos():
    a = argparse.ArgumentParser()
    a.add_argument("--escena", required=True)
    a.add_argument("--vista", required=True)
    a.add_argument("--modo", choices=["dia", "noche"], required=True)
    a.add_argument("--salida", required=True)
    a.add_argument("--muestras", type=int)
    a.add_argument("--escala", type=int, default=100, help="porcentaje de la resolución")
    return a.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def kelvin(k):
    """Color aproximado de una luz de k grados Kelvin (suficiente para 2000-6500 K)."""
    t = k / 100
    r = 1.0 if t <= 66 else min(1, 1.292936 * (t - 60) ** -0.1332)
    g = (0.39008 * math.log(t) - 0.63184) if t <= 66 else 1.1298909 * (t - 60) ** -0.0755
    b = 1.0 if t >= 66 else (0 if t <= 19 else 0.5432 * math.log(t - 10) - 1.19625)
    return tuple(max(0.0, min(1.0, c)) for c in (r, g, b))


# ---------- materiales ----------
def principled(mat):
    if not mat or not mat.use_nodes:
        return None
    return next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)


def poner(nodo, entrada, valor):
    if nodo and entrada in nodo.inputs:
        campo = nodo.inputs[entrada]
        for enlace in list(campo.links):
            nodo.id_data.links.remove(enlace)
        campo.default_value = valor


def vidrio_transparente(mat):
    """Vidrio de archviz: deja pasar la luz derecho (transparente) con un reflejo leve.
    Un vidrio con refracción no deja entrar el sol ni el cielo si las cáusticas están apagadas."""
    arbol = mat.node_tree
    arbol.nodes.clear()
    salida = arbol.nodes.new("ShaderNodeOutputMaterial")
    mezcla = arbol.nodes.new("ShaderNodeMixShader")
    claro = arbol.nodes.new("ShaderNodeBsdfTransparent")
    brillo = arbol.nodes.new("ShaderNodeBsdfGlossy")
    fresnel = arbol.nodes.new("ShaderNodeFresnel")
    fresnel.inputs["IOR"].default_value = 1.5
    claro.inputs["Color"].default_value = (0.97, 0.99, 1.0, 1)
    brillo.inputs["Roughness"].default_value = 0.0
    arbol.links.new(fresnel.outputs["Fac"], mezcla.inputs["Fac"])
    arbol.links.new(claro.outputs["BSDF"], mezcla.inputs[1])
    arbol.links.new(brillo.outputs["BSDF"], mezcla.inputs[2])
    arbol.links.new(mezcla.outputs["Shader"], salida.inputs["Surface"])


def ajustar_materiales(modo):
    for mat in bpy.data.materials:
        n = principled(mat)
        if not n:
            continue
        nombre = mat.name.split(".")[0]
        if nombre.startswith("vidrio"):
            vidrio_transparente(mat)
            continue
        elif nombre == "piso_porcelanato":
            poner(n, "Roughness", 0.08)
            poner(n, "Coat Weight", 0.4)
        elif nombre == "piso_porcelanato_gris":
            poner(n, "Roughness", 0.18)
            poner(n, "Coat Weight", 0.25)
        elif nombre == "azulejo":
            poner(n, "Roughness", 0.22)
            poner(n, "Coat Weight", 0.35)
        elif nombre == "piso_madera":
            poner(n, "Roughness", 0.35)
            poner(n, "Coat Weight", 0.25)
        elif nombre in ("pared", "techo", "revoque"):
            poner(n, "Roughness", 0.9)
        elif nombre == "granito":
            poner(n, "Coat Weight", 0.5)
        elif nombre == "tela":
            poner(n, "Sheen Weight", 0.4)
        # luces: las cálidas se prenden de noche; las pantallas (tele, monitor) quedan apagadas
        if "Emission Color" in n.inputs:
            c = n.inputs["Emission Color"].default_value
            fuerza = n.inputs["Emission Strength"].default_value if "Emission Strength" in n.inputs else 0
            if fuerza > 0 and max(c[:3]) > 0.01:
                calida = c[0] >= c[2]
                poner(n, "Emission Strength", (12.0 if calida else 0.0) if modo == "noche" else 0.0)


def lampara_calada():
    """El colgante del living es una esfera calada: en el visor es wireframe y el GLB la trae llena."""
    for obj in bpy.data.objects:
        if obj.type == "MESH" and any(s.material and s.material.name.startswith("lampara") for s in obj.material_slots):
            mod = obj.modifiers.new("calado", "WIREFRAME")
            mod.thickness = 0.006
            mod.use_replace = True


# ---------- luz ----------
def mundo_dia(cfg):
    w = bpy.data.worlds.new("cielo")
    w.use_nodes = True
    arbol = w.node_tree
    fondo = arbol.nodes["Background"]
    cielo = arbol.nodes.new("ShaderNodeTexSky")
    for tipo in ("MULTIPLE_SCATTERING", "SINGLE_SCATTERING", "HOSEK_WILKIE"):
        try:
            cielo.sky_type = tipo
            break
        except TypeError:
            continue
    if hasattr(cielo, "sun_disc"):
        cielo.sun_disc = False          # el disco lo pone la lámpara de sol (menos ruido)
    elev = math.radians(cfg["sol_elevacion"])
    dx, dy = cfg["sol_desde"]
    desde = Vector((dx, -dy, 0)).normalized()
    if hasattr(cielo, "sun_elevation"):
        cielo.sun_elevation = elev
        cielo.sun_rotation = math.atan2(desde.x, desde.y) % (2 * math.pi)
    arbol.links.new(cielo.outputs["Color"], fondo.inputs["Color"])
    fondo.inputs["Strength"].default_value = cfg["cielo_intensidad"]
    bpy.context.scene.world = w

    sol = bpy.data.lights.new("sol", "SUN")
    sol.energy = cfg["sol_intensidad"]
    sol.angle = math.radians(0.6)
    sol.color = kelvin(5600)
    obj = bpy.data.objects.new("sol", sol)
    hacia_sol = desde * math.cos(elev) + Vector((0, 0, math.sin(elev)))
    obj.rotation_euler = (-hacia_sol).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(obj)


def bajar_edificio_vecino(alto):
    """El edificio de ladrillo de enfrente (grupo 'entorno' del visor) mide 25 m: se corta a `alto` sobre el piso."""
    vecino = bpy.data.objects.get("entorno")
    if not vecino:
        return
    for obj in vecino.children_recursive:
        if obj.type != "MESH":
            continue
        inv = obj.matrix_world.inverted()
        for v in obj.data.vertices:
            mundo = obj.matrix_world @ v.co
            if mundo.z > alto:
                mundo.z = alto
                v.co = inv @ mundo


def portales(depto):
    """Luces portal en ventanas y puertas de vidrio de la fachada: guían la luz del cielo hacia adentro."""
    fachada = next(m for m in depto["muros"] if m["id"] == "fachada")
    cara = fachada["en"] + fachada["espesor"] / 2      # cara interior del muro
    for a in fachada.get("aberturas", []):
        pie = a.get("antepecho", 0)
        luz = bpy.data.lights.new(f"portal {a.get('nombre', '')}", "AREA")
        luz.shape = "RECTANGLE"
        luz.size, luz.size_y = a["hasta"] - a["desde"], a["alto"]
        luz.cycles.is_portal = True
        obj = bpy.data.objects.new(luz.name, luz)
        obj.location = P((a["desde"] + a["hasta"]) / 2, cara + 0.01, pie + a["alto"] / 2)
        obj.rotation_euler = (-math.pi / 2, 0, 0)        # emite hacia adentro (-Y en Blender)
        bpy.context.scene.collection.objects.link(obj)


def mundo_noche():
    w = bpy.data.worlds.new("noche")
    w.use_nodes = True
    fondo = w.node_tree.nodes["Background"]
    fondo.inputs["Color"].default_value = (0.012, 0.018, 0.04, 1)
    fondo.inputs["Strength"].default_value = 0.6
    bpy.context.scene.world = w


def luz(nombre, tipo, pos, potencia, color, radio=0.05, hacia_abajo=False, angulo=None):
    l = bpy.data.lights.new(nombre, tipo)
    l.energy = potencia
    l.color = color
    if tipo in ("POINT", "SPOT"):
        l.shadow_soft_size = radio
    if tipo == "AREA":
        l.shape = "DISK"
        l.size = radio * 2
    if tipo == "SPOT" and angulo:
        l.spot_size = math.radians(angulo)
        l.spot_blend = 0.6
    obj = bpy.data.objects.new(nombre, l)
    obj.location = pos
    if hacia_abajo:
        obj.rotation_euler = (0, 0, 0)       # las luces de área y spot apuntan a -Z: hacia abajo
    bpy.context.scene.collection.objects.link(obj)


def items_distribucion(dist_id):
    d = leer("distribuciones.json")
    dist = next(x for x in d["distribuciones"] if x["id"] == dist_id)
    items = {}
    for i in d.get("comunes", []) + dist["items"]:
        items[i["id"]] = i
    return [i for i in items.values() if not i.get("guardado")]


def luces_noche(cfg_noche, depto, dist_id):
    color = kelvin(cfg_noche.get("kelvin", 2700))
    H = depto["alto_techo"]
    for f in depto.get("fijos", []):
        if f["tipo"] == "lampara":
            x, y = f["pos"]
            luz("colgante", "POINT", P(x, y, H - 0.72), 60, color, radio=0.06)
    catalogo = {m["id"]: m for m in leer("muebles.json")["muebles"]}
    for it in items_distribucion(dist_id):
        m = catalogo.get(it["mueble"], {})
        alto = m.get("medidas", [0, 0, 0])[2]
        x, y = it["pos"]
        g = math.radians(it.get("giro", 0))
        base = it.get("elev", 0)
        if m.get("tipo") == "lampara_arco":
            alcance = m.get("alcance", 1.4)
            luz("lampara de arco", "SPOT", P(x + alcance * math.sin(g), y + alcance * math.cos(g), alto - 0.42),
                45, color, radio=0.08, hacia_abajo=True, angulo=110)
        elif m.get("tipo") == "lampara_pie":
            luz("lampara de pie", "POINT", P(x, y, base + alto - 0.12), 45, color, radio=0.08)
        elif m.get("tipo") == "lampara_mesa":
            luz("lampara de mesa", "POINT", P(x, y, base + alto - 0.12), 18, color, radio=0.05)
    for s in cfg_noche.get("spots_techo", []):
        x, y = s["pos"]
        luz(f"spot {s['nombre']}", "AREA", P(x, y, s["alto"] - 0.01), s["potencia"], color, radio=0.06, hacia_abajo=True)


# ---------- cámara y render ----------
def camara(vista, ancho, alto):
    cam = bpy.data.cameras.new("camara")
    cam.lens = vista.get("lente", 20)
    cam.sensor_width = 36
    cam.sensor_fit = "HORIZONTAL"
    cam.clip_start = 0.05
    cam.shift_y = vista.get("desplazamiento", 0.0)
    obj = bpy.data.objects.new("camara", cam)
    origen, destino = P(*vista["pos"]), P(*vista["mira"])
    obj.location = origen
    obj.rotation_euler = (destino - origen).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(obj)
    bpy.context.scene.camera = obj


def configurar_render(muestras, ancho, alto, escala, exposicion, salida, blancos=None):
    esc = bpy.context.scene
    esc.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    try:
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        esc.cycles.device = "GPU"
    except TypeError:
        esc.cycles.device = "CPU"
    esc.cycles.samples = muestras
    esc.cycles.use_adaptive_sampling = True
    esc.cycles.adaptive_threshold = 0.02
    esc.cycles.use_denoising = True
    if hasattr(esc.cycles, "denoising_use_gpu"):
        esc.cycles.denoising_use_gpu = True
    try:
        esc.cycles.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    esc.cycles.max_bounces = 10
    esc.cycles.diffuse_bounces = 6
    esc.cycles.glossy_bounces = 4
    esc.cycles.transmission_bounces = 10
    esc.cycles.transparent_max_bounces = 16
    esc.cycles.sample_clamp_indirect = 8
    esc.cycles.caustics_reflective = False
    esc.cycles.caustics_refractive = False
    esc.render.resolution_x, esc.render.resolution_y = ancho, alto
    esc.render.resolution_percentage = escala
    for transformacion in ("AgX", "Filmic"):
        try:
            esc.view_settings.view_transform = transformacion
            break
        except TypeError:
            continue
    for mirada in ("AgX - Medium High Contrast", "Medium High Contrast"):
        try:
            esc.view_settings.look = mirada
            break
        except TypeError:
            continue
    esc.view_settings.exposure = exposicion
    # balance de blancos: neutraliza el azul del cielo de día y el naranja de las lámparas de noche
    if hasattr(esc.view_settings, "use_white_balance") and blancos:
        esc.view_settings.use_white_balance = True
        esc.view_settings.white_balance_temperature = blancos
    esc.render.image_settings.file_format = "PNG"
    esc.render.filepath = str(salida)


def main():
    args = argumentos()
    cfg, depto = leer("render.json"), leer("depto.json")
    vista = next(v for v in cfg["vistas"] if v["id"] == args.vista)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(Path(args.escena).resolve()))
    for obj in [o for o in bpy.data.objects if o.type in ("LIGHT", "CAMERA")]:
        bpy.data.objects.remove(obj, do_unlink=True)   # luces y cámaras del visor: acá van las propias

    ajustar_materiales(args.modo)
    lampara_calada()
    bajar_edificio_vecino(cfg.get("edificio_vecino_alto", 9.0))
    if args.modo == "dia":
        mundo_dia(cfg["dia"])
        portales(depto)
        # ambientes sin ventana (baño, hall): de día también tienen su luz de techo prendida
        for s in cfg["noche"].get("spots_techo", []):
            if s["nombre"] in vista.get("spots_dia", []):
                x, y = s["pos"]
                luz(f"spot {s['nombre']}", "AREA", P(x, y, s["alto"] - 0.01), s["potencia"] * 1.6, kelvin(3500),
                    radio=0.06, hacia_abajo=True)
    else:
        mundo_noche()
        luces_noche(cfg["noche"], depto, cfg["distribucion"])

    ancho, alto = cfg["resolucion"]
    camara(vista, ancho, alto)
    muestras = args.muestras or cfg["muestras"][args.modo]
    exposicion = cfg[args.modo]["exposicion"] + vista.get("exposicion_extra", {}).get(args.modo, 0)
    configurar_render(muestras, ancho, alto, args.escala, exposicion, Path(args.salida).resolve(),
                      cfg[args.modo].get("balance_blancos"))
    prefs = bpy.context.preferences.addons["cycles"].preferences
    print("DISPOSITIVO", bpy.context.scene.cycles.device, [d.name for d in prefs.devices if d.use])
    bpy.ops.render.render(write_still=True)
    print(f"RENDER_OK {args.salida}")


main()
