#!/usr/bin/env python3
"""Dibuja el plano 2D del departamento (SVG) a partir de datos/depto.json.

Uso: python3 -I herramientas/plano.py [datos.json] [salida.svg]
"""
import json
import math
import sys
from pathlib import Path

ESCALA = 80.0          # px por metro
MARGEN = 120.0         # px alrededor del dibujo
ALTO_LEYENDA = 120.0   # px debajo del dibujo

MURO = "#45443f"
VIDRIO = "#185fa5"
FIJO = "#0f6e56"
GRIS = "#8a8780"
TEXTO = "#2c2c2a"
PISOS = {"madera": "#f3e4c9", "porcelanato": "#ebe9e4", "porcelanato_gris": "#e2ddd4"}


def num(v, dec=2):
    return f"{v:.{dec}f}".replace(".", ",")


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def estilo(fill="none", stroke=None, sw=1.0, dash=None):
    s = f'fill="{fill}"'
    if stroke:
        s += f' stroke="{stroke}" stroke-width="{sw}"'
        if dash:
            s += f' stroke-dasharray="{dash}"'
    return s


class Plano:
    def __init__(self, datos):
        self.d = datos
        xs, ys = [], []
        for m in datos["muros"]:
            t = m["espesor"] / 2
            largo, ancho = (xs, ys) if m["eje"] == "x" else (ys, xs)
            largo += [m["desde"], m["hasta"]]
            ancho += [m["en"] - t, m["en"] + t]
        for e in datos.get("exteriores", []):
            xs += [e["rect"][0], e["rect"][2]]
            ys += [e["rect"][1], e["rect"][3]]
        for c in datos.get("cotas", []):
            largo, ancho = (xs, ys) if c["eje"] == "x" else (ys, xs)
            largo += [c["desde"], c["hasta"]]
            ancho += [c["en"] - 0.3, c["en"] + 0.3]
        self.x0, self.y0 = min(xs), min(ys)
        self.ancho = (max(xs) - self.x0) * ESCALA + 2 * MARGEN
        self.alto_dibujo = (max(ys) - self.y0) * ESCALA + 2 * MARGEN
        self.alto = self.alto_dibujo + ALTO_LEYENDA
        self.svg = []

    # --- primitivas en metros ---
    def X(self, x):
        return MARGEN + (x - self.x0) * ESCALA

    def Y(self, y):
        return MARGEN + (y - self.y0) * ESCALA

    def rect(self, x0, y0, x1, y1, rx=0, **k):
        x, y = self.X(min(x0, x1)), self.Y(min(y0, y1))
        w, h = abs(x1 - x0) * ESCALA, abs(y1 - y0) * ESCALA
        self.svg.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" {estilo(**k)}/>')

    def linea(self, x0, y0, x1, y1, stroke=MURO, sw=1.0, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.svg.append(f'<line x1="{self.X(x0):.1f}" y1="{self.Y(y0):.1f}" x2="{self.X(x1):.1f}" '
                        f'y2="{self.Y(y1):.1f}" stroke="{stroke}" stroke-width="{sw}"{d}/>')

    def polilinea(self, pts, stroke=GRIS, sw=1.0, dash=None):
        p = " ".join(f"{self.X(x):.1f},{self.Y(y):.1f}" for x, y in pts)
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.svg.append(f'<polyline points="{p}" fill="none" stroke="{stroke}" stroke-width="{sw}"{d}/>')

    def circulo(self, x, y, r_px, **k):
        self.svg.append(f'<circle cx="{self.X(x):.1f}" cy="{self.Y(y):.1f}" r="{r_px}" {estilo(**k)}/>')

    def elipse(self, x, y, rx, ry, **k):
        self.svg.append(f'<ellipse cx="{self.X(x):.1f}" cy="{self.Y(y):.1f}" rx="{rx * ESCALA:.1f}" '
                        f'ry="{ry * ESCALA:.1f}" {estilo(**k)}/>')

    def texto(self, x, y, s, size=12, peso=400, anchor="middle", color=TEXTO, dy=0, px=False):
        tx = x if px else self.X(x)
        ty = (y if px else self.Y(y)) + dy
        self.svg.append(f'<text x="{tx:.1f}" y="{ty:.1f}" font-size="{size}" font-weight="{peso}" '
                        f'text-anchor="{anchor}" fill="{color}">{esc(s)}</text>')

    # --- capas ---
    def pisos(self):
        for e in self.d.get("exteriores", []):
            self.rect(*e["rect"], fill="#f7f6f2", stroke=GRIS, sw=1, dash="6 4")
        for a in self.d["ambientes"]:
            for r in a["rects"]:
                self.rect(*r, fill=PISOS.get(a.get("piso"), "#f4f4f4"))

    def fijos(self):
        for f in self.d.get("fijos", []):
            if f.get("en_plano") is False:
                continue
            t, r = f["tipo"], f.get("rect")
            if t == "closet":
                self.rect(*r, fill="#dcefe8", stroke=FIJO, sw=1)
            elif t in ("cubierta", "mesada", "lavamanos"):
                self.rect(*r, fill="#e4ded2", stroke=GRIS, sw=1)
                if t == "lavamanos":
                    cx, cy = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2
                    self.rect(cx - 0.2, cy - 0.17, cx + 0.2, cy + 0.17, rx=3, fill="#ffffff", stroke=GRIS, sw=1)
            elif t == "lavaplatos":
                if f.get("doble"):   # dos bachas a lo largo de la mesada
                    medio = (r[1] + r[3]) / 2
                    self.rect(r[0], r[1], r[2], medio - 0.015, rx=4, fill="#ffffff", stroke=GRIS, sw=1)
                    self.rect(r[0], medio + 0.015, r[2], r[3], rx=4, fill="#ffffff", stroke=GRIS, sw=1)
                else:
                    self.rect(*r, rx=4, fill="#ffffff", stroke=GRIS, sw=1)
            elif t == "anafe":
                self.rect(*r, fill="#ffffff", stroke=GRIS, sw=1)
                for fx in (0.28, 0.72):
                    for fy in (0.28, 0.72):
                        self.circulo(r[0] + (r[2] - r[0]) * fx, r[1] + (r[3] - r[1]) * fy, 5, stroke=GRIS, sw=1)
            elif t == "banera":
                self.rect(*r, fill="#ffffff", stroke=GRIS, sw=1)
                self.rect(r[0] + 0.07, r[1] + 0.07, r[2] - 0.07, r[3] - 0.07, rx=10, fill="#ffffff", stroke=GRIS, sw=1)
            elif t == "inodoro":
                tanque = 0.2
                self.rect(r[0], r[1], r[2], r[1] + tanque, fill="#ffffff", stroke=GRIS, sw=1)
                self.elipse((r[0] + r[2]) / 2, (r[1] + tanque + r[3]) / 2, (r[2] - r[0]) / 2 * 0.85,
                            (r[3] - r[1] - tanque) / 2, fill="#ffffff", stroke=GRIS, sw=1)
            elif t == "tubos":
                self.rect(*r, fill="#f7f6f2", stroke=GRIS, sw=1, dash="3 3")
            elif t == "columna":
                self.rect(*r, fill=MURO)
            elif t == "bidet":
                self.elipse((r[0] + r[2]) / 2, (r[1] + r[3]) / 2 + 0.03, (r[2] - r[0]) / 2 * 0.8,
                            (r[3] - r[1]) / 2 * 0.8, fill="#ffffff", stroke=GRIS, sw=1)
            elif t == "aire":
                self.rect(*r, fill="#cfe2f6", stroke=VIDRIO, sw=1)
            elif t == "viga":
                self.rect(*r, stroke=GRIS, sw=1, dash="5 4")
            elif t == "enchufe":
                self.circulo(*f["pos"], 4.5, fill="#ffffff", stroke=FIJO, sw=1.5)
            elif t == "lampara":
                x, y = f["pos"]
                self.circulo(x, y, 8, stroke=GRIS, sw=1)
                self.linea(x - 0.07, y - 0.07, x + 0.07, y + 0.07, stroke=GRIS)
                self.linea(x - 0.07, y + 0.07, x + 0.07, y - 0.07, stroke=GRIS)
            if f.get("etiqueta"):
                if "pos_etiqueta" in f:
                    ex, ey = f["pos_etiqueta"]
                elif r:
                    ex, ey = (r[0] + r[2]) / 2, (r[1] + r[3]) / 2
                else:
                    ex, ey = f["pos"]
                self.texto(ex, ey, f["etiqueta"], size=11, color=FIJO if t == "closet" else TEXTO, dy=4)

    def muros(self):
        for m in self.d["muros"]:
            t = m["espesor"] / 2
            aberturas = sorted(m.get("aberturas", []), key=lambda a: a["desde"])
            cursor, tramos = m["desde"], []
            for a in aberturas:
                tramos.append((cursor, a["desde"]))
                cursor = a["hasta"]
            tramos.append((cursor, m["hasta"]))
            for a0, a1 in tramos:
                if a1 - a0 <= 1e-6:
                    continue
                if m["eje"] == "x":
                    self.rect(a0, m["en"] - t, a1, m["en"] + t, fill=MURO)
                else:
                    self.rect(m["en"] - t, a0, m["en"] + t, a1, fill=MURO)
            for a in aberturas:
                if a["tipo"] in ("ventana", "ventanal"):
                    self.ventana(m, a)
                elif a["tipo"] == "puerta":
                    self.puerta(m, a)
                elif a["tipo"] == "paso":   # hueco sin puerta: se pinta como piso
                    if m["eje"] == "x":
                        self.rect(a["desde"], m["en"] - t, a["hasta"], m["en"] + t, fill=PISOS["madera"])
                    else:
                        self.rect(m["en"] - t, a["desde"], m["en"] + t, a["hasta"], fill=PISOS["madera"])

    def ventana(self, m, a):
        t = m["espesor"] / 2
        horiz = m["eje"] == "x"
        if horiz:
            r = (a["desde"], m["en"] - t, a["hasta"], m["en"] + t)
        else:
            r = (m["en"] - t, a["desde"], m["en"] + t, a["hasta"])
        self.rect(*r, fill="#ffffff", stroke=VIDRIO, sw=1)
        largo = a["hasta"] - a["desde"]
        if a["tipo"] == "ventanal":   # dos hojas corredizas que se superponen
            hojas = [(0.38, a["desde"], a["desde"] + 0.55 * largo), (0.62, a["hasta"] - 0.55 * largo, a["hasta"])]
        else:
            hojas = [(0.38, a["desde"], a["hasta"]), (0.62, a["desde"], a["hasta"])]
        for f, h0, h1 in hojas:
            if horiz:
                yy = r[1] + (r[3] - r[1]) * f
                self.linea(h0, yy, h1, yy, stroke=VIDRIO, sw=1.4)
            else:
                xx = r[0] + (r[2] - r[0]) * f
                self.linea(xx, h0, xx, h1, stroke=VIDRIO, sw=1.4)

    def puerta(self, m, a):
        t = m["espesor"] / 2
        fija = a.get("hoja_fija", 0)
        ancho = a["hasta"] - a["desde"] - fija   # la hoja que abre; el paño fijo queda en el vano
        bisagra = a["desde"] if a["bisagra"] == "desde" else a["hasta"]
        otro = a["hasta"] if a["bisagra"] == "desde" else a["desde"]
        s = 1 if a["abre"] == "+" else -1
        cara = m["en"] + s * t
        if fija:
            f0, f1 = (otro - fija, otro) if otro > bisagra else (otro, otro + fija)
            if m["eje"] == "x":
                self.rect(f0, m["en"] - 0.02, f1, m["en"] + 0.02, fill=MURO)
            else:
                self.rect(m["en"] - 0.02, f0, m["en"] + 0.02, f1, fill=MURO)
        if m["eje"] == "x":
            pivote, u, v = (bisagra, cara), (math.copysign(1, otro - bisagra), 0), (0, s)
        else:
            pivote, u, v = (cara, bisagra), (0, math.copysign(1, otro - bisagra)), (s, 0)
        hoja = (pivote[0] + v[0] * ancho, pivote[1] + v[1] * ancho)
        self.linea(*pivote, *hoja, stroke=MURO, sw=2)
        arco = []
        for i in range(17):
            ang = math.pi / 2 * i / 16
            arco.append((pivote[0] + ancho * (math.cos(ang) * u[0] + math.sin(ang) * v[0]),
                         pivote[1] + ancho * (math.cos(ang) * u[1] + math.sin(ang) * v[1])))
        self.polilinea(arco, stroke=GRIS, sw=0.8, dash="4 3")

    def etiquetas(self):
        for e in self.d.get("exteriores", []):
            r = e["rect"]
            self.texto((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, e["nombre"], size=13, color=GRIS, dy=4)
        for a in self.d["ambientes"]:
            r = a["rects"][0]
            cx, cy = a.get("etiqueta", [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2])
            self.texto(cx, cy, a["nombre"], size=15, peso=600, dy=-10)
            if a.get("solo_nombre"):
                continue
            area = sum((q[2] - q[0]) * (q[3] - q[1]) for q in a["rects"])
            self.texto(cx, cy, f"{num(r[2] - r[0])} × {num(r[3] - r[1])} m", size=12, dy=8)
            self.texto(cx, cy, f"{num(area, 1)} m²", size=12, color=GRIS, dy=24)

    def cotas(self):
        for c in self.d.get("cotas", []):
            largo = c["hasta"] - c["desde"]
            if c["eje"] == "x":
                y = c["en"]
                self.linea(c["desde"], y, c["hasta"], y, stroke=GRIS, sw=0.8)
                for x in (c["desde"], c["hasta"]):
                    self.linea(x - 0.06, y + 0.06, x + 0.06, y - 0.06, stroke=TEXTO, sw=1.2)
                    self.linea(x, y - 0.12, x, y + 0.12, stroke=GRIS, sw=0.6)
                self.texto((c["desde"] + c["hasta"]) / 2, y, num(largo), dy=-6)
            else:
                x = c["en"]
                self.linea(x, c["desde"], x, c["hasta"], stroke=GRIS, sw=0.8)
                for y in (c["desde"], c["hasta"]):
                    self.linea(x - 0.06, y + 0.06, x + 0.06, y - 0.06, stroke=TEXTO, sw=1.2)
                    self.linea(x - 0.12, y, x + 0.12, y, stroke=GRIS, sw=0.6)
                izq = c.get("lado", "izq") == "izq"
                self.texto(self.X(x) + (-8 if izq else 8), self.Y((c["desde"] + c["hasta"]) / 2) + 4, num(largo),
                           anchor="end" if izq else "start", px=True)

    def leyenda(self):
        y = self.alto_dibujo - MARGEN + 70
        x = MARGEN
        s = self.svg
        s.append(f'<rect x="{x}" y="{y - 5}" width="26" height="10" fill="{MURO}"/>')
        self.texto(x + 34, y + 4, "muro", px=True, anchor="start")
        x += 100
        s.append(f'<rect x="{x}" y="{y - 5}" width="26" height="10" fill="#ffffff" stroke="{VIDRIO}"/>')
        s.append(f'<line x1="{x}" y1="{y}" x2="{x + 26}" y2="{y}" stroke="{VIDRIO}" stroke-width="1.4"/>')
        self.texto(x + 34, y + 4, "ventana", px=True, anchor="start")
        x += 115
        s.append(f'<line x1="{x}" y1="{y + 6}" x2="{x}" y2="{y - 14}" stroke="{MURO}" stroke-width="2"/>')
        s.append(f'<path d="M{x + 20} {y + 6} A20 20 0 0 0 {x} {y - 14}" fill="none" stroke="{GRIS}" '
                 f'stroke-width="0.8" stroke-dasharray="4 3"/>')
        self.texto(x + 30, y + 4, "puerta", px=True, anchor="start")
        x += 105
        s.append(f'<rect x="{x}" y="{y - 6}" width="22" height="12" fill="#dcefe8" stroke="{FIJO}"/>')
        self.texto(x + 30, y + 4, "fijo (clóset, cocina, baño)", px=True, anchor="start")
        x += 205
        s.append(f'<circle cx="{x + 5}" cy="{y}" r="4.5" fill="#ffffff" stroke="{FIJO}" stroke-width="1.5"/>')
        self.texto(x + 16, y + 4, "enchufe", px=True, anchor="start")
        x += 95
        s.append(f'<line x1="{x}" y1="{y}" x2="{x + ESCALA}" y2="{y}" stroke="{TEXTO}" stroke-width="1.5"/>')
        for xx in (x, x + ESCALA):
            s.append(f'<line x1="{xx}" y1="{y - 5}" x2="{xx}" y2="{y + 5}" stroke="{TEXTO}" stroke-width="1"/>')
        self.texto(x + ESCALA + 8, y + 4, "1 m", px=True, anchor="start")

        area = sum((r[2] - r[0]) * (r[3] - r[1]) for r in self.d.get("contorno_cubierto", []))
        pub = self.d.get("superficie_publicada_m2", {}).get("cubierta")
        nota = f"Superficie cubierta del plano: {num(area, 1)} m²"
        if pub:
            nota += f" (publicación: {pub} m²)"
        nota += f". Alto de techo supuesto: {num(self.d['alto_techo'])} m."
        self.texto(MARGEN, y + 40, nota, px=True, anchor="start", color=GRIS)
        self.texto(MARGEN, y + 60, self.d.get("nota_plano", "Medidas estimadas a partir de fotos y croquis, con un margen de ±10–15 %."),
                   px=True, anchor="start", color=GRIS)

    def dibujar(self):
        self.svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.ancho:.0f}" height="{self.alto:.0f}" '
                    f'viewBox="0 0 {self.ancho:.0f} {self.alto:.0f}" font-family="Helvetica, Arial, sans-serif">',
                    f'<rect width="{self.ancho:.0f}" height="{self.alto:.0f}" fill="#ffffff"/>']
        self.texto(MARGEN, 50, self.d.get("titulo", "Plano"), size=18, peso=600, anchor="start", px=True)
        self.pisos()
        self.fijos()
        self.muros()
        self.etiquetas()
        self.cotas()
        self.leyenda()
        self.svg.append("</svg>")
        return "\n".join(self.svg) + "\n"


def main():
    raiz = Path(__file__).resolve().parent.parent
    entrada = Path(sys.argv[1]) if len(sys.argv) > 1 else raiz / "datos" / "depto.json"
    salida = Path(sys.argv[2]) if len(sys.argv) > 2 else raiz / "salidas" / "plano.svg"
    datos = json.loads(entrada.read_text(encoding="utf-8"))
    salida.parent.mkdir(parents=True, exist_ok=True)
    salida.write_text(Plano(datos).dibujar(), encoding="utf-8")
    print(f"Plano generado: {salida}")


if __name__ == "__main__":
    main()
