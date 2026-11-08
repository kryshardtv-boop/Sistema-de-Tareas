// Sesiones, contraseñas y enlaces de invitación
const crypto = require('crypto');
const { q, getPersona } = require('./db');

const DIAS_SESION = 30;
const DIAS_INVITACION = 7;

function hashClave(clave, sal) {
  sal = sal || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(clave), sal, 64).toString('hex');
  return { hash, sal };
}
function verificarClave(clave, hash, sal) {
  if (!hash || !sal) return false;
  const h = crypto.scryptSync(String(clave), sal, 64);
  const b = Buffer.from(hash, 'hex');
  return h.length === b.length && crypto.timingSafeEqual(h, b);
}
function token() { return crypto.randomBytes(24).toString('base64url'); }

function crearSesion(personaId) {
  const t = token(); const ahora = new Date(); const exp = new Date(ahora.getTime() + DIAS_SESION * 86400000);
  q.run('INSERT INTO sesiones (token, persona, creado, expira) VALUES (?, ?, ?, ?)', t, personaId, ahora.toISOString(), exp.toISOString());
  return t;
}
function borrarSesion(t) { if (t) q.run('DELETE FROM sesiones WHERE token = ?', t); }
function limpiarSesiones() { q.run('DELETE FROM sesiones WHERE expira < ?', new Date().toISOString()); }

function leerCookies(req) {
  const out = {}; (req.headers.cookie || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function ponerCookie(req, res, nombre, valor, dias) {
  const seguro = req.secure || (req.headers['x-forwarded-proto'] || '').includes('https');
  res.setHeader('Set-Cookie', `${nombre}=${encodeURIComponent(valor)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${dias * 86400}${seguro ? '; Secure' : ''}`);
}
function quitarCookie(req, res, nombre) { res.setHeader('Set-Cookie', `${nombre}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`); }

// Middleware: carga req.yo si hay sesión válida
function sesion(req, res, next) {
  const c = leerCookies(req); const t = c.sesion; req.yo = null; req.sesionToken = t || null;
  if (t) {
    const s = q.get('SELECT * FROM sesiones WHERE token = ?', t);
    if (s && s.expira > new Date().toISOString()) { const p = getPersona(s.persona); if (p && p.estado === 'activo') req.yo = p; }
  }
  next();
}
function requiereSesion(req, res, next) { if (!req.yo) return res.status(401).json({ error: 'Tu sesión terminó. Vuelve a entrar.' }); next(); }
function requiereAdmin(req, res, next) { if (!req.yo || req.yo.rol !== 'Administrador') return res.status(403).json({ error: 'Solo un administrador puede hacer esto.' }); next(); }

function generarInvitacion(personaId) {
  const t = token(); const vence = new Date(Date.now() + DIAS_INVITACION * 86400000).toISOString();
  q.run('UPDATE personas SET token = ?, token_vence = ? WHERE id = ?', t, vence, personaId);
  return { token: t, vence };
}
function personaPorToken(t) {
  if (!t) return null;
  const r = q.get('SELECT * FROM personas WHERE token = ?', t);
  if (!r) return null;
  if (!r.token_vence || r.token_vence < new Date().toISOString()) return { vencida: true, persona: getPersona(r.id) };
  return { persona: getPersona(r.id) };
}
function hayAdminConfigurado() {
  return !!q.get("SELECT id FROM personas WHERE rol = 'Administrador' AND clave_hash IS NOT NULL AND estado = 'activo'");
}

module.exports = { hashClave, verificarClave, token, crearSesion, borrarSesion, limpiarSesiones, ponerCookie, quitarCookie, sesion, requiereSesion, requiereAdmin, generarInvitacion, personaPorToken, hayAdminConfigurado, DIAS_INVITACION };
