// Visor 3D del departamento. Lee ../datos/depto.json y arma el modelo con Three.js.
// Coordenadas: x del plano -> X, y del plano (desde la fachada hacia adentro) -> Z, altura -> Y.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { construirMueble } from './muebles.js?v=10';

const DATOS_URL = '../datos/depto.json';
const MUEBLES_URL = '../datos/muebles.json';
const DISTRIBUCIONES_URL = '../datos/distribuciones.json';
const VERSIONES_URL = '../datos/versiones.json';
const VERSIONES_API = '/api/versiones';
// Con abrir_visor.command (servidor local) se pueden guardar versiones; el HTML de doble clic y Azure solo las muestran
const CON_SERVIDOR = ['127.0.0.1', 'localhost'].includes(location.hostname);   // en Azure o en el HTML suelto, solo se mira
const ALTURA_CORTE = 1.2;     // "Muros bajos"
const ALTURA_MUY_BAJA = 0.2;  // "Muros muy bajos": queda como un plano con relieve
const VELOCIDAD_PUERTAS = 3;  // rad/s al abrir o cerrar
const OJOS = 1.6;
const VELOCIDAD = 1.6;      // m/s al caminar

// ---------- Texturas generadas ----------
function azar(semilla) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function lienzo(tam, dibujar) {
  const c = document.createElement('canvas');
  c.width = c.height = tam;
  dibujar(c.getContext('2d'), tam);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

const TAM_MADERA = 1.8;        // metros que cubre la textura
const texMadera = lienzo(1024, (g, w) => {
  const r = azar(7);
  const tablas = 20;           // tablas de 9 cm
  const ancho = w / tablas;
  for (let i = 0; i < tablas; i++) {
    let y = -r() * w;
    while (y < w) {
      const largo = (0.45 + r() * 0.8) / TAM_MADERA * w;
      const tono = 0.9 + r() * 0.16;
      g.fillStyle = `rgb(${Math.min(255, 190 * tono) | 0},${Math.min(255, 126 * tono) | 0},${Math.min(255, 66 * tono) | 0})`;
      g.fillRect(i * ancho, y, ancho, largo);
      for (let k = 0; k < 7; k++) {
        const x = i * ancho + r() * ancho;
        g.strokeStyle = `rgba(110,60,22,${0.06 + r() * 0.1})`;
        g.lineWidth = 0.6 + r();
        g.beginPath();
        g.moveTo(x, y);
        g.bezierCurveTo(x + (r() - 0.5) * 8, y + largo * 0.3, x + (r() - 0.5) * 8, y + largo * 0.7, x + (r() - 0.5) * 5, y + largo);
        g.stroke();
      }
      g.fillStyle = 'rgba(80,45,20,0.45)';
      g.fillRect(i * ancho, y + largo - 1.5, ancho, 1.5);
      y += largo;
    }
    g.fillStyle = 'rgba(80,45,20,0.4)';
    g.fillRect(i * ancho, 0, 1.4, w);
  }
});

const TAM_PORCELANATO = 1.2;   // 2 x 2 baldosas de 60 cm
const texPorcelanato = lienzo(512, (g, w) => {
  const r = azar(3);
  g.fillStyle = '#e4e0d8';
  g.fillRect(0, 0, w, w);
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '160,150,135'},${r() * 0.06})`;
    g.fillRect(r() * w, r() * w, 3, 3);
  }
  g.fillStyle = 'rgba(150,143,130,0.7)';
  for (const p of [0, w / 2]) { g.fillRect(p, 0, 2, w); g.fillRect(0, p, w, 2); }
});

// Porcelanato beige grisáceo del baño (fotos 14, 16 y 23): 60 x 60, casi liso, apenas más oscuro que las paredes
const texPorcelanatoGris = lienzo(512, (g, w) => {
  const r = azar(13);
  g.fillStyle = '#d5cfc4';
  g.fillRect(0, 0, w, w);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '120,118,112'},${r() * 0.05})`;
    g.fillRect(r() * w, r() * w, 3, 3);
  }
  g.fillStyle = 'rgba(120,118,112,0.6)';
  for (const p of [0, w / 2]) { g.fillRect(p, 0, 2, w); g.fillRect(0, p, w, 2); }
});

// Azulejo crema del baño (foto 23): piezas grandes de 60 x 60, satinadas, con un veteado muy suave
const TAM_AZULEJO = 1.2;
const texAzulejo = lienzo(512, (g, w) => {
  const r = azar(17);
  g.fillStyle = '#e6dccb';
  g.fillRect(0, 0, w, w);
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(${r() > 0.5 ? '250,245,235' : '205,192,172'},${0.03 + r() * 0.05})`;
    g.lineWidth = 6 + r() * 14;
    g.lineCap = g.lineJoin = 'round';
    g.beginPath();
    let x = r() * w, y = r() * w;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 120; y += (r() - 0.3) * 90; g.lineTo(x, y); }
    g.stroke();
  }
  g.fillStyle = 'rgba(175,165,148,0.65)';
  for (const p of [0, w / 2]) { g.fillRect(p, 0, 1.5, w); g.fillRect(0, p, w, 1.5); }
});

const texGranito = lienzo(512, (g, w) => {
  const r = azar(11);
  g.fillStyle = '#dad6ce';
  g.fillRect(0, 0, w, w);
  const colores = ['#262626', '#5d5852', '#8f897f', '#f3f0ea', '#463b36', '#b9b2a6'];
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = colores[(r() * colores.length) | 0];
    const s = 1 + r() * 3.5;
    g.fillRect(r() * w, r() * w, s, s * (0.5 + r()));
  }
});

// ---------- Materiales ----------
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
const M = {
  pared: mat(0xf0eee8, { roughness: 0.92 }),
  techo: mat(0xf7f6f2, { roughness: 0.95 }),
  losa: mat(0xcfccc4, { roughness: 1 }),
  blanco: mat(0xf5f5f2, { roughness: 0.45 }),
  loza: mat(0xfbfbfa, { roughness: 0.15 }),
  zocalo: mat(0xfafaf8, { roughness: 0.6 }),
  aluminio: mat(0xd5d7d9, { roughness: 0.35, metalness: 0.6 }),
  puerta: mat(0x3b2a21, { roughness: 0.55 }),
  vidrio: new THREE.MeshStandardMaterial({ color: 0xd6e8f2, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.2, depthWrite: false }),
  acero: mat(0xb9bdc0, { roughness: 0.3, metalness: 0.85 }),
  negro: mat(0x1e1e20, { roughness: 0.3 }),
  zocaloCocina: mat(0x9a9890, { roughness: 0.7 }),
  piedra: mat(0xe3d9c5, { roughness: 0.45 }),
  maderaOscura: mat(0x3b2a21, { roughness: 0.6 }),
  espejo: mat(0xd3dbdf, { roughness: 0.12, metalness: 0.6 }),
  ladrillo: null,
  revoque: mat(0xe7e4dd, { roughness: 0.95 }),
  granito: new THREE.MeshStandardMaterial({ map: texGranito, roughness: 0.22 }),
  closet: mat(0xf3f2ee, { roughness: 0.5 }),
  fondoBanera: mat(0xe6e9ea, { roughness: 0.15 }),
  fondoBacha: mat(0x6f7579, { roughness: 0.3, metalness: 0.8 }),
  lampara: mat(0xd9b98a, { roughness: 0.6, wireframe: true }),
  foco: new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffd9a0, emissiveIntensity: 2 }),
};
M.granito.userData.tam = 0.6;
M.azulejo = new THREE.MeshStandardMaterial({ name: 'azulejo', map: texAzulejo, roughness: 0.3 });
M.azulejo.userData.tam = TAM_AZULEJO;

// Tela de las cortinas: pliegues verticales suaves (4 cada 50 cm); roller y soga de las cortinas
const texTela = lienzo(128, (g, w) => {
  for (let x = 0; x < w; x++) {
    const v = 224 + Math.round(16 * Math.sin((x / w) * Math.PI * 8));
    g.fillStyle = `rgb(${v},${v - 7},${v - 20})`;
    g.fillRect(x, 0, 1, w);
  }
});
M.tela = new THREE.MeshStandardMaterial({ map: texTela, roughness: 1 });
M.tela.userData.tam = 0.5;
M.roller = mat(0xd9d5cd, { roughness: 0.95 });
M.soga = mat(0xa8865a, { roughness: 1 });
M.bronce = mat(0xa8844e, { roughness: 0.35, metalness: 0.8 });
// cada material lleva su nombre: Blender los reconoce al importar la escena (renders fotorrealistas)
for (const [nombre, m] of Object.entries(M)) if (m) m.name = nombre;

// Ladrillo visto de los edificios vecinos (se ve por las ventanas)
const texLadrillo = lienzo(512, (g, w) => {
  const r = azar(5);
  g.fillStyle = '#c9c1b4';
  g.fillRect(0, 0, w, w);
  const filas = 16, alto = w / filas, largo = w / 4;     // la textura cubre 1,2 x 1,2 m
  for (let f = 0; f < filas; f++) {
    const desfase = f % 2 ? largo / 2 : 0;
    for (let k = -1; k < 5; k++) {
      const t = 0.85 + r() * 0.3;
      g.fillStyle = `rgb(${158 * t | 0},${78 * t | 0},${52 * t | 0})`;
      g.fillRect(k * largo + desfase + 3, f * alto + 3, largo - 6, alto - 6);
    }
  }
});
M.ladrillo = new THREE.MeshStandardMaterial({ map: texLadrillo, roughness: 0.95 });
M.ladrillo.userData.tam = 1.2;

// Caja con las UV escaladas a metros, para que las texturas no se estiren.
function geometriaCaja(w, h, p, tam) {
  const geo = new THREE.BoxGeometry(w, h, p);
  if (tam) {
    const uv = geo.attributes.uv;
    const dims = [[p, h], [p, h], [w, p], [w, p], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      for (let k = 0; k < 4; k++) {
        const i = f * 4 + k;
        uv.setXY(i, uv.getX(i) * dims[f][0] / tam, uv.getY(i) * dims[f][1] / tam);
      }
    }
  }
  return geo;
}

// ---------- Construcción del modelo ----------
// corte: altura a la que se cortan muros, aberturas y lo que cuelga de ellos.
// corteFijos: altura de corte de los elementos fijos (cubierta, clóset, baño), para que se sigan viendo
// aunque los muros estén muy bajos.
function construir(d, corte = Infinity, corteFijos = corte) {
  const g = new THREE.Group();
  const H = d.alto_techo;
  const altoMax = Math.min(H, corte);
  const hojas = [];   // pivotes de las hojas de las puertas
  let limite = corte;
  let fantasma = false;   // dibuja semitransparente lo que queda por encima del corte (alacenas en la vista aérea)
  const fantasmas = new Map();
  const deFantasma = (m) => {
    if (!fantasmas.has(m)) fantasmas.set(m, Object.assign(m.clone(), { transparent: true, opacity: 0.4, depthWrite: false }));
    return fantasmas.get(m);
  };

  function caja(x0, x1, y0, y1, z0, z1, material, padre = g) {
    if (fantasma) material = deFantasma(material);
    [x0, x1] = [Math.min(x0, x1), Math.max(x0, x1)];
    [z0, z1] = [Math.min(z0, z1), Math.max(z0, z1)];
    y1 = Math.min(y1, limite);
    if (y1 - y0 <= 0.001 || x1 - x0 <= 0.0005 || z1 - z0 <= 0.0005) return null;
    const m = new THREE.Mesh(geometriaCaja(x1 - x0, y1 - y0, z1 - z0, material.userData.tam), material);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    padre.add(m);
    return m;
  }

  function cilindro(x, z, r, y0, y1, material) {
    y1 = Math.min(y1, limite);
    if (y1 - y0 <= 0.001) return;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, y1 - y0, 24), material);
    m.position.set(x, (y0 + y1) / 2, z);
    g.add(m);
  }

  // Cajas en el sistema de un muro: s a lo largo, n perpendicular (desde el eje).
  const enMuro = (mu) => (s0, s1, y0, y1, n0, n1, material) => (mu.eje === 'x'
    ? caja(s0, s1, y0, y1, mu.en + n0, mu.en + n1, material)
    : caja(mu.en + n0, mu.en + n1, y0, y1, s0, s1, material));

  // Losa debajo de todo
  for (const r of [...d.contorno_cubierto, ...(d.exteriores || []).map((e) => e.rect)]) {
    caja(r[0], r[2], -0.2, 0, r[1], r[3], M.losa);
  }

  // Pisos
  let capa = 0;
  const piso = (r, tipo) => {
    const w = r[2] - r[0], h = r[3] - r[1];
    const madera = tipo === 'madera', gris = tipo === 'porcelanato_gris';
    const tex = (madera ? texMadera : gris ? texPorcelanatoGris : texPorcelanato).clone();
    const tam = madera ? TAM_MADERA : TAM_PORCELANATO;
    tex.repeat.set(w / tam, h / tam);
    tex.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ name: madera ? 'piso_madera' : gris ? 'piso_porcelanato_gris' : 'piso_porcelanato', map: tex, roughness: madera ? 0.42 : gris ? 0.3 : 0.18 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(r[0] + w / 2, 0.002 + capa++ * 0.0004, r[1] + h / 2);
    g.add(m);
  };
  for (const a of d.ambientes) for (const r of a.rects) piso(r, a.piso);
  for (const e of d.exteriores || []) piso(e.rect, e.piso);

  // Muros con sus aberturas
  for (const mu of d.muros) {
    const t = mu.espesor / 2;
    const c = enMuro(mu);
    const aberturas = [...(mu.aberturas || [])].sort((a, b) => a.desde - b.desde);
    let cursor = mu.desde;
    for (const a of aberturas) { c(cursor, a.desde, 0, H, -t, t, M.pared); cursor = a.hasta; }
    c(cursor, mu.hasta, 0, H, -t, t, M.pared);
    for (const a of aberturas) {
      const pie = a.antepecho || 0;
      if (pie > 0) c(a.desde, a.hasta, 0, pie, -t, t, M.pared);
      if (pie + a.alto < H) c(a.desde, a.hasta, pie + a.alto, H, -t, t, M.pared);
      if (a.tipo === 'ventana' || a.tipo === 'ventanal') ventana(c, a);
      else if (a.tipo === 'puerta') puerta(mu, c, a);
    }
  }

  // Zócalos blancos en las caras de muro que dan a ambientes con piso de madera
  const pisoEn = (x, y) => {
    for (const a of d.ambientes) for (const r of a.rects) if (x > r[0] && x < r[2] && y > r[1] && y < r[3]) return a.piso;
    return null;
  };
  for (const mu of d.muros) {
    const t = mu.espesor / 2;
    const c = enMuro(mu);
    const huecos = (mu.aberturas || []).filter((a) => !(a.antepecho > 0)).sort((a, b) => a.desde - b.desde);
    const tramos = [];
    let cursor = mu.desde;
    for (const a of huecos) { tramos.push([cursor, a.desde]); cursor = a.hasta; }
    tramos.push([cursor, mu.hasta]);
    for (const [s0, s1] of tramos) {
      for (const sg of [-1, 1]) {
        const n0 = sg * t, n1 = sg * (t + 0.012);
        let ini = null, fin = null;
        const cerrar = () => {
          if (ini !== null) c(Math.max(s0, ini - 0.05), Math.min(s1, fin + 0.05), 0, 0.075, n0, n1, M.zocalo);
          ini = fin = null;
        };
        for (let s = s0 + 0.025; s < s1; s += 0.05) {
          const n = mu.en + sg * (t + 0.04);
          const p = mu.eje === 'x' ? pisoEn(s, n) : pisoEn(n, s);
          if (p === 'madera') { if (ini === null) ini = s; fin = s; } else if (p !== null) cerrar();
        }
        cerrar();
      }
    }
  }

  function hojaCorrediza(c, s0, s1, y0, y1, n) {
    const p = 0.045;
    c(s0, s1, y0, y0 + p, n - 0.015, n + 0.015, M.aluminio);
    c(s0, s1, y1 - p, y1, n - 0.015, n + 0.015, M.aluminio);
    c(s0, s0 + p, y0, y1, n - 0.015, n + 0.015, M.aluminio);
    c(s1 - p, s1, y0, y1, n - 0.015, n + 0.015, M.aluminio);
    c(s0 + p, s1 - p, y0 + p, y1 - p, n - 0.004, n + 0.004, M.vidrio);
  }

  function ventana(c, a) {
    const pie = a.antepecho || 0, tope = pie + a.alto, f = 0.05;
    const s0 = a.desde, s1 = a.hasta, medio = (s0 + s1) / 2;
    c(s0, s1, pie, pie + f, -0.045, 0.045, M.aluminio);
    c(s0, s1, tope - f, tope, -0.045, 0.045, M.aluminio);
    c(s0, s0 + f, pie, tope, -0.045, 0.045, M.aluminio);
    c(s1 - f, s1, pie, tope, -0.045, 0.045, M.aluminio);
    const trav = a.travesano;
    const base = trav ?? pie + f;
    if (trav) {
      c(s0, s1, trav - f / 2, trav + f / 2, -0.045, 0.045, M.aluminio);
      c(medio - 0.02, medio + 0.02, pie + f, trav, -0.03, 0.03, M.aluminio);
      c(s0 + f, s1 - f, pie + f, trav - f / 2, -0.004, 0.004, M.vidrio);
    }
    hojaCorrediza(c, s0 + f, medio + 0.03, base, tope - f, -0.02);
    hojaCorrediza(c, medio - 0.03, s1 - f, base, tope - f, 0.02);
  }

  function puerta(mu, c, a) {
    const t = mu.espesor / 2;
    const ancho = a.hasta - a.desde;
    const vidrio = a.hoja === 'vidrio';
    const marco = vidrio ? M.aluminio : M.puerta;
    // marco del vano
    c(a.desde, a.desde + 0.03, 0, a.alto, -t - 0.01, t + 0.01, marco);
    c(a.hasta - 0.03, a.hasta, 0, a.alto, -t - 0.01, t + 0.01, marco);
    c(a.desde, a.hasta, a.alto - 0.03, a.alto + 0.02, -t - 0.01, t + 0.01, marco);
    // La hoja cuelga de un pivote en la bisagra (sobre la cara del muro hacia donde abre).
    // Con rotación 0 queda abierta a 90°; con userData.cerrada queda cerrada dentro del vano.
    const sgn = a.abre === '+' ? 1 : -1;
    const bis = a.bisagra === 'desde' ? a.desde + 0.03 : a.hasta - 0.03;
    const dentro = a.bisagra === 'desde' ? 1 : -1;
    // hoja_fija: paño fijo junto al marco opuesto a la bisagra; la hoja que abre ocupa el resto
    const fija = a.hoja_fija || 0;
    const largo = ancho - 0.06 - fija, alto = a.alto - 0.03;
    if (fija > 0) {
      const f0 = a.bisagra === 'desde' ? a.hasta - 0.03 - fija : a.desde + 0.03;
      const [m0, m1] = [Math.min(sgn * (t - 0.04), sgn * t), Math.max(sgn * (t - 0.04), sgn * t)];
      c(f0, f0 + fija, 0.01, alto, m0, m1, M.puerta);
    }
    const pivote = new THREE.Group();
    pivote.name = `hoja ${a.nombre || ''}`;
    if (mu.eje === 'x') pivote.position.set(bis, 0, mu.en + sgn * t);
    else pivote.position.set(mu.en + sgn * t, 0, bis);
    pivote.userData.cerrada = (mu.eje === 'x' ? 1 : -1) * dentro * sgn * Math.PI / 2;
    // s: a lo largo del muro (espesor de la hoja), n: hacia afuera del muro (largo de la hoja)
    const hoja = (s0, s1, y0, y1, n0, n1, m) => (mu.eje === 'x'
      ? caja(s0, s1, y0, y1, n0, n1, m, pivote)
      : caja(n0, n1, y0, y1, s0, s1, m, pivote));
    const s0 = 0, s1 = dentro * 0.04;
    const [na, nb] = [Math.min(0, sgn * largo), Math.max(0, sgn * largo)];
    if (!vidrio) {
      hoja(s0, s1, 0.01, alto, na, nb, M.puerta);
    } else {
      const p = 0.06;
      hoja(s0, s1, 0.01, 0.01 + p, na, nb, M.aluminio);
      hoja(s0, s1, alto - p, alto, na, nb, M.aluminio);
      hoja(s0, s1, 0.01, alto, na, na + p, M.aluminio);
      hoja(s0, s1, 0.01, alto, nb - p, nb, M.aluminio);
      hoja(s0, s1, 0.95, 1.0, na, nb, M.aluminio);
      const sm = (s0 + s1) / 2;
      hoja(sm - 0.004, sm + 0.004, 0.01 + p, alto - p, na + p, nb - p, M.vidrio);
    }
    g.add(pivote);
    hojas.push(pivote);
  }

  // Elementos fijos
  const caraMasCercana = (x, y) => {
    let mejor = null;
    for (const mu of d.muros) {
      const t = mu.espesor / 2;
      const [s, n] = mu.eje === 'x' ? [x, y] : [y, x];
      if (s < mu.desde || s > mu.hasta) continue;
      for (const sg of [-1, 1]) {
        const dist = Math.abs(n - (mu.en + sg * t));
        if (!mejor || dist < mejor.dist) mejor = { mu, cara: mu.en + sg * t, sg, dist };
      }
    }
    return mejor;
  };

  for (const f of d.fijos || []) {
    const r = f.rect;
    // lo que va colgado o pegado al muro se corta con el muro; el resto, con corteFijos
    limite = ['enchufe', 'aire', 'viga', 'lampara', 'tubos', 'columna', 'registro', 'cielorraso', 'revestimiento'].includes(f.tipo) ? corte : corteFijos;
    // lo alto de la cocina no se corta: si queda por encima del corte, se ve semitransparente
    const altoCocina = ['alacena', 'purificador', 'estante'].includes(f.tipo);
    fantasma = altoCocina && corteFijos < f.alto_hasta;
    if (altoCocina) limite = Infinity;
    switch (f.tipo) {
      case 'closet': {
        // color "oscuro": puertas de madera (clóset del pasillo); si no, laqueado blanco
        caja(r[0], r[2], 0, f.alto, r[1], r[3], f.color === 'oscuro' ? M.puerta : M.closet);
        if (f.alto < H) caja(r[0], r[2], f.alto, H, r[1], r[3], M.pared);
        // perfiles de las hojas corredizas sobre el frente (frente hacia ±y o ±x)
        if (f.frente === '+x' || f.frente === '-x') {
          const x = f.frente === '+x' ? r[2] + 0.006 : r[0] - 0.006;
          const medio = (r[1] + r[3]) / 2;
          for (const z of [r[1] + 0.02, medio, r[3] - 0.02]) caja(x - 0.006, x + 0.006, 0.02, f.alto - 0.02, z - 0.015, z + 0.015, M.aluminio);
          caja(x - 0.006, x + 0.006, f.alto - 0.035, f.alto, r[1], r[3], M.aluminio);
        } else {
          const z = f.frente === '+y' ? r[3] + 0.006 : r[1] - 0.006;
          const medio = (r[0] + r[2]) / 2;
          for (const x of [r[0] + 0.02, medio, r[2] - 0.02]) caja(x - 0.015, x + 0.015, 0.02, f.alto - 0.02, z - 0.006, z + 0.006, M.aluminio);
          caja(r[0], r[2], f.alto - 0.035, f.alto, z - 0.006, z + 0.006, M.aluminio);
        }
        break;
      }
      case 'cubierta': {
        const alto = f.alto ?? 0.9;
        caja(r[0], r[2] - 0.05, 0, 0.1, r[1], r[3], M.zocaloCocina);
        caja(r[0], r[2], 0.1, alto - 0.04, r[1], r[3], M.blanco);
        caja(r[0], r[2] + 0.02, alto - 0.04, alto, r[1], r[3], M.granito);
        if (corte > alto) caja(r[0], r[0] + 0.02, alto, Math.min(1.5, corte), r[1], r[3], M.granito);   // salpicadero contra la pared
        // frentes de los muebles bajos: módulos con puertas o cajones, y el hueco del horno
        const junta = (z) => caja(r[2], r[2] + 0.004, 0.12, alto - 0.06, z - 0.003, z + 0.003, M.zocaloCocina);
        if (f.modulos) {
          let desde = r[1];
          for (const m of f.modulos) {
            if (desde > r[1] + 0.01) junta(desde);
            for (let i = 1; i < (m.puertas || 0); i++) junta(desde + (m.hasta - desde) * i / m.puertas);
            for (let i = 1; i < (m.cajones || 0); i++) {
              const y = 0.12 + (alto - 0.18) * i / m.cajones;
              caja(r[2], r[2] + 0.004, y - 0.003, y + 0.003, desde + 0.003, m.hasta - 0.003, M.zocaloCocina);
            }
            desde = m.hasta;
          }
        } else {
          for (let z = r[1] + 0.6; z < r[3] - 0.1; z += 0.6) junta(z);
        }
        break;
      }
      case 'roller': {
        // cortina roller en el vano de la ventana: cajón arriba, tela bajada según "cerrado" (0 = enrollada) y barra de peso
        const tope = f.alto_hasta, caida = Math.max((f.alto_hasta - f.alto_desde) * (f.cerrado || 0), 0.09), zm = (r[1] + r[3]) / 2;
        caja(r[0], r[2], tope - 0.08, tope, r[1], r[3], M.blanco);
        if (caida > 0.09) caja(r[0] + 0.01, r[2] - 0.01, tope - caida, tope - 0.08, zm - 0.003, zm + 0.003, M.roller);
        caja(r[0] + 0.01, r[2] - 0.01, tope - caida - 0.02, tope - caida, zm - 0.008, zm + 0.008, M.aluminio);
        break;
      }
      case 'cortinas': {
        // dos paños en las puntas del barral, atados a media altura con una soga (forma de reloj de arena)
        const barral = f.alto, atadas = f.atadas, zm = (r[1] + r[3]) / 2;
        caja(r[0] - 0.02, r[2] + 0.02, barral, barral + 0.02, zm - 0.01, zm + 0.01, M.acero);
        const ancho = (y) => (y >= atadas ? 0.14 + 0.28 * (y - atadas) / (barral - atadas) : 0.14 + 0.18 * (atadas - y) / atadas);
        for (const lado of [-1, 1]) {
          for (let y = 0.01; y < barral - 0.001; y += 0.05) {
            const y1 = Math.min(y + 0.05, barral), w = ancho((y + y1) / 2);
            caja(lado < 0 ? r[0] : r[2] - w, lado < 0 ? r[0] + w : r[2], y, y1, r[1], r[3], M.tela);
          }
          if (limite > atadas) {
            const cx = lado < 0 ? r[0] + 0.07 : r[2] - 0.07;
            const soga = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.011, 8, 28), M.soga);
            soga.position.set(cx, atadas, zm);
            soga.rotation.x = Math.PI / 2;
            soga.scale.set(1, 0.65, 1);
            g.add(soga);
            caja(cx - 0.006, cx + 0.006, atadas - 0.13, atadas, r[3] + 0.002, r[3] + 0.014, M.soga);   // la punta del nudo
          }
        }
        break;
      }
      case 'mesada': {
        // solo la cubierta de granito y el salpicadero: abajo queda un hueco (el del lavarropas)
        const alto = f.alto ?? 0.9;
        caja(r[0], r[2] + 0.02, alto - 0.04, alto, r[1], r[3], M.granito);
        if (corte > alto) caja(r[0], r[0] + 0.02, alto, Math.min(1.5, corte), r[1], r[3], M.granito);
        break;
      }
      case 'alacena': {
        caja(r[0], r[2], f.alto_desde, f.alto_hasta, r[1], r[3], M.blanco);
        // juntas entre puertas: "puertas" iguales si se indica; si no, una cada 0,60 m
        const juntas = [];
        if (f.puertas) for (let i = 1; i < f.puertas; i++) juntas.push(r[1] + (r[3] - r[1]) * i / f.puertas);
        else for (let z = r[1] + 0.6; z < r[3] - 0.1; z += 0.6) juntas.push(z);
        for (const z of [r[1], ...juntas, r[3]]) caja(r[2], r[2] + 0.004, f.alto_desde + 0.02, f.alto_hasta - 0.02, z - 0.003, z + 0.003, M.zocaloCocina);
        break;
      }
      case 'estante': {
        // estantería abierta: laterales, piso, techo y los estantes intermedios
        const t = 0.018;
        for (const z of [r[1], r[3] - t]) caja(r[0], r[2], f.alto_desde, f.alto_hasta, z, z + t, M.blanco);
        for (const y of [f.alto_desde, ...(f.estantes || []), f.alto_hasta - t]) caja(r[0], r[2], y, y + t, r[1] + t, r[3] - t, M.blanco);
        break;
      }
      case 'purificador': {
        // cuerpo empotrado bajo la alacena, filtros abajo y visera de acero extraíble hasta x = visera
        const base = f.alto_desde + 0.035;
        caja(r[0], r[2], base, f.alto_hasta, r[1], r[3], M.blanco);
        caja(r[0] + 0.02, r[2] - 0.04, base - 0.004, base, r[1] + 0.03, r[3] - 0.03, M.negro);
        caja(r[2] - 0.06, f.visera ?? r[2], f.alto_desde, base, r[1] + 0.01, r[3] - 0.01, M.acero);
        break;
      }
      case 'lavaplatos': {
        // reborde de acero con una o dos bachas (doble: true) y canilla monocomando contra la pared
        caja(r[0], r[2], 0.895, 0.903, r[1], r[3], M.acero);
        const zc = (r[1] + r[3]) / 2;
        const bachas = f.doble ? [[r[1] + 0.03, zc - 0.015], [zc + 0.015, r[3] - 0.03]] : [[r[1] + 0.03, r[3] - 0.03]];
        for (const [b0, b1] of bachas) caja(r[0] + 0.06, r[2] - 0.03, 0.903, 0.905, b0, b1, M.fondoBacha);
        cilindro(r[0] + 0.05, zc, 0.018, 0.9, 1.18, M.acero);
        caja(r[0] + 0.05, r[0] + 0.24, 1.16, 1.19, zc - 0.012, zc + 0.012, M.acero);
        break;
      }
      case 'anafe': {
        caja(r[0], r[2], 0.9, 0.912, r[1], r[3], M.acero);
        for (const fx of [0.28, 0.72]) for (const fz of [0.28, 0.72]) {
          cilindro(r[0] + (r[2] - r[0]) * fx, r[1] + (r[3] - r[1]) * fz, 0.055, 0.912, 0.93, M.negro);
        }
        if (f.horno) {
          // horno empotrado de acero bajo el anafe, con puerta de vidrio y manija; abajo queda un cajón
          const z0 = r[1] + 0.01, z1 = r[3] - 0.01, x = r[2] + 0.01;
          caja(x, x + 0.02, 0.26, 0.84, z0, z1, M.acero);
          caja(x + 0.02, x + 0.024, 0.32, 0.70, z0 + 0.05, z1 - 0.05, M.negro);
          caja(x + 0.03, x + 0.045, 0.725, 0.745, z0 + 0.08, z1 - 0.08, M.acero);
        }
        break;
      }
      case 'banera': {
        caja(r[0], r[2], 0, 0.55, r[1], r[3], M.loza);
        caja(r[0] + 0.07, r[2] - 0.07, 0.5, 0.552, r[1] + 0.07, r[3] - 0.07, M.fondoBanera);
        // mampara de vidrio sobre el borde libre, en la punta de la ducha (mampara: '-y' o '+y')
        const largo = (r[3] - r[1]) * 0.5;
        const [m0, m1] = f.mampara === '+y' ? [r[3] - largo, r[3]] : [r[1], r[1] + largo];
        caja(r[0] + 0.02, r[0] + 0.03, 0.56, 2.0, m0, m1, M.vidrio);
        caja(r[0] + 0.015, r[0] + 0.035, 1.98, 2.0, m0, m1, M.aluminio);
        break;
      }
      case 'inodoro': {
        caja(r[0] + 0.03, r[2] - 0.03, 0.4, 0.8, r[1], r[1] + 0.18, M.loza);
        const cx = (r[0] + r[2]) / 2, cz = r[1] + 0.4;
        cilindro(cx, cz, 0.17, 0, 0.4, M.loza);
        cilindro(cx, cz, 0.19, 0.4, 0.42, M.loza);
        break;
      }
      case 'bidet': {
        const cx = (r[0] + r[2]) / 2, cz = r[1] + 0.32;
        caja(r[0] + 0.08, r[2] - 0.08, 0, 0.38, r[1], r[1] + 0.12, M.loza);
        cilindro(cx, cz, 0.17, 0, 0.4, M.loza);
        break;
      }
      case 'lavamanos': {
        // mueble flotante con repisas oscuras, bacha de apoyo y espejo en la pared de "contra" (±x o ±y)
        const alto = f.alto ?? 0.85;
        const enX = f.contra === '+x' || f.contra === '-x';
        caja(r[0], r[2], alto - 0.05, alto, r[1], r[3], M.piedra);
        if (enX) {
          caja(r[0], r[2], 0.15, alto - 0.05, r[1], r[1] + 0.03, M.maderaOscura);
          caja(r[0], r[2], 0.15, alto - 0.05, r[3] - 0.03, r[3], M.maderaOscura);
          for (const y of [0.15, 0.45]) caja(f.contra === '+x' ? r[0] + 0.02 : r[0], f.contra === '+x' ? r[2] : r[2] - 0.02, y, y + 0.03, r[1] + 0.03, r[3] - 0.03, M.maderaOscura);
        } else {
          caja(r[0], r[0] + 0.03, 0.15, alto - 0.05, r[1], r[3], M.maderaOscura);
          caja(r[2] - 0.03, r[2], 0.15, alto - 0.05, r[1], r[3], M.maderaOscura);
          for (const y of [0.15, 0.45]) caja(r[0] + 0.03, r[2] - 0.03, y, y + 0.03, r[1] + 0.02, r[3], M.maderaOscura);
        }
        // bacha: coordenada del centro de la bacha a lo largo de la mesada (si no, centrada)
        const cx = !enX && f.bacha ? f.bacha : (r[0] + r[2]) / 2, cz = enX && f.bacha ? f.bacha : (r[1] + r[3]) / 2;
        if (enX) caja(cx - 0.17, cx + 0.15, alto, alto + 0.15, cz - 0.22, cz + 0.22, M.loza);
        else caja(cx - 0.22, cx + 0.22, alto, alto + 0.15, cz - 0.17, cz + 0.15, M.loza);
        const signo = f.contra === '-y' || f.contra === '-x' ? -1 : 1;
        const espejo = f.espejo_hasta ?? 2.1;
        if (enX) {
          const pared = signo > 0 ? r[2] : r[0];
          cilindro(pared - 0.06 * signo, cz, 0.015, alto, alto + 0.3, M.acero);
          caja(pared, pared - 0.01 * signo, alto + 0.1, espejo, r[1], r[3], M.espejo);
        } else {
          const pared = signo > 0 ? r[3] : r[1];
          cilindro(cx, pared - 0.06 * signo, 0.015, alto, alto + 0.3, M.acero);
          caja(r[0], r[2], alto + 0.1, espejo, pared, pared - 0.01 * signo, M.espejo);
        }
        break;
      }
      case 'aire':
        caja(r[0], r[2], f.alto_desde, f.alto_hasta, r[1], r[3], M.blanco);
        break;
      case 'tubos': {
        // tubos verticales de la calefacción contra la pared (no ocupan lugar para los choques)
        const x = (r[0] + r[2]) / 2;
        for (const z of [r[1] + 0.15, r[1] + 0.27]) cilindro(x, z, 0.025, 0, H, M.blanco);
        break;
      }
      case 'viga':
        caja(r[0], r[2], f.alto_desde, H, r[1], r[3], M.pared);
        break;
      case 'columna':
        caja(r[0], r[2], 0, f.alto_hasta ?? H, r[1], r[3], M[f.material] || M.pared);
        if (f.alto_hasta && f.alto_hasta < H) caja(r[0], r[2], f.alto_hasta, H, r[1], r[3], M.pared);
        break;
      case 'revestimiento': {
        // azulejos sobre las caras interiores de un ambiente (rect), hasta alto; "huecos" deja libres las puertas
        const e = 0.006, alto = f.alto ?? H, mat = M[f.material] || M.azulejo;
        const tramos = (a0, a1, lado) => {
          let cursor = a0;
          const huecos = (f.huecos || []).filter((h) => h.lado === lado).sort((p, q) => p.desde - q.desde);
          const res = [];
          for (const h of huecos) { res.push([cursor, h.desde, 0, alto]); res.push([h.desde, h.hasta, h.alto, alto]); cursor = h.hasta; }
          res.push([cursor, a1, 0, alto]);
          return res;
        };
        for (const [a0, a1, y0, y1] of tramos(r[1], r[3], '-x')) if (y1 > y0) caja(r[0], r[0] + e, y0, y1, a0, a1, mat);
        for (const [a0, a1, y0, y1] of tramos(r[1], r[3], '+x')) if (y1 > y0) caja(r[2] - e, r[2], y0, y1, a0, a1, mat);
        for (const [a0, a1, y0, y1] of tramos(r[0], r[2], '-y')) if (y1 > y0) caja(a0, a1, y0, y1, r[1], r[1] + e, mat);
        for (const [a0, a1, y0, y1] of tramos(r[0], r[2], '+y')) if (y1 > y0) caja(a0, a1, y0, y1, r[3] - e, r[3], mat);
        break;
      }
      case 'registro': {
        // tapa de registro en la pared: marco, puerta un poco hundida y cerradura chica arriba al centro
        caja(r[0], r[2], f.alto_desde, f.alto_hasta, r[1], r[3], M.blanco);
        const enX = r[2] - r[0] > r[3] - r[1];
        const yc = f.alto_hasta - 0.07;
        if (enX) {
          const xc = (r[0] + r[2]) / 2, z = r[3] + (r[3] - r[1]) * 0.6;
          caja(r[0] + 0.03, r[2] - 0.03, f.alto_desde + 0.03, f.alto_hasta - 0.03, r[1], z, M.techo);
          caja(xc - 0.011, xc + 0.011, yc - 0.011, yc + 0.011, z, z + 0.004, M.bronce);
        } else {
          const zc = (r[1] + r[3]) / 2, x = r[2] + (r[2] - r[0]) * 0.6;
          caja(r[0], x, f.alto_desde + 0.03, f.alto_hasta - 0.03, r[1] + 0.03, r[3] - 0.03, M.techo);
          caja(x, x + 0.004, yc - 0.011, yc + 0.011, zc - 0.011, zc + 0.011, M.bronce);
        }
        break;
      }
      case 'cielorraso': {
        // techo más bajo: plano visible solo desde abajo y bordes finos, para no tapar la vista aérea
        if (corte < H) break;
        const plano = new THREE.Mesh(new THREE.PlaneGeometry(r[2] - r[0], r[3] - r[1]), M.techo);
        plano.rotation.x = Math.PI / 2;
        plano.position.set((r[0] + r[2]) / 2, f.alto_desde, (r[1] + r[3]) / 2);
        g.add(plano);
        const e = 0.02;
        caja(r[0], r[2], f.alto_desde, H, r[1], r[1] + e, M.pared);
        caja(r[0], r[2], f.alto_desde, H, r[3] - e, r[3], M.pared);
        caja(r[0], r[0] + e, f.alto_desde, H, r[1], r[3], M.pared);
        caja(r[2] - e, r[2], f.alto_desde, H, r[1], r[3], M.pared);
        break;
      }
      case 'lampara': {
        if (corte < H) break;
        const [x, z] = f.pos;
        cilindro(x, z, 0.004, H - 0.55, H, M.negro);
        const pantalla = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), M.lampara);
        pantalla.position.set(x, H - 0.72, z);
        g.add(pantalla);
        const foco = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), M.foco);
        foco.position.copy(pantalla.position);
        g.add(foco);
        const luz = new THREE.PointLight(0xffd9a8, 0.8, 0, 2);
        luz.position.copy(pantalla.position);
        g.add(luz);
        break;
      }
      case 'enchufe': {
        const [x, y] = f.pos;
        const c = caraMasCercana(x, y);
        if (!c) break;
        const n1 = c.cara + c.sg * 0.012;
        if (c.mu.eje === 'x') caja(x - 0.045, x + 0.045, 0.26, 0.38, c.cara, n1, M.blanco);
        else caja(c.cara, n1, 0.26, 0.38, y - 0.045, y + 0.045, M.blanco);
        break;
      }
      default:
        break;
    }
  }
  limite = corte;
  fantasma = false;

  // Baranda del balcón: vidrio con pasamanos en los lados abiertos
  for (const e of d.exteriores || []) {
    const [x0, z0, x1, z1] = e.rect;
    const lados = [[x0, x1, z0, z0], [x0, x0, z0, z1 - 0.05], [x1, x1, z0, z1 - 0.05]];
    for (const [a0, a1, b0, b1] of lados) {
      const vertical = a0 === a1;
      const [xa, xb] = vertical ? [a0 - 0.01, a0 + 0.01] : [a0, a1];
      const [za, zb] = vertical ? [b0, b1] : [b0 - 0.01, b0 + 0.01];
      caja(xa, xb, 0.08, 0.98, za, zb, M.vidrio);
      caja(xa - 0.015, xb + 0.015, 0.98, 1.02, za - 0.015, zb + 0.015, M.acero);
    }
  }

  // Techo (se ve solo desde adentro)
  const techo = new THREE.Group();
  techo.name = 'techo';
  if (corte >= H) {
    for (const r of d.contorno_cubierto) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r[2] - r[0], r[3] - r[1]), M.techo);
      m.rotation.x = Math.PI / 2;
      m.position.set((r[0] + r[2]) / 2, H, (r[1] + r[3]) / 2);
      techo.add(m);
    }
  }
  g.add(techo);

  // Luz de relleno en cada ambiente (a media altura, para que no deje manchas en el techo)
  if (corte >= H) {
    for (const a of d.ambientes) {
      const r = a.rects[0];
      const luz = new THREE.PointLight(0xfff0dc, 1.2, 0, 2);
      luz.position.set((r[0] + r[2]) / 2, H * 0.65, (r[1] + r[3]) / 2);
      techo.add(luz);
    }
  }

  // Edificios vecinos frente a la fachada: solo se ven desde adentro
  const entorno = new THREE.Group();
  entorno.name = 'entorno';
  const ladrillo = caja(-20, 30, -25, 25, -8.0, -7.8, M.ladrillo, entorno);
  const blanco = caja(4.5, 9.5, -25, 22, -6.6, -5.6, M.revoque, entorno);
  for (const m of [ladrillo, blanco]) if (m) m.userData.sinSombra = true;
  g.add(entorno);

  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.material !== M.vidrio && !o.userData.sinSombra;
      o.receiveShadow = !o.userData.sinSombra;
    }
  });
  g.userData.altoMax = altoMax;
  g.userData.hojas = hojas;
  return g;
}

// ---------- Escena, cámara y controles ----------
const contenedor = document.getElementById('escena');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
contenedor.appendChild(renderer.domElement);

const etiquetas = new CSS2DRenderer();
etiquetas.domElement.style.position = 'absolute';
etiquetas.domElement.style.inset = '0';
etiquetas.domElement.style.pointerEvents = 'none';
contenedor.appendChild(etiquetas.domElement);

const escena = new THREE.Scene();
escena.background = new THREE.Color(0xe9edf0);
const pmrem = new THREE.PMREMGenerator(renderer);
escena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
escena.environmentIntensity = 0.55;

escena.add(new THREE.HemisphereLight(0xf2f5ff, 0xd8ccb6, 0.6));
const sol = new THREE.DirectionalLight(0xfff2de, 2.4);
sol.position.set(2, 11, -9);
sol.target.position.set(4.5, 0, 3);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
Object.assign(sol.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
sol.shadow.bias = -0.0004;
sol.shadow.normalBias = 0.02;
escena.add(sol, sol.target);

const camara = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
const orbita = new OrbitControls(camara, renderer.domElement);
orbita.enableDamping = true;
orbita.maxPolarAngle = Math.PI * 0.49;

const estado = {
  datos: null, modelo: null, modo: 'aerea', yaw: 0, pitch: 0, teclas: new Set(), etiquetas: [],
  muros: 'bajos',          // altura de los muros en la vista aérea: 'altos', 'bajos' o 'muy_bajos'
  puertasCerradas: false,
};

function ajustarTamano() {
  const w = contenedor.clientWidth, h = contenedor.clientHeight;
  renderer.setSize(w, h);
  etiquetas.setSize(w, h);
  camara.aspect = w / h;
  // Corre el centro de la imagen para que el modelo quede centrado en lo que no tapa el panel
  const panel = document.getElementById('panel');
  const tapa = panel && w > 900 ? panel.offsetWidth : 0;
  if (tapa) camara.setViewOffset(w, h, tapa / 2, 0, w, h);
  else camara.clearViewOffset();
  camara.updateProjectionMatrix();
}
window.addEventListener('resize', ajustarTamano);

function rearmar() {
  if (estado.modelo) {
    escena.remove(estado.modelo);
    estado.modelo.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  estado.murosAplicados = murosEfectivos();
  const [corte, corteFijos] = CORTES[estado.murosAplicados];
  estado.modelo = construir(estado.datos, corte, corteFijos);
  for (const p of estado.modelo.userData.hojas) p.rotation.y = estado.puertasCerradas ? p.userData.cerrada : 0;
  escena.add(estado.modelo);
  aplicarModo();
}

// Altura de corte de [muros, elementos fijos] para cada opción de "Muros".
// Solo vale para la vista aérea: adentro los muros van siempre completos.
const CORTES = { altos: [Infinity, Infinity], bajos: [ALTURA_CORTE, ALTURA_CORTE], muy_bajos: [ALTURA_MUY_BAJA, ALTURA_CORTE] };
const murosEfectivos = () => (estado.modo === 'aerea' ? estado.muros : 'altos');

function aplicarModo() {
  if (estado.modelo && estado.murosAplicados !== murosEfectivos()) { rearmar(); return; }
  const interior = estado.modo === 'interior';
  for (const nombre of ['techo', 'entorno']) {
    const grupo = estado.modelo?.getObjectByName(nombre);
    if (grupo) grupo.visible = interior;
  }
  for (const e of estado.etiquetas) e.visible = !interior;
  marcas.visible = !interior;
  orbita.enabled = !interior;
  camara.fov = interior ? 70 : 45;
  camara.updateProjectionMatrix();
  document.getElementById('ayuda').textContent = interior
    ? 'Arrastra para mirar alrededor · W A S D o flechas para caminar · rueda para avanzar'
    : estado.edicion
      ? 'Edición activa: arrastra un mueble para moverlo · R lo gira · arrastra el fondo para girar la vista'
      : 'Toca un mueble para ver sus datos · arrastra para girar la vista · rueda para acercar · «Editar muebles» permite moverlos';
}

function irA(vista) {
  estado.modo = vista.modo;
  const [px, py, pz] = vista.pos, [mx, my, mz] = vista.mira;
  camara.position.set(px, py, pz);
  if (vista.modo === 'interior') {
    const dx = mx - px, dy = my - py, dz = mz - pz;
    estado.yaw = Math.atan2(-dx, -dz);
    estado.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    camara.rotation.set(estado.pitch, estado.yaw, 0, 'YXZ');
  } else {
    orbita.target.set(mx, my, mz);
    orbita.update();
  }
  for (const b of document.querySelectorAll('#vistas button')) b.classList.toggle('activo', b.dataset.vista === vista.id);
  aplicarModo();
}

// Mirar y caminar en modo interior
let arrastre = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (estado.modo !== 'interior') return;
  arrastre = { x: e.clientX, y: e.clientY };
  renderer.domElement.setPointerCapture(e.pointerId);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!arrastre || estado.modo !== 'interior') return;
  estado.yaw += (e.clientX - arrastre.x) * 0.004;
  estado.pitch = THREE.MathUtils.clamp(estado.pitch + (e.clientY - arrastre.y) * 0.004, -1.2, 1.2);
  arrastre = { x: e.clientX, y: e.clientY };
  camara.rotation.set(estado.pitch, estado.yaw, 0, 'YXZ');
});
renderer.domElement.addEventListener('pointerup', () => { arrastre = null; });
renderer.domElement.addEventListener('wheel', (e) => {
  if (estado.modo !== 'interior') return;
  e.preventDefault();
  caminar(-e.deltaY * 0.003, 0);
}, { passive: false });
const escribiendo = (e) => e.target instanceof HTMLElement && e.target.matches('input, textarea, select');
window.addEventListener('keydown', (e) => { if (!escribiendo(e)) estado.teclas.add(e.code); });
window.addEventListener('keyup', (e) => estado.teclas.delete(e.code));

function caminar(adelante, derecha) {
  const s = Math.sin(estado.yaw), c = Math.cos(estado.yaw);
  camara.position.x += -s * adelante + c * derecha;
  camara.position.z += -c * adelante - s * derecha;
  camara.position.y = OJOS;
}

const reloj = new THREE.Clock();
function animar() {
  const dt = Math.min(reloj.getDelta(), 0.1);
  if (estado.modo === 'interior' && estado.teclas.size) {
    const k = estado.teclas;
    const adelante = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const derecha = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    if (adelante || derecha) caminar(adelante * VELOCIDAD * dt, derecha * VELOCIDAD * dt);
  }
  for (const p of estado.modelo?.userData.hojas || []) {
    const dif = (estado.puertasCerradas ? p.userData.cerrada : 0) - p.rotation.y;
    if (Math.abs(dif) > 1e-4) p.rotation.y += Math.sign(dif) * Math.min(Math.abs(dif), dt * VELOCIDAD_PUERTAS);
  }
  if (orbita.enabled) orbita.update();
  renderer.render(escena, camara);
  etiquetas.render(escena, camara);
  requestAnimationFrame(animar);
}

// ---------- Muebles y distribuciones ----------
const grupoMuebles = new THREE.Group();
escena.add(grupoMuebles);
const marcas = new THREE.Group();
escena.add(marcas);
const matChoque = new THREE.MeshBasicMaterial({ color: 0xe24b4a, transparent: true, opacity: 0.4, depthWrite: false });
const CLAVE = (id) => `render-depto:v4:${id}`;

// v4 (2026-11-06): quedaron dos distribuciones; la E pasó a ser la A y la B sigue siendo la B.
// Los cambios guardados con v3 se copian una sola vez a su nueva letra (los de A, C y D no se usan).
function migrarCambiosV3() {
  if (localStorage.getItem(CLAVE('migrado'))) return;
  const nuevaLetra = { e: 'a', b: 'b' };
  for (const [vieja, nueva] of Object.entries(nuevaLetra)) {
    const guardado = localStorage.getItem(`render-depto:v3:${vieja}`);
    if (guardado && !localStorage.getItem(CLAVE(nueva))) localStorage.setItem(CLAVE(nueva), guardado);
  }
  const actual = nuevaLetra[localStorage.getItem('render-depto:v3:actual')];
  if (actual && !localStorage.getItem(CLAVE('actual'))) localStorage.setItem(CLAVE('actual'), actual);
  localStorage.setItem(CLAVE('migrado'), '1');
}
Object.assign(estado, {
  catalogo: new Map(), dist: null, actual: null, items: [], base: new Map(), original: new Map(), versiones: [],
  objetos: new Map(), seleccion: null, choques: new Map(), obstaculos: [], puertas: [],
  edicion: false,   // con la edición apagada los muebles no se pueden mover, girar ni sacar
});
const cm = (v) => Math.round(v * 100);
const ajustar = (v) => Math.round(Math.round(v / 0.05) * 0.05 * 1000) / 1000;

// La grilla de 5 cm puede dejar un mueble unos cm adentro de una pared: lo corre hasta que quede apoyado.
// Los muebles en el piso se apoyan también contra clósets, cubierta, etc.; los de arriba (pava, cuadros...), solo contra muros.
function apoyar(o, x, y) {
  const enPiso = !(o.item.elev > 0) && !o.item.sobre;
  const prueba = { ...o, item: { ...o.item, pos: [x, y] } };
  for (let vuelta = 0; vuelta < 2; vuelta++) {
    for (const h of huellasMundo(prueba)) {
      for (const ob of estado.obstaculos) {
        if (!enPiso && ob.nombre !== 'un muro') continue;
        const [a0, b0, a1, b1] = ob.rect;
        const dx = Math.min(h[2] - a0, a1 - h[0]), dy = Math.min(h[3] - b0, b1 - h[1]);
        if (dx <= 0.001 || dy <= 0.001 || Math.min(dx, dy) > 0.051) continue;   // no se tocan, o es un choque de verdad
        if (dx <= dy) x += h[0] + h[2] < a0 + a1 ? -dx : dx;
        else y += h[1] + h[3] < b0 + b1 ? -dy : dy;
        prueba.item.pos = [x, y];
      }
    }
  }
  return [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
}

// Muros (sin los vanos), elementos fijos y barrido de las puertas, para avisar choques
function prepararObstaculos(d) {
  const obstaculos = [];
  for (const mu of d.muros) {
    const t = mu.espesor / 2;
    const tramo = (s0, s1) => {
      if (s1 - s0 > 0.001) obstaculos.push({ nombre: 'un muro', rect: mu.eje === 'x' ? [s0, mu.en - t, s1, mu.en + t] : [mu.en - t, s0, mu.en + t, s1] });
    };
    let cursor = mu.desde;
    for (const a of [...(mu.aberturas || [])].sort((p, q) => p.desde - q.desde)) { tramo(cursor, a.desde); cursor = a.hasta; }
    tramo(cursor, mu.hasta);
  }
  const nombres = { closet: 'el clóset', cubierta: 'la cubierta de la cocina', banera: 'la bañera', inodoro: 'el inodoro', bidet: 'el bidet', lavamanos: 'el lavamanos', columna: 'una columna' };
  for (const f of d.fijos || []) if (nombres[f.tipo]) obstaculos.push({ nombre: nombres[f.tipo], rect: f.rect });
  for (const f of d.fijos || []) {
    if (f.tipo !== 'cortinas') continue;
    const [x0, y0, x1, y1] = f.rect;
    obstaculos.push({ nombre: 'las cortinas', rect: [x0, y0, x0 + 0.42, y1] }, { nombre: 'las cortinas', rect: [x1 - 0.42, y0, x1, y1] });
  }
  const puertas = [];
  for (const mu of d.muros) {
    for (const a of mu.aberturas || []) {
      if (a.tipo !== 'puerta') continue;
      const t = mu.espesor / 2;
      const bis = a.bisagra === 'desde' ? a.desde : a.hasta, otro = a.bisagra === 'desde' ? a.hasta : a.desde;
      const sgn = a.abre === '+' ? 1 : -1, cara = mu.en + sgn * t;
      puertas.push({
        nombre: (a.nombre || 'puerta').toLowerCase(),
        c: mu.eje === 'x' ? [bis, cara] : [cara, bis],
        u: mu.eje === 'x' ? [Math.sign(otro - bis), 0] : [0, Math.sign(otro - bis)],
        v: mu.eje === 'x' ? [0, sgn] : [sgn, 0],
        r: a.hasta - a.desde - (a.hoja_fija || 0),
      });
    }
  }
  return { obstaculos, puertas };
}

// Bases redondas: girarlas no cambia lo que ocupan
const REDONDOS = new Set(['lampara_arco', 'lampara_pie', 'mesa_redonda']);

function huellasMundo(o) {
  const { item, huellas } = o;
  const a = REDONDOS.has(o.def.tipo) ? 0 : (item.giro || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return huellas.map(([x0, z0, x1, z1]) => {
    const p = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => [item.pos[0] + x * c + z * s, item.pos[1] - x * s + z * c]);
    return [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))];
  });
}

const solapan = (a, b, eps = 0.01) => a[0] < b[2] - eps && b[0] < a[2] - eps && a[1] < b[3] - eps && b[1] < a[3] - eps;
function traba(r, p) {
  for (let i = 0; i <= 5; i++) {
    for (let j = 0; j <= 5; j++) {
      const dx = r[0] + (r[2] - r[0]) * i / 5 - p.c[0], dy = r[1] + (r[3] - r[1]) * j / 5 - p.c[1];
      if (dx * dx + dy * dy < (p.r - 0.02) ** 2 && dx * p.u[0] + dy * p.u[1] > 0.02 && dx * p.v[0] + dy * p.v[1] > 0.02) return true;
    }
  }
  return false;
}

// Las sillas se meten debajo de su mesa o escritorio: eso no cuenta como choque
const SILLAS = new Set(['silla_comedor', 'silla_oficina']);
const MESAS = new Set(['mesa_comedor', 'escritorio']);
const seMeteDebajo = (a, b) => (SILLAS.has(a.def.tipo) && MESAS.has(b.def.tipo)) || (SILLAS.has(b.def.tipo) && MESAS.has(a.def.tipo));

function calcularChoques() {
  const enPiso = [...estado.objetos.values()].filter((o) => o.grupo.visible && !(o.item.elev > 0) && !o.item.sobre && !o.item.sin_choque && o.huellas.length);
  const res = new Map();
  const anotar = (id, motivo) => {
    if (!res.has(id)) res.set(id, []);
    if (!res.get(id).includes(motivo)) res.get(id).push(motivo);
  };
  const h = new Map(enPiso.map((o) => [o.item.id, huellasMundo(o)]));
  for (let i = 0; i < enPiso.length; i++) {
    const A = enPiso[i], ha = h.get(A.item.id);
    for (let j = i + 1; j < enPiso.length; j++) {
      const B = enPiso[j];
      if (seMeteDebajo(A, B)) continue;
      if (ha.some((a) => h.get(B.item.id).some((b) => solapan(a, b)))) {
        anotar(A.item.id, `choca con ${B.def.nombre.toLowerCase()}`);
        anotar(B.item.id, `choca con ${A.def.nombre.toLowerCase()}`);
      }
    }
    for (const ob of estado.obstaculos) if (ha.some((a) => solapan(a, ob.rect))) anotar(A.item.id, `se mete en ${ob.nombre}`);
    for (const p of estado.puertas) if (ha.some((a) => traba(a, p))) anotar(A.item.id, `no deja abrir la ${p.nombre}`);
  }
  estado.choques = res;
  dibujarMarcas();
}

function dibujarMarcas() {
  for (const m of [...marcas.children]) { marcas.remove(m); m.geometry?.dispose(); }
  for (const id of estado.choques.keys()) {
    for (const r of huellasMundo(estado.objetos.get(id))) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r[2] - r[0], r[3] - r[1]), matChoque);
      m.rotation.x = -Math.PI / 2;
      m.position.set((r[0] + r[2]) / 2, 0.02, (r[1] + r[3]) / 2);
      marcas.add(m);
    }
  }
  const sel = estado.seleccion && estado.objetos.get(estado.seleccion);
  if (sel) marcas.add(new THREE.Box3Helper(new THREE.Box3().setFromObject(sel.grupo), 0x185fa5));
}

const estadoMueble = (i) => ({ pos: [...i.pos], giro: i.giro || 0, guardado: !!i.guardado });
const mismoEstado = (a, b) => a.pos[0] === b.pos[0] && a.pos[1] === b.pos[1] && a.giro === b.giro && a.guardado === b.guardado;
const ultimaVersion = (id) => estado.versiones.filter((v) => v.distribucion === id).at(-1) || null;

// Muebles cuyo estado difiere del de referencia (la distribución original o la última versión)
function diferencias(referencia) {
  const res = {};
  for (const it of estado.items) {
    const actual = estadoMueble(it), ref = referencia.get(it.id);
    if (!ref || !mismoEstado(ref, actual)) res[it.id] = actual;
  }
  return res;
}

function itemsDe(id) {
  const dist = estado.dist.distribuciones.find((d) => d.id === id);
  // los ítems de la distribución reemplazan a los comunes que tengan el mismo id
  const porId = new Map();
  for (const i of [...(estado.dist.comunes || []), ...dist.items]) porId.set(i.id, i);
  const items = [...porId.values()].map((i) => ({ ...i, pos: [...i.pos], giro: i.giro || 0 }));
  estado.original = new Map(items.map((i) => [i.id, estadoMueble(i)]));
  // la última versión guardada (datos/versiones.json) es el punto de partida
  const version = ultimaVersion(id);
  if (version) for (const it of items) if (version.items[it.id]) Object.assign(it, estadoMueble(version.items[it.id]));
  estado.base = new Map(items.map((i) => [i.id, estadoMueble(i)]));
  // encima, los cambios sin guardar de este navegador
  let cambios = null;
  try { cambios = JSON.parse(localStorage.getItem(CLAVE(id)) || 'null'); } catch { cambios = null; }
  if (cambios?.items) for (const it of items) if (cambios.items[it.id]) Object.assign(it, cambios.items[it.id]);
  return items;
}

const colocar = (o) => {
  o.grupo.position.set(o.item.pos[0], o.item.elev || 0, o.item.pos[1]);
  o.grupo.rotation.y = (o.item.giro || 0) * Math.PI / 180;
  ajustarHojas(o);
};

// Las hojas que apuntan contra una pared se paran hasta no atravesarla, como una planta real apoyada en el muro.
function ajustarHojas(o) {
  const giro = o.grupo.rotation.y, [px, py] = o.item.pos;
  const muros = estado.obstaculos.filter((ob) => ob.nombre === 'un muro');
  o.grupo.traverse((p) => {
    const h = p.userData.hoja;
    if (!h) return;
    const a = p.rotation.y + giro, ux = Math.sin(a), uy = Math.cos(a);
    // distancia al primer muro en la dirección de la hoja (rayo contra rectángulos en el plano)
    let t = Infinity;
    for (const { rect: [x0, y0, x1, y1] } of muros) {
      let t0 = 0, t1 = Infinity, ok = true;
      for (const [o0, u, a0, a1] of [[px, ux, x0, x1], [py, uy, y0, y1]]) {
        if (Math.abs(u) < 1e-9) { if (o0 < a0 || o0 > a1) ok = false; continue; }
        const s0 = (a0 - o0) / u, s1 = (a1 - o0) / u;
        t0 = Math.max(t0, Math.min(s0, s1)); t1 = Math.min(t1, Math.max(s0, s1));
      }
      if (ok && t0 <= t1 && t0 > 0) t = Math.min(t, t0);
    }
    const alcance = Math.max(0, t - 0.03);
    p.rotation.x = h.largo * Math.sin(h.inclinacion) > alcance ? Math.asin(Math.min(1, alcance / h.largo)) : h.inclinacion;
  });
}
const hijos = (id) => [...estado.objetos.values()].filter((h) => h.item.sobre === id);
const visible = (it) => !it.guardado && !(it.sobre && estado.items.find((p) => p.id === it.sobre)?.guardado);

function cargarDistribucion(id) {
  estado.actual = id;
  estado.seleccion = null;
  for (const o of estado.objetos.values()) {
    grupoMuebles.remove(o.grupo);
    o.grupo.traverse((m) => m.geometry?.dispose());
  }
  estado.objetos.clear();
  estado.items = itemsDe(id);
  for (const item of estado.items) {
    const def = estado.catalogo.get(item.mueble);
    if (!def) { console.warn('Mueble desconocido:', item.mueble); continue; }
    const { grupo, huellas } = construirMueble(def);
    grupo.userData.itemId = item.id;
    grupo.name = item.id;
    const o = { grupo, def, item, huellas };
    estado.objetos.set(item.id, o);
    colocar(o);
    grupo.visible = visible(item);
    grupoMuebles.add(grupo);
  }
  localStorage.setItem(CLAVE('actual'), id);
  calcularChoques();
  actualizarPanel();
}

function mover(o, x, y) {
  const dx = x - o.item.pos[0], dy = y - o.item.pos[1];
  for (const h of hijos(o.item.id)) { h.item.pos = [h.item.pos[0] + dx, h.item.pos[1] + dy]; colocar(h); }
  o.item.pos = [x, y];
  colocar(o);
}

function girar(o, grados) {
  const a = grados * Math.PI / 180, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  for (const h of hijos(o.item.id)) {
    const rx = h.item.pos[0] - o.item.pos[0], ry = h.item.pos[1] - o.item.pos[1];
    h.item.pos = [o.item.pos[0] + rx * c + ry * s, o.item.pos[1] - rx * s + ry * c];
    h.item.giro = ((h.item.giro || 0) + grados + 360) % 360;
    colocar(h);
  }
  o.item.giro = ((o.item.giro || 0) + grados + 360) % 360;
  colocar(o);
}

// Cambios sin guardar: quedan en este navegador hasta que se guarda una versión
function guardar() {
  const cambios = diferencias(estado.base);
  if (Object.keys(cambios).length) localStorage.setItem(CLAVE(estado.actual), JSON.stringify({ items: cambios }));
  else localStorage.removeItem(CLAVE(estado.actual));
}

async function guardarVersion(nota) {
  const movidos = diferencias(estado.base);
  const ids = Object.keys(movidos);
  if (!ids.length) return null;
  const cuerpo = {
    distribucion: estado.actual,
    nota,
    items: diferencias(estado.original),
    movimientos: ids.map((id) => ({ id, mueble: estado.objetos.get(id)?.def.nombre || id, antes: estado.base.get(id), despues: movidos[id] })),
  };
  const resp = await fetch(VERSIONES_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const respuesta = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(respuesta.error || `HTTP ${resp.status}`);
  estado.versiones.push(respuesta);
  localStorage.removeItem(CLAVE(estado.actual));
  return respuesta;
}

function seleccionar(id) {
  estado.seleccion = id;
  dibujarMarcas();
  actualizarPanel();
}

function sacar(o) {
  o.item.guardado = true;
  o.grupo.visible = false;
  for (const h of hijos(o.item.id)) h.grupo.visible = false;
  estado.seleccion = null;
  guardar();
  calcularChoques();
  actualizarPanel();
}

function ubicar(it) {
  it.guardado = false;
  for (const o of [estado.objetos.get(it.id), ...hijos(it.id)]) o.grupo.visible = visible(o.item);
  guardar();
  calcularChoques();
  seleccionar(it.id);
}

const boton = (texto, alHacerClic, clase = 'enlace') => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = clase;
  b.textContent = texto;
  b.addEventListener('click', alHacerClic);
  return b;
};

function actualizarPanel() {
  const dist = estado.dist?.distribuciones.find((d) => d.id === estado.actual);
  document.getElementById('descripcion').textContent = dist?.descripcion || '';
  const v = estado.actual && ultimaVersion(estado.actual);
  document.getElementById('version-info').textContent =
    (v ? `Versión ${v.version}, guardada el ${v.fecha}.` : 'Sin versiones nuevas: es la distribución del proyecto.') +
    (CON_SERVIDOR ? '' : ' Este archivo es para mirar: para guardar versiones, abre el visor con abrir_visor.command.');
  for (const b of document.querySelectorAll('#distribuciones button')) {
    b.classList.toggle('activo', b.dataset.id === estado.actual);
    b.classList.toggle('modificada', !!localStorage.getItem(CLAVE(b.dataset.id)));
  }

  const sel = estado.seleccion && estado.objetos.get(estado.seleccion);
  document.getElementById('seleccion').hidden = !sel;
  if (sel) {
    const [W, D, H] = sel.def.medidas;
    document.getElementById('sel-nombre').textContent = sel.def.nombre;
    document.getElementById('sel-medidas').textContent = `${cm(W)} × ${cm(D)} × ${cm(H)} cm (ancho × fondo × alto). ${sel.def.origen ? `Medida ${sel.def.origen}.` : ''}`;
    const avisos = estado.choques.get(sel.item.id) || [];
    document.getElementById('sel-avisos').textContent = avisos.length ? `Atención: ${avisos.join(', ')}.` : '';
    document.getElementById('sel-bloqueo').hidden = estado.edicion;
    document.getElementById('btn-girar').disabled = !estado.edicion;
    document.getElementById('btn-sacar').disabled = !estado.edicion;
    document.getElementById('sel-fotos').replaceChildren(...(sel.def.fotos || []).map((f) => {
      const a = document.createElement('a');
      a.href = `../fotos/muebles/${f}.jpg`;
      a.target = '_blank';
      const img = document.createElement('img');
      img.src = `../fotos/muebles/${f}.jpg`;
      img.alt = `Foto ${f} de ${sel.def.nombre}`;
      a.append(img);
      return a;
    }));
  }

  const filas = [...estado.choques.entries()].map(([id, motivos]) => {
    const li = document.createElement('li');
    li.append(boton(estado.objetos.get(id).def.nombre, () => seleccionar(id)), `: ${motivos.join(', ')}`);
    return li;
  });
  if (!filas.length) {
    const li = document.createElement('li');
    li.className = 'ok';
    li.textContent = 'Todo entra: no hay choques ni puertas trabadas.';
    filas.push(li);
  }
  document.getElementById('avisos').replaceChildren(...filas);

  const guardados = estado.items.filter((i) => i.guardado);
  document.getElementById('sin-ubicar-sec').hidden = !guardados.length;
  document.getElementById('sin-ubicar').replaceChildren(...guardados.map((it) => {
    const li = document.createElement('li');
    const b = boton('Ubicar', () => ubicar(it));
    b.disabled = !estado.edicion;
    li.append(`${estado.catalogo.get(it.mueble)?.nombre || it.mueble} `, b);
    return li;
  }));
}

// Elegir y arrastrar muebles en la vista aérea
const rayo = new THREE.Raycaster();
const puntero = new THREE.Vector2();
const planoArrastre = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const punto = new THREE.Vector3();
let arrastreMueble = null, clic = null;

function apuntar(e) {
  const r = renderer.domElement.getBoundingClientRect();
  puntero.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  rayo.setFromCamera(puntero, camara);
}
function muebleBajo(e) {
  apuntar(e);
  const grupos = [...estado.objetos.values()].filter((o) => o.grupo.visible).map((o) => o.grupo);
  let n = rayo.intersectObjects(grupos, true)[0]?.object;
  while (n && !n.userData.itemId) n = n.parent;
  return n ? estado.objetos.get(n.userData.itemId) : null;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (estado.modo !== 'aerea' || e.button !== 0) return;
  const o = muebleBajo(e);
  // Sin edición (o sobre el fondo) el arrastre gira la vista; un clic sin mover solo elige el mueble
  if (!o || !estado.edicion) { clic = { x: e.clientX, y: e.clientY, id: o?.item.id ?? null }; return; }
  orbita.enabled = false;            // así OrbitControls no gira la vista mientras se arrastra
  seleccionar(o.item.id);
  planoArrastre.constant = -(o.item.elev || 0);
  if (!rayo.ray.intersectPlane(planoArrastre, punto)) return;
  arrastreMueble = { o, dx: o.item.pos[0] - punto.x, dy: o.item.pos[1] - punto.z, movido: false };
  try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* puntero sintético */ }
}, { capture: true });

renderer.domElement.addEventListener('pointermove', (e) => {
  if (!arrastreMueble) return;
  apuntar(e);
  if (!rayo.ray.intersectPlane(planoArrastre, punto)) return;
  const { o } = arrastreMueble;
  const [x, y] = apoyar(o, ajustar(punto.x + arrastreMueble.dx), ajustar(punto.z + arrastreMueble.dy));
  if (Math.abs(x - o.item.pos[0]) < 1e-6 && Math.abs(y - o.item.pos[1]) < 1e-6) return;
  mover(o, x, y);
  arrastreMueble.movido = true;
  calcularChoques();
});

renderer.domElement.addEventListener('pointerup', (e) => {
  if (arrastreMueble) {
    if (arrastreMueble.movido) guardar();
    arrastreMueble = null;
    orbita.enabled = estado.modo === 'aerea';
    actualizarPanel();
  } else if (clic && Math.hypot(e.clientX - clic.x, e.clientY - clic.y) < 4) {
    if (clic.id) seleccionar(clic.id);
    else if (estado.seleccion) seleccionar(null);
  }
  clic = null;
});

window.addEventListener('keydown', (e) => {
  if (escribiendo(e) || estado.modo !== 'aerea' || !estado.seleccion) return;
  if (e.code === 'KeyR' && estado.edicion) {
    girar(estado.objetos.get(estado.seleccion), e.shiftKey ? -90 : 90);
    guardar();
    calcularChoques();
    actualizarPanel();
  } else if (e.code === 'Escape') {
    seleccionar(null);
  }
});

function prepararPanel() {
  const nav = document.getElementById('distribuciones');
  for (const d of estado.dist.distribuciones) {
    const b = boton(d.nombre, () => cargarDistribucion(d.id), '');
    b.dataset.id = d.id;
    nav.appendChild(b);
  }
  const btnEditar = document.getElementById('btn-editar');
  btnEditar.addEventListener('click', () => {
    estado.edicion = !estado.edicion;
    btnEditar.setAttribute('aria-pressed', String(estado.edicion));
    btnEditar.textContent = estado.edicion ? 'Terminar edición' : 'Editar muebles';
    aplicarModo();
    actualizarPanel();
  });
  document.getElementById('btn-girar').addEventListener('click', () => {
    const o = estado.objetos.get(estado.seleccion);
    if (!o || !estado.edicion) return;
    girar(o, 90);
    guardar();
    calcularChoques();
    actualizarPanel();
  });
  document.getElementById('btn-sacar').addEventListener('click', () => {
    const o = estado.objetos.get(estado.seleccion);
    if (o && estado.edicion) sacar(o);
  });
  const estadoAcciones = document.getElementById('estado-acciones');
  const btnVersion = document.getElementById('btn-guardar-version'), campoNota = document.getElementById('nota-version');
  btnVersion.hidden = campoNota.hidden = !CON_SERVIDOR;
  document.getElementById('btn-copiar').hidden = CON_SERVIDOR;
  btnVersion.addEventListener('click', async () => {
    btnVersion.disabled = true;
    try {
      const v = await guardarVersion(campoNota.value.trim());
      if (!v) { estadoAcciones.textContent = 'No hay cambios sin guardar en esta distribución.'; return; }
      campoNota.value = '';
      cargarDistribucion(estado.actual);
      estadoAcciones.textContent = `Guardada como versión ${v.version} de la ${estado.actual.toUpperCase()}.`;
    } catch (err) {
      estadoAcciones.textContent = `No se pudo guardar (${err.message}). Abre el visor con abrir_visor.command.`;
    } finally {
      btnVersion.disabled = false;
    }
  });
  document.getElementById('btn-copiar').addEventListener('click', async () => {
    const items = estado.items.map(({ id, mueble, pos, giro, elev, sobre, guardado, sin_choque }) => ({
      id, mueble, pos, giro, ...(elev ? { elev } : {}), ...(sobre ? { sobre } : {}), ...(guardado ? { guardado } : {}), ...(sin_choque ? { sin_choque } : {}),
    }));
    try {
      await navigator.clipboard.writeText(JSON.stringify({ distribucion: estado.actual, items }, null, 1));
      estadoAcciones.textContent = 'Copiado. Pégalo en el chat y lo guardo en el proyecto.';
    } catch {
      estadoAcciones.textContent = 'No se pudo copiar al portapapeles.';
    }
  });
  document.getElementById('btn-restablecer').addEventListener('click', () => {
    if (!localStorage.getItem(CLAVE(estado.actual))) { estadoAcciones.textContent = 'No hay cambios sin guardar.'; return; }
    const v = ultimaVersion(estado.actual);
    const destino = v ? `la versión ${v.version} guardada` : 'la distribución del proyecto';
    if (!window.confirm(`¿Descartar los cambios sin guardar y volver a ${destino}?`)) return;
    localStorage.removeItem(CLAVE(estado.actual));
    cargarDistribucion(estado.actual);
    estadoAcciones.textContent = `Volviste a ${destino}.`;
  });
}

// ---------- Inicio ----------
async function iniciar() {
  ajustarTamano();
  let datos;
  try {
    const resp = await fetch(DATOS_URL, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    datos = await resp.json();
  } catch (err) {
    const aviso = document.getElementById('aviso');
    aviso.hidden = false;
    aviso.textContent = `No se pudo leer datos/depto.json (${err.message}). Abre el visor con abrir_visor.command, que levanta un servidor local.`;
    return;
  }
  estado.datos = datos;
  document.title = `${datos.titulo || 'Departamento'} · 3D`;

  for (const a of datos.ambientes) {
    const r = a.rects[0];
    const [cx, cz] = a.etiqueta || [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
    const div = document.createElement('div');
    div.className = 'etiqueta';
    div.textContent = a.nombre;
    const obj = new CSS2DObject(div);
    obj.position.set(cx, 0.05, cz);
    escena.add(obj);
    estado.etiquetas.push(obj);
  }

  const nav = document.getElementById('vistas');
  for (const v of datos.vistas || []) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = v.nombre;
    b.dataset.vista = v.id;
    b.addEventListener('click', () => irA(v));
    nav.appendChild(b);
  }
  // Altura de los muros (solo vista aérea: si estás adentro, vuelve a la vista aérea)
  const opcionesMuros = document.querySelectorAll('[data-muros]');
  for (const b of opcionesMuros) {
    b.addEventListener('click', () => {
      estado.muros = b.dataset.muros;
      for (const o of opcionesMuros) o.setAttribute('aria-checked', String(o === b));
      const aerea = (datos.vistas || []).find((v) => v.modo === 'aerea');
      if (estado.modo !== 'aerea' && aerea) irA(aerea);
      else rearmar();
    });
  }
  const btnPuertas = document.getElementById('btn-puertas');
  btnPuertas.addEventListener('click', () => {
    estado.puertasCerradas = !estado.puertasCerradas;
    btnPuertas.textContent = estado.puertasCerradas ? 'Abrir puertas' : 'Cerrar puertas';
  });

  rearmar();
  irA((datos.vistas || [])[0] || { id: 'aerea', modo: 'aerea', pos: [4.5, 12, 11], mira: [4.5, 0, 2.5] });

  // Muebles: si faltan los archivos, el visor muestra el departamento vacío
  try {
    const [muebles, distribuciones] = await Promise.all([MUEBLES_URL, DISTRIBUCIONES_URL].map(async (url) => {
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) throw new Error(`${url}: HTTP ${resp.status}`);
      return resp.json();
    }));
    estado.catalogo = new Map(muebles.muebles.map((m) => [m.id, m]));
    estado.dist = distribuciones;
    try {
      const resp = await fetch(VERSIONES_URL, { cache: 'no-store' });
      estado.versiones = resp.ok ? (await resp.json()).versiones || [] : [];
    } catch {
      estado.versiones = [];
    }
    Object.assign(estado, prepararObstaculos(datos));
    prepararPanel();
    migrarCambiosV3();
    const anterior = localStorage.getItem(CLAVE('actual'));
    const inicial = distribuciones.distribuciones.some((d) => d.id === anterior) ? anterior : distribuciones.distribuciones[0].id;
    cargarDistribucion(inicial);
    const params = new URLSearchParams(location.search);
    if (CON_SERVIDOR && params.has('exportar')) exportarEscena(params).catch((err) => { document.title = `error ${err.message}`; console.error(err); });
  } catch (err) {
    console.warn('Sin muebles:', err);
    document.getElementById('panel').hidden = true;
    document.getElementById('btn-editar').hidden = true;
  }
  ajustarTamano();
  animar();
}

// ---------- Exportación para los renders fotorrealistas ----------
// Con el servidor local, ?exportar=<distribución>&muros=<altos|bajos> arma esa distribución y manda la escena
// en GLB a POST /api/glb (queda en salidas/fotorrealista/escena/). La usa herramientas/render_fotorrealista.py.
async function exportarEscena(params) {
  const dist = params.get('exportar'), muros = params.get('muros') === 'bajos' ? 'bajos' : 'altos';
  if (!estado.dist.distribuciones.some((d) => d.id === dist)) throw new Error(`no existe la distribución ${dist}`);
  const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');
  cargarDistribucion(dist);
  estado.muros = muros;
  const vistas = estado.datos.vistas || [];
  irA(vistas.find((v) => v.modo === (muros === 'bajos' ? 'aerea' : 'interior')) || vistas[0]);
  // la puerta de entrada va cerrada (abierta tapa el hall); las demás, abiertas
  for (const p of estado.modelo.userData.hojas) p.rotation.y = /entrada/i.test(p.name) ? p.userData.cerrada : 0;
  // maqueta: con los muros cortados, los cuadros y el espejo quedarían flotando (desde arriba parecen pantallas).
  // Los de ?bajar=id1,id2 se cuelgan justo debajo del corte, para que se vean derechos en su pared; los demás se ocultan.
  const bajar = new Set((params.get('bajar') || '').split(',').filter(Boolean));
  for (const o of estado.objetos.values()) {
    if (muros !== 'bajos' || !['cuadros', 'espejo'].includes(o.def.tipo)) continue;
    const alto = o.def.medidas[2];
    if (bajar.has(o.item.id) && alto < ALTURA_CORTE - 0.1) o.grupo.position.y = ALTURA_CORTE - 0.03 - alto;
    else o.grupo.visible = false;
  }
  const raices = [estado.modelo, grupoMuebles];
  for (const r of raices) r.updateMatrixWorld(true);
  const glb = await new GLTFExporter().parseAsync(raices, { binary: true, onlyVisible: true });
  const resp = await fetch(`/api/glb?nombre=${encodeURIComponent(`${dist}_${muros}`)}`, { method: 'POST', headers: { 'Content-Type': 'model/gltf-binary' }, body: glb });
  document.title = resp.ok ? `exportado ${dist}_${muros}` : `error ${resp.status}`;
}

window.visor = { estado, camara };   // para revisar el visor desde la consola del navegador
iniciar();
