// Modelos 3D de los muebles, armados con formas simples a partir de sus medidas (datos/muebles.json).
// Cada modelo tiene el frente hacia +Z, el ancho en X, el fondo en Z y el piso en y = 0.
// construirMueble devuelve { grupo, huellas }: las huellas son los rectángulos [x0, z0, x1, z1]
// que ocupa en el piso, en coordenadas del mueble (se usan para detectar choques).
import * as THREE from 'three';

const cache = new Map();
export function mat(color, extra = {}) {
  const clave = `${color}|${JSON.stringify(extra)}`;
  if (!cache.has(clave)) cache.set(clave, new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra }));
  return cache.get(clave);
}
const vidrio = new THREE.MeshStandardMaterial({ color: 0xcfe5ea, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false });
vidrio.name = 'vidrio_mueble';
const espejo = new THREE.MeshStandardMaterial({ color: 0xd3dbdf, roughness: 0.08, metalness: 0.7 });
const cromo = mat('#c8cbce', { metalness: 0.9, roughness: 0.22 });
const blanco = mat('#f3f2ee', { roughness: 0.45 });
const negro = mat('#1d1d20', { roughness: 0.4 });
const roble = mat('#b98a55', { roughness: 0.6 });

function azar(semilla) {
  let s = semilla >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const hash = (t) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function caja(g, m, x0, x1, y0, y1, z0, z1) {
  const malla = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), m);
  malla.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  g.add(malla);
  return malla;
}
function cilindro(g, m, x, z, r, y0, y1, rArriba = r, seg = 20) {
  const malla = new THREE.Mesh(new THREE.CylinderGeometry(rArriba, r, y1 - y0, seg), m);
  malla.position.set(x, (y0 + y1) / 2, z);
  g.add(malla);
  return malla;
}
function elipsoide(g, m, x, y, z, rx, ry, rz) {
  const malla = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), m);
  malla.scale.set(rx, ry, rz);
  malla.position.set(x, y, z);
  g.add(malla);
  return malla;
}
// Hoja (o espiga) que sale de un punto: "inclinacion" se mide desde la vertical.
function hoja(g, m, y, angulo, inclinacion, ancho, largo, espiga = false) {
  const pivote = new THREE.Group();
  pivote.position.set(0, y, 0);
  pivote.rotation.order = 'YXZ';
  pivote.rotation.y = angulo;
  pivote.rotation.x = inclinacion;
  // el visor la endereza si apunta contra una pared (ver ajustarHojas en app.js)
  pivote.userData.hoja = { largo, inclinacion };
  g.add(pivote);
  const malla = espiga
    ? new THREE.Mesh(new THREE.ConeGeometry(ancho, largo, 5), m)
    : new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), m);
  if (!espiga) malla.scale.set(ancho, largo / 2, 0.012);
  malla.position.y = largo / 2;
  pivote.add(malla);
}

let texPaisaje = null;
function paisaje() {
  if (texPaisaje) return texPaisaje;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 180;
  const g = c.getContext('2d');
  const cielo = g.createLinearGradient(0, 0, 0, 120);
  cielo.addColorStop(0, '#3f78b8');
  cielo.addColorStop(1, '#b4d0ea');
  g.fillStyle = cielo;
  g.fillRect(0, 0, 256, 180);
  g.fillStyle = '#7d8590';
  g.beginPath();
  [[0, 125], [40, 85], [70, 100], [110, 40], [130, 62], [150, 28], [185, 88], [220, 72], [256, 104], [256, 180], [0, 180]].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.fill();
  g.fillStyle = '#eef2f6';
  for (const [x, y] of [[110, 40], [150, 28]]) { g.beginPath(); g.moveTo(x - 9, y + 13); g.lineTo(x, y); g.lineTo(x + 9, y + 13); g.fill(); }
  g.fillStyle = '#8a6d4a';
  g.fillRect(0, 145, 256, 35);
  texPaisaje = new THREE.CanvasTexture(c);
  texPaisaje.colorSpace = THREE.SRGBColorSpace;
  return texPaisaje;
}

// Lámina pintada en un canvas (se arma una sola vez)
const laminas = new Map();
function lamina(nombre, ancho, alto, pintar) {
  if (!laminas.has(nombre)) {
    const c = document.createElement('canvas');
    c.width = ancho; c.height = alto;
    pintar(c.getContext('2d'), ancho, alto);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    laminas.set(nombre, new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
  }
  return laminas.get(nombre);
}

// Glaciar Perito Moreno, vertical: cielo, cerros nevados, el frente de hielo y el lago turquesa
const pintarGlaciar = (g, w, h) => {
  const r = azar(77);
  const cielo = g.createLinearGradient(0, 0, 0, h * 0.4);
  cielo.addColorStop(0, '#5b8fc7'); cielo.addColorStop(1, '#d7e6f2');
  g.fillStyle = cielo; g.fillRect(0, 0, w, h);
  g.fillStyle = '#6f7f93';
  g.beginPath(); g.moveTo(0, h * 0.36);
  for (const [x, y] of [[0.12, 0.25], [0.28, 0.31], [0.45, 0.17], [0.6, 0.27], [0.78, 0.2], [1, 0.3]]) g.lineTo(w * x, h * y);
  g.lineTo(w, h * 0.45); g.lineTo(0, h * 0.45); g.fill();
  g.fillStyle = '#eef3f8';
  for (const [x, y] of [[0.45, 0.17], [0.78, 0.2], [0.12, 0.25]]) { g.beginPath(); g.moveTo(w * (x - 0.07), h * (y + 0.05)); g.lineTo(w * x, h * y); g.lineTo(w * (x + 0.07), h * (y + 0.05)); g.fill(); }
  // la lengua del glaciar baja hacia el frente
  const hielo = g.createLinearGradient(0, h * 0.38, 0, h * 0.55);
  hielo.addColorStop(0, '#f4f8fb'); hielo.addColorStop(1, '#cfe3ef');
  g.fillStyle = hielo;
  g.beginPath(); g.moveTo(0, h * 0.42); g.lineTo(w, h * 0.4); g.lineTo(w, h * 0.56); g.lineTo(0, h * 0.58); g.fill();
  // frente de hielo: paredes recortadas con grietas azules
  g.fillStyle = '#e9f3f8';
  g.beginPath(); g.moveTo(0, h * 0.56);
  for (let x = 0; x <= w; x += w / 14) g.lineTo(x, h * (0.53 + r() * 0.04));
  g.lineTo(w, h * 0.66); g.lineTo(0, h * 0.67); g.fill();
  for (let i = 0; i < 26; i++) {
    const x = r() * w;
    g.strokeStyle = r() < 0.5 ? '#7fb6d6' : '#a9d2e6'; g.lineWidth = 1 + r() * 2;
    g.beginPath(); g.moveTo(x, h * (0.56 + r() * 0.02)); g.lineTo(x + (r() - 0.5) * 6, h * 0.66); g.stroke();
  }
  // lago turquesa lechoso con témpanos
  const lago = g.createLinearGradient(0, h * 0.66, 0, h);
  lago.addColorStop(0, '#5fa9b8'); lago.addColorStop(1, '#2f6f86');
  g.fillStyle = lago; g.fillRect(0, h * 0.66, w, h * 0.34);
  g.fillStyle = '#e6f2f7';
  for (let i = 0; i < 9; i++) { const x = r() * w, y = h * (0.7 + r() * 0.25), s = 2 + r() * 6; g.fillRect(x, y, s * 1.6, s * 0.6); }
};

// Cuadro inventado para el living: fotografía panorámica de montañas en blanco y negro, con paspartú blanco.
// Cordones que se aclaran con la distancia y un lago que los refleja (combina con el sofá gris y los marcos negros).
const pintarMontanas = (g, w, h) => {
  const r = azar(31);
  g.fillStyle = '#f6f5f2'; g.fillRect(0, 0, w, h);                 // paspartú
  const m = Math.round(h * 0.09), x0 = m, y0 = m, fw = w - 2 * m, fh = h - 2 * m;
  g.save(); g.beginPath(); g.rect(x0, y0, fw, fh); g.clip();
  const cielo = g.createLinearGradient(0, y0, 0, y0 + fh * 0.6);
  cielo.addColorStop(0, '#9a9a98'); cielo.addColorStop(1, '#e4e4e1');
  g.fillStyle = cielo; g.fillRect(x0, y0, fw, fh);
  const agua = y0 + fh * 0.7;
  // cordones de atrás (claros) hacia adelante (oscuros)
  const capas = [['#c9c9c6', 0.30, 0.10], ['#a9a9a6', 0.40, 0.09], ['#7d7d7b', 0.50, 0.08], ['#4b4b4a', 0.60, 0.06]];
  const perfiles = capas.map(([color, base, amp], k) => {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const pico = Math.sin(t * Math.PI * (2 + k)) * 0.5 + Math.sin(t * Math.PI * (5 + 2 * k) + k) * 0.3 + (r() - 0.5) * 0.4;
      pts.push([x0 + t * fw, y0 + fh * (base - amp * pico)]);
    }
    return [color, pts];
  });
  for (const [color, pts] of perfiles) {
    g.fillStyle = color; g.beginPath(); g.moveTo(x0, agua);
    for (const [x, y] of pts) g.lineTo(x, Math.min(y, agua));
    g.lineTo(x0 + fw, agua); g.fill();
  }
  // nieve en los picos del cordón del medio
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (const [x, y] of perfiles[1][1]) if (y < y0 + fh * 0.36) { g.beginPath(); g.moveTo(x - 6, y + 7); g.lineTo(x, y); g.lineTo(x + 6, y + 7); g.fill(); }
  // lago: reflejo invertido y atenuado
  g.fillStyle = '#bdbdba'; g.fillRect(x0, agua, fw, fh);
  g.globalAlpha = 0.45;
  for (const [color, pts] of perfiles.slice(2)) {
    g.fillStyle = color; g.beginPath(); g.moveTo(x0, agua);
    for (const [x, y] of pts) g.lineTo(x, agua + (agua - Math.min(y, agua)) * 0.6);
    g.lineTo(x0 + fw, agua); g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 14; i++) g.fillRect(x0 + r() * fw, agua + 4 + r() * (fh * 0.28), 10 + r() * 30, 1);
  g.restore();
};

let texPelo = null;
function pelo() {
  if (texPelo) return texPelo;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = azar(21);
  g.fillStyle = '#e6e6e6';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2500; i++) {
    const v = 170 + (r() * 85) | 0;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2);
  }
  texPelo = new THREE.CanvasTexture(c);
  texPelo.wrapS = texPelo.wrapT = THREE.RepeatWrapping;
  texPelo.repeat.set(6, 6);
  return texPelo;
}

const constructores = {
  sofa(g, d) {
    const [W, D, H] = d.medidas;
    const tela = mat(d.color || '#cbcac5', { roughness: 0.95 });
    const x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2;
    const brazo = d.brazo ?? 0.15, base = 0.30, asiento = 0.45, respaldo = 0.22;
    caja(g, negro, x0 + 0.06, x1 - 0.06, 0, 0.06, z0 + 0.06, z1 - 0.06);
    caja(g, tela, x0, x1, 0.06, base, z0, z1);
    caja(g, tela, x0, x1, base, H - 0.1, z0, z0 + respaldo);
    const huellas = [[x0, z0, x1, z1]];
    let s0 = x0 + brazo, s1 = x1 - brazo, lado = 0;
    const ch = d.chaise;
    if (ch) {
      lado = ch.lado === 'derecha' ? -1 : 1;           // la derecha de quien se sienta es -X
      const cx0 = lado < 0 ? x0 : x1 - ch.ancho, cx1 = lado < 0 ? x0 + ch.ancho : x1;
      const zf = z0 + ch.fondo;
      caja(g, negro, cx0 + 0.06, cx1 - 0.06, 0, 0.06, z1 - 0.06, zf - 0.06);
      caja(g, tela, cx0, cx1, 0.06, base, z1, zf);
      caja(g, tela, lado < 0 ? cx0 + brazo : cx0 + 0.01, lado < 0 ? cx1 - 0.01 : cx1 - brazo, base, asiento, z0 + respaldo + 0.01, zf - 0.02);
      if (lado < 0) { s0 = cx1; caja(g, tela, x0, x0 + brazo, base, 0.62, z0, zf); } else { s1 = cx0; caja(g, tela, x1 - brazo, x1, base, 0.62, z0, zf); }
      huellas.push([cx0, z1, cx1, zf]);
    }
    if (lado >= 0) caja(g, tela, x0, x0 + brazo, base, 0.62, z0, z1);
    if (lado <= 0) caja(g, tela, x1 - brazo, x1, base, 0.62, z0, z1);
    // plazas: asientos en total, contando el del extensible; un almohadón de respaldo por plaza
    const plazas = d.plazas ?? 3, sueltos = plazas - (ch ? 1 : 0);
    const paso = (s1 - s0) / sueltos;
    for (let i = 0; i < sueltos; i++) caja(g, tela, s0 + i * paso + 0.01, s0 + (i + 1) * paso - 0.01, base, asiento, z0 + respaldo + 0.01, z1 - 0.02);
    const pa = (W - 2 * brazo) / plazas;
    for (let i = 0; i < plazas; i++) {
      caja(g, tela, x0 + brazo + i * pa + 0.015, x0 + brazo + (i + 1) * pa - 0.015, asiento, H - 0.04, z0 + respaldo, z0 + respaldo + 0.14).rotation.x = -0.12;
    }
    // almohadones decorativos: uno en cada punta, contra los brazos (pedido del usuario)
    const deco = mat('#dcdbd6', { roughness: 0.95 });
    for (const sx of [x0 + brazo + 0.22, x1 - brazo - 0.22]) caja(g, deco, sx - 0.2, sx + 0.2, asiento, asiento + 0.36, z0 + respaldo + 0.16, z0 + respaldo + 0.28).rotation.x = -0.25;
    return huellas;
  },

  mesa_ratona(g, d) {
    const [W, D, H] = d.medidas;
    caja(g, blanco, -W / 2, W / 2, H - 0.045, H, -D / 2, D / 2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (W / 2 - 0.07), z = sz * (D / 2 - 0.06);
      caja(g, roble, x - 0.025, x + 0.025, 0, H - 0.045, z - 0.025, z + 0.025);
    }
  },

  alfombra(g, d) {
    const [W, D, H] = d.medidas;
    caja(g, new THREE.MeshStandardMaterial({ color: d.color || '#8c8a85', map: pelo(), roughness: 1 }), -W / 2, W / 2, 0.004, H, -D / 2, D / 2);
    return [];
  },

  rack_tv(g, d) {
    const [W, D, H] = d.medidas;
    const x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2, puerta = 0.40;
    caja(g, mat('#e6e3dc'), x0 + 0.03, x1 - 0.03, 0, 0.06, z0 + 0.03, z1 - 0.03);
    caja(g, blanco, x0, x1, 0.06, H - 0.035, z0, z1);
    caja(g, roble, x0 - 0.01, x1 + 0.01, H - 0.035, H, z0, z1 + 0.01);
    const vidrioPuerta = mat('#aeb8bb', { roughness: 0.15, metalness: 0.2 });
    for (const a of [x0 + 0.02, x1 - 0.02 - puerta]) caja(g, vidrioPuerta, a + 0.04, a + puerta - 0.04, 0.12, H - 0.09, z1, z1 + 0.006);
    caja(g, mat('#a89a86'), x0 + puerta + 0.05, x1 - puerta - 0.05, H - 0.22, H - 0.05, z0 + 0.02, z1 + 0.001);
    for (const y of [0.19, 0.31]) caja(g, mat('#d8d4cc'), x0 + puerta + 0.05, x1 - puerta - 0.05, y, y + 0.006, z1, z1 + 0.004);
  },

  rack_perfumes(g, d) {
    const [W, D, H] = d.medidas;
    const x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2, puerta = W * 0.33;
    caja(g, mat('#e6e3dc'), x0 + 0.03, x1 - 0.03, 0, 0.04, z0 + 0.03, z1 - 0.03);
    caja(g, blanco, x0, x1, 0.04, H, z0, z1);
    caja(g, mat('#ebe8e2'), x0 + 0.01, x0 + puerta, 0.06, H - 0.02, z1, z1 + 0.004);
    caja(g, mat('#cfc9bf'), x0 + puerta + 0.03, x1 - 0.03, 0.07, H - 0.04, z0 + 0.02, z1 + 0.001);
    caja(g, blanco, x0 + puerta + 0.03, x1 - 0.03, H / 2 - 0.01, H / 2 + 0.01, z0 + 0.02, z1);
    const r = azar(31);
    const colores = ['#18181a', '#2d2622', '#5b1f2e', '#1d2c48', '#c9a54a', '#e8e5de', '#3b3f45', '#6b4b2f'].map((c) => mat(c, { roughness: 0.4 }));
    for (let fila = 0; fila < 3; fila++) {
      let x = x0 + 0.1;
      const z = z0 + 0.07 + fila * 0.11;
      while (x < x1 - 0.14) {
        const w = 0.05 + r() * 0.06, h = 0.08 + r() * 0.12 - fila * 0.02;
        caja(g, colores[(r() * colores.length) | 0], x, x + w, H, H + h, z - 0.035, z + 0.035);
        x += w + 0.01 + r() * 0.02;
      }
    }
    for (const s of [-1, 1]) cilindro(g, cromo, s * (W / 2 - 0.07), z0 + 0.2, 0.06, H, H + 0.16);
  },

  tv(g, d) {
    const [W, D, H] = d.medidas;
    const marco = mat('#111214', { roughness: 0.25, metalness: 0.3 });
    const pantalla = mat('#0d1622', { roughness: 0.08, metalness: 0.2, emissive: '#0a1726', emissiveIntensity: 0.6 });
    caja(g, marco, -W / 2, W / 2, 0.075, H, -0.03, 0.02);
    caja(g, pantalla, -W / 2 + 0.012, W / 2 - 0.012, 0.087, H - 0.012, 0.02, 0.024);
    for (const s of [-1, 1]) caja(g, marco, s * W * 0.38 - 0.03, s * W * 0.38 + 0.03, 0, 0.08, -D / 2, D / 2);
  },

  ps5(g, d) {
    const [W, D, H] = d.medidas;
    caja(g, mat('#f2f2f0', { roughness: 0.3 }), -W / 2, W / 2, 0.01, H, -D / 2, D / 2);
    caja(g, mat('#141416'), -W * 0.22, W * 0.22, 0, H - 0.02, -D / 2 - 0.003, D / 2 + 0.003);
  },

  proyector(g, d) {
    const [W, D, H] = d.medidas;
    caja(g, mat('#e6e6e3', { roughness: 0.4 }), -W / 2, W / 2, 0, H, -D / 2, D / 2);
    const lente = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 20), negro);
    lente.rotation.x = Math.PI / 2;
    lente.position.set(-W * 0.2, H / 2, D / 2 + 0.008);
    g.add(lente);
    return [];
  },

  bloque(g, d) {
    const [W, D, H] = d.medidas;
    caja(g, mat(d.color || '#8a8780'), -W / 2, W / 2, 0, H, -D / 2, D / 2);
  },

  guitarra(g) {
    const madera = mat('#c9924e', { roughness: 0.45 }), oscura = mat('#3b2418', { roughness: 0.5 });
    const cuerpo = new THREE.Group();
    cuerpo.position.set(0, 0.06, -0.05);
    cuerpo.rotation.x = -0.2;
    g.add(cuerpo);
    elipsoide(cuerpo, madera, 0, 0.28, 0, 0.19, 0.2, 0.05);
    elipsoide(cuerpo, madera, 0, 0.53, 0, 0.145, 0.14, 0.05);
    const boca = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 20), negro);
    boca.rotation.x = Math.PI / 2;
    boca.position.set(0, 0.47, 0.048);
    cuerpo.add(boca);
    caja(cuerpo, oscura, -0.025, 0.025, 0.62, 0.98, -0.02, 0.025);
    caja(cuerpo, oscura, -0.04, 0.04, 0.98, 1.08, -0.025, 0.02);
    caja(g, negro, -0.15, 0.15, 0, 0.02, -0.02, 0.02);
    caja(g, negro, -0.01, 0.01, 0, 0.55, -0.17, -0.14);
    caja(g, negro, -0.13, 0.13, 0.05, 0.08, 0.02, 0.08);
  },

  lampara_arco(g, d) {
    const [W, , H] = d.medidas;
    const alcance = d.alcance || 1.4;
    cilindro(g, mat('#e9e7e2', { roughness: 0.3 }), 0, 0, W / 2, 0, 0.05, W / 2, 28);
    // H es lo más alto del arco; la punta baja ~0,2 m y de ahí cuelga la pantalla
    const curva = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, H + 0.55, alcance * 0.25), new THREE.Vector3(0, H - 0.2, alcance));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curva, 40, 0.012, 8), cromo));
    const pantalla = new THREE.Mesh(new THREE.SphereGeometry(0.19, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat('#d9dcdf', { metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }));
    pantalla.position.set(0, H - 0.38, alcance);
    g.add(pantalla);
    elipsoide(g, mat('#fff3dc', { emissive: '#ffd9a0', emissiveIntensity: 1.5 }), 0, H - 0.36, alcance, 0.05, 0.05, 0.05);
    return [[-W / 2, -W / 2, W / 2, W / 2]];
  },

  lampara_pie(g, d) {
    const [W, , H] = d.medidas;
    cilindro(g, blanco, 0, 0, W / 2, 0, 0.03, W / 2, 24);
    cilindro(g, blanco, 0, 0, 0.012, 0.03, H - 0.16);
    cilindro(g, mat('#f5f4f0', { roughness: 0.5, side: THREE.DoubleSide }), 0, 0, 0.05, H - 0.18, H, 0.18, 24);
    return [[-W / 2, -W / 2, W / 2, W / 2]];
  },

  lampara_mesa(g, d) {
    const [W, , H] = d.medidas;
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Group();
      p.rotation.y = i * 2.094;
      g.add(p);
      const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.32, 8), roble);
      pata.position.set(0, 0.15, 0.05);
      pata.rotation.x = 0.3;
      p.add(pata);
    }
    cilindro(g, mat('#f4f1e8', { roughness: 0.6, emissive: '#fff1d0', emissiveIntensity: 0.25 }), 0, 0, W / 2, H - 0.17, H, W / 2 * 0.9, 24);
    return [];
  },

  planta(g, d) {
    const [W, D, H] = d.medidas;
    const m = d.maceta || { alto: 0.3, forma: 'redonda', color: '#d9d3c7' };
    const r = azar(hash(d.id));
    const tierra = mat('#3b2a1e', { roughness: 1 });
    if (m.forma === 'cuadrada') {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(W / 2 * Math.SQRT2, W / 2 * Math.SQRT2 * 0.82, m.alto, 4, 1), mat(m.color, { roughness: 0.8 }));
      p.rotation.y = Math.PI / 4;
      p.position.y = m.alto / 2;
      g.add(p);
    } else {
      cilindro(g, mat(m.color, { roughness: 0.8 }), 0, 0, W / 2 * 0.82, 0, m.alto, W / 2, 24);
    }
    cilindro(g, tierra, 0, 0, W / 2 * 0.85, m.alto - 0.03, m.alto - 0.01, W / 2 * 0.85, 16);
    const verdes = ['#3f6b35', '#4d7a3a', '#5b8a45', '#355d2e'].map((c) => mat(c, { roughness: 0.75 }));
    const alto = H - m.alto, base = m.alto;
    if (d.estilo === 'palmera') {
      cilindro(g, mat('#6b5136'), 0, 0, 0.03, base, base + alto * 0.55, 0.022, 10);
      for (let i = 0; i < 11; i++) hoja(g, verdes[i % 4], base + alto * 0.55, i * 2.4 + r(), 0.7 + r() * 0.7, 0.045, alto * (0.35 + r() * 0.15));
    } else if (d.estilo === 'puntiaguda') {
      cilindro(g, mat('#7a6a55'), 0, 0, 0.02, base, base + alto * 0.62, 0.015, 8);
      const tonos = ['#7d3f45', '#6f7a43', '#8c5a50'].map((c) => mat(c, { roughness: 0.7 }));
      for (let i = 0; i < 28; i++) hoja(g, tonos[i % 3], base + alto * 0.62, i * 2.39996, r() * 1.5, 0.014, alto * (0.22 + r() * 0.1), true);
    } else if (d.estilo === 'arbusto') {
      for (let i = 0; i < 30; i++) {
        const a = r() * Math.PI * 2, rr = r() * W * 0.55, y = base + 0.08 + r() * alto * 0.8;
        elipsoide(g, verdes[i % 4], Math.cos(a) * rr, y, Math.sin(a) * rr, 0.07 + r() * 0.05, 0.06 + r() * 0.04, 0.07 + r() * 0.05);
      }
    } else {
      // copa: diámetro máximo de las hojas; las que se abren más se paran (misma altura, menos ancho)
      const radio = d.copa ? d.copa / 2 - 0.02 : Infinity;
      for (let i = 0; i < 16; i++) {
        const y = base + r() * alto * 0.25, inclinacion = 0.3 + r() * 0.8, largo = alto * (0.4 + r() * 0.35);
        const maxima = largo * Math.sin(inclinacion) > radio ? Math.asin(radio / largo) : inclinacion;
        hoja(g, verdes[i % 4], y, i * 2.39996, maxima, 0.07, largo);
      }
    }
    return [[-W / 2, -D / 2, W / 2, D / 2]];
  },

  maceta(g, d) {
    const [W, , H] = d.medidas;
    cilindro(g, mat('#b5643c', { roughness: 0.9 }), 0, 0, W / 2 * 0.75, 0, H * 0.6, W / 2, 16);
    const verde = mat('#7fa38c', { roughness: 0.7 });
    for (let i = 0; i < 5; i++) elipsoide(g, verde, Math.cos(i * 1.25) * 0.035, H * 0.65, Math.sin(i * 1.25) * 0.035, 0.035, 0.02, 0.035);
    return [];
  },

  escritorio(g, d) {
    const [W, D, H] = d.medidas;
    const z0 = -D / 2, z1 = D / 2;
    caja(g, blanco, -W / 2, W / 2, H - 0.025, H, z0, z1);
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 0.12);
      caja(g, blanco, x - 0.03, x + 0.03, 0.03, H - 0.025, -0.03, 0.03);
      caja(g, blanco, x - 0.03, x + 0.03, 0, 0.03, z0 + 0.03, z1 - 0.03);
      caja(g, blanco, x - 0.03, x + 0.03, H - 0.06, H - 0.025, z0 + 0.04, z1 - 0.04);
    }
    caja(g, blanco, -W / 2 + 0.12, W / 2 - 0.12, H - 0.09, H - 0.06, -0.04, 0);
    caja(g, negro, -0.10, 0.10, H, H + 0.01, z0 + 0.08, z0 + 0.22);
    caja(g, negro, -0.02, 0.02, H, H + 0.22, z0 + 0.12, z0 + 0.15);
    // monitor: carcasa gris oscuro mate y la pantalla solo del lado de quien se sienta (desde atrás no parece prendido)
    caja(g, mat('#2b2d31', { roughness: 0.7 }), -0.31, 0.31, H + 0.14, H + 0.50, z0 + 0.15, z0 + 0.175);
    caja(g, mat('#15181d', { emissive: '#18304a', emissiveIntensity: 0.5 }), -0.30, 0.30, H + 0.15, H + 0.49, z0 + 0.175, z0 + 0.18);
    const aluminio = mat('#9a9da1', { metalness: 0.6, roughness: 0.35 });
    caja(g, aluminio, -W / 2 + 0.1, -W / 2 + 0.42, H, H + 0.015, -0.04, 0.18);
    caja(g, aluminio, -W / 2 + 0.1, -W / 2 + 0.42, H + 0.015, H + 0.22, -0.06, -0.05).rotation.x = -0.25;
  },

  silla_oficina(g) {
    const tela = mat('#2a2b2f', { roughness: 0.9 });
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Group();
      p.rotation.y = i * 1.2566;
      g.add(p);
      caja(p, negro, -0.02, 0.02, 0.04, 0.07, 0.02, 0.30);
      cilindro(p, negro, 0, 0.29, 0.025, 0, 0.05);
    }
    cilindro(g, negro, 0, 0, 0.03, 0.06, 0.44);
    caja(g, tela, -0.25, 0.25, 0.44, 0.52, -0.22, 0.24);
    const resp = new THREE.Group();
    resp.position.set(0, 0.55, -0.24);
    resp.rotation.x = -0.12;
    g.add(resp);
    caja(resp, blanco, -0.24, 0.24, 0, 0.58, -0.03, 0);
    caja(resp, tela, -0.21, 0.21, 0.03, 0.55, 0, 0.01);
    caja(resp, blanco, -0.14, 0.14, 0.6, 0.72, -0.03, 0.01);
    for (const s of [-1, 1]) {
      caja(g, blanco, s * 0.27 - 0.025, s * 0.27 + 0.025, 0.62, 0.66, -0.12, 0.14);
      caja(g, blanco, s * 0.27 - 0.015, s * 0.27 + 0.015, 0.5, 0.62, -0.05, 0);
    }
  },

  masajeador_pies(g, d) {
    // funda tejida; atrás es más alto y arriba tiene la boca donde se meten los pies
    const [W, D, H] = d.medidas;
    const tejido = mat('#8f8d88', { roughness: 1 });
    caja(g, tejido, -W / 2, W / 2, 0, H * 0.72, -D / 2, D / 2);
    caja(g, tejido, -W / 2, W / 2, H * 0.72, H, -D / 2, -D / 2 + 0.12);
    caja(g, mat('#2f2e2c', { roughness: 0.9 }), -W / 2 + 0.05, W / 2 - 0.05, H * 0.72, H * 0.72 + 0.004, -D / 2 + 0.13, D / 2 - 0.05);
  },

  cuadros(g, d) {
    const [W, D, H] = d.medidas;
    const papel = mat('#f4f2ea', { roughness: 0.9 });
    const foto = new THREE.MeshStandardMaterial({ map: paisaje(), roughness: 0.6 });
    const cuadro = (x0, x1, y0, y1, marco, lamina, borde) => {
      caja(g, marco, x0, x1, y0, y1, -D / 2, D / 2);
      caja(g, lamina, x0 + borde, x1 - borde, y0 + borde, y1 - borde, D / 2, D / 2 + 0.003);
    };
    if (d.estilo === 'diplomas') {
      const marco = mat('#1f1f21', { roughness: 0.5 });
      const w = (W - 0.1) / 3;
      for (let i = 0; i < 3; i++) cuadro(-W / 2 + i * (w + 0.05), -W / 2 + i * (w + 0.05) + w, H * 0.52, H, marco, papel, 0.025);
      const w2 = (W - 0.3) / 2;
      for (let i = 0; i < 2; i++) cuadro(-W / 2 + 0.1 + i * (w2 + 0.1), -W / 2 + 0.1 + i * (w2 + 0.1) + w2, 0, H * 0.45, marco, papel, 0.025);
    } else if (d.estilo === 'glaciar') {
      cuadro(-W / 2, W / 2, 0, H, negro, lamina('glaciar', 180, 252, pintarGlaciar), 0.02);
    } else if (d.estilo === 'montanas') {
      // marco negro fino, como el de los diplomas
      cuadro(-W / 2, W / 2, 0, H, negro, lamina('montanas', 448, 288, pintarMontanas), 0.015);
    } else if (d.estilo === 'chicos') {
      const w = (W - 0.06) / 2, h = (H - 0.06) / 2;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) cuadro(-W / 2 + i * (w + 0.06), -W / 2 + i * (w + 0.06) + w, j * (h + 0.06), j * (h + 0.06) + h, roble, foto, 0.02);
    } else {
      cuadro(-W / 2, W / 2, 0, H, mat('#cfd2d4', { metalness: 0.5, roughness: 0.35 }), foto, 0.03);
    }
    return [];
  },

  espejo(g, d) {
    const [W, D, H] = d.medidas;
    const b = 0.06;
    caja(g, roble, -W / 2, W / 2, 0, b, -D / 2, D / 2);
    caja(g, roble, -W / 2, W / 2, H - b, H, -D / 2, D / 2);
    caja(g, roble, -W / 2, -W / 2 + b, b, H - b, -D / 2, D / 2);
    caja(g, roble, W / 2 - b, W / 2, b, H - b, -D / 2, D / 2);
    caja(g, espejo, -W / 2 + b, W / 2 - b, b, H - b, -D / 2 + 0.01, D / 2 - 0.015);
    return [];
  },

  mesa_comedor(g, d) {
    const [W, D, H] = d.medidas;
    caja(g, vidrio, -W / 2, W / 2, H - 0.012, H, -D / 2, D / 2);
    for (const s of [-1, 1]) {
      cilindro(g, cromo, s * 0.3, 0, 0.04, 0.02, H - 0.06);
      caja(g, cromo, s * 0.3 - 0.06, s * 0.3 + 0.06, H - 0.06, H - 0.012, -D / 2 + 0.15, D / 2 - 0.15);
    }
    caja(g, cromo, -0.42, 0.42, 0, 0.02, -0.25, 0.25);
    caja(g, cromo, -0.3, 0.3, 0.3, 0.34, -0.02, 0.02);
  },

  silla_comedor(g, d) {
    const [W, D, H] = d.medidas;
    const tela = mat('#b9b8b4', { roughness: 0.9 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cilindro(g, cromo, sx * (W / 2 - 0.04), sz * (D / 2 - 0.05), 0.011, 0, 0.46, 0.011, 8);
    caja(g, tela, -W / 2, W / 2, 0.44, 0.52, -D / 2 + 0.04, D / 2);
    const resp = new THREE.Group();
    resp.position.set(0, 0.5, -D / 2 + 0.06);
    resp.rotation.x = -0.1;
    g.add(resp);
    caja(resp, tela, -W / 2 + 0.02, W / 2 - 0.02, 0, H - 0.5, -0.06, 0);
  },

  cama(g, d) {
    const [W, D, H] = d.medidas;
    const z0 = -D / 2, z1 = D / 2;
    caja(g, negro, -W / 2 + 0.05, W / 2 - 0.05, 0, 0.06, z0 + 0.12, z1 - 0.05);
    caja(g, mat('#8e8f93', { roughness: 0.95 }), -W / 2, W / 2, 0.06, 0.32, z0 + 0.08, z1);
    caja(g, mat('#f1f0ec', { roughness: 0.9 }), -W / 2 + 0.02, W / 2 - 0.02, 0.32, 0.56, z0 + 0.1, z1 - 0.02);
    caja(g, mat('#9fa2a6', { roughness: 0.95 }), -W / 2 - 0.01, W / 2 + 0.01, 0.3, 0.585, z0 + 0.55, z1 + 0.01);
    for (const s of [-0.36, -0.3, 0.3, 0.36]) caja(g, mat('#e9e9e6'), s * W - 0.012, s * W + 0.012, 0.586, 0.589, z0 + 0.6, z1);
    // almohadas: dos, cada una de casi la mitad del ancho de la cama
    const media = W / 4 - 0.02;
    for (const s of [-1, 1]) caja(g, mat('#a9acb0', { roughness: 0.95 }), s * W / 4 - media, s * W / 4 + media, 0.56, 0.72, z0 + 0.14, z0 + 0.46).rotation.x = -0.35;
    const rollo = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, Math.min(0.55, W * 0.4), 16), mat('#8b8e92', { roughness: 0.95 }));
    rollo.rotation.z = Math.PI / 2;
    rollo.position.set(-0.15, 0.66, z0 + 0.56);
    g.add(rollo);
    caja(g, mat('#e8e1d2', { roughness: 0.7 }), -W / 2, W / 2, 0.1, H, z0, z0 + 0.08);
    return [[-W / 2, z0, W / 2, z1]];
  },

  mesa_luz(g, d) {
    const [W, D, H] = d.medidas;
    caja(g, blanco, -W / 2, W / 2, 0.03, H, -D / 2, D / 2);
    caja(g, mat('#d9d6cf'), -W / 2 + 0.03, W / 2 - 0.03, 0.06, H - 0.2, -D / 2 + 0.02, D / 2 + 0.001);
    caja(g, mat('#e4e2dd'), -W / 2 + 0.02, W / 2 - 0.02, H - 0.17, H - 0.165, D / 2, D / 2 + 0.004);
    caja(g, cromo, -0.03, 0.03, H - 0.1, H - 0.085, D / 2, D / 2 + 0.015);
  },

  banco_zapatos(g, d) {
    const [W, D, H] = d.medidas;
    caja(g, blanco, -W / 2, -W / 2 + 0.02, 0, H, -D / 2, D / 2);
    caja(g, blanco, W / 2 - 0.02, W / 2, 0, H, -D / 2, D / 2);
    for (const y of [0.02, 0.27, H]) caja(g, blanco, -W / 2 + 0.02, W / 2 - 0.02, y - 0.02, y, -D / 2, D / 2);
    const zapas = ['#f1f1ee', '#232325', '#6b4a32', '#e9e7e1'].map((c) => mat(c));
    let k = 0;
    for (const y of [0.02, 0.27]) for (let p = 0; p < 2; p++) {
      const cx = -W / 2 + 0.16 + p * 0.27;
      for (const dx of [-0.05, 0.05]) caja(g, zapas[k % 4], cx + dx - 0.045, cx + dx + 0.045, y, y + 0.09, -0.13, 0.13);
      k++;
    }
  },

  biblioteca(g, d) {
    const [W, D, H] = d.medidas;
    const x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2, e = 0.02;
    caja(g, blanco, x0, x0 + e, 0, H, z0, z1);
    caja(g, blanco, x1 - e, x1, 0, H, z0, z1);
    caja(g, blanco, x0, x1, H - e, H, z0, z1);
    caja(g, blanco, x0 + e, x1 - e, 0, 0.05, z0, z1);
    caja(g, mat('#e7e5df'), x0 + e, x1 - e, 0.05, H - e, z0, z0 + 0.01);
    const estantes = [0.72, 1.05, 1.38, 1.68];
    for (const y of estantes) caja(g, blanco, x0 + e, x1 - e, y - e, y, z0, z1);
    for (const s of [0, 1]) caja(g, mat('#efede8'), x0 + e + s * (W / 2 - e), x0 + e + (s + 1) * (W / 2 - e) - 0.004, 0.05, 0.7, z1 - 0.02, z1);
    const r = azar(17);
    const lomos = ['#7a2e2a', '#2f4a6b', '#d9c9a3', '#3c5a3a', '#1f1f22', '#b8862f', '#e4e1da', '#8a4f6a'].map((c) => mat(c, { roughness: 0.8 }));
    for (let i = 0; i < 3; i++) {
      const y = estantes[i];
      let x = x0 + e + 0.01;
      while (x < x1 - e - 0.06) {
        if (r() < 0.12) { x += 0.05; continue; }
        const w = 0.02 + r() * 0.03;
        caja(g, lomos[(r() * lomos.length) | 0], x, x + w, y, y + 0.16 + r() * 0.12, z0 + 0.03, z0 + 0.22);
        x += w + 0.003;
      }
    }
    // tres pelotas chicas arriba
    for (const s of [-0.25, 0, 0.25]) elipsoide(g, mat('#f1f1ee', { roughness: 0.6 }), s, H + 0.075, 0, 0.075, 0.075, 0.075);
  },


  mesa_redonda(g, d) {
    const [W, , H] = d.medidas;
    const r = W / 2;
    cilindro(g, vidrio, 0, 0, r, H - 0.012, H, r, 32);
    const aro = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 8, 40), negro);
    aro.rotation.x = Math.PI / 2;
    aro.position.y = H - 0.012;
    g.add(aro);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      cilindro(g, negro, Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, 0.012, 0, H - 0.012, 0.012, 8);
    }
    const aro2 = new THREE.Mesh(new THREE.TorusGeometry(r * 0.7, 0.008, 6, 32), negro);
    aro2.rotation.x = Math.PI / 2;
    aro2.position.y = 0.25;
    g.add(aro2);
    return [[-r, -r, r, r]];
  },

  silla_balcon(g, d) {
    const [W, D, H] = d.medidas;
    const ratan = mat('#2b2a2c', { roughness: 0.95, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cilindro(g, negro, sx * (W / 2 - 0.05), sz * (D / 2 - 0.06), 0.012, 0, 0.43, 0.012, 8);
    caja(g, ratan, -W / 2 + 0.02, W / 2 - 0.02, 0.4, 0.45, -D / 2 + 0.04, D / 2 - 0.02);
    const resp = new THREE.Mesh(new THREE.CylinderGeometry(W / 2, W / 2 - 0.03, H - 0.45, 20, 1, true, Math.PI / 2, Math.PI), ratan);
    resp.position.set(0, 0.45 + (H - 0.45) / 2, 0);
    g.add(resp);
  },

  heladera(g, d) {
    const [W, D, H] = d.medidas;
    const inox = mat('#c3c6c8', { metalness: 0.65, roughness: 0.3 });
    caja(g, inox, -W / 2, W / 2, 0.02, H, -D / 2, D / 2);
    caja(g, mat('#2a2b2d'), -W / 2, W / 2, 1.12, 1.125, D / 2, D / 2 + 0.003);
    for (const [y0, y1] of [[0.8, 1.08], [1.18, 1.45]]) caja(g, mat('#9da1a4', { metalness: 0.8, roughness: 0.3 }), W / 2 - 0.06, W / 2 - 0.04, y0, y1, D / 2, D / 2 + 0.03);
  },

  lavarropas(g, d) {
    const [W, D, H] = d.medidas;
    caja(g, blanco, -W / 2, W / 2, 0, H, -D / 2, D / 2);
    caja(g, mat('#d9dbdc'), -W / 2 + 0.01, W / 2 - 0.01, H - 0.12, H - 0.01, D / 2, D / 2 + 0.003);
    const aro = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 32), mat('#9ca1a6', { metalness: 0.6, roughness: 0.3 }));
    aro.rotation.x = Math.PI / 2;
    aro.position.set(0, 0.42, D / 2 + 0.012);
    g.add(aro);
    const ojo = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.035, 32), mat('#2c3238', { roughness: 0.1 }));
    ojo.rotation.x = Math.PI / 2;
    ojo.position.set(0, 0.42, D / 2 + 0.016);
    g.add(ojo);
  },

  microondas(g, d) {
    const [W, D, H] = d.medidas;
    caja(g, negro, -W / 2, W / 2, 0, H, -D / 2, D / 2);
    caja(g, mat('#2d3238', { roughness: 0.1 }), -W / 2 + 0.03, W / 2 - 0.14, 0.04, H - 0.04, D / 2, D / 2 + 0.003);
    caja(g, cromo, W / 2 - 0.12, W / 2 - 0.1, 0.05, H - 0.05, D / 2, D / 2 + 0.02);
  },

  cafetera(g, d) {
    const [W, D, H] = d.medidas;
    caja(g, negro, -W / 2, W / 2, 0, H, -D / 2, D / 2);
    caja(g, cromo, -W / 2 + 0.02, W / 2 - 0.02, 0.02, 0.16, D / 2 - 0.12, D / 2 + 0.002);
    caja(g, mat('#111111', { emissive: '#1d3550', emissiveIntensity: 0.4 }), -W / 2 + 0.03, W / 2 - 0.03, H - 0.12, H - 0.04, D / 2, D / 2 + 0.004);
  },

  freidora(g, d) {
    const [W, D, H] = d.medidas;
    const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 28), negro);
    cuerpo.scale.set(W, H, D);
    cuerpo.position.y = H / 2;
    g.add(cuerpo);
    caja(g, negro, -0.04, 0.04, H * 0.25, H * 0.45, D / 2 - 0.02, D / 2 + 0.06);
  },

  pava(g, d) {
    const [W, , H] = d.medidas;
    cilindro(g, negro, 0, 0, W / 2 * 0.75, 0, H * 0.85, W / 2 * 0.55, 20);
    caja(g, negro, -W / 2 * 0.75 - 0.03, -W / 2 * 0.75, H * 0.25, H * 0.9, -0.015, 0.015);
  },

  estante_bano(g, d) {
    const [W, D] = d.medidas;
    caja(g, vidrio, -W / 2, W / 2, 0, 0.008, -D / 2, D / 2);
    caja(g, cromo, -W / 2, W / 2, 0.03, 0.04, D / 2 - 0.01, D / 2);
    for (const s of [-1, 1]) caja(g, cromo, s * W / 2 - 0.005, s * W / 2 + 0.005, 0, 0.05, -D / 2, D / 2);
    productos(g, W - 0.08, 0.008, 0.18, 5);
    return [];
  },

  cesto(g, d) {
    const [W, D, H] = d.medidas;
    const c = mat('#f1efe8', { roughness: 0.95 });
    caja(g, c, -W / 2, W / 2, 0, H - 0.04, -D / 2, D / 2);
    caja(g, c, -W / 2 - 0.01, W / 2 + 0.01, H - 0.04, H, -D / 2 - 0.01, D / 2 + 0.01);
  },

  productos(g, d) {
    const [W, , H] = d.medidas;
    productos(g, W, 0, H, 9);
    return [];
  },
};

function productos(g, ancho, y0, altoMax, semilla) {
  const r = azar(semilla);
  const colores = ['#2f6fb0', '#e9e7e1', '#c9473d', '#3c8a5a', '#f0c24a', '#7a4f9a'].map((c) => mat(c, { roughness: 0.4 }));
  let x = -ancho / 2;
  while (x < ancho / 2 - 0.04) {
    const rr = 0.018 + r() * 0.015, h = 0.06 + r() * (altoMax - 0.06);
    cilindro(g, colores[(r() * colores.length) | 0], x + rr, 0, rr, y0, y0 + h, rr, 12);
    x += 2 * rr + 0.012;
  }
}

export function construirMueble(def) {
  const grupo = new THREE.Group();
  const constructor = constructores[def.tipo] || constructores.bloque;
  const [W, D] = def.medidas;
  const huellas = constructor(grupo, def) || [[-W / 2, -D / 2, W / 2, D / 2]];
  grupo.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.material !== vidrio;
      o.receiveShadow = true;
    }
  });
  return { grupo, huellas };
}
