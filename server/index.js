// Agenda del Grupo · servidor
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { q, J, DATA_DIR, getConfig, setConfig, filaPersona, filaItem, guardarItem, getItem, getPersona, personasActivas, prefsDe } = require('./db');
const auth = require('./auth');
const N = require('./notify');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(auth.sesion);
app.use((req, res, next) => { if (req.yo && !process.env.APP_URL && !getConfig('app_url')) { setConfig('app_url', (req.headers['x-forwarded-proto'] || req.protocol) + '://' + req.get('host')); } next(); });

const PUBLIC = path.join(__dirname, '..', 'public');
const pagina = n => path.join(PUBLIC, n);
const ahoraISO = () => new Date().toISOString();
const TIPOS = ['Grabación', 'Reunión', 'Entrevista', 'Podcast', 'Evento', 'Publicación', 'Tarea', 'Entrega'];
const ROLES = ['Colaborador', 'Coordinador', 'Líder', 'Administrador'];
const esAdmin = yo => yo.rol === 'Administrador';
const esLider = yo => yo.rol === 'Líder';
const puedeEditar = (yo, it) => esAdmin(yo) || it.dueño === yo.id || (esLider(yo) && yo.empresas.includes(it.empresa));
const veDetalles = (yo, it) => it.personas.includes(yo.id) || esAdmin(yo) || (esLider(yo) && yo.empresas.includes(it.empresa));
const hist = (it, texto) => { it.historial.push({ fecha: ahoraISO(), texto }); };
const slug = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const fechaCorta = d => N.cap(N.fCorta(d)) + ' ' + N.fHora(d);
const err = (res, code, msg) => res.status(code).json({ error: msg });

/* ---------- Páginas ---------- */
app.get('/', (req, res) => {
  if (!auth.hayAdminConfigurado()) return res.redirect('/configurar');
  if (!req.yo) return res.redirect('/entrar');
  res.sendFile(pagina('index.html'));
});
app.get('/entrar', (req, res) => { if (!auth.hayAdminConfigurado()) return res.redirect('/configurar'); if (req.yo) return res.redirect('/'); res.sendFile(pagina('entrar.html')); });
app.get('/configurar', (req, res) => { if (auth.hayAdminConfigurado()) return res.redirect('/entrar'); res.sendFile(pagina('configurar.html')); });
app.get('/invitacion/:token', (req, res) => res.sendFile(pagina('invitacion.html')));
app.get('/salud', (req, res) => res.json({ ok: true, hora: ahoraISO(), programador: N.estadoCanales.programador }));
app.use(express.static(PUBLIC, { index: false, maxAge: '1h' }));

/* ---------- Acceso ---------- */
app.post('/api/configurar', (req, res) => {
  if (auth.hayAdminConfigurado()) return err(res, 400, 'El administrador ya está configurado. Entra con tu correo y contraseña.');
  const { nombre, correo, clave } = req.body || {};
  if (!correo || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return err(res, 400, 'Escribe un correo válido.');
  if (!clave || String(clave).length < 8) return err(res, 400, 'La contraseña debe tener al menos 8 caracteres.');
  let admin = q.get("SELECT * FROM personas WHERE rol = 'Administrador' ORDER BY creado LIMIT 1");
  const { hash, sal } = auth.hashClave(clave);
  if (admin) q.run("UPDATE personas SET nombre = ?, correo = ?, clave_hash = ?, clave_sal = ?, estado = 'activo', token = NULL, token_vence = NULL WHERE id = ?", (nombre || admin.nombre).trim(), correo.trim().toLowerCase(), hash, sal, admin.id);
  else { const id = 'admin'; q.run("INSERT INTO personas (id, nombre, correo, rol, funcion, empresas, estado, pc, clave_hash, clave_sal, creado) VALUES (?, ?, ?, 'Administrador', 'Administrador general', ?, 'activo', '#4f46e5', ?, ?, ?)", id, (nombre || 'Administrador').trim(), correo.trim().toLowerCase(), JSON.stringify(q.all('SELECT id FROM empresas').map(e => e.id)), hash, sal, ahoraISO()); admin = { id }; }
  const t = auth.crearSesion(admin.id); auth.ponerCookie(req, res, 'sesion', t, 30);
  res.json({ ok: true });
});
app.post('/api/entrar', (req, res) => {
  const { correo, clave } = req.body || {};
  const r = q.get('SELECT * FROM personas WHERE lower(correo) = ?', String(correo || '').trim().toLowerCase());
  if (!r || !auth.verificarClave(clave || '', r.clave_hash, r.clave_sal)) return err(res, 401, 'Correo o contraseña incorrectos.');
  if (r.estado === 'desactivado') return err(res, 403, 'Tu acceso está desactivado. Habla con el administrador.');
  if (r.estado !== 'activo') return err(res, 403, 'Tu cuenta aún no está activa. Usa el enlace de invitación que te enviaron.');
  const t = auth.crearSesion(r.id); auth.ponerCookie(req, res, 'sesion', t, 30);
  res.json({ ok: true });
});
app.post('/api/salir', (req, res) => { auth.borrarSesion(req.sesionToken); auth.quitarCookie(req, res, 'sesion'); res.json({ ok: true }); });
app.get('/api/invitacion/:token', (req, res) => {
  const r = auth.personaPorToken(req.params.token);
  if (!r) return err(res, 404, 'Este enlace no es válido. Pídele al administrador uno nuevo.');
  if (r.vencida) return err(res, 410, 'Este enlace venció. Pídele al administrador que te envíe uno nuevo.');
  res.json({ nombre: r.persona.nombre, correo: r.persona.correo, tieneClave: r.persona.tieneClave, rol: r.persona.rol });
});
app.post('/api/invitacion/:token', (req, res) => {
  const r = auth.personaPorToken(req.params.token);
  if (!r || r.vencida) return err(res, 410, 'Este enlace ya no sirve. Pídele al administrador uno nuevo.');
  const { nombre, correo, clave } = req.body || {};
  if (!clave || String(clave).length < 8) return err(res, 400, 'La contraseña debe tener al menos 8 caracteres.');
  const c = String(correo || r.persona.correo || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) return err(res, 400, 'Escribe un correo válido.');
  const otro = q.get('SELECT id FROM personas WHERE lower(correo) = ? AND id <> ?', c, r.persona.id);
  if (otro) return err(res, 400, 'Ese correo ya lo usa otra persona del equipo.');
  const { hash, sal } = auth.hashClave(clave);
  q.run("UPDATE personas SET nombre = ?, correo = ?, clave_hash = ?, clave_sal = ?, estado = 'activo', token = NULL, token_vence = NULL WHERE id = ?", (nombre || r.persona.nombre).trim(), c, hash, sal, r.persona.id);
  const t = auth.crearSesion(r.persona.id); auth.ponerCookie(req, res, 'sesion', t, 30);
  res.json({ ok: true });
});
app.post('/api/recuperar', async (req, res) => {
  const c = String((req.body || {}).correo || '').trim().toLowerCase();
  const r = q.get('SELECT * FROM personas WHERE lower(correo) = ?', c);
  if (!r || r.estado === 'desactivado') return res.json({ ok: true, mensaje: 'Si el correo está registrado, te llegará un enlace. Si no llega, pídele al administrador un enlace de acceso.' });
  if (!N.estadoCanales.correo.ok) return res.json({ ok: true, mensaje: 'El correo automático no está configurado. Pídele al administrador que te envíe un enlace de acceso.' });
  const inv = auth.generarInvitacion(r.id); const enlace = N.appUrl() + '/invitacion/' + inv.token;
  try { await N.enviarCorreo({ correo: r.correo }, { titulo: 'Tu enlace de acceso', cuerpo: 'Abre este enlace para crear una contraseña nueva. Vence en 7 días.', item_id: null }); await N.enviarCorreo({ correo: r.correo }, { titulo: 'Enlace de acceso: ' + enlace, cuerpo: enlace, item_id: null }); } catch (e) { return res.json({ ok: true, mensaje: 'No se pudo enviar el correo. Pídele al administrador un enlace de acceso.' }); }
  res.json({ ok: true, mensaje: 'Te enviamos un enlace al correo. Revisa también la carpeta de no deseados.' });
});

/* ---------- Estado ---------- */
app.use('/api', (req, res, next) => { if (req.path.startsWith('/configurar') || req.path.startsWith('/entrar') || req.path.startsWith('/invitacion') || req.path.startsWith('/recuperar')) return next(); auth.requiereSesion(req, res, next); });

function itemsPara(yo) {
  const todos = q.all('SELECT * FROM items ORDER BY inicio').map(filaItem);
  const coms = q.all('SELECT * FROM comentarios ORDER BY id'); const porItem = {}; coms.forEach(c => (porItem[c.item_id] = porItem[c.item_id] || []).push({ de: c.de, texto: c.texto, fecha: c.fecha }));
  return todos.map(it => { const ve = veDetalles(yo, it); return Object.assign({}, it, { comentarios: ve ? (porItem[it.id] || []) : [], archivos: ve ? it.archivos : [], enlace: ve ? it.enlace : '', nota: ve ? it.nota : '', privado: !ve }); });
}
app.get('/api/estado', (req, res) => {
  const yo = req.yo;
  res.json({
    yo, personas: q.all('SELECT * FROM personas ORDER BY creado').map(filaPersona),
    empresas: q.all('SELECT * FROM empresas ORDER BY orden').map(e => ({ id: e.id, nombre: e.nombre, c: e.color })),
    proyectos: q.all("SELECT DISTINCT proyecto, empresa FROM items WHERE proyecto <> '' ORDER BY proyecto").map(p => ({ nombre: p.proyecto, empresa: p.empresa })),
    items: itemsPara(yo),
    avisos: q.all('SELECT * FROM avisos WHERE para = ? ORDER BY fecha DESC LIMIT 200', yo.id).map(a => ({ id: a.id, titulo: a.titulo, cuerpo: a.cuerpo, itemId: a.item_id, fecha: a.fecha, leida: !!a.leida, canales: q.all('SELECT canal, estado, detalle FROM envios WHERE aviso_id = ?', a.id) })),
    prefs: prefsDe(yo.id), offsetsEquipo: getConfig('offsets_equipo', [1440, 120, 15]),
    push: { clave: N.estadoCanales.push.ok ? N.estadoCanales.push.clave : null, dispositivos: q.get('SELECT COUNT(*) AS n FROM suscripciones WHERE persona = ?', yo.id).n },
    canales: esAdmin(yo) ? { correo: N.estadoCanales.correo, push: { ok: N.estadoCanales.push.ok, detalle: N.estadoCanales.push.detalle }, programador: N.estadoCanales.programador, appUrl: N.appUrl() } : null,
    envios: esAdmin(yo) ? q.all('SELECT e.*, p.nombre AS persona FROM envios e LEFT JOIN personas p ON p.id = e.para ORDER BY e.id DESC LIMIT 60') : [],
    ahora: ahoraISO()
  });
});

/* ---------- Actividades ---------- */
function leerCuerpoItem(b, yo) {
  const inicio = new Date(b.inicio); if (isNaN(inicio)) throw new Error('La fecha no es válida.');
  const nombre = String(b.nombre || '').trim(); if (!nombre) throw new Error('Falta el nombre de la actividad.');
  const tipo = TIPOS.includes(b.tipo) ? b.tipo : 'Reunión';
  if (!q.get('SELECT id FROM empresas WHERE id = ?', b.empresa)) throw new Error('Elige una empresa.');
  const activos = personasActivas().map(p => p.id);
  const dueño = activos.includes(b.dueño) ? b.dueño : yo.id;
  let personas = Array.isArray(b.personas) ? b.personas.filter(p => activos.includes(p)) : []; if (!personas.includes(dueño)) personas.unshift(dueño);
  return { nombre, tipo, empresa: b.empresa, proyecto: String(b.proyecto || '').trim().slice(0, 80), inicio: inicio.toISOString(), duracion: Math.min(720, Math.max(15, Number(b.duracion) || 60)), dueño, personas, lugar: String(b.lugar || '').trim().slice(0, 160), nota: String(b.nota || '').trim().slice(0, 2000), enlace: String(b.enlace || '').trim().slice(0, 300), plataforma: String(b.plataforma || '').slice(0, 40), links: Math.max(0, Number(b.links) || 0), comentariosResp: Math.max(0, Number(b.comentariosResp) || 0), enlacePub: String(b.enlacePub || '').trim().slice(0, 300) };
}
app.post('/api/items', (req, res) => {
  let d; try { d = leerCuerpoItem(req.body, req.yo); } catch (e) { return err(res, 400, e.message); }
  const it = Object.assign({ id: 'a' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex'), frase: '', estado: 'pendiente', confirm: {}, solicitudes: [], offsets: null, bloqueo: '', revisor: '', archivos: [], historial: [], creada: ahoraISO(), creadoPor: req.yo.id }, d);
  it.personas.forEach(p => it.confirm[p] = p === it.dueño ? 'ok' : 'pend');
  hist(it, 'Creada por ' + req.yo.nombre + '.');
  if (req.body.hechaNow) { it.estado = 'hecha'; hist(it, 'Registrada como hecha.'); }
  guardarItem(it);
  if (it.estado !== 'hecha') {
    it.personas.filter(p => p !== req.yo.id).forEach(p => N.crearAviso({ para: p, titulo: 'Te agregaron a una actividad', cuerpo: it.nombre + ' · ' + N.empresaNombre(it.empresa) + ' · ' + N.cuandoTexto(it.inicio) + ' ' + N.fHora(it.inicio) + (it.lugar ? ' · ' + it.lugar : '') + '. Responsable: ' + N.nombreDe(it.dueño) + '.' + (N.ES_TAREA(it.tipo) ? '' : ' Confirma tu asistencia.'), itemId: it.id, pushCuerpo: 'Nueva · ' + it.tipo + ' · ' + N.empresaNombre(it.empresa) + ' · ' + N.fHora(it.inicio) }));
    N.programarRecordatorios(it);
  }
  res.json({ ok: true, id: it.id });
});
app.put('/api/items/:id', (req, res) => {
  const it = getItem(req.params.id); if (!it) return err(res, 404, 'La actividad ya no existe.');
  if (!puedeEditar(req.yo, it)) return err(res, 403, 'No puedes editar esta actividad. Pídele el cambio a ' + N.nombreDe(it.dueño) + '.');
  if (!N.activo(it)) return err(res, 400, 'Esta actividad ya está cerrada.');
  const b = Object.assign({}, it, req.body); let d; try { d = leerCuerpoItem(b, req.yo); } catch (e) { return err(res, 400, e.message); }
  const cambioHora = it.inicio !== d.inicio || it.duracion !== d.duracion; const antes = fechaCorta(it.inicio);
  const nuevos = d.personas.filter(p => !it.personas.includes(p)); const salen = it.personas.filter(p => !d.personas.includes(p));
  Object.assign(it, d);
  nuevos.forEach(p => it.confirm[p] = 'pend'); salen.forEach(p => delete it.confirm[p]); it.confirm[it.dueño] = 'ok';
  if (req.body.hechaNow) { it.estado = 'hecha'; hist(it, 'Registrada como hecha por ' + req.yo.nombre + '.'); }
  if (cambioHora && it.personas.length > 1 && it.estado !== 'hecha') {
    const n = (it.offsets || getConfig('offsets_equipo', [1440, 120, 15])).length;
    if (it.estado !== 'pendiente') it.estado = 'movida';
    it.personas.forEach(p => it.confirm[p] = p === it.dueño ? 'ok' : 'pend'); it.solicitudes = [];
    hist(it, 'Movida por ' + req.yo.nombre + ': de ' + antes + ' a ' + fechaCorta(it.inicio) + '. Se cancelaron ' + n + ' recordatorios, se programaron ' + n + ' nuevos y se pidió confirmar de nuevo.');
    it.personas.filter(p => p !== req.yo.id).forEach(p => N.crearAviso({ para: p, titulo: 'Cambió la fecha de una actividad', cuerpo: it.nombre + ' ahora es ' + N.cuandoTexto(it.inicio) + ' ' + N.fHora(it.inicio) + ' (' + N.empresaNombre(it.empresa) + '). Confirma de nuevo tu asistencia.', itemId: it.id, pushCuerpo: 'Nueva fecha · ' + it.tipo + ' · ' + N.fHora(it.inicio) }));
  } else if (cambioHora) hist(it, 'Fecha cambiada por ' + req.yo.nombre + ': de ' + antes + ' a ' + fechaCorta(it.inicio) + '. Recordatorios reprogramados.');
  else hist(it, 'Datos actualizados por ' + req.yo.nombre + '.');
  nuevos.filter(p => p !== req.yo.id).forEach(p => N.crearAviso({ para: p, titulo: 'Te agregaron a una actividad', cuerpo: it.nombre + ' · ' + N.empresaNombre(it.empresa) + ' · ' + N.cuandoTexto(it.inicio) + ' ' + N.fHora(it.inicio) + '.', itemId: it.id, pushCuerpo: 'Nueva · ' + it.tipo + ' · ' + N.fHora(it.inicio) }));
  guardarItem(it); N.programarRecordatorios(it);
  res.json({ ok: true, movida: cambioHora });
});
app.post('/api/items/:id/accion', (req, res) => {
  const it = getItem(req.params.id); if (!it) return err(res, 404, 'La actividad ya no existe.');
  const yo = req.yo; const { accion } = req.body || {}; const motivo = String((req.body || {}).motivo || '').trim().slice(0, 500);
  const participa = it.personas.includes(yo.id); const tarea = N.ES_TAREA(it.tipo) || it.personas.length === 1;
  const avisarDueño = (titulo, cuerpo, pushCuerpo) => { if (it.dueño !== yo.id) N.crearAviso({ para: it.dueño, titulo, cuerpo, itemId: it.id, pushCuerpo }); };
  switch (accion) {
    case 'confirmar': if (!participa) return err(res, 403, 'No estás en esta actividad.'); if (!N.activo(it)) return err(res, 400, 'La actividad ya está cerrada.');
      it.confirm[yo.id] = 'ok'; it.solicitudes = (it.solicitudes || []).filter(s => s.de !== yo.id); hist(it, yo.nombre + ' confirmó asistencia.');
      if (it.personas.every(p => it.confirm[p] === 'ok') && ['pendiente', 'movida'].includes(it.estado)) { it.estado = 'confirmada'; hist(it, 'Todos confirmaron.'); }
      avisarDueño(yo.nombre + ' confirmó asistencia', it.nombre + ' · ' + N.cuandoTexto(it.inicio) + ' ' + N.fHora(it.inicio), 'Confirmó · ' + yo.nombre); break;
    case 'no_puedo': if (!participa) return err(res, 403, 'No estás en esta actividad.');
      it.confirm[yo.id] = 'no'; hist(it, yo.nombre + ' no puede asistir' + (motivo ? ': “' + motivo + '”' : '.')); avisarDueño(yo.nombre + ' no puede asistir', it.nombre + (motivo ? ': “' + motivo + '”' : ''), 'No puede · ' + yo.nombre); break;
    case 'cambio': if (!participa) return err(res, 403, 'No estás en esta actividad.');
      it.confirm[yo.id] = 'cambio'; it.solicitudes = (it.solicitudes || []).filter(s => s.de !== yo.id); it.solicitudes.push({ de: yo.id, motivo: motivo || 'Sin motivo', fecha: ahoraISO() }); hist(it, yo.nombre + ' pidió otra hora.');
      avisarDueño(yo.nombre + ' pidió otra hora', it.nombre + ': “' + (motivo || 'Sin motivo') + '”', 'Pide otra hora · ' + yo.nombre); break;
    case 'hecha': if (!(puedeEditar(yo, it) || (tarea && it.dueño === yo.id))) return err(res, 403, 'Solo el responsable puede marcarla como hecha.');
      it.estado = 'hecha'; hist(it, 'Marcada como hecha por ' + yo.nombre + '.'); N.detenerRecordatorios(it.id);
      if (it.revisor && it.revisor !== yo.id) N.crearAviso({ para: it.revisor, titulo: yo.nombre + ' terminó una tarea', cuerpo: it.nombre, itemId: it.id }); break;
    case 'cancelar': if (!puedeEditar(yo, it)) return err(res, 403, 'No puedes cancelar esta actividad. Pídeselo a ' + N.nombreDe(it.dueño) + '.');
      { const n = q.get('SELECT COUNT(*) AS n FROM recordatorios WHERE item_id = ? AND enviado = 0', it.id).n; it.estado = 'cancelada'; hist(it, 'Cancelada por ' + yo.nombre + (motivo ? ' (“' + motivo + '”)' : '') + '. Se avisó a ' + (it.personas.length - 1) + ' participantes y se detuvieron ' + n + ' recordatorios.'); N.detenerRecordatorios(it.id);
        it.personas.filter(p => p !== yo.id).forEach(p => N.crearAviso({ para: p, titulo: 'Actividad cancelada', cuerpo: it.nombre + ' · ' + N.empresaNombre(it.empresa) + ' · ' + N.cuandoTexto(it.inicio) + ' ' + N.fHora(it.inicio) + (motivo ? '. Motivo: ' + motivo : ''), itemId: it.id, pushCuerpo: 'Cancelada · ' + it.tipo + ' · ' + N.fHora(it.inicio) })); } break;
    case 'entregar': if (it.dueño !== yo.id) return err(res, 403, 'Solo el responsable puede entregarla.');
      { it.estado = 'en_revision'; const rev = it.revisor || N.responsablesDe(it.empresa).find(x => x !== yo.id) || ''; it.revisor = rev; q.run('INSERT INTO comentarios (item_id, de, texto, fecha) VALUES (?, ?, ?, ?)', it.id, yo.id, 'Entregado para revisión.', ahoraISO()); hist(it, 'Entregada para revisión.');
        if (rev) N.crearAviso({ para: rev, titulo: 'Entrega para revisión', cuerpo: yo.nombre + ' entregó “' + it.nombre + '”. Revisa y aprueba o pide ajustes.', itemId: it.id, pushCuerpo: 'Para revisar · ' + yo.nombre }); } break;
    case 'aprobar': if (!(it.revisor === yo.id || esAdmin(yo) || esLider(yo))) return err(res, 403, 'No puedes aprobar esta entrega.');
      it.estado = 'hecha'; q.run('INSERT INTO comentarios (item_id, de, texto, fecha) VALUES (?, ?, ?, ?)', it.id, yo.id, 'Aprobada.', ahoraISO()); hist(it, 'Aprobada por ' + yo.nombre + '.'); N.detenerRecordatorios(it.id);
      N.crearAviso({ para: it.dueño, titulo: 'Tu entrega fue aprobada', cuerpo: '“' + it.nombre + '” quedó aprobada por ' + yo.nombre + '.', itemId: it.id }); break;
    case 'ajustes': if (!(it.revisor === yo.id || esAdmin(yo) || esLider(yo))) return err(res, 403, 'No puedes pedir ajustes en esta entrega.');
      it.estado = 'ajustes'; q.run('INSERT INTO comentarios (item_id, de, texto, fecha) VALUES (?, ?, ?, ?)', it.id, yo.id, motivo || 'Revisar y ajustar', ahoraISO()); hist(it, yo.nombre + ' pidió ajustes.');
      N.crearAviso({ para: it.dueño, titulo: 'Te pidieron ajustes', cuerpo: '“' + it.nombre + '”: ' + (motivo || 'Revisar y ajustar'), itemId: it.id, pushCuerpo: 'Ajustes · ' + it.nombre }); break;
    case 'bloquear': if (it.dueño !== yo.id && !puedeEditar(yo, it)) return err(res, 403, 'Solo el responsable puede reportar el bloqueo.');
      it.estado = 'bloqueada'; it.bloqueo = motivo || 'Sin detalle'; hist(it, 'Bloqueada: ' + it.bloqueo);
      N.responsablesDe(it.empresa).filter(x => x !== yo.id).forEach(p => N.crearAviso({ para: p, titulo: 'Tarea bloqueada', cuerpo: '“' + it.nombre + '” de ' + yo.nombre + ': ' + it.bloqueo, itemId: it.id })); break;
    case 'desbloquear': if (it.dueño !== yo.id && !puedeEditar(yo, it)) return err(res, 403, 'No puedes cambiar esta tarea.');
      it.estado = 'pendiente'; it.bloqueo = ''; hist(it, 'Desbloqueada por ' + yo.nombre + '.'); break;
    case 'comentar': if (!veDetalles(yo, it)) return err(res, 403, 'No tienes acceso a los comentarios de esta actividad.');
      { const texto = String((req.body || {}).texto || '').trim().slice(0, 2000); if (!texto) return err(res, 400, 'Escribe el comentario primero.'); q.run('INSERT INTO comentarios (item_id, de, texto, fecha) VALUES (?, ?, ?, ?)', it.id, yo.id, texto, ahoraISO());
        it.personas.filter(p => p !== yo.id).forEach(p => N.crearAviso({ para: p, titulo: 'Nuevo comentario en ' + it.nombre, cuerpo: yo.nombre + ': “' + texto + '”', itemId: it.id, pushCuerpo: 'Comentario · ' + yo.nombre })); guardarItem(it); return res.json({ ok: true }); }
    case 'recordatorios': if (!puedeEditar(yo, it)) return err(res, 403, 'Solo el responsable puede ajustar los recordatorios.');
      { const offs = (Array.isArray(req.body.offsets) ? req.body.offsets : []).map(Number).filter(o => [2880, 1440, 120, 60, 30, 15].includes(o)); if (!offs.length) return err(res, 400, 'Elige al menos un recordatorio.');
        if (req.body.paraEquipo && esAdmin(yo)) { setConfig('offsets_equipo', offs); it.offsets = null; } else it.offsets = offs; hist(it, 'Recordatorios ajustados por ' + yo.nombre + '.'); guardarItem(it); N.programarRecordatorios(it); return res.json({ ok: true }); }
    default: return err(res, 400, 'Acción desconocida.');
  }
  guardarItem(it);
  res.json({ ok: true });
});
app.post('/api/items/:id/archivos', express.raw({ type: '*/*', limit: '25mb' }), (req, res) => {
  const it = getItem(req.params.id); if (!it) return err(res, 404, 'La actividad ya no existe.');
  if (!veDetalles(req.yo, it)) return err(res, 403, 'No tienes acceso a los archivos de esta actividad.');
  const nombre = String(req.query.nombre || 'archivo').replace(/[\/\\:*?"<>|]/g, '_').slice(0, 120);
  if (!req.body || !req.body.length) return err(res, 400, 'El archivo llegó vacío.');
  const dir = path.join(DATA_DIR, 'archivos', it.id); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, nombre), req.body);
  if (!it.archivos.includes(nombre)) it.archivos.push(nombre); hist(it, req.yo.nombre + ' adjuntó ' + nombre + '.'); guardarItem(it);
  res.json({ ok: true });
});
app.get('/archivos/:id/:nombre', auth.requiereSesion, (req, res) => {
  const it = getItem(req.params.id); if (!it || !veDetalles(req.yo, it)) return res.status(403).send('Sin acceso');
  const f = path.join(DATA_DIR, 'archivos', it.id, path.basename(req.params.nombre)); if (!fs.existsSync(f)) return res.status(404).send('No existe');
  res.download(f);
});

/* ---------- Avisos y preferencias ---------- */
app.post('/api/avisos/leer', (req, res) => { const { ids, todos } = req.body || {}; if (todos) q.run('UPDATE avisos SET leida = 1 WHERE para = ?', req.yo.id); else (ids || []).forEach(id => q.run('UPDATE avisos SET leida = 1 WHERE id = ? AND para = ?', id, req.yo.id)); res.json({ ok: true }); });
app.put('/api/prefs', (req, res) => {
  const b = req.body || {}; const pf = prefsDe(req.yo.id);
  const hora = /^\d{2}:\d{2}$/.test(b.resumenHora || '') ? b.resumenHora : pf.resumenHora; const d = b.descanso || pf.descanso;
  q.run('UPDATE prefs SET correo = ?, push = ?, resumen = ?, resumen_hora = ?, descanso_on = ?, descanso_desde = ?, descanso_hasta = ?, rec_citas = ?, rec_tareas = ? WHERE persona = ?',
    Number(b.correo === undefined ? pf.correo : !!b.correo), Number(b.push === undefined ? pf.push : !!b.push), Number(b.resumen === undefined ? pf.resumen : !!b.resumen), hora, Number(!!d.on), /^\d{2}:\d{2}$/.test(d.desde || '') ? d.desde : pf.descanso.desde, /^\d{2}:\d{2}$/.test(d.hasta || '') ? d.hasta : pf.descanso.hasta, Number(b.recCitas === undefined ? pf.recCitas : !!b.recCitas), Number(b.recTareas === undefined ? pf.recTareas : !!b.recTareas), req.yo.id);
  res.json({ ok: true, prefs: prefsDe(req.yo.id) });
});
app.get('/api/push/clave', (req, res) => res.json({ clave: N.estadoCanales.push.ok ? N.estadoCanales.push.clave : null, detalle: N.estadoCanales.push.detalle }));
app.post('/api/push/suscribir', (req, res) => {
  const s = req.body || {}; if (!s.endpoint || !s.keys || !s.keys.p256dh || !s.keys.auth) return err(res, 400, 'Suscripción incompleta.');
  q.run('INSERT INTO suscripciones (persona, endpoint, p256dh, auth, creado, agente) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET persona = excluded.persona, p256dh = excluded.p256dh, auth = excluded.auth', req.yo.id, s.endpoint, s.keys.p256dh, s.keys.auth, ahoraISO(), String(req.headers['user-agent'] || '').slice(0, 200));
  q.run('UPDATE prefs SET push = 1 WHERE persona = ?', req.yo.id);
  N.crearAviso({ para: req.yo.id, titulo: 'Avisos del celular activados', cuerpo: 'Este dispositivo ya recibe avisos de la Agenda del Grupo.', urgente: true, pushCuerpo: 'Listo: este celular recibe avisos' });
  N.procesarEnvios().catch(() => {});
  res.json({ ok: true });
});
app.delete('/api/push/suscribir', (req, res) => { const { endpoint } = req.body || {}; if (endpoint) q.run('DELETE FROM suscripciones WHERE endpoint = ? AND persona = ?', endpoint, req.yo.id); else q.run('DELETE FROM suscripciones WHERE persona = ?', req.yo.id); if (!q.get('SELECT id FROM suscripciones WHERE persona = ?', req.yo.id)) q.run('UPDATE prefs SET push = 0 WHERE persona = ?', req.yo.id); res.json({ ok: true }); });

/* ---------- Personas (directorio) ---------- */
app.post('/api/personas', auth.requiereAdmin, async (req, res) => {
  const b = req.body || {}; const correo = String(b.correo || '').trim().toLowerCase(); const nombre = String(b.nombre || '').trim();
  if (!nombre) return err(res, 400, 'Escribe el nombre.'); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return err(res, 400, 'Escribe un correo válido.');
  const rol = ROLES.includes(b.rol) ? b.rol : 'Colaborador'; const emps = (Array.isArray(b.empresas) ? b.empresas : []).filter(e => q.get('SELECT id FROM empresas WHERE id = ?', e));
  const existe = q.get('SELECT * FROM personas WHERE lower(correo) = ?', correo);
  if (existe) { const p = filaPersona(existe); const nuevas = [...new Set(p.empresas.concat(emps))]; q.run('UPDATE personas SET empresas = ? WHERE id = ?', JSON.stringify(nuevas), p.id); return res.json({ ok: true, existente: true, mensaje: p.nombre + ' ya está en el equipo: se agregó a las empresas con su cuenta, sin duplicarla.' }); }
  let id = slug(nombre) || 'p'; if (q.get('SELECT id FROM personas WHERE id = ?', id)) id += '-' + crypto.randomBytes(2).toString('hex');
  q.run("INSERT INTO personas (id, nombre, correo, rol, funcion, empresas, estado, pc, creado) VALUES (?, ?, ?, ?, ?, ?, 'invitado', ?, ?)", id, nombre, correo, rol, String(b.funcion || '').trim().slice(0, 160), JSON.stringify(emps), b.pc || '#' + crypto.randomBytes(3).toString('hex'), ahoraISO());
  const r = await enviarEnlace(id, true);
  res.json(Object.assign({ ok: true, id }, r));
});
async function enviarEnlace(personaId, esInvitacion) {
  const p = getPersona(personaId); const inv = auth.generarInvitacion(personaId); const enlace = N.appUrl() + '/invitacion/' + inv.token;
  let correoEnviado = false, detalle = '';
  if (!p.correo) detalle = 'La persona no tiene correo: compártele el enlace por WhatsApp.';
  else if (!N.estadoCanales.correo.ok) detalle = 'El correo no está configurado en el servidor: compártele el enlace por WhatsApp.';
  else { try { await N.enviarCorreo({ correo: p.correo }, { titulo: esInvitacion ? 'Te invitaron a la Agenda del Grupo' : 'Tu enlace de acceso', cuerpo: (esInvitacion ? 'Hola ' + p.nombre + ', crea tu acceso con este enlace (vence en 7 días): ' : 'Crea una contraseña nueva con este enlace (vence en 7 días): ') + enlace, item_id: null }); correoEnviado = true; detalle = 'Correo enviado a ' + p.correo + '.'; } catch (e) { detalle = 'No se pudo enviar el correo (' + (e.message || e) + '). Compártele el enlace por WhatsApp.'; } }
  q.run('INSERT INTO envios (aviso_id, para, canal, asunto, estado, detalle, intentos, siguiente, fecha, destino) VALUES (NULL, ?, ?, ?, ?, ?, 1, NULL, ?, ?)', personaId, 'Correo', esInvitacion ? 'Invitación al equipo' : 'Enlace de acceso', correoEnviado ? 'Enviado' : 'No enviado', detalle, ahoraISO(), p.correo || null);
  return { enlace, correoEnviado, detalle, vence: inv.vence };
}
app.put('/api/personas/:id', (req, res) => {
  const p = getPersona(req.params.id); if (!p) return err(res, 404, 'La persona no existe.');
  const b = req.body || {}; const yo = req.yo;
  if (!esAdmin(yo) && yo.id !== p.id) return err(res, 403, 'Solo un administrador puede editar a otras personas.');
  if (b.foto !== undefined) { if (b.foto && (!/^data:image\/(jpeg|png|webp);base64,/.test(b.foto) || b.foto.length > 400000)) return err(res, 400, 'La foto es muy grande.'); q.run('UPDATE personas SET foto = ? WHERE id = ?', b.foto || null, p.id); }
  if (b.nombre !== undefined && String(b.nombre).trim()) q.run('UPDATE personas SET nombre = ? WHERE id = ?', String(b.nombre).trim().slice(0, 80), p.id);
  if (b.correo !== undefined) { const c = String(b.correo || '').trim().toLowerCase(); if (c && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) return err(res, 400, 'Escribe un correo válido.'); if (c && q.get('SELECT id FROM personas WHERE lower(correo) = ? AND id <> ?', c, p.id)) return err(res, 400, 'Ese correo ya lo usa otra persona.'); q.run('UPDATE personas SET correo = ? WHERE id = ?', c || null, p.id); }
  if (esAdmin(yo)) {
    if (b.funcion !== undefined) q.run('UPDATE personas SET funcion = ? WHERE id = ?', String(b.funcion).trim().slice(0, 160), p.id);
    if (b.rol !== undefined && ROLES.includes(b.rol)) { if (p.id === yo.id && b.rol !== 'Administrador') return err(res, 400, 'No puedes quitarte a ti mismo el rol de administrador.'); q.run('UPDATE personas SET rol = ? WHERE id = ?', b.rol, p.id); }
    if (Array.isArray(b.empresas)) q.run('UPDATE personas SET empresas = ? WHERE id = ?', JSON.stringify(b.empresas.filter(e => q.get('SELECT id FROM empresas WHERE id = ?', e))), p.id);
    if (b.pc && /^#[0-9a-f]{6}$/i.test(b.pc)) q.run('UPDATE personas SET pc = ? WHERE id = ?', b.pc, p.id);
  }
  res.json({ ok: true });
});
app.post('/api/personas/:id/accion', auth.requiereAdmin, async (req, res) => {
  const p = getPersona(req.params.id); if (!p) return err(res, 404, 'La persona no existe.');
  const { accion } = req.body || {};
  if (accion === 'enlace' || accion === 'reenviar') { if (!p.correo && !req.body.enlaceSinCorreo) { /* igual se genera */ } const r = await enviarEnlace(p.id, p.estado === 'invitado'); return res.json(Object.assign({ ok: true }, r)); }
  if (accion === 'cancelar_invitacion') { if (p.estado !== 'invitado') return err(res, 400, 'Esta persona ya tiene acceso.'); if (q.get('SELECT id FROM items WHERE dueno = ?', p.id)) q.run("UPDATE personas SET estado = 'desactivado', token = NULL, token_vence = NULL WHERE id = ?", p.id); else q.run('DELETE FROM personas WHERE id = ?', p.id); return res.json({ ok: true }); }
  if (accion === 'reactivar') { q.run("UPDATE personas SET estado = 'activo' WHERE id = ?", p.id); return res.json({ ok: true }); }
  if (accion === 'desactivar') {
    if (p.id === req.yo.id) return err(res, 400, 'No puedes desactivarte a ti mismo.');
    const reas = (req.body.reasignaciones || {}); const activos = personasActivas().map(x => x.id).filter(x => x !== p.id);
    q.all("SELECT * FROM items WHERE dueno = ? AND estado NOT IN ('cancelada','hecha')", p.id).map(filaItem).forEach(it => {
      const nuevo = activos.includes(reas[it.id]) ? reas[it.id] : (N.ES_TAREA(it.tipo) ? req.yo.id : it.dueño);
      if (nuevo !== it.dueño) { it.personas = it.personas.map(x => x === p.id ? nuevo : x); if (!it.personas.includes(nuevo)) it.personas.push(nuevo); it.dueño = nuevo; it.confirm[nuevo] = 'ok'; delete it.confirm[p.id]; hist(it, 'Pasó a ' + N.nombreDe(nuevo) + ' porque ' + p.nombre + ' dejó el equipo.'); guardarItem(it); N.crearAviso({ para: nuevo, titulo: 'Nueva tarea asignada', cuerpo: '“' + it.nombre + '” pasó a ti porque ' + p.nombre + ' dejó el equipo.', itemId: it.id }); N.programarRecordatorios(it); }
    });
    q.run("UPDATE personas SET estado = 'desactivado', token = NULL, token_vence = NULL WHERE id = ?", p.id);
    q.run('DELETE FROM sesiones WHERE persona = ?', p.id); q.run('DELETE FROM suscripciones WHERE persona = ?', p.id); q.run('DELETE FROM recordatorios WHERE para = ? AND enviado = 0', p.id); q.run("UPDATE envios SET estado = 'Cancelado', detalle = 'Acceso desactivado' WHERE para = ? AND estado = 'Pendiente'", p.id);
    q.run('INSERT INTO envios (aviso_id, para, canal, asunto, estado, detalle, intentos, siguiente, fecha, destino) VALUES (NULL, ?, ?, ?, ?, ?, 1, NULL, ?, NULL)', p.id, 'Programador', 'Todos los recordatorios de ' + p.nombre, 'Detenidos', 'Acceso revocado', ahoraISO());
    return res.json({ ok: true });
  }
  err(res, 400, 'Acción desconocida.');
});
app.put('/api/empresas/:id', auth.requiereAdmin, (req, res) => { const { color, nombre } = req.body || {}; if (!q.get('SELECT id FROM empresas WHERE id = ?', req.params.id)) return err(res, 404, 'La empresa no existe.'); if (color && /^#[0-9a-f]{6}$/i.test(color)) q.run('UPDATE empresas SET color = ? WHERE id = ?', color, req.params.id); if (nombre !== undefined) { const n = String(nombre).trim().slice(0, 60); if (!n) return err(res, 400, 'El nombre no puede quedar vacío.'); if (q.get('SELECT id FROM empresas WHERE lower(nombre) = ? AND id <> ?', n.toLowerCase(), req.params.id)) return err(res, 400, 'Ya hay una empresa con ese nombre.'); q.run('UPDATE empresas SET nombre = ? WHERE id = ?', n, req.params.id); } res.json({ ok: true }); });
app.post('/api/empresas', auth.requiereAdmin, (req, res) => {
  const n = String((req.body || {}).nombre || '').trim().slice(0, 60); const color = /^#[0-9a-f]{6}$/i.test((req.body || {}).color || '') ? req.body.color : '#' + crypto.randomBytes(3).toString('hex');
  if (!n) return err(res, 400, 'Escribe el nombre de la empresa.');
  if (q.get('SELECT id FROM empresas WHERE lower(nombre) = ?', n.toLowerCase())) return err(res, 400, 'Ya hay una empresa con ese nombre.');
  let id = slug(n) || 'e'; if (q.get('SELECT id FROM empresas WHERE id = ?', id)) id += '-' + crypto.randomBytes(2).toString('hex');
  const orden = (q.get('SELECT MAX(orden) AS m FROM empresas').m || 0) + 1;
  q.run('INSERT INTO empresas (id, nombre, color, orden) VALUES (?, ?, ?, ?)', id, n, color, orden);
  if (req.body.agregarme !== false) { const emps = req.yo.empresas.concat([id]); q.run('UPDATE personas SET empresas = ? WHERE id = ?', JSON.stringify([...new Set(emps)]), req.yo.id); }
  res.json({ ok: true, id });
});
app.delete('/api/empresas/:id', auth.requiereAdmin, (req, res) => {
  const id = req.params.id; if (!q.get('SELECT id FROM empresas WHERE id = ?', id)) return err(res, 404, 'La empresa no existe.');
  const n = q.get('SELECT COUNT(*) AS n FROM items WHERE empresa = ?', id).n; if (n) return err(res, 400, 'No se puede eliminar: tiene ' + n + ' actividad' + (n === 1 ? '' : 'es') + ' registrada' + (n === 1 ? '' : 's') + '. Puedes cambiarle el nombre o el color.');
  if (q.get('SELECT COUNT(*) AS n FROM empresas').n <= 1) return err(res, 400, 'Debe quedar al menos una empresa.');
  q.run('DELETE FROM empresas WHERE id = ?', id);
  q.all('SELECT id, empresas FROM personas').forEach(p => { const e = (J(p.empresas) || []).filter(x => x !== id); q.run('UPDATE personas SET empresas = ? WHERE id = ?', JSON.stringify(e), p.id); });
  res.json({ ok: true });
});
app.put('/api/config/offsets', auth.requiereAdmin, (req, res) => { const offs = (Array.isArray(req.body.offsets) ? req.body.offsets : []).map(Number).filter(o => [2880, 1440, 120, 60, 30, 15].includes(o)); if (!offs.length) return err(res, 400, 'Elige al menos un recordatorio.'); setConfig('offsets_equipo', offs); res.json({ ok: true }); });
app.post('/api/admin/correo', auth.requiereAdmin, async (req, res) => {
  const b = req.body || {};
  if (process.env.SMTP_HOST || process.env.BREVO_API_KEY) return err(res, 400, 'El correo está fijado con variables del servidor; cámbialo en Railway.');
  let datos;
  if ((b.tipo || 'brevo') === 'brevo') {
    const apiKey = String(b.apiKey || '').trim(); const from = String(b.from || '').trim().toLowerCase();
    if (!apiKey) return err(res, 400, 'Pega la clave API de Brevo.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from)) return err(res, 400, 'Escribe el correo remitente (el que verificaste en Brevo).');
    datos = { tipo: 'brevo', apiKey, from };
  } else {
    const user = String(b.user || '').trim(); const pass = String(b.pass || '').replace(/\s+/g, '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(user)) return err(res, 400, 'Escribe el correo completo.');
    if (!pass) return err(res, 400, 'Falta la contraseña de aplicación.');
    const esGmail = /@gmail\.com$|@googlemail\.com$/i.test(user); const host = esGmail ? 'smtp.gmail.com' : String(b.host || '').trim(); const port = esGmail ? 465 : (Number(b.port) || 587);
    if (!host) return err(res, 400, 'Escribe el servidor SMTP (host).');
    datos = { tipo: 'smtp', host, port, user, pass, from: user };
  }
  const estado = await N.guardarCorreo(datos);
  if (!estado.ok) { await N.borrarCorreo(); return err(res, 400, estado.detalle); }
  if (req.yo.correo) { try { await N.enviarCorreo({ correo: req.yo.correo }, { titulo: 'Correo configurado', cuerpo: 'Listo: la Agenda del Grupo ya envía correos desde ' + datos.from + '.', item_id: null }); } catch (e) { await N.borrarCorreo(); return err(res, 400, 'Se conectó, pero el envío de prueba falló: ' + (e.message || e)); } }
  res.json({ ok: true, detalle: estado.detalle, prueba: req.yo.correo ? 'Te enviamos un correo de prueba a ' + req.yo.correo + '.' : 'Agrega tu correo en Editar mis datos para recibir pruebas.' });
});
app.delete('/api/admin/correo', auth.requiereAdmin, async (req, res) => { if (process.env.SMTP_HOST || process.env.BREVO_API_KEY) return err(res, 400, 'El correo está fijado con variables del servidor.'); const estado = await N.borrarCorreo(); res.json({ ok: true, detalle: estado.detalle }); });
app.post('/api/admin/probar-correo', auth.requiereAdmin, async (req, res) => { if (!N.estadoCanales.correo.ok) return err(res, 400, N.estadoCanales.correo.detalle); if (!req.yo.correo) return err(res, 400, 'Tu usuario no tiene correo.'); try { await N.enviarCorreo({ correo: req.yo.correo }, { titulo: 'Prueba de correo', cuerpo: 'Si lees esto, el correo de la Agenda del Grupo está funcionando.', item_id: null }); res.json({ ok: true, mensaje: 'Correo de prueba enviado a ' + req.yo.correo }); } catch (e) { err(res, 500, 'No se pudo enviar: ' + (e.message || e)); } });

app.use('/api', (req, res) => err(res, 404, 'Ruta no encontrada.'));
app.use((e, req, res, next) => { console.error(e); if (res.headersSent) return next(e); res.status(e.type === 'entity.too.large' ? 413 : 500).json({ error: e.type === 'entity.too.large' ? 'El archivo es muy grande (máximo 25 MB).' : 'Algo falló en el servidor. Inténtalo de nuevo.' }); });

/* ---------- Arranque ---------- */
(async () => {
  await N.configurarCorreo(); N.configurarPush(); N.iniciarProgramador(); auth.limpiarSesiones();
  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, () => {
    console.log('Agenda del Grupo escuchando en el puerto ' + PORT);
    console.log('Datos en: ' + DATA_DIR);
    console.log('Correo: ' + (N.estadoCanales.correo.ok ? 'configurado' : 'NO configurado · ' + N.estadoCanales.correo.detalle));
    console.log('Push: ' + (N.estadoCanales.push.ok ? 'listo' : 'NO configurado · ' + N.estadoCanales.push.detalle));
    if (!auth.hayAdminConfigurado()) console.log('Primer ingreso: abre /configurar para crear el administrador.');
  });
})();
