// Base de datos SQLite (node:sqlite, sin dependencias nativas)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'archivos'), { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'agenda.sqlite'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS empresas (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, color TEXT NOT NULL, orden INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, correo TEXT, rol TEXT NOT NULL, funcion TEXT DEFAULT '',
  empresas TEXT NOT NULL DEFAULT '[]', estado TEXT NOT NULL DEFAULT 'invitado', pc TEXT DEFAULT '#64748b', foto TEXT,
  clave_hash TEXT, clave_sal TEXT, token TEXT, token_vence TEXT, creado TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS personas_correo ON personas(lower(correo)) WHERE correo IS NOT NULL AND correo <> '';
CREATE TABLE IF NOT EXISTS sesiones (
  token TEXT PRIMARY KEY, persona TEXT NOT NULL, creado TEXT NOT NULL, expira TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY, tipo TEXT NOT NULL, nombre TEXT NOT NULL, frase TEXT, empresa TEXT NOT NULL, proyecto TEXT DEFAULT '',
  inicio TEXT NOT NULL, duracion INTEGER NOT NULL, dueno TEXT NOT NULL, personas TEXT NOT NULL DEFAULT '[]',
  lugar TEXT DEFAULT '', enlace TEXT DEFAULT '', nota TEXT DEFAULT '', estado TEXT NOT NULL DEFAULT 'pendiente',
  confirm TEXT NOT NULL DEFAULT '{}', solicitudes TEXT NOT NULL DEFAULT '[]', offsets TEXT, bloqueo TEXT, revisor TEXT,
  plataforma TEXT DEFAULT '', links INTEGER DEFAULT 0, comentarios_resp INTEGER DEFAULT 0, enlace_pub TEXT DEFAULT '',
  archivos TEXT NOT NULL DEFAULT '[]', historial TEXT NOT NULL DEFAULT '[]', creada TEXT NOT NULL, creado_por TEXT
);
CREATE TABLE IF NOT EXISTS comentarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item_id TEXT NOT NULL, de TEXT NOT NULL, texto TEXT NOT NULL, fecha TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS avisos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, para TEXT NOT NULL, titulo TEXT NOT NULL, cuerpo TEXT NOT NULL, item_id TEXT,
  fecha TEXT NOT NULL, leida INTEGER DEFAULT 0, urgente INTEGER DEFAULT 0, clave TEXT
);
CREATE INDEX IF NOT EXISTS avisos_para ON avisos(para, fecha);
CREATE UNIQUE INDEX IF NOT EXISTS avisos_clave ON avisos(clave) WHERE clave IS NOT NULL;
CREATE TABLE IF NOT EXISTS envios (
  id INTEGER PRIMARY KEY AUTOINCREMENT, aviso_id INTEGER, para TEXT NOT NULL, canal TEXT NOT NULL, asunto TEXT NOT NULL,
  estado TEXT NOT NULL, detalle TEXT DEFAULT '', intentos INTEGER DEFAULT 0, siguiente TEXT, fecha TEXT NOT NULL, destino TEXT
);
CREATE INDEX IF NOT EXISTS envios_pend ON envios(estado, siguiente);
CREATE TABLE IF NOT EXISTS recordatorios (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item_id TEXT NOT NULL, para TEXT NOT NULL, etiqueta TEXT NOT NULL,
  enviar_en TEXT NOT NULL, enviado INTEGER DEFAULT 0, urgente INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS rec_pend ON recordatorios(enviado, enviar_en);
CREATE TABLE IF NOT EXISTS suscripciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT, persona TEXT NOT NULL, endpoint TEXT UNIQUE NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, creado TEXT NOT NULL, agente TEXT
);
CREATE TABLE IF NOT EXISTS prefs (
  persona TEXT PRIMARY KEY, correo INTEGER DEFAULT 1, push INTEGER DEFAULT 0, resumen INTEGER DEFAULT 1, resumen_hora TEXT DEFAULT '07:00',
  descanso_on INTEGER DEFAULT 1, descanso_desde TEXT DEFAULT '21:00', descanso_hasta TEXT DEFAULT '07:00',
  rec_citas INTEGER DEFAULT 1, rec_tareas INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT);
CREATE TABLE IF NOT EXISTS marcas (clave TEXT PRIMARY KEY, fecha TEXT NOT NULL);
`);

// ---- Migraciones ----
if (!db.prepare("SELECT 1 FROM pragma_table_info('items') WHERE name = 'empresas'").get()) db.exec('ALTER TABLE items ADD COLUMN empresas TEXT');

// ---- Datos base (solo la primera vez) ----
const ALL = ['bross', 'rojas', 'chupe', 'montecarlo', 'qkis'];
const EMPRESAS_BASE = [
  ['bross', 'Bross Colombia', '#e8772e'],
  ['rojas', 'Constructora Rojas', '#2f9e5b'],
  ['chupe', 'El Chupe', '#c9a227'],
  ['montecarlo', 'Montecarlo', '#7c5cbf'],
  ['qkis', 'QKis Cruz', '#e0527f']
];
const EQUIPO_BASE = [
  ['cristian', 'Cristian', 'Administrador', 'Administrador general', ALL, '#4f46e5'],
  ['alex-rojas', 'Alex Rojas', 'Coordinador', 'Imagen de Constructora Rojas', ['rojas'], '#2f9e5b'],
  ['andres-felipe', 'Andrés Felipe', 'Coordinador', 'Imagen de El Chupe', ['chupe'], '#c9a227'],
  ['sebastian-beltran', 'Sebastián Beltrán', 'Colaborador', 'Filmmaker: graba y edita los videos de todas las empresas', ALL, '#14b8a6'],
  ['jerson-gonzalez', 'Jerson González', 'Colaborador', 'Manejo de contenido: sube contenido, responde comentarios y envía links', ALL, '#f43f5e'],
  ['alex-rodriguez', 'Alex Rodríguez', 'Coordinador', 'Eventos de El Chupe; grabación e imagen de El Chupe en los podcasts', ['chupe'], '#8b5cf6']
];
if (db.prepare('SELECT COUNT(*) AS n FROM empresas').get().n === 0) {
  const ins = db.prepare('INSERT INTO empresas (id, nombre, color, orden) VALUES (?, ?, ?, ?)');
  EMPRESAS_BASE.forEach((e, i) => ins.run(e[0], e[1], e[2], i));
}
if (db.prepare('SELECT COUNT(*) AS n FROM personas').get().n === 0) {
  const ins = db.prepare('INSERT INTO personas (id, nombre, correo, rol, funcion, empresas, estado, pc, creado) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)');
  const ahora = new Date().toISOString();
  EQUIPO_BASE.forEach(p => ins.run(p[0], p[1], p[2], p[3], JSON.stringify(p[4]), 'invitado', p[5], ahora));
}
if (!db.prepare('SELECT valor FROM config WHERE clave = ?').get('offsets_equipo')) {
  db.prepare('INSERT INTO config (clave, valor) VALUES (?, ?)').run('offsets_equipo', JSON.stringify([1440, 120, 15]));
}

// ---- Helpers ----
const q = {
  get: (sql, ...a) => db.prepare(sql).get(...a),
  all: (sql, ...a) => db.prepare(sql).all(...a),
  run: (sql, ...a) => db.prepare(sql).run(...a)
};
const J = s => { try { return JSON.parse(s); } catch (e) { return null; } };

function getConfig(clave, def) { const r = q.get('SELECT valor FROM config WHERE clave = ?', clave); return r ? J(r.valor) ?? r.valor : def; }
function setConfig(clave, valor) { q.run('INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor', clave, typeof valor === 'string' ? valor : JSON.stringify(valor)); }

function filaPersona(r) {
  if (!r) return null;
  return { id: r.id, nombre: r.nombre, correo: r.correo || '', rol: r.rol, funcion: r.funcion || '', empresas: J(r.empresas) || [], estado: r.estado, pc: r.pc, foto: r.foto || null, vence: r.token_vence || null, tieneClave: !!r.clave_hash };
}
function filaItem(r) {
  if (!r) return null;
  return {
    id: r.id, tipo: r.tipo, nombre: r.nombre, frase: r.frase || '', empresa: r.empresa, empresas: (J(r.empresas) || [r.empresa]).filter(Boolean), proyecto: r.proyecto || '', inicio: r.inicio, duracion: r.duracion,
    dueño: r.dueno, personas: J(r.personas) || [], lugar: r.lugar || '', enlace: r.enlace || '', nota: r.nota || '', estado: r.estado,
    confirm: J(r.confirm) || {}, solicitudes: J(r.solicitudes) || [], offsets: r.offsets ? J(r.offsets) : null, bloqueo: r.bloqueo || '', revisor: r.revisor || '',
    plataforma: r.plataforma || '', links: r.links || 0, comentariosResp: r.comentarios_resp || 0, enlacePub: r.enlace_pub || '',
    archivos: J(r.archivos) || [], historial: J(r.historial) || [], creada: r.creada, creadoPor: r.creado_por || ''
  };
}
function guardarItem(it) {
  q.run(`INSERT INTO items (id, tipo, nombre, frase, empresa, proyecto, inicio, duracion, dueno, personas, lugar, enlace, nota, estado, confirm, solicitudes, offsets, bloqueo, revisor, plataforma, links, comentarios_resp, enlace_pub, archivos, historial, creada, creado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET tipo=excluded.tipo, nombre=excluded.nombre, frase=excluded.frase, empresa=excluded.empresa, proyecto=excluded.proyecto, inicio=excluded.inicio, duracion=excluded.duracion, dueno=excluded.dueno, personas=excluded.personas, lugar=excluded.lugar, enlace=excluded.enlace, nota=excluded.nota, estado=excluded.estado, confirm=excluded.confirm, solicitudes=excluded.solicitudes, offsets=excluded.offsets, bloqueo=excluded.bloqueo, revisor=excluded.revisor, plataforma=excluded.plataforma, links=excluded.links, comentarios_resp=excluded.comentarios_resp, enlace_pub=excluded.enlace_pub, archivos=excluded.archivos, historial=excluded.historial`,
    it.id, it.tipo, it.nombre, it.frase || '', it.empresa, it.proyecto || '', it.inicio, it.duracion, it.dueño, JSON.stringify(it.personas), it.lugar || '', it.enlace || '', it.nota || '', it.estado,
    JSON.stringify(it.confirm || {}), JSON.stringify(it.solicitudes || []), it.offsets ? JSON.stringify(it.offsets) : null, it.bloqueo || null, it.revisor || null,
    it.plataforma || '', it.links || 0, it.comentariosResp || 0, it.enlacePub || '', JSON.stringify(it.archivos || []), JSON.stringify(it.historial || []), it.creada, it.creadoPor || null);
  q.run('UPDATE items SET empresas = ? WHERE id = ?', JSON.stringify(it.empresas && it.empresas.length ? it.empresas : [it.empresa]), it.id);
}
function getItem(id) { return filaItem(q.get('SELECT * FROM items WHERE id = ?', id)); }
function getPersona(id) { return filaPersona(q.get('SELECT * FROM personas WHERE id = ?', id)); }
function personasActivas() { return q.all("SELECT * FROM personas WHERE estado = 'activo'").map(filaPersona); }
function prefsDe(id) {
  let r = q.get('SELECT * FROM prefs WHERE persona = ?', id);
  if (!r) { q.run('INSERT INTO prefs (persona) VALUES (?)', id); r = q.get('SELECT * FROM prefs WHERE persona = ?', id); }
  return { correo: !!r.correo, push: !!r.push, resumen: !!r.resumen, resumenHora: r.resumen_hora, descanso: { on: !!r.descanso_on, desde: r.descanso_desde, hasta: r.descanso_hasta }, recCitas: !!r.rec_citas, recTareas: !!r.rec_tareas };
}

module.exports = { db, q, J, DATA_DIR, ALL, getConfig, setConfig, filaPersona, filaItem, guardarItem, getItem, getPersona, personasActivas, prefsDe };
