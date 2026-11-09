// Avisos internos, correo, push al celular, cola de envíos con reintentos, recordatorios y resumen diario
const nodemailer = require('nodemailer');
const webpush = require('web-push');
const { q, J, getConfig, setConfig, getPersona, personasActivas, prefsDe, getItem, filaItem } = require('./db');

const TZ = 'America/Bogota';
const estadoCanales = { correo: { ok: false, detalle: 'Sin configurar' }, push: { ok: false, detalle: 'Sin configurar' }, programador: { ok: false, ultimo: null } };

/* ---------- Fechas en hora de Colombia ---------- */
const fHora = d => new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TZ }).format(new Date(d)).replace(/\s?([ap])\.\s?m\./i, ' $1. m.');
const fLarga = d => new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(new Date(d));
const fCorta = d => new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ }).format(new Date(d)).replace(/\./g, '');
const ymd = d => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
const hm = d => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d));
function diasEntre(a, b) { const da = new Date(ymd(a) + 'T00:00:00Z'), dbb = new Date(ymd(b) + 'T00:00:00Z'); return Math.round((dbb - da) / 86400000); }
function cuandoTexto(d) { const n = diasEntre(new Date(), d); if (n === 0) return 'hoy'; if (n === 1) return 'mañana'; if (n === -1) return 'ayer'; return 'el ' + fLarga(d); }
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function fechaBogota(ymdStr, hmStr) { return new Date(`${ymdStr}T${hmStr}:00-05:00`); }

/* ---------- Config de canales ---------- */
let transporte = null;
let remitente = '';
let brevoKey = '';
const BREVO_URL = process.env.BREVO_URL || 'https://api.brevo.com/v3';
function datosCorreo() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, BREVO_API_KEY } = process.env;
  if (BREVO_API_KEY && MAIL_FROM) return { tipo: 'brevo', apiKey: BREVO_API_KEY, from: MAIL_FROM, origen: 'variables del servidor' };
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) return { tipo: 'smtp', host: SMTP_HOST, port: Number(SMTP_PORT || 587), user: SMTP_USER, pass: SMTP_PASS, from: MAIL_FROM || SMTP_USER, origen: 'variables del servidor' };
  const g = getConfig('correo'); if (g && g.tipo === 'brevo' && g.apiKey && g.from) return Object.assign({ origen: 'configurado desde la plataforma' }, g);
  if (g && g.tipo === 'smtp' && g.host && g.user && g.pass) return Object.assign({ origen: 'configurado desde la plataforma' }, g);
  const viejo = getConfig('smtp'); if (viejo && viejo.host && viejo.user && viejo.pass) return Object.assign({ tipo: 'smtp', origen: 'configurado desde la plataforma' }, viejo);
  return null;
}
async function brevo(ruta, metodo, cuerpo, key) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(BREVO_URL + ruta, { method: metodo || 'GET', headers: { 'api-key': key, 'accept': 'application/json', 'content-type': 'application/json' }, body: cuerpo ? JSON.stringify(cuerpo) : undefined, signal: ctrl.signal });
    const txt = await r.text(); let j = {}; try { j = JSON.parse(txt); } catch (e) { }
    if (!r.ok) { const msg = j.message || txt || ('HTTP ' + r.status); const e = new Error(r.status === 401 ? 'Brevo rechazó la clave API. Revisa que la hayas copiado completa (empieza por xkeysib-).' : /not authorized/i.test(msg) ? 'La clave API no tiene permiso para enviar correos. En Brevo → SMTP y API → Claves API, genera una clave nueva con todos los permisos (o al menos “Correos transaccionales”).' : /sender/i.test(msg) ? 'Brevo no acepta ese remitente: el correo debe estar verificado en Brevo (Remitentes → Agregar remitente → confirmar el código).' : 'Brevo respondió: ' + msg); e.status = r.status; throw e; }
    return j;
  } catch (e) { if (e.name === 'AbortError') throw new Error('Brevo no respondió a tiempo.'); throw e; }
  finally { clearTimeout(t); }
}
async function configurarCorreo() {
  const d = datosCorreo(); transporte = null; brevoKey = '';
  if (!d) { estadoCanales.correo = { ok: false, detalle: 'Sin cuenta de correo. Pulsa “Configurar correo” para conectarlo.', configurable: true }; return estadoCanales.correo; }
  const configurable = d.origen !== 'variables del servidor';
  if (d.tipo === 'brevo') {
    if (!/^xkeysib-/.test(d.apiKey)) { estadoCanales.correo = { ok: false, detalle: 'La clave API de Brevo debe empezar por xkeysib-. Revisa que la hayas copiado completa.', configurable, cuenta: d.from, tipo: 'brevo' }; return estadoCanales.correo; }
    let detalle = 'Enviando desde ' + d.from + ' por Brevo.';
    try { const cuenta = await brevo('/account', 'GET', null, d.apiKey); if (cuenta && cuenta.email) detalle = 'Enviando desde ' + d.from + ' por Brevo (cuenta ' + cuenta.email + ').'; }
    catch (e) { if (e.status === 401) { estadoCanales.correo = { ok: false, detalle: 'Brevo: ' + e.message, configurable, cuenta: d.from, tipo: 'brevo' }; return estadoCanales.correo; } }
    brevoKey = d.apiKey; remitente = d.from; estadoCanales.correo = { ok: true, detalle, configurable, cuenta: d.from, tipo: 'brevo' };
    return estadoCanales.correo;
  }
  const puerto = Number(d.port || 587);
  const t = nodemailer.createTransport({ host: d.host, port: puerto, secure: puerto === 465, auth: { user: d.user, pass: d.pass }, connectionTimeout: 12000 });
  try { await t.verify(); transporte = t; remitente = d.from || d.user; estadoCanales.correo = { ok: true, detalle: 'Enviando desde ' + remitente + ' por SMTP (' + d.origen + ').', configurable, cuenta: d.user, host: d.host, tipo: 'smtp' }; }
  catch (e) { estadoCanales.correo = { ok: false, detalle: 'No se pudo conectar con ' + d.user + ': ' + traducirErrorCorreo(e), configurable, cuenta: d.user, host: d.host, tipo: 'smtp' }; }
  return estadoCanales.correo;
}
function traducirErrorCorreo(e) {
  const m = String(e && e.message || e);
  if (/Invalid login|535|BadCredentials|Username and Password not accepted/i.test(m)) return 'Google rechazó la clave. Debe ser una contraseña de aplicación de 16 letras y la verificación en 2 pasos debe estar activa.';
  if (/ENOTFOUND|EAI_AGAIN/i.test(m)) return 'no se encontró el servidor (revisa el host).';
  if (/ETIMEDOUT|timeout/i.test(m)) return 'tiempo de espera agotado. En Railway, los planes gratis y Hobby bloquean SMTP; usa la opción Brevo.';
  return m.slice(0, 160);
}
function guardarCorreo(d) { if (d.tipo === 'brevo') setConfig('correo', { tipo: 'brevo', apiKey: d.apiKey, from: d.from }); else setConfig('correo', { tipo: 'smtp', host: d.host, port: Number(d.port) || 465, user: d.user, pass: d.pass, from: d.from || d.user }); setConfig('smtp', {}); return configurarCorreo(); }
function borrarCorreo() { setConfig('correo', {}); setConfig('smtp', {}); return configurarCorreo(); }
function configurarPush() {
  let pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    const guardadas = getConfig('vapid');
    if (guardadas && guardadas.pub && guardadas.priv) { pub = guardadas.pub; priv = guardadas.priv; }
    else { const k = webpush.generateVAPIDKeys(); pub = k.publicKey; priv = k.privateKey; setConfig('vapid', { pub, priv }); }
  }
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:' + (process.env.MAIL_FROM || process.env.SMTP_USER || 'admin@agenda.local'), pub, priv);
    estadoCanales.push = { ok: true, detalle: 'Clave del servidor lista. Cada persona activa su celular desde Ajustes.', clave: pub };
  } catch (e) { estadoCanales.push = { ok: false, detalle: 'Clave push inválida: ' + e.message }; }
}
function appUrl() { return (process.env.APP_URL || getConfig('app_url') || '').replace(/\/$/, ''); }

/* ---------- Descanso ---------- */
function enDescanso(pf, d) {
  if (!pf.descanso.on) return false; const h = hm(d || new Date()); const { desde, hasta } = pf.descanso;
  return desde > hasta ? (h >= desde || h < hasta) : (h >= desde && h < hasta);
}
function finDescanso(pf, d) {
  d = d || new Date(); let f = fechaBogota(ymd(d), pf.descanso.hasta); if (f <= d) f = new Date(f.getTime() + 86400000); return f;
}

/* ---------- Crear aviso + envíos ---------- */
function crearAviso({ para, titulo, cuerpo, itemId, urgente, clave, pushCuerpo }) {
  const p = getPersona(para); if (!p || p.estado !== 'activo') return null;
  const ahora = new Date();
  if (clave && q.get('SELECT id FROM avisos WHERE clave = ?', clave)) return null;
  const r = q.run('INSERT INTO avisos (para, titulo, cuerpo, item_id, fecha, leida, urgente, clave) VALUES (?, ?, ?, ?, ?, 0, ?, ?)', para, titulo, cuerpo, itemId || null, ahora.toISOString(), urgente ? 1 : 0, clave || null);
  const avisoId = Number(r.lastInsertRowid);
  const pf = prefsDe(para);
  const siguiente = (!urgente && enDescanso(pf, ahora)) ? finDescanso(pf, ahora).toISOString() : ahora.toISOString();
  const ins = (canal, estado, detalle, destino) => q.run('INSERT INTO envios (aviso_id, para, canal, asunto, estado, detalle, intentos, siguiente, fecha, destino) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)', avisoId, para, canal, titulo, estado, detalle || '', siguiente, ahora.toISOString(), destino || null);
  ins('Interna', 'Entregada', '');
  if (!p.correo) ins('Correo', 'No enviado', 'La persona no tiene correo registrado');
  else if (!pf.correo) ins('Correo', 'Omitido', 'La persona desactivó el correo');
  else if (!estadoCanales.correo.ok) ins('Correo', 'No enviado', 'Correo sin configurar en el servidor', p.correo);
  else ins('Correo', 'Pendiente', siguiente > ahora.toISOString() ? 'Espera a que termine el horario de descanso' : '', p.correo);
  const subs = q.all('SELECT id FROM suscripciones WHERE persona = ?', para);
  if (!pf.push || !subs.length) ins('Push', 'No enviado', 'Celular sin activar');
  else if (!estadoCanales.push.ok) ins('Push', 'No enviado', 'Servidor sin clave push');
  else ins('Push', 'Pendiente', pushCuerpo || '', String(subs.length) + ' dispositivo(s)');
  return avisoId;
}

/* ---------- Procesar cola ---------- */
let procesando = false;
async function procesarEnvios() {
  if (procesando) return; procesando = true;
  try {
    const ahora = new Date().toISOString();
    const pend = q.all("SELECT * FROM envios WHERE estado = 'Pendiente' AND siguiente <= ? ORDER BY id LIMIT 25", ahora);
    for (const e of pend) {
      const aviso = q.get('SELECT * FROM avisos WHERE id = ?', e.aviso_id); const p = getPersona(e.para);
      if (!aviso || !p || p.estado !== 'activo') { q.run("UPDATE envios SET estado = 'Cancelado', detalle = 'Persona sin acceso' WHERE id = ?", e.id); continue; }
      try {
        if (e.canal === 'Correo') await enviarCorreo(p, aviso);
        else if (e.canal === 'Push') await enviarPush(p, aviso, e.detalle);
        q.run("UPDATE envios SET estado = 'Enviado', intentos = intentos + 1, detalle = ? WHERE id = ?", 'Enviado ' + fCorta(new Date()) + ' ' + fHora(new Date()), e.id);
      } catch (err) {
        const intentos = e.intentos + 1; const msg = String(err && err.message || err).slice(0, 180);
        if (intentos >= 3) q.run("UPDATE envios SET estado = 'Falló', intentos = ?, detalle = ? WHERE id = ?", intentos, msg, e.id);
        else q.run("UPDATE envios SET intentos = ?, siguiente = ?, detalle = ? WHERE id = ?", intentos, new Date(Date.now() + intentos * 5 * 60000).toISOString(), 'Reintento ' + intentos + ': ' + msg, e.id);
      }
    }
  } finally { procesando = false; }
}
function colorEmpresa(id) { const e = q.get('SELECT color FROM empresas WHERE id = ?', id); return e ? e.color : '#4f46e5'; }
function plantillaCorreo({ titulo, cuerpo, item, url, boton, color, nombrePersona }) {
  const c = color || '#4f46e5';
  const fila = (icono, texto) => '<tr><td style="padding:6px 10px 6px 0;font-size:18px;vertical-align:top;width:28px">' + icono + '</td><td style="padding:6px 0;font-size:15px;line-height:1.5;color:#1b2030;vertical-align:top">' + texto + '</td></tr>';
  let detalles = '';
  if (item) {
    const f = fin(item); const personas = item.personas.filter(x => x !== item.dueño).map(nombreDe);
    const [et] = (() => { if (item.estado === 'cancelada') return ['Cancelada']; if (item.estado === 'hecha') return ['Realizada']; if (item.estado === 'movida') return ['Nueva fecha, por confirmar']; const pend = item.personas.filter(px => item.confirm[px] !== 'ok').length; return [pend ? 'Por confirmar' : 'Confirmada']; })();
    detalles = '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:18px 0 6px;background:#f6f7fb;border-radius:12px;border-left:5px solid ' + c + '"><tr><td style="padding:14px 16px">' +
      '<div style="font-size:12px;font-weight:bold;color:#5f6880;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">' + esc(nombresEmpresas(item)) + (item.proyecto ? ' · ' + esc(item.proyecto) : '') + '</div>' +
      '<div style="font-size:19px;font-weight:bold;color:#1b2030;margin-bottom:8px">' + esc(item.nombre) + '</div>' +
      '<table role="presentation" cellpadding="0" cellspacing="0">' +
      fila('📅', '<b>' + cap(fLarga(item.inicio)) + '</b><br>' + fHora(item.inicio) + ' a ' + fHora(f) + ' · hora de Colombia') +
      (item.lugar ? fila(item.enlace ? '💻' : '📍', esc(item.lugar) + (item.enlace ? '<br><a href="' + esc(item.enlace) + '" style="color:' + c + '">Abrir enlace de reunión</a>' : '')) : '') +
      fila('👤', 'Responsable: <b>' + esc(nombreDe(item.dueño)) + '</b>') +
      (personas.length ? fila('👥', esc(personas.join(', '))) : '') +
      (item.nota ? fila('📝', esc(item.nota)) : '') +
      fila('🏷️', '<span style="display:inline-block;background:#e9e8fb;color:#4f46e5;font-weight:bold;font-size:13px;padding:3px 10px;border-radius:8px">' + et + '</span>') +
      '</table></td></tr></table>';
  }
  const cuerpoHtml = esc(cuerpo).replace(/\n/g, '<br>');
  return '<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' + esc(titulo) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#eef0f5;font-family:Arial,Helvetica,sans-serif">' +
    '<div style="display:none;max-height:0;overflow:hidden;color:#eef0f5">' + esc(cuerpo.slice(0, 110)) + '</div>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eef0f5"><tr><td align="center" style="padding:28px 12px">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:580px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 18px rgba(27,32,48,.08)">' +
    '<tr><td style="padding:18px 24px;background:#ffffff;border-bottom:1px solid #e6e8f0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:40px;height:40px;background:#4f46e5;border-radius:11px;color:#ffffff;font-weight:bold;font-size:16px;text-align:center;vertical-align:middle">AG</td><td style="padding-left:12px;font-size:16px;font-weight:bold;color:#1b2030">Agenda del Grupo<div style="font-size:12px;font-weight:normal;color:#5f6880">Agenda, avisos y tareas del equipo</div></td></tr></table></td></tr>' +
    '<tr><td style="height:5px;background:' + c + '"></td></tr>' +
    '<tr><td style="padding:26px 24px 8px">' + (nombrePersona ? '<div style="font-size:15px;color:#5f6880;margin-bottom:6px">Hola, ' + esc(nombrePersona) + '</div>' : '') + '<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25;color:#1b2030">' + esc(titulo) + '</h1><p style="margin:0;font-size:16px;line-height:1.55;color:#2b3142">' + cuerpoHtml + '</p>' + detalles + '</td></tr>' +
    (url ? '<tr><td style="padding:14px 24px 26px"><a href="' + esc(url) + '" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:14px 26px;border-radius:12px">' + esc(boton || 'Abrir la agenda') + '</a><div style="font-size:12px;color:#5f6880;margin-top:10px">Si el botón no abre, copia este enlace: <a href="' + esc(url) + '" style="color:#4f46e5;word-break:break-all">' + esc(url) + '</a></div></td></tr>' : '') +
    '<tr><td style="padding:16px 24px;background:#f6f7fb;font-size:12px;line-height:1.5;color:#5f6880;border-top:1px solid #e6e8f0">Recibes este correo porque haces parte del equipo en Agenda del Grupo. Puedes cambiar cómo te avisamos en <b>Ajustes de avisos</b> dentro de la plataforma.</td></tr>' +
    '</table></td></tr></table></body></html>';
}
async function enviarCorreo(p, aviso) {
  if (!transporte && !brevoKey) throw new Error('Correo sin configurar');
  const item = aviso.item_id ? getItem(aviso.item_id) : null;
  const url = aviso.url || (appUrl() + (aviso.item_id ? '/?item=' + encodeURIComponent(aviso.item_id) : '/'));
  const esConfirmacion = item && p.id && item.personas.includes(p.id) && item.dueño !== p.id && item.confirm && item.confirm[p.id] !== 'ok' && activo(item) && !ES_TAREA(item.tipo);
  const boton = aviso.boton || (esConfirmacion ? 'Confirmar asistencia' : (item ? 'Abrir actividad' : 'Abrir la agenda'));
  const html = plantillaCorreo({ titulo: aviso.titulo, cuerpo: aviso.cuerpo, item, url, boton, color: item ? colorEmpresa(item.empresa) : null, nombrePersona: p.nombre || '' });
  const texto = aviso.cuerpo + (item ? '\n\n' + item.nombre + ' · ' + nombresEmpresas(item) + '\n' + cap(fLarga(item.inicio)) + ' · ' + fHora(item.inicio) + ' a ' + fHora(fin(item)) + (item.lugar ? '\n' + item.lugar : '') + '\nResponsable: ' + nombreDe(item.dueño) : '') + '\n\n' + boton + ': ' + url;
  const asunto = aviso.titulo + (item ? ' · ' + item.nombre : '') + ' · Agenda del Grupo';
  if (brevoKey) { await brevo('/smtp/email', 'POST', { sender: { name: 'Agenda del Grupo', email: remitente }, to: [{ email: p.correo, name: p.nombre || undefined }], subject: asunto, htmlContent: html, textContent: texto }, brevoKey); return; }
  await transporte.sendMail({ from: '"Agenda del Grupo" <' + remitente + '>', to: p.correo, subject: asunto, text: texto, html });
}
async function enviarPush(p, aviso, cuerpoCorto) {
  const subs = q.all('SELECT * FROM suscripciones WHERE persona = ?', p.id);
  if (!subs.length) throw new Error('Celular sin activar');
  const noLeidos = q.get('SELECT COUNT(*) AS n FROM avisos WHERE para = ? AND leida = 0', p.id).n;
  const payload = JSON.stringify({ titulo: 'Agenda del Grupo', cuerpo: cuerpoCorto || aviso.titulo, url: appUrl() + (aviso.item_id ? '/?item=' + encodeURIComponent(aviso.item_id) : '/'), tag: 'aviso-' + aviso.id, noLeidos });
  let ok = 0, ultimo = null;
  for (const s of subs) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 }); ok++; }
    catch (err) { ultimo = err; if (err.statusCode === 404 || err.statusCode === 410) q.run('DELETE FROM suscripciones WHERE id = ?', s.id); }
  }
  if (!ok) throw new Error(ultimo ? 'Push rechazado (' + (ultimo.statusCode || ultimo.message) + ')' : 'Sin dispositivos');
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Recordatorios ---------- */
const ES_TAREA = t => t === 'Tarea' || t === 'Entrega';
const OFFSET_LABELS = { 2880: '2 días antes', 1440: '1 día antes', 120: '2 horas antes', 60: '1 hora antes', 30: '30 minutos antes', 15: '15 minutos antes' };
const activo = it => !['cancelada', 'hecha'].includes(it.estado);
function fin(it) { return new Date(new Date(it.inicio).getTime() + it.duracion * 60000); }
function nombreDe(id) { const p = getPersona(id); return p ? p.nombre : id; }
function empresaNombre(id) { const e = q.get('SELECT nombre FROM empresas WHERE id = ?', id); return e ? e.nombre : id; }
function nombresEmpresas(it) { const ids = (it.empresas && it.empresas.length ? it.empresas : [it.empresa]); return ids.map(empresaNombre).join(' · '); }

function textoAviso(it, personaId) {
  const dest = it.enlace ? 'Enlace: ' + it.enlace : (it.lugar ? 'Lugar: ' + it.lugar : '');
  return nombreDe(personaId) + ', ' + cuandoTexto(it.inicio) + ' tienes ' + (it.frase || ('“' + it.nombre + '”')) + ' de ' + nombresEmpresas(it) + ' a las ' + fHora(it.inicio) + ' (hora de Colombia). ' + (dest ? dest + '. ' : '') + 'Responsable: ' + nombreDe(it.dueño) + '. ' + (it.nota ? it.nota.split('.')[0] + ' y confirma tu asistencia.' : 'Confirma tu asistencia.');
}
function textoTarea(it, etiqueta) {
  return (etiqueta === 'vence' ? '“' + it.nombre + '” (' + nombresEmpresas(it) + ') venció ' + cuandoTexto(fin(it)) + ' a las ' + fHora(fin(it)) + ' y sigue sin completarse.' : '“' + it.nombre + '” (' + nombresEmpresas(it) + ') se entrega ' + cuandoTexto(fin(it)) + ' a las ' + fHora(fin(it)) + '.');
}
function programarRecordatorios(it) {
  q.run('DELETE FROM recordatorios WHERE item_id = ? AND enviado = 0', it.id);
  if (!activo(it)) return;
  const ahora = Date.now(); const inicio = new Date(it.inicio).getTime();
  const personas = it.personas.filter(pid => { const p = getPersona(pid); return p && p.estado === 'activo'; });
  if (ES_TAREA(it.tipo)) {
    const f = fin(it).getTime();
    personas.forEach(pid => { if (!prefsDe(pid).recTareas) return;
      if (f - 1440 * 60000 > ahora) q.run('INSERT INTO recordatorios (item_id, para, etiqueta, enviar_en, urgente) VALUES (?, ?, ?, ?, 0)', it.id, pid, 'se acerca', new Date(f - 1440 * 60000).toISOString());
      if (f > ahora) q.run('INSERT INTO recordatorios (item_id, para, etiqueta, enviar_en, urgente) VALUES (?, ?, ?, ?, 1)', it.id, pid, 'vence', new Date(f).toISOString());
    });
    return;
  }
  const offsets = (it.offsets || getConfig('offsets_equipo', [1440, 120, 15]));
  personas.forEach(pid => { if (!prefsDe(pid).recCitas) return; offsets.forEach(o => { const t = inicio - o * 60000; if (t > ahora) q.run('INSERT INTO recordatorios (item_id, para, etiqueta, enviar_en, urgente) VALUES (?, ?, ?, ?, ?)', it.id, pid, OFFSET_LABELS[o] || (o + ' min antes'), new Date(t).toISOString(), o <= 15 ? 1 : 0); }); });
}
function detenerRecordatorios(itemId) { q.run('DELETE FROM recordatorios WHERE item_id = ? AND enviado = 0', itemId); }

function enviarRecordatoriosVencidos() {
  const ahora = new Date().toISOString();
  const pend = q.all('SELECT * FROM recordatorios WHERE enviado = 0 AND enviar_en <= ? ORDER BY enviar_en LIMIT 50', ahora);
  for (const r of pend) {
    q.run('UPDATE recordatorios SET enviado = 1 WHERE id = ?', r.id);
    const it = getItem(r.item_id); if (!it || !activo(it)) continue;
    if (ES_TAREA(it.tipo)) {
      crearAviso({ para: r.para, titulo: r.etiqueta === 'vence' ? 'Tarea vencida sin completar' : 'Se acerca una entrega', cuerpo: textoTarea(it, r.etiqueta), itemId: it.id, urgente: r.urgente === 1, pushCuerpo: (r.etiqueta === 'vence' ? 'Venció · ' : 'Entrega · ') + it.tipo + ' · ' + nombresEmpresas(it) + ' · ' + fHora(fin(it)) });
    } else {
      if (it.confirm && it.confirm[r.para] === 'no') continue;
      crearAviso({ para: r.para, titulo: 'Recordatorio · ' + it.nombre, cuerpo: textoAviso(it, r.para), itemId: it.id, urgente: r.urgente === 1, pushCuerpo: it.tipo + ' · ' + nombresEmpresas(it) + ' · ' + fHora(it.inicio) + ' · ' + r.etiqueta });
    }
  }
}

/* ---------- Alertas al responsable y resumen diario ---------- */
function responsablesDe(emp) { return personasActivas().filter(p => p.rol === 'Administrador' || p.rol === 'Líder' || (p.rol === 'Coordinador' && p.empresas.includes(emp))).map(p => p.id); }
function marcar(clave) { if (q.get('SELECT clave FROM marcas WHERE clave = ?', clave)) return false; q.run('INSERT INTO marcas (clave, fecha) VALUES (?, ?)', clave, new Date().toISOString()); return true; }

function revisarAlertas() {
  const ahora = new Date();
  const items = q.all("SELECT * FROM items WHERE estado NOT IN ('cancelada','hecha')").map(filaItem);
  for (const it of items) {
    const ini = new Date(it.inicio); const f = fin(it);
    if (!ES_TAREA(it.tipo) && it.personas.length > 1 && ini > ahora && ini - ahora <= 24 * 3600000) {
      const sin = it.personas.filter(p => p !== it.dueño && it.confirm[p] !== 'ok');
      if (sin.length && marcar('sinconf:' + it.id + ':' + it.inicio)) crearAviso({ para: it.dueño, titulo: 'Faltan confirmaciones', cuerpo: it.nombre + ' es en menos de 24 horas y ' + sin.map(nombreDe).join(', ') + ' ' + (sin.length === 1 ? 'no ha respondido' : 'no han respondido') + '.', itemId: it.id, clave: 'sinconf:' + it.id + ':' + it.inicio, pushCuerpo: 'Faltan confirmaciones · ' + it.tipo + ' · ' + fHora(it.inicio) });
    }
    if (ES_TAREA(it.tipo) && it.estado !== 'en_revision' && f < ahora) {
      const dias = Math.floor((ahora - f) / 86400000);
      if (dias >= 2 && marcar('retraso:' + it.id)) [...new Set((it.empresas && it.empresas.length ? it.empresas : [it.empresa]).flatMap(responsablesDe))].filter(x => x !== it.dueño).forEach(pid => crearAviso({ para: pid, titulo: 'Retraso importante', cuerpo: '“' + it.nombre + '” de ' + nombreDe(it.dueño) + ' (' + empresaNombre(it.empresa) + ') lleva ' + dias + ' días de retraso.', itemId: it.id, clave: 'retraso:' + it.id + ':' + pid }));
    }
  }
}
function enviarResumenes() {
  const ahora = new Date(); const hoy = ymd(ahora); const h = hm(ahora);
  for (const p of personasActivas()) {
    const pf = prefsDe(p.id); if (!pf.resumen) continue;
    if (h < pf.resumenHora) continue;
    const [hh] = pf.resumenHora.split(':').map(Number); if (Number(h.split(':')[0]) - hh > 3) continue;
    if (!marcar('resumen:' + p.id + ':' + hoy)) continue;
    const items = q.all("SELECT * FROM items WHERE estado NOT IN ('cancelada')").map(filaItem).filter(it => it.personas.includes(p.id));
    const citas = items.filter(it => !ES_TAREA(it.tipo) && ymd(it.inicio) === hoy && it.estado !== 'hecha').sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
    const tareas = items.filter(it => ES_TAREA(it.tipo) && it.dueño === p.id && activo(it) && diasEntre(ahora, fin(it)) <= 0);
    const porConf = items.filter(it => !ES_TAREA(it.tipo) && it.dueño !== p.id && it.confirm[p.id] === 'pend' && activo(it) && new Date(it.inicio) > ahora);
    if (!citas.length && !tareas.length && !porConf.length) continue;
    const cuerpo = p.nombre + ', tu día de hoy (' + fLarga(ahora) + '):\n\nCitas (' + citas.length + ')\n' + (citas.length ? citas.map(a => '• ' + fHora(a.inicio) + ' · ' + a.nombre + ' · ' + nombresEmpresas(a) + (a.lugar ? ' · ' + a.lugar : '')).join('\n') : '• Sin citas hoy') +
      '\n\nTareas para hoy o atrasadas (' + tareas.length + ')\n' + (tareas.length ? tareas.map(t => '• ' + t.nombre + ' · ' + nombresEmpresas(t)).join('\n') : '• Todo listo') +
      '\n\nPor confirmar (' + porConf.length + ')\n' + (porConf.length ? porConf.map(a => '• ' + a.nombre + ' · ' + cuandoTexto(a.inicio) + ' ' + fHora(a.inicio)).join('\n') : '• Nada por confirmar');
    crearAviso({ para: p.id, titulo: 'Resumen de hoy', cuerpo, clave: 'resumen:' + p.id + ':' + hoy, pushCuerpo: citas.length + ' citas · ' + tareas.length + ' tareas · ' + porConf.length + ' por confirmar' });
  }
}

/* ---------- Programador ---------- */
function iniciarProgramador() {
  const tick = async () => { try { enviarRecordatoriosVencidos(); revisarAlertas(); enviarResumenes(); estadoCanales.programador = { ok: true, ultimo: new Date().toISOString() }; } catch (e) { console.error('Programador:', e); } try { await procesarEnvios(); } catch (e) { console.error('Envíos:', e); } };
  tick(); setInterval(tick, 60000); setInterval(() => procesarEnvios().catch(e => console.error('Envíos:', e)), 20000);
}

module.exports = { TZ, fHora, fLarga, fCorta, ymd, hm, cuandoTexto, cap, estadoCanales, nombresEmpresas, configurarCorreo, guardarCorreo, borrarCorreo, configurarPush, appUrl, crearAviso, procesarEnvios, programarRecordatorios, detenerRecordatorios, iniciarProgramador, textoAviso, responsablesDe, nombreDe, empresaNombre, ES_TAREA, activo, fin, enviarCorreo };
