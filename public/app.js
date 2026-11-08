/* Agenda del Grupo · interfaz conectada al servidor */
let DB = { yo: null, personas: [], empresas: [], proyectos: [], items: [], avisos: [], prefs: null, offsetsEquipo: [1440, 120, 15], push: { clave: null, dispositivos: 0 }, canales: null, envios: [] };
const now = new Date();
function addMin(d, m) { return new Date(d.getTime() + m * 60000); }
const TIPOS = { 'Grabación': '🎬', 'Reunión': '🤝', 'Entrevista': '🎤', 'Podcast': '🎙️', 'Evento': '🎉', 'Publicación': '📣', 'Tarea': '📝', 'Entrega': '📦' };
const ES_TAREA = t => t === 'Tarea' || t === 'Entrega';
const PLATAFORMAS = ['Instagram', 'TikTok', 'Facebook', 'YouTube', 'WhatsApp', 'Otra'];
const OFFSET_LABELS = { 2880: '2 días antes', 1440: '1 día antes', 120: '2 horas antes', 60: '1 hora antes', 30: '30 minutos antes', 15: '15 minutos antes' };
const H_INI = 7, H_FIN = 21, ROWS = H_FIN - H_INI;
const state = { view: 'inicio', fecha: new Date(now.getFullYear(), now.getMonth(), now.getDate()), calMode: null, comparar: null, filtroEmp: '', repPeriodo: 'semana', repEmp: '', repPersona: '', cargando: false };
const isMobile = () => window.matchMedia('(max-width:820px)').matches;

/* ---------- API ---------- */
const revive = (k, v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) ? new Date(v) : v;
async function api(method, url, body) {
  let r;
  try { r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' }); }
  catch (e) { throw new Error('Sin conexión. Revisa tu internet e inténtalo de nuevo.'); }
  if (r.status === 401) { location.href = '/entrar'; throw new Error('Tu sesión terminó.'); }
  const txt = await r.text(); let j = {}; try { j = JSON.parse(txt, revive); } catch (e) { }
  if (!r.ok) throw new Error(j.error || 'Algo falló. Inténtalo de nuevo.');
  return j;
}
async function cargar() { DB = await api('GET', '/api/estado'); }
async function accion(method, url, body, opts) {
  opts = opts || {};
  try {
    const r = await api(method, url, body);
    await cargar(); render();
    if (opts.reabrir) panelItem(opts.reabrir); else if (opts.cerrar !== false) closePanel();
    if (opts.toast) toast(typeof opts.toast === 'function' ? opts.toast(r) : opts.toast, true);
    return r;
  } catch (e) { toast(e.message); return null; }
}

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const P = id => DB.personas.find(p => p.id === id);
const E = id => DB.empresas.find(e => e.id === id) || { id, nombre: id, c: '#888' };
const I = id => DB.items.find(i => i.id === id);
const nombre = id => P(id) ? P(id).nombre : id;
const ini = id => { const n = nombre(id).split(' '); return (n[0][0] + (n[1] ? n[1][0] : '')).toUpperCase(); };
const fin = it => addMin(it.inicio, it.duracion);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const fHora = d => new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true }).format(d).replace(/\s?([ap])\.\s?m\./i, ' $1. m.');
const fFecha = d => new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).format(d).replace(/\./g, '');
const fLarga = d => new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
const fMes = d => new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(d);
const fDiaCorto = d => new Intl.DateTimeFormat('es-CO', { weekday: 'short' }).format(d).replace('.', '');
const toISODate = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const toISOTime = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const soloDia = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
function diasEntre(a, b) { return Math.round((soloDia(b) - soloDia(a)) / 86400000); }
function diaLabel(d) { const n = diasEntre(now, d); if (n === 0) return 'Hoy'; if (n === 1) return 'Mañana'; if (n === -1) return 'Ayer'; return cap(fFecha(d)); }
function fechaTitulo(d) { const n = Math.abs(diasEntre(now, d)); return n <= 1 ? diaLabel(d) + ', ' + fLarga(d) : cap(fLarga(d)); }
function cuandoTexto(d) { const n = diasEntre(now, d); if (n === 0) return 'hoy'; if (n === 1) return 'mañana'; return 'el ' + fLarga(d); }
function relativo(d) { const m = Math.round((d - new Date()) / 60000); const am = Math.abs(m); const f = am < 60 ? am + ' min' : am < 1440 ? Math.round(am / 60) + ' h' : Math.round(am / 1440) + ' d'; return m < 0 ? 'hace ' + f : 'en ' + f; }
function lunesDe(d) { const x = soloDia(d); const w = (x.getDay() + 6) % 7; x.setDate(x.getDate() - w); return x; }
function semanaDe(d) { const l = lunesDe(d); return [0, 1, 2, 3, 4, 5, 6].map(i => { const x = new Date(l); x.setDate(l.getDate() + i); return x; }); }
function mismoDia(a, b) { return diasEntre(a, b) === 0; }
function toast(msg, ok) { const t = $('#toast'); t.textContent = msg; t.classList.toggle('ok', !!ok); t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3200); }
function chipEmp(id) { const e = E(id); return '<span class="chip emp" style="--c:' + e.c + '">' + esc(e.nombre) + '</span>'; }
function av(id, cls) { const p = P(id); return '<span class="av ' + (cls || '') + '" style="--pc:' + (p ? p.pc : '#888') + '" title="' + esc(nombre(id)) + '">' + (p && p.foto ? '<img src="' + p.foto + '" alt="">' : ini(id)) + '</span>'; }
function avatars(ids, cls) { return '<span class="avatars">' + ids.map(i => av(i, cls)).join('') + '</span>'; }
const yo = () => DB.yo;
const esAdmin = () => yo().rol === 'Administrador';
const esLider = () => yo().rol === 'Líder';
function participo(it) { return it.personas.includes(yo().id); }
const empresasDe = it => (it.empresas && it.empresas.length ? it.empresas : [it.empresa]);
const chipsEmp = it => empresasDe(it).map(chipEmp).join('');
const nombresEmp = it => empresasDe(it).map(e => E(e).nombre).join(' · ');
function empresasPermitidas() { return esAdmin() ? DB.empresas.map(e => e.id) : DB.empresas.map(e => e.id).filter(e => yo().empresas.includes(e)); }
function puedeEditar(it) { return esAdmin() || it.dueño === yo().id || (esLider() && empresasDe(it).some(e => yo().empresas.includes(e))); }
function puedeVerTodoReporte() { return esAdmin() || esLider() || yo().rol === 'Coordinador'; }
function activo(it) { return !['cancelada', 'hecha'].includes(it.estado); }
function atrasada(it) { return ES_TAREA(it.tipo) && activo(it) && it.estado !== 'en_revision' && fin(it) < new Date(); }
function noLeidos() { return DB.avisos.filter(n => !n.leida).length; }
function offsetsDe(it) { return (it.offsets || DB.offsetsEquipo).slice().sort((x, y) => y - x); }
function responsablesDe(emp) { return DB.personas.filter(p => p.estado === 'activo' && (p.rol === 'Administrador' || p.rol === 'Líder' || (p.rol === 'Coordinador' && p.empresas.includes(emp)))).map(p => p.id); }
function estadoInfo(it) {
  if (it.estado === 'cancelada') return ['Cancelada', 'l-bad'];
  if (it.estado === 'hecha') return [ES_TAREA(it.tipo) ? 'Hecha' : 'Realizada', 'l-gray'];
  if (ES_TAREA(it.tipo) || it.personas.length === 1) {
    if (it.estado === 'en_revision') return ['En revisión', 'l-info'];
    if (it.estado === 'ajustes') return ['Con ajustes', 'l-pend'];
    if (it.estado === 'bloqueada') return ['Bloqueada', 'l-bad'];
    if (atrasada(it)) return ['Atrasada', 'l-bad'];
    return ['Por hacer', 'l-gray'];
  }
  if (it.estado === 'movida') return ['Se movió · por confirmar', 'l-info'];
  const pend = it.personas.filter(p => it.confirm[p] !== 'ok').length;
  if (pend === 0) return ['Confirmada', 'l-ok'];
  return ['Por confirmar (' + pend + ')', 'l-pend'];
}
function lblEstado(it) { const [t, c] = estadoInfo(it); return '<span class="lbl ' + c + '">' + t + '</span>'; }
function confInfo(v) { return { pend: ['Sin responder', 'l-gray'], ok: ['Confirmó', 'l-ok'], no: ['No puede', 'l-bad'], cambio: ['Pidió otra hora', 'l-pend'] }[v || 'pend']; }
function lblConf(v) { const [t, c] = confInfo(v); return '<span class="lbl ' + c + '">' + t + '</span>'; }
function recordatorios(it) {
  const list = [{ label: 'Al agregarte', when: it.creada }].concat(offsetsDe(it).map(o => ({ label: OFFSET_LABELS[o] || o + ' min antes', when: addMin(it.inicio, -o) })));
  return list.map(r => { let estado = 'Programado', cls = 'l-info'; if (!activo(it)) { estado = 'Detenido'; cls = 'l-gray'; } else if (r.when <= new Date()) { estado = 'Enviado'; cls = 'l-ok'; } return Object.assign({ estado, cls }, r); });
}
function textoAviso(it, u) { const dest = it.enlace ? ('Enlace: ' + it.enlace) : (it.lugar ? 'Lugar: ' + it.lugar : ''); return nombre(u) + ', ' + cuandoTexto(it.inicio) + ' tienes “' + it.nombre + '” de ' + nombresEmp(it) + ' a las ' + fHora(it.inicio) + ' (hora de Colombia). ' + (dest ? dest + '. ' : '') + 'Responsable: ' + nombre(it.dueño) + '. Confirma tu asistencia.'; }
function cruces(id, inicio, finD, personas) { const res = []; personas.forEach(p => DB.items.forEach(o => { if (o.id === id || !activo(o) || !o.personas.includes(p)) return; if (inicio < fin(o) && finD > o.inicio) res.push({ persona: p, otra: o }); })); return res; }

/* ---------- Navegación ---------- */
const VIEWS = { inicio: { t: 'Inicio', ico: '🏠' }, 'mi-agenda': { t: 'Mi agenda', ico: '📅' }, equipo: { t: 'Equipo', ico: '👥' }, tareas: { t: 'Mis tareas', ico: '✅' }, avisos: { t: 'Avisos', ico: '🔔' }, reportes: { t: 'Reportes', ico: '📈' }, directorio: { t: 'Directorio', ico: '🧑‍🤝‍🧑' }, ajustes: { t: 'Ajustes de avisos', ico: '⚙️' } };
function go(view) { if (!VIEWS[view]) view = 'inicio'; state.view = view; try { if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view); } catch (e) { } render(); window.scrollTo(0, 0); cargar().then(render).catch(() => { }); }
function renderNav() {
  const nl = noLeidos(); const vis = ['inicio', 'mi-agenda', 'equipo', 'tareas', 'avisos', 'reportes', 'directorio', 'ajustes'];
  $('#side').innerHTML = '<div class="brand"><div class="logo">AG</div><div><strong>Agenda del Grupo</strong><small>' + DB.empresas.length + ' empresas · un equipo</small></div></div>' +
    vis.map(v => (v === 'reportes' ? '<div class="nav-sep"></div>' : '') + '<button class="nav-btn' + (state.view === v ? ' active' : '') + '" data-act="go" data-view="' + v + '"><span class="ico">' + VIEWS[v].ico + '</span>' + VIEWS[v].t + (v === 'avisos' && nl ? '<span class="count">' + nl + '</span>' : '') + '</button>').join('') +
    '<div class="nav-sep"></div><button class="nav-btn" data-act="guia"><span class="ico">🧭</span>Guía de inicio</button><button class="nav-btn" data-act="salir"><span class="ico">🚪</span>Cerrar sesión</button>';
  const tabs = ['inicio', 'mi-agenda', 'equipo', 'tareas'];
  $('#tabbar').innerHTML = tabs.map(v => '<button class="tab' + (state.view === v ? ' active' : '') + '" data-act="go" data-view="' + v + '"><span class="ico">' + VIEWS[v].ico + '</span>' + VIEWS[v].t + '</button>').join('');
  $('#bellDot').hidden = nl === 0; $('#bellDot').textContent = nl;
  $('#viewTitle').textContent = VIEWS[state.view].t;
  $('#userChip').innerHTML = av(yo().id) + '<span class="lbl-user">' + esc(yo().nombre) + '</span>';
}

/* ---------- Componentes ---------- */
function cardAct(it) {
  const [et, ec] = estadoInfo(it); const u = yo().id; const cls = (it.estado === 'cancelada' ? ' off' : '') + (it.estado === 'hecha' ? ' done' : '');
  const cr = activo(it) ? cruces(it.id, it.inicio, fin(it), it.personas) : [];
  return '<button class="acard' + cls + '" data-act="ver" data-id="' + it.id + '" style="--c:' + E(it.empresa).c + '">' +
    '<div class="time num">' + fHora(it.inicio) + '<small>' + fHora(fin(it)) + '</small></div>' +
    '<div class="body"><div class="name">' + TIPOS[it.tipo] + ' ' + esc(it.nombre) + '</div>' +
    '<div class="meta">' + chipsEmp(it) + (it.lugar ? '<span>📍 ' + esc(it.lugar) + '</span>' : '') + '</div>' +
    '<div class="meta">' + avatars(it.personas) + '<span class="lbl ' + ec + '">' + et + '</span>' + (participo(it) && it.dueño !== u && activo(it) && !ES_TAREA(it.tipo) ? lblConf(it.confirm[u]) : '') + (cr.length ? '<span class="lbl l-pend">⚠️ Cruce de horario</span>' : '') + '</div></div></button>';
}
function cardTarea(it) {
  const hecha = it.estado === 'hecha'; const [et, ec] = estadoInfo(it); const v = fin(it); const dn = diasEntre(now, v);
  const vence = hecha ? '' : (dn < 0 ? 'Venció ' + diaLabel(v).toLowerCase() + ' ' + fHora(v) : dn === 0 ? 'Hoy a las ' + fHora(v) : dn === 1 ? 'Mañana a las ' + fHora(v) : cap(fFecha(v)) + ' · ' + fHora(v));
  return '<div class="tcard' + (hecha ? ' done' : '') + '" style="--c:' + E(it.empresa).c + '"><button class="checkbtn' + (hecha ? ' on' : '') + '" data-act="hecha" data-id="' + it.id + '" aria-label="Marcar como hecha"' + (hecha || it.dueño !== yo().id ? ' disabled' : '') + '>✓</button><div class="body" data-act="ver" data-id="' + it.id + '"><div class="name">' + esc(it.nombre) + '</div><div class="meta">' + chipsEmp(it) + (vence ? '<span>🕒 ' + vence + '</span>' : '') + '<span class="lbl ' + ec + '">' + et + '</span>' + (it.dueño !== yo().id ? '<span>' + esc(nombre(it.dueño)) + '</span>' : '') + '</div></div></div>';
}
function dayStrip(fecha) {
  const sem = semanaDe(fecha);
  return '<div class="daystrip">' + sem.map(d => { const its = DB.items.filter(i => mismoDia(i.inicio, d) && activo(i) && (state.view !== 'mi-agenda' || participo(i))); const emps = [...new Set(its.flatMap(empresasDe))].slice(0, 4); return '<button class="dpill' + (mismoDia(d, fecha) ? ' sel' : '') + (mismoDia(d, now) ? ' today' : '') + '" data-act="fecha" data-fecha="' + toISODate(d) + '"><small>' + fDiaCorto(d) + '</small><span class="n num">' + d.getDate() + '</span><span class="dots">' + emps.map(e => '<i style="--c:' + E(e).c + '"></i>').join('') + '</span></button>'; }).join('') + '</div>';
}
function calBar(rangeTxt, modes) { return '<div class="calbar"><button class="btn sm" data-act="nav" data-dir="-1">‹ Anterior</button><button class="btn sm" data-act="hoy">Hoy</button><button class="btn sm" data-act="nav" data-dir="1">Siguiente ›</button><span class="range">' + rangeTxt + '</span>' + (modes ? '<div class="seg">' + modes.map(m => '<button class="' + (state.calMode === m[0] ? 'active' : '') + '" data-act="modo" data-modo="' + m[0] + '">' + m[1] + '</button>').join('') + '</div>' : '') + '</div>'; }
function filtroEmpresas() { return '<div class="opts"><button class="opt' + (!state.filtroEmp ? ' on' : '') + '" data-act="femp" data-emp="">Todas las empresas</button>' + DB.empresas.map(e => '<button class="opt emp' + (state.filtroEmp === e.id ? ' on' : '') + '" style="--c:' + e.c + '" data-act="femp" data-emp="' + e.id + '">' + esc(e.nombre) + '</button>').join('') + '</div>'; }
function itemsVisibles(soloMios) { return DB.items.filter(i => (!soloMios || participo(i)) && (!state.filtroEmp || empresasDe(i).includes(state.filtroEmp))); }
function agendaVertical(items, fecha, opts) {
  const dia = items.filter(i => mismoDia(i.inicio, fecha)).sort((a, b) => a.inicio - b.inicio);
  return '<div class="card flat" style="gap:12px"><div class="sec"><div><h2>' + diaLabel(fecha) + '</h2><p class="sub">' + cap(fLarga(fecha)) + '</p></div><div class="btn-row"><button class="btn sm" data-act="nav" data-dir="-1">‹</button><button class="btn sm" data-act="hoy">Hoy</button><button class="btn sm" data-act="nav" data-dir="1">›</button></div></div>' + dayStrip(fecha) + '</div>' + (opts.filtros || '') +
    '<div class="list">' + (dia.length ? dia.map(i => cardAct(i)).join('') : '<div class="empty"><span class="big">' + (state.filtroEmp ? '🔍' : '🌤️') + '</span>' + (state.filtroEmp ? 'Ningún resultado con este filtro.<button class="btn sm" data-act="femp" data-emp="">Quitar filtro</button>' : (opts.vacioTxt || 'Nada agendado este día.') + '<button class="btn primary sm" data-act="crear" data-fecha="' + toISODate(fecha) + '">+ Crear actividad</button>') + '</div>') + '</div>';
}
function lanes(items) { items.sort((a, b) => a.inicio - b.inicio || fin(b) - fin(a)); const cols = []; items.forEach(it => { let ok = false; for (let i = 0; i < cols.length; i++) { if (fin(cols[i][cols[i].length - 1]) <= it.inicio) { cols[i].push(it); it._lane = i; ok = true; break; } } if (!ok) { cols.push([it]); it._lane = cols.length - 1; } }); items.forEach(it => it._lanes = cols.length || 1); }
function bloque(it) {
  const top = ((it.inicio.getHours() * 60 + it.inicio.getMinutes()) - H_INI * 60) / 60 * 64; const h = Math.max(28, it.duracion / 60 * 64 - 3);
  const w = 100 / it._lanes; const left = it._lane * w; const [et, ec] = estadoInfo(it); const cr = activo(it) ? cruces(it.id, it.inicio, fin(it), it.personas).length : 0;
  const cls = (it.estado === 'cancelada' ? ' off' : '') + (it.estado === 'hecha' ? ' done' : '');
  return '<div class="blk' + cls + '" draggable="' + (puedeEditar(it) && activo(it) ? 'true' : 'false') + '" data-act="ver" data-id="' + it.id + '" style="--c:' + E(it.empresa).c + ';top:' + top + 'px;height:' + h + 'px;left:calc(' + left + '% + 3px);width:calc(' + w + '% - 6px)" title="' + esc(it.nombre) + '">' +
    '<div class="t">' + TIPOS[it.tipo] + ' ' + esc(it.nombre) + '</div>' + (h >= 44 ? '<div class="h num">' + fHora(it.inicio) + ' – ' + fHora(fin(it)) + '</div>' : '') + (h >= 62 ? '<div class="e">' + esc(nombresEmp(it)) + '</div>' : '') + (h >= 86 ? '<div class="s"><span class="lbl ' + ec + '">' + et + '</span>' + (cr ? '<span>⚠️ Cruce</span>' : '') + '</div>' : '') + (h >= 112 && it.personas.length > 1 ? '<div class="avatars">' + it.personas.map(p => av(p)).join('') + '</div>' : '') + '</div>';
}
function gridCal(cols) {
  const hours = []; for (let h = H_INI; h < H_FIN; h++) { hours.push('<div class="num">' + fHora(new Date(2000, 0, 1, h, 0)) + '</div>'); }
  const n = new Date(); const nowTop = ((n.getHours() * 60 + n.getMinutes()) - H_INI * 60) / 60 * 64;
  return '<div class="cal"><div class="cal-scroll"><div class="cal-grid" style="--n:' + cols.length + ';--cw:' + (cols[0] && cols[0].persona ? '150px' : '120px') + '"><div class="corner"></div>' +
    cols.map(c => '<div class="chead' + (c.fecha && mismoDia(c.fecha, now) && !c.persona ? ' today' : '') + '">' + c.head + '</div>').join('') + '<div class="hours">' + hours.join('') + '</div>' +
    cols.map(c => { const its = c.items.slice(); lanes(its); const hoy = mismoDia(c.fecha, now); return '<div class="col' + (hoy ? ' today' : '') + '" style="--rows:' + ROWS + '" data-act="slot" data-fecha="' + toISODate(c.fecha) + '" data-persona="' + (c.persona ? c.persona.id : '') + '">' + (hoy && nowTop > 0 && nowTop < ROWS * 64 ? '<div class="nowline" style="top:' + nowTop + 'px"></div>' : '') + its.map(bloque).join('') + '</div>'; }).join('') + '</div></div></div>';
}
const MODOS = [['semana', 'Semana'], ['dia', 'Día por personas'], ['mes', 'Mes']];
function vistaSemana(items) {
  const sem = semanaDe(state.fecha); const cols = sem.map(d => ({ fecha: d, head: '<div class="d"><small>' + fDiaCorto(d) + '</small><span class="n num">' + d.getDate() + '</span></div>', items: items.filter(i => mismoDia(i.inicio, d)) }));
  const total = cols.reduce((s, c) => s + c.items.length, 0);
  return calBar(cap(fFecha(sem[0])) + ' – ' + cap(fFecha(sem[6])), MODOS) + (total ? gridCal(cols) : '<div class="empty"><span class="big">' + (state.filtroEmp ? '🔍' : '🗓️') + '</span>' + (state.filtroEmp ? 'Ningún resultado con este filtro.<button class="btn sm" data-act="femp" data-emp="">Quitar filtro</button>' : 'Todavía no hay actividades esta semana.<button class="btn primary sm" data-act="crear">+ Crear actividad</button>') + '</div>');
}
function vistaDia(items) {
  const act = DB.personas.filter(p => p.estado === 'activo'); if (!state.comparar) state.comparar = act.map(p => p.id);
  const sel = act.filter(p => state.comparar.includes(p.id));
  const cols = sel.map(p => ({ fecha: state.fecha, persona: p, head: av(p.id, 'lg') + '<div class="d"><span>' + esc(p.nombre) + '</span><span class="sub">' + items.filter(i => mismoDia(i.inicio, state.fecha) && i.personas.includes(p.id) && i.estado !== 'cancelada').length + ' este día</span></div>', items: items.filter(i => mismoDia(i.inicio, state.fecha) && i.personas.includes(p.id)) }));
  return calBar(fechaTitulo(state.fecha), MODOS) + '<div class="card flat" style="gap:8px"><span class="small muted" style="font-weight:800">Comparar a:</span><div class="ppl">' + act.map(p => '<button class="pbtn' + (state.comparar.includes(p.id) ? ' on' : '') + '" data-act="comparar" data-id="' + p.id + '">' + av(p.id) + esc(p.nombre) + '</button>').join('') + '</div></div>' + (sel.length ? gridCal(cols) : '<div class="empty"><span class="big">👥</span>Elige al menos una persona para comparar.</div>');
}
function vistaMes(items) {
  const f = state.fecha; const primero = new Date(f.getFullYear(), f.getMonth(), 1); const start = lunesDe(primero); const cells = [];
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); cells.push(d); }
  return calBar(cap(fMes(f)), MODOS) + '<div class="card"><div class="month">' + ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map(w => '<div class="wd">' + w + '</div>').join('') + cells.map(d => { const its = items.filter(i => mismoDia(i.inicio, d) && i.estado !== 'cancelada').sort((a, b) => a.inicio - b.inicio); return '<button class="mday' + (d.getMonth() !== f.getMonth() ? ' out' : '') + (mismoDia(d, now) ? ' today' : '') + '" data-act="ir-dia" data-fecha="' + toISODate(d) + '"><span class="dn num">' + d.getDate() + '</span>' + its.slice(0, 3).map(i => '<span class="mchip" style="--c:' + E(i.empresa).c + '">' + fHora(i.inicio).replace(' ', '') + ' ' + esc(i.nombre) + '</span>').join('') + (its.length > 3 ? '<span class="mmore">+' + (its.length - 3) + ' más</span>' : '') + '</button>'; }).join('') + '</div></div>';
}
function calendario(items, opts) { if (isMobile()) return agendaVertical(items, state.fecha, opts); if (!state.calMode) state.calMode = 'semana'; return (opts.filtros || '') + (state.calMode === 'semana' ? vistaSemana(items) : state.calMode === 'dia' ? vistaDia(items) : vistaMes(items)); }

/* ---------- Vistas ---------- */
function vInicio() {
  const u = yo().id; const mios = DB.items.filter(i => participo(i) && activo(i)); const ahora = new Date();
  const proxima = mios.filter(i => !ES_TAREA(i.tipo) && fin(i) > ahora).sort((a, b) => a.inicio - b.inicio)[0];
  const tareasHoy = mios.filter(i => ES_TAREA(i.tipo) && i.dueño === u && diasEntre(now, fin(i)) <= 0).sort((a, b) => a.inicio - b.inicio);
  const porConf = mios.filter(i => !ES_TAREA(i.tipo) && i.dueño !== u && i.confirm[u] === 'pend' && i.inicio > ahora).sort((a, b) => a.inicio - b.inicio);
  const equipoHoy = DB.items.filter(i => activo(i) && mismoDia(i.inicio, now)).sort((a, b) => a.inicio - b.inicio); const equipoMan = DB.items.filter(i => activo(i) && diasEntre(now, i.inicio) === 1).length;
  let h = '<div><h1>Hola, ' + esc(yo().nombre) + ' 👋</h1><p class="muted" style="font-weight:700">' + cap(fLarga(now)) + ' · hora de Colombia</p></div>';
  if (DB.push && !DB.push.dispositivos && DB.prefs && !DB.prefs.push && soportaPush()) h += '<div class="note info" style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap"><span>🔔 Activa los avisos en este celular para enterarte aunque la app esté cerrada.</span><button class="btn sm primary" data-act="activar-push">Activar avisos</button></div>';
  h += '<div class="card' + (proxima ? ' stripe' : '') + '" style="--c:' + (proxima ? E(proxima.empresa).c : '') + '"><div class="sec"><h2>Mi próxima actividad</h2>' + (proxima ? '<span class="sub">' + diaLabel(proxima.inicio) + ' · ' + relativo(proxima.inicio) + '</span>' : '') + '</div>' +
    (proxima ? '<div><div style="font-size:22px;font-weight:800">' + TIPOS[proxima.tipo] + ' ' + esc(proxima.nombre) + '</div><div class="meta" style="margin-top:8px;font-size:15px"><span class="num"><b>🕒 ' + fHora(proxima.inicio) + ' – ' + fHora(fin(proxima)) + '</b></span>' + chipsEmp(proxima) + (proxima.lugar ? '<span>📍 ' + esc(proxima.lugar) + '</span>' : '') + '</div><div class="meta" style="margin-top:10px">' + avatars(proxima.personas, 'lg') + '<span>' + proxima.personas.map(nombre).join(', ') + '</span></div></div>' +
      '<div class="btn-row stack">' + (proxima.dueño !== u && proxima.confirm[u] === 'pend' ? '<button class="btn primary" data-act="confirmar" data-id="' + proxima.id + '">Confirmar asistencia</button><button class="btn" data-act="ver" data-id="' + proxima.id + '">Ver detalles</button>' : '<button class="btn primary" data-act="ver" data-id="' + proxima.id + '">Ver detalles</button>') + '</div>' : '<div class="empty"><span class="big">🌤️</span>No tienes actividades próximas.<button class="btn primary sm" data-act="crear">+ Crear actividad</button></div>') + '</div>';
  h += '<div class="card"><div class="sec"><h2>Mis tareas de hoy</h2><button class="btn ghost sm" data-act="go" data-view="tareas">Ver todas</button></div><div class="list">' + (tareasHoy.length ? tareasHoy.slice(0, 3).map(cardTarea).join('') : '<div class="empty"><span class="big">✅</span>Todo listo para hoy.</div>') + '</div></div>';
  h += '<div class="card"><div class="sec"><h2>Confirmaciones pendientes</h2><span class="sub">' + (porConf.length ? porConf.length + ' por responder' : '') + '</span></div><div class="list">' + (porConf.length ? porConf.slice(0, 3).map(i => cardAct(i) + '<div class="btn-row stack" style="margin-top:-2px"><button class="btn primary sm" data-act="confirmar" data-id="' + i.id + '">Confirmar asistencia</button><button class="btn sm" data-act="ver" data-id="' + i.id + '">Ver detalles</button></div>').join('') : '<div class="empty"><span class="big">👍</span>No tienes nada por confirmar.</div>') + '</div></div>';
  const rp = resumenReporte('semana', '', puedeVerTodoReporte() ? '' : u);
  h += '<div class="card"><div class="sec"><h2>Reportes</h2><button class="btn ghost sm" data-act="go" data-view="reportes">Ver reportes</button></div><p class="muted" style="font-weight:700">Esta semana: ' + rp.publicaciones + ' publicaciones, ' + rp.links + ' links enviados, ' + rp.comentarios + ' comentarios respondidos y ' + rp.grabaciones + ' grabaciones.</p></div>';
  h += '<div class="card"><div class="sec"><h2>Agenda del equipo</h2><button class="btn ghost sm" data-act="go" data-view="equipo">Ver agenda completa</button></div><p class="muted" style="font-weight:700">Hoy el equipo tiene ' + equipoHoy.length + ' actividad' + (equipoHoy.length === 1 ? '' : 'es') + ' y mañana ' + equipoMan + '.</p><div class="list">' + (equipoHoy.filter(i => fin(i) > ahora).slice(0, 3).map(i => cardAct(i)).join('') || '<div class="empty">Ya no quedan actividades del equipo por hoy.</div>') + '</div></div>';
  return h;
}
function vMiAgenda() { return calendario(itemsVisibles(true), { filtros: filtroEmpresas(), vacioTxt: 'No tienes nada agendado este día.' }); }
function vEquipo() { const top = '<div class="card flat" style="gap:10px"><div class="sec"><div><h2>Agenda compartida</h2><p class="sub">Todos ven la agenda de las ' + DB.empresas.length + ' empresas. Solo el responsable, un líder o un administrador pueden editar cada actividad.</p></div><button class="btn sm" data-act="go" data-view="directorio">Ver directorio</button></div>' + filtroEmpresas() + '</div>'; return calendario(itemsVisibles(false), { filtros: top, vacioTxt: 'El equipo no tiene nada agendado este día.' }); }
function vTareas() {
  const u = yo().id; const mias = DB.items.filter(i => ES_TAREA(i.tipo) && i.dueño === u);
  const atras = mias.filter(i => atrasada(i)); const hoy = mias.filter(i => activo(i) && !atrasada(i) && diasEntre(now, fin(i)) === 0); const prox = mias.filter(i => activo(i) && !atrasada(i) && diasEntre(now, fin(i)) > 0).sort((a, b) => a.inicio - b.inicio); const hechas = mias.filter(i => i.estado === 'hecha');
  const revisar = DB.items.filter(i => i.estado === 'en_revision' && (i.revisor === u || esAdmin() || esLider()) && i.dueño !== u);
  const sec = (t, l, vacio) => '<div class="card"><div class="sec"><h2>' + t + '</h2><span class="sub">' + l.length + '</span></div><div class="list">' + (l.length ? l.map(cardTarea).join('') : '<div class="empty">' + vacio + '</div>') + '</div></div>';
  return '<div class="btn-row"><button class="btn primary" data-act="crear" data-tipo="Tarea">+ Nueva tarea</button></div>' + (atras.length ? sec('Atrasadas', atras, '') : '') + sec('Para hoy', hoy, 'Todo listo para hoy.') + sec('Próximas', prox, 'Nada pendiente por ahora.') +
    (revisar.length ? '<div class="card"><div class="sec"><h2>Para revisar</h2><span class="sub">Te las entregaron a ti</span></div><div class="list">' + revisar.map(i => cardAct(i)).join('') + '</div></div>' : '') + '<details class="more card"><summary>Hechas (' + hechas.length + ')</summary><div class="list">' + hechas.map(cardTarea).join('') + '</div></details>';
}
function lblCanal(c) { const ok = ['Entregada', 'Enviado'].includes(c.estado); const gris = ['Omitido', 'Cancelado'].includes(c.estado) || /sin activar|sin correo|no tiene correo/i.test(c.detalle); const nombre = c.canal === 'Interna' ? 'App' : c.canal === 'Push' ? 'Celular' : c.canal; return '<span class="lbl ' + (ok ? 'l-ok' : gris ? 'l-gray' : c.estado === 'Pendiente' ? 'l-info' : 'l-bad') + '" title="' + esc(c.detalle || '') + '">' + nombre + ': ' + esc(c.estado.toLowerCase()) + (c.estado === 'No enviado' && c.detalle ? ' · ' + esc(c.detalle.toLowerCase()) : '') + '</span>'; }
function vAvisos() {
  const lista = DB.avisos;
  return '<div class="sec"><p class="muted small" style="font-weight:700">Cada aviso muestra por separado si lo leíste y qué pasó con el correo y el celular.</p><div class="btn-row"><button class="btn sm" data-act="leer-todo">Marcar todo como leído</button><button class="btn sm" data-act="go" data-view="ajustes">Ajustes</button></div></div>' +
    '<div class="list">' + (lista.length ? lista.map(n => { const it = n.itemId ? I(n.itemId) : null; const conf = it && it.personas.includes(yo().id) && it.dueño !== yo().id && !ES_TAREA(it.tipo) ? it.confirm[yo().id] : null; return '<button class="notif' + (n.leida ? '' : ' unread') + '" data-act="abrir-aviso" data-id="' + n.id + '"><div style="flex:1;min-width:0"><div class="t">' + esc(n.titulo) + '</div><div class="small muted" style="font-weight:600;white-space:pre-line">' + esc(n.cuerpo) + '</div><div class="ch">' + (n.canales || []).map(lblCanal).join('') + (conf ? '<span class="lbl ' + confInfo(conf)[1] + '">Asistencia: ' + confInfo(conf)[0].toLowerCase() + '</span>' : '') + '</div></div><div class="small muted num" style="white-space:nowrap;font-weight:700">' + relativo(n.fecha) + '</div></button>'; }).join('') : '<div class="empty"><span class="big">🔔</span>No tienes avisos.</div>') + '</div>';
}
function enPeriodo(d, periodo) { if (periodo === 'todo') return true; if (periodo === 'semana') { const s = semanaDe(now); return d >= s[0] && d < addMin(s[6], 1440); } return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); }
function resumenReporte(periodo, emp, persona) {
  const its = DB.items.filter(i => i.estado !== 'cancelada' && enPeriodo(i.inicio, periodo) && (!emp || empresasDe(i).includes(emp)) && (!persona || i.personas.includes(persona)));
  const h = its.filter(i => i.estado === 'hecha'); const pubs = h.filter(i => i.tipo === 'Publicación');
  return { items: its, publicaciones: pubs.length, links: pubs.reduce((s, i) => s + (i.links || 0), 0), comentarios: pubs.reduce((s, i) => s + (i.comentariosResp || 0), 0), grabaciones: h.filter(i => i.tipo === 'Grabación').length, eventos: h.filter(i => i.tipo === 'Evento').length, podcasts: h.filter(i => i.tipo === 'Podcast' || i.tipo === 'Entrevista').length, tareas: h.filter(i => ES_TAREA(i.tipo)).length, atrasadas: its.filter(atrasada).length, listaPubs: its.filter(i => i.tipo === 'Publicación').sort((a, b) => b.inicio - a.inicio) };
}
function textoReporte() {
  const per = { semana: 'esta semana', mes: 'este mes', todo: 'todo el tiempo' }[state.repPeriodo]; const persona = puedeVerTodoReporte() ? state.repPersona : yo().id; const r = resumenReporte(state.repPeriodo, state.repEmp, persona);
  let t = 'Reporte de ' + (persona ? nombre(persona) : 'todo el equipo') + ' · ' + (state.repEmp ? E(state.repEmp).nombre : 'todas las empresas') + ' · ' + per + '\n';
  t += 'Publicaciones hechas: ' + r.publicaciones + '\nLinks enviados: ' + r.links + '\nComentarios respondidos: ' + r.comentarios + '\nGrabaciones realizadas: ' + r.grabaciones + '\nEventos realizados: ' + r.eventos + '\nPodcasts y entrevistas: ' + r.podcasts + '\nTareas hechas: ' + r.tareas + '\nAtrasadas: ' + r.atrasadas + '\n';
  if (r.listaPubs.length) t += '\nPublicaciones:\n' + r.listaPubs.map(i => '- ' + cap(fFecha(i.inicio)) + ' · ' + i.nombre + ' · ' + nombresEmp(i) + ' · ' + (i.plataforma || '') + ' · ' + (i.links || 0) + ' links · ' + (i.comentariosResp || 0) + ' comentarios · ' + (i.estado === 'hecha' ? 'hecha' : 'pendiente')).join('\n');
  return t;
}
function vReportes() {
  const todo = puedeVerTodoReporte(); const persona = todo ? state.repPersona : yo().id; const r = resumenReporte(state.repPeriodo, state.repEmp, persona);
  const tile = (n, l) => '<div class="card flat" style="padding:14px;gap:2px"><div style="font-size:28px;font-weight:800" class="num">' + n + '</div><div class="small muted" style="font-weight:800">' + l + '</div></div>';
  let h = '<div class="card flat" style="gap:12px"><div class="sec"><div><h2>' + (persona ? 'Reporte de ' + esc(nombre(persona)) : 'Reporte del equipo') + '</h2><p class="sub">Contenido publicado, links enviados, comentarios respondidos y actividades realizadas. Se calcula con lo marcado como hecho.</p></div><div class="btn-row"><button class="btn primary sm" data-act="crear" data-tipo="Publicación">+ Registrar publicación o links</button><button class="btn sm" data-act="copiar-reporte">Copiar resumen</button></div></div>' +
    '<div class="seg" style="width:fit-content">' + [['semana', 'Esta semana'], ['mes', 'Este mes'], ['todo', 'Todo']].map(x => '<button class="' + (state.repPeriodo === x[0] ? 'active' : '') + '" data-act="rep-periodo" data-v="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
    '<div class="opts"><button class="opt' + (!state.repEmp ? ' on' : '') + '" data-act="rep-emp" data-emp="">Todas las empresas</button>' + DB.empresas.map(e => '<button class="opt emp' + (state.repEmp === e.id ? ' on' : '') + '" style="--c:' + e.c + '" data-act="rep-emp" data-emp="' + e.id + '">' + esc(e.nombre) + '</button>').join('') + '</div>' +
    (todo ? '<div class="ppl">' + DB.personas.filter(p => p.estado === 'activo').map(p => '<button class="pbtn' + (state.repPersona === p.id ? ' on' : '') + '" data-act="rep-persona" data-id="' + p.id + '">' + av(p.id) + esc(p.nombre) + '</button>').join('') + '</div>' : '') + '</div>';
  h += '<div class="grid2">' + tile(r.publicaciones, 'Publicaciones hechas') + tile(r.links, 'Links enviados') + tile(r.comentarios, 'Comentarios respondidos') + tile(r.grabaciones, 'Grabaciones realizadas') + tile(r.eventos, 'Eventos realizados') + tile(r.podcasts, 'Podcasts y entrevistas') + tile(r.tareas, 'Tareas hechas') + tile(r.atrasadas, 'Atrasadas') + '</div>';
  if (!state.repEmp) { const porEmp = DB.empresas.map(e => ({ e, r: resumenReporte(state.repPeriodo, e.id, persona) })).filter(x => x.r.items.length); h += '<div class="card"><h2>Por empresa</h2><div class="list">' + (porEmp.length ? porEmp.map(x => '<div class="conf" style="border-left:6px solid ' + x.e.c + '"><span class="n">' + esc(x.e.nombre) + '<div class="small muted" style="font-weight:700">' + x.r.publicaciones + ' publicaciones · ' + x.r.links + ' links · ' + x.r.comentarios + ' comentarios · ' + x.r.grabaciones + ' grabaciones · ' + x.r.tareas + ' tareas hechas</div></span></div>').join('') : '<div class="empty"><span class="big">📈</span>Todavía no hay nada registrado en este período.</div>') + '</div></div>'; }
  h += '<div class="card"><div class="sec"><h2>Publicaciones y links</h2><span class="sub">' + r.listaPubs.length + '</span></div><div class="list">' + (r.listaPubs.length ? r.listaPubs.map(i => '<button class="acard' + (i.estado === 'hecha' ? ' done' : '') + '" data-act="ver" data-id="' + i.id + '" style="--c:' + E(i.empresa).c + '"><div class="time num">' + cap(fFecha(i.inicio)) + '<small>' + fHora(i.inicio) + '</small></div><div class="body"><div class="name">📣 ' + esc(i.nombre) + '</div><div class="meta">' + chipsEmp(i) + (i.plataforma ? '<span>' + esc(i.plataforma) + '</span>' : '') + '<span>' + (i.links || 0) + ' links · ' + (i.comentariosResp || 0) + ' comentarios</span></div><div class="meta">' + avatars(i.personas) + lblEstado(i) + '</div></div></button>').join('') : '<div class="empty"><span class="big">📣</span>Aún no hay publicaciones registradas.<button class="btn primary sm" data-act="crear" data-tipo="Publicación">+ Registrar publicación o links</button></div>') + '</div></div>';
  return h;
}
function vDirectorio() {
  const canal = (n, ok, det, cls) => '<div class="conf"><div class="n">' + n + '<div class="small muted">' + esc(det) + '</div></div><span class="lbl ' + cls + '">' + ok + '</span></div>';
  let h = '<div class="card"><div class="sec"><div><h2>Integrantes</h2><p class="sub">' + (esAdmin() ? 'Invita por correo, asigna función y empresas, y desactiva accesos cuando alguien deje el grupo.' : 'Quiénes son y en qué empresas trabajan.') + '</p></div>' + (esAdmin() ? '<button class="btn primary sm" data-act="invitar">+ Invitar persona</button>' : '') + '</div><div class="list">' +
    DB.personas.map(p => {
      let est, acts = '';
      if (p.estado === 'activo') { est = '<span class="lbl l-ok">Activo</span>'; if (esAdmin()) acts = '<button class="btn sm" data-act="editar-persona" data-id="' + p.id + '">Editar</button><button class="btn sm" data-act="enlace-acceso" data-id="' + p.id + '">Enlace de acceso</button>' + (p.id !== yo().id ? '<button class="btn sm danger" data-act="desactivar" data-id="' + p.id + '">Desactivar acceso</button>' : ''); else if (p.id === yo().id) acts = '<button class="btn sm" data-act="editar-persona" data-id="' + p.id + '">Editar mis datos</button>'; }
      else if (p.estado === 'invitado') { est = '<span class="lbl l-pend">' + (p.vence ? 'Invitación enviada · vence ' + diaLabel(p.vence).toLowerCase() : 'Sin invitar todavía') + '</span>'; if (esAdmin()) acts = '<button class="btn sm" data-act="editar-persona" data-id="' + p.id + '">Editar</button><button class="btn sm primary" data-act="enlace-acceso" data-id="' + p.id + '">' + (p.vence ? 'Reenviar invitación' : 'Enviar invitación') + '</button><button class="btn sm danger" data-act="cancelar-inv" data-id="' + p.id + '">Quitar</button>'; }
      else { est = '<span class="lbl l-gray">Desactivado</span>'; if (esAdmin()) acts = '<button class="btn sm" data-act="reactivar" data-id="' + p.id + '">Reactivar</button>'; }
      return '<div class="person">' + av(p.id, 'xl') + '<div class="info"><div class="n">' + esc(p.nombre) + ' <span class="muted small">· ' + esc(p.rol) + '</span></div><div class="small muted" style="font-weight:600">' + esc(p.funcion) + (p.correo ? ' · ' + esc(p.correo) : ' · <span class="lbl l-pend">Correo pendiente</span>') + '</div><div class="meta" style="margin-top:6px">' + p.empresas.map(chipEmp).join('') + '</div></div><div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">' + est + '<div class="btn-row">' + acts + '</div></div></div>';
    }).join('') + '</div></div>';
  if (esAdmin() && DB.canales) {
    const c = DB.canales;
    h += '<div class="card"><div class="sec"><div><h2>Empresas</h2><p class="sub">Agrega, cambia el nombre o el color. El color identifica a la empresa en toda la plataforma.</p></div><button class="btn primary sm" data-act="nueva-empresa">+ Agregar empresa</button></div><div class="list">' + DB.empresas.map(e => '<div class="conf" style="border-left:6px solid ' + e.c + ';flex-wrap:wrap"><span class="n">' + esc(e.nombre) + '<div class="small muted" style="font-weight:700">' + DB.items.filter(i => empresasDe(i).includes(e.id)).length + ' actividades · ' + DB.personas.filter(p => p.estado === 'activo' && p.empresas.includes(e.id)).length + ' personas</div></span><label class="small muted" style="display:flex;align-items:center;gap:8px;font-weight:800">Color <input type="color" value="' + e.c + '" data-act="color-emp" data-id="' + e.id + '" style="width:44px;height:36px;border:1px solid var(--line);border-radius:8px;background:var(--surface);padding:2px"></label><div class="btn-row"><button class="btn sm" data-act="editar-empresa" data-id="' + e.id + '">Editar</button></div></div>').join('') + '</div></div>';
    h += '<div class="card"><div class="sec"><div><h2>Estado de canales</h2><p class="sub">Estado real del servidor. Si falta algo, aquí dice qué.</p></div><button class="btn sm" data-act="probar-correo">Enviarme un correo de prueba</button></div>' +
      canal('Avisos en la app', 'Funciona', 'Historial dentro de la plataforma.', 'l-ok') +
      canal('Correo electrónico', c.correo.ok ? 'Configurado' : 'No configurado', c.correo.detalle, c.correo.ok ? 'l-ok' : 'l-bad') + (c.correo.configurable !== false ? '<div class="btn-row"><button class="btn sm primary" data-act="config-correo">' + (c.correo.ok ? 'Cambiar cuenta de correo' : 'Configurar correo') + '</button>' + (c.correo.ok ? '<button class="btn sm danger" data-act="quitar-correo">Quitar</button>' : '') + '</div>' : '') +
      canal('Avisos al celular (push)', c.push.ok ? 'Listo' : 'No configurado', c.push.detalle, c.push.ok ? 'l-ok' : 'l-bad') +
      canal('Recordatorios automáticos', c.programador.ok ? 'Activo' : 'Detenido', c.programador.ultimo ? 'Última revisión ' + relativo(new Date(c.programador.ultimo)) + '. Funciona aunque nadie tenga la app abierta.' : 'Todavía no ha corrido.', c.programador.ok ? 'l-ok' : 'l-bad') +
      canal('Dirección de la plataforma', c.appUrl ? 'Lista' : 'Pendiente', c.appUrl || 'Se define sola con el primer ingreso.', c.appUrl ? 'l-ok' : 'l-pend') +
      '<details class="more"><summary>Registro de envíos</summary><div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Para</th><th>Canal</th><th>Aviso</th><th>Estado</th></tr></thead><tbody>' + DB.envios.map(e => '<tr><td class="num">' + cap(fFecha(e.fecha)) + ' ' + fHora(e.fecha) + '</td><td>' + esc(e.persona || e.para) + '</td><td>' + e.canal + '</td><td>' + esc(e.asunto) + '</td><td>' + esc(e.estado) + (e.detalle ? ' · ' + esc(e.detalle) : '') + '</td></tr>').join('') + '</tbody></table></div></details></div>';
    h += '<div class="card"><div class="sec"><div><h2>Recordatorios del equipo</h2><p class="sub">Para citas, a todo el equipo le avisamos:</p></div></div><div class="checks">' + Object.keys(OFFSET_LABELS).map(Number).sort((a, b) => b - a).map(o => '<label class="check"><input type="checkbox" data-act="offset-equipo" value="' + o + '"' + (DB.offsetsEquipo.includes(o) ? ' checked' : '') + '> ' + OFFSET_LABELS[o] + '</label>').join('') + '</div><div class="btn-row"><button class="btn sm primary" data-act="guardar-offsets">Guardar</button></div></div>';
  }
  return h;
}
function soportaPush() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
function vAjustes() {
  const pf = DB.prefs;
  const sw = (k, t, d, on, dis) => '<div class="switch"><div><div class="t">' + t + '</div><div class="d">' + d + '</div></div><button class="toggle" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" data-act="toggle" data-key="' + k + '"' + (dis ? ' disabled' : '') + ' aria-label="' + t + '"></button></div>';
  const pushOn = pf.push && DB.push.dispositivos > 0;
  return '<div class="card"><h2>Cómo te avisamos</h2>' + sw('app', 'Avisos en la app', 'Siempre activos. Es tu historial.', true, true) + sw('correo', 'Correo electrónico', (yo().correo ? 'A ' + esc(yo().correo) + '. ' : 'No tienes correo registrado. ') + 'Si no puedes activar el celular, este es tu respaldo.', pf.correo) +
    '<div class="switch"><div><div class="t">Avisos en el celular</div><div class="d">' + (pushOn ? 'Activados en ' + DB.push.dispositivos + ' dispositivo' + (DB.push.dispositivos === 1 ? '' : 's') + '.' : 'Sin activar en este dispositivo. Hay que dar permiso y, en iPhone, instalar la app primero.') + '</div></div><div class="btn-row">' + (pushOn ? '<button class="btn sm" data-act="desactivar-push">Desactivar</button>' : '') + '<button class="btn primary sm" data-act="activar-push">' + (pushOn ? 'Activar en este dispositivo' : 'Activar') + '</button></div></div></div>' +
    '<div class="card"><h2>Recordatorios</h2><p class="muted small" style="font-weight:700">Para citas te avisamos ' + DB.offsetsEquipo.slice().sort((a, b) => b - a).map(o => OFFSET_LABELS[o]).join(', ') + '. Para tareas: al asignarte, un día antes de la entrega y si se atrasa.</p>' + sw('recCitas', 'Recordatorios de citas', 'Grabaciones, reuniones, entrevistas, podcasts y eventos.', pf.recCitas) + sw('recTareas', 'Recordatorios de tareas', 'Entregas que se acercan y tareas atrasadas.', pf.recTareas) + sw('resumen', 'Resumen diario', 'Un solo aviso con tus citas y tareas del día.', pf.resumen) + '<div class="grid2" style="max-width:360px"><div class="field"><label for="resHora">Hora del resumen</label><input id="resHora" type="time" value="' + pf.resumenHora + '" data-act="res-hora"></div></div></div>' +
    '<div class="card"><h2>Descanso</h2>' + sw('descanso', 'No molestar en la noche', 'Los avisos no urgentes esperan. El de 15 minutos antes de una cita siempre llega.', pf.descanso.on) + '<div class="grid2" style="max-width:360px"><div class="field"><label for="dDesde">Desde</label><input id="dDesde" type="time" value="' + pf.descanso.desde + '" data-act="desc" data-key="desde"></div><div class="field"><label for="dHasta">Hasta</label><input id="dHasta" type="time" value="' + pf.descanso.hasta + '" data-act="desc" data-key="hasta"></div></div></div>' +
    '<div class="card"><h2>Privacidad en pantalla bloqueada</h2><p class="muted small" style="font-weight:700">En el celular bloqueado solo se ve el tipo de actividad, la hora y la empresa. Nunca archivos ni comentarios.</p><div class="note">🔔 <b>Agenda del Grupo</b> · en 15 min<br>Grabación · El Chupe · 3:00 p. m. Toca para ver los detalles.</div></div>' +
    '<div class="card"><h2>Acceso rápido</h2><div class="btn-row stack"><button class="btn" data-act="instalar">Instalar en el celular</button><button class="btn" data-act="guia">Ver guía de inicio</button><button class="btn" data-act="editar-persona" data-id="' + yo().id + '">Editar mis datos</button><button class="btn" data-act="salir">Cerrar sesión</button></div></div>';
}
function render() {
  if (!DB.yo) return;
  renderNav();
  const map = { inicio: vInicio, 'mi-agenda': vMiAgenda, equipo: vEquipo, tareas: vTareas, avisos: vAvisos, reportes: vReportes, directorio: vDirectorio, ajustes: vAjustes };
  $('#content').innerHTML = (map[state.view] || vInicio)();
  const sc = $('.cal-scroll'); if (sc) { const h = mismoDia(state.fecha, now) ? Math.max(H_INI, now.getHours() - 1) : 8; sc.scrollTop = (h - H_INI) * 64; }
}

/* ---------- Panel ---------- */
function openPanel(html, c) { $('#panel').innerHTML = html; $('#panel').style.setProperty('--c', c || 'var(--line)'); $('#overlay').classList.add('open'); $('#panel').scrollTop = 0; document.body.style.overflow = 'hidden'; }
function closePanel() { $('#overlay').classList.remove('open'); document.body.style.overflow = ''; }
function ptop(t, sub) { return '<div class="ptop"><div><h2>' + t + '</h2>' + (sub ? '<p class="muted small" style="font-weight:700">' + sub + '</p>' : '') + '</div><button class="btn sm x" data-act="cerrar">✕ Cerrar</button></div><div class="stripe"></div>'; }
function panelItem(id) {
  const it = I(id); if (!it) { toast('La actividad ya no existe.'); return; } const u = yo().id; const tarea = ES_TAREA(it.tipo) || it.personas.length === 1; const act = activo(it);
  const cr = act ? cruces(it.id, it.inicio, fin(it), it.personas) : [];
  let h = ptop(TIPOS[it.tipo] + ' ' + esc(it.nombre), esc(nombresEmp(it)) + (it.proyecto ? ' · ' + esc(it.proyecto) : '') + ' · ' + it.tipo);
  h += '<div class="meta">' + chipsEmp(it) + lblEstado(it) + (participo(it) && it.dueño !== u && act && !tarea ? lblConf(it.confirm[u]) : '') + (atrasada(it) ? '<span class="lbl l-bad">⏰ ' + (-diasEntre(now, fin(it))) + ' días de retraso</span>' : '') + '</div>';
  h += '<div class="kv"><div class="r"><span class="i">📅</span><div class="v"><b>' + fechaTitulo(it.inicio) + '</b><br><span class="num">' + fHora(it.inicio) + ' – ' + fHora(fin(it)) + '</span> · hora de Colombia</div></div>' +
    (it.lugar ? '<div class="r"><span class="i">' + (it.enlace ? '💻' : '📍') + '</span><div class="v">' + esc(it.lugar) + (it.enlace ? '<br><a href="' + esc(it.enlace) + '" target="_blank" rel="noopener">Abrir enlace de reunión</a>' : '') + '</div></div>' : '') +
    '<div class="r"><span class="i">👤</span><div class="v">Responsable: <b>' + esc(nombre(it.dueño)) + '</b></div></div>' +
    (it.personas.length > 1 ? '<div class="r"><span class="i">👥</span><div class="v"><div class="list" style="gap:6px">' + it.personas.filter(p => p !== it.dueño).map(p => '<div class="conf">' + av(p) + '<span class="n">' + esc(nombre(p)) + (P(p) && P(p).estado !== 'activo' ? ' <span class="small muted">(sin acceso)</span>' : '') + '</span>' + (act ? lblConf(it.confirm[p]) : '') + '</div>').join('') + '</div></div></div>' : '') +
    (it.tipo === 'Publicación' && (it.plataforma || it.links || it.comentariosResp) ? '<div class="r"><span class="i">📣</span><div class="v">' + esc(it.plataforma || 'Publicación') + ' · <b>' + (it.links || 0) + '</b> links enviados · <b>' + (it.comentariosResp || 0) + '</b> comentarios respondidos' + (it.enlacePub ? '<br><a href="' + esc(it.enlacePub) + '" target="_blank" rel="noopener">Ver publicación</a>' : '') + '</div></div>' : '') +
    (it.nota ? '<div class="r"><span class="i">📝</span><div class="v">' + esc(it.nota) + '</div></div>' : '') + (it.bloqueo ? '<div class="r"><span class="i">⛔</span><div class="v">Bloqueada: ' + esc(it.bloqueo) + '</div></div>' : '') + '</div>';
  if (cr.length) h += '<div class="note warn">⚠️ <b>Cruce de horario.</b> ' + [...new Set(cr.map(c => nombre(c.persona) + ' también tiene “' + c.otra.nombre + '” (' + E(c.otra.empresa).nombre + ') de ' + fHora(c.otra.inicio) + ' a ' + fHora(fin(c.otra))))].join('. ') + '.</div>';
  if ((it.solicitudes || []).length && act) h += '<div class="note info">🕐 ' + it.solicitudes.map(s => esc(nombre(s.de)) + ' pidió otra hora: “' + esc(s.motivo) + '”').join(' · ') + '</div>';
  if (act) {
    if (!tarea && participo(it) && it.dueño !== u) h += '<div class="btn-row stack">' + (it.confirm[u] !== 'ok' ? '<button class="btn primary wide" data-act="confirmar" data-id="' + it.id + '">Confirmar asistencia</button>' : '<button class="btn wide" disabled>✓ Ya confirmaste</button>') + '</div><div class="btn-row stack"><button class="btn sm" data-act="no-puedo" data-id="' + it.id + '">No puedo asistir</button><button class="btn sm" data-act="pedir-cambio" data-id="' + it.id + '">Pedir otra hora</button></div><p class="small muted" style="font-weight:600">Pedir otra hora no cambia la actividad: ' + esc(nombre(it.dueño)) + ' la revisa y decide.</p>';
    if (tarea && it.dueño === u) h += '<div class="btn-row stack"><button class="btn primary wide" data-act="hecha" data-id="' + it.id + '">Marcar como hecha</button></div><div class="btn-row stack">' + (it.estado !== 'en_revision' ? '<button class="btn sm" data-act="entregar" data-id="' + it.id + '">Entregar para revisión</button>' : '') + (it.estado === 'bloqueada' ? '<button class="btn sm" data-act="desbloquear" data-id="' + it.id + '">Ya se resolvió el bloqueo</button>' : '<button class="btn sm" data-act="bloquear" data-id="' + it.id + '">Reportar bloqueo</button>') + '</div>';
    if (it.estado === 'en_revision' && (it.revisor === u || esAdmin() || esLider()) && it.dueño !== u) h += '<div class="btn-row stack"><button class="btn ok" data-act="aprobar" data-id="' + it.id + '">Aprobar entrega</button><button class="btn" data-act="pedir-ajustes" data-id="' + it.id + '">Pedir ajustes</button></div>';
  }
  if (!it.privado) h += '<div class="card flat" style="padding:14px"><h3>Materiales</h3>' + (it.archivos.length ? '<div class="files">' + it.archivos.map(f => '<a class="btn sm" href="/archivos/' + encodeURIComponent(it.id) + '/' + encodeURIComponent(f) + '">' + (/guion/i.test(f) ? '📄 Ver guion' : '📎 ' + esc(f)) + '</a>').join('') + '</div>' : '<p class="small muted" style="font-weight:600">Todavía no hay archivos.</p>') + '<label class="btn sm" style="align-self:flex-start">Adjuntar archivo<input type="file" hidden data-act="adjuntar" data-id="' + it.id + '"></label></div>';
  else h += '<div class="note">🔒 Los archivos y comentarios de este proyecto son privados. Puedes ver la agenda sin acceder a ellos. Si los necesitas, pídele acceso a ' + esc(nombre(it.dueño)) + '.</div>';
  if (puedeEditar(it)) { if (act) h += '<div class="card flat" style="padding:14px"><div class="sec"><h3>Organizar</h3>' + (!tarea ? '<span class="sub">' + it.personas.filter(p => it.confirm[p] === 'ok').length + ' de ' + it.personas.length + ' confirmaron</span>' : '') + '</div><div class="btn-row stack"><button class="btn sm" data-act="editar" data-id="' + it.id + '">Cambiar fecha o editar</button>' + (!tarea || it.dueño !== u ? '<button class="btn sm" data-act="hecha" data-id="' + it.id + '">Marcar como ' + (tarea ? 'hecha' : 'realizada') + '</button>' : '') + '<button class="btn sm danger" data-act="cancelar-item" data-id="' + it.id + '">Cancelar actividad</button></div></div>'; }
  else if (act && !participo(it)) h += '<div class="note">Puedes ver esta actividad, pero no editarla. Si necesitas un cambio, escríbele a ' + esc(nombre(it.dueño)) + '.</div>';
  const recs = recordatorios(it);
  h += '<div class="card flat" style="padding:14px"><div class="sec"><h3>🔔 Recordatorios</h3>' + (puedeEditar(it) && act ? '<button class="btn ghost sm" data-act="ajustar-rec" data-id="' + it.id + '">Ajustar</button>' : '') + '</div><p class="small muted" style="font-weight:700">' + (act ? (ES_TAREA(it.tipo) ? 'Te avisamos un día antes de la entrega y si se atrasa.' : 'Te avisamos ' + offsetsDe(it).map(o => OFFSET_LABELS[o].replace(' antes', '')).join(', ') + ' antes.') : 'Recordatorios detenidos.') + '</p>' + (!ES_TAREA(it.tipo) ? '<details class="more"><summary>Ver programación y mensaje</summary><div class="list" style="gap:6px;margin-top:8px">' + recs.map(r => '<div class="conf"><span class="n">' + r.label + '<div class="small muted num">' + cap(fFecha(r.when)) + ' · ' + fHora(r.when) + '</div></span><span class="lbl ' + r.cls + '">' + r.estado + '</span></div>').join('') + '</div>' + (participo(it) ? '<div class="msg" style="margin-top:10px">' + esc(textoAviso(it, u)) + '</div>' : '') + '</details>' : '') + '</div>';
  if (!it.privado) h += '<div class="card flat" style="padding:14px"><h3>💬 Comentarios</h3>' + (it.comentarios.length ? '<div class="list" style="gap:6px">' + it.comentarios.map(c => '<div class="conf">' + av(c.de) + '<span class="n"><b>' + esc(nombre(c.de)) + '</b> <span class="small muted num">' + relativo(c.fecha) + '</span><br>' + esc(c.texto) + '</span></div>').join('') + '</div>' : '<p class="small muted" style="font-weight:600">Aún no hay comentarios.</p>') + '<div class="field"><textarea id="comentario" placeholder="Escribe un comentario para el equipo"></textarea></div><div class="btn-row"><button class="btn sm" data-act="comentar" data-id="' + it.id + '">Comentar</button></div></div>';
  if (it.historial.length) h += '<details class="more"><summary>Historial</summary><div class="hist" style="margin-top:8px">' + it.historial.slice().reverse().map(x => '<div><span class="num">' + cap(fFecha(x.fecha)) + ' ' + fHora(x.fecha) + '</span> · ' + esc(x.texto) + '</div>').join('') + '</div></details>';
  openPanel(h, E(it.empresa).c);
}
function panelForm(id, pre) {
  pre = pre || {}; const it = id ? I(id) : null; const esNueva = !it;
  const inicio0 = it ? it.inicio : (pre.inicio || (() => { const d = new Date(state.fecha); d.setHours(10, 0, 0, 0); return d; })());
  const tipo0 = it ? it.tipo : (pre.tipo || 'Reunión'); const permitidas = empresasPermitidas(); const emps0 = it ? empresasDe(it) : [permitidas[0] || DB.empresas[0].id]; const emp0 = emps0[0]; const personas0 = it ? it.personas : [...new Set([yo().id].concat(pre.persona && pre.persona !== yo().id ? [pre.persona] : []))];
  const dueño0 = it ? it.dueño : yo().id; const act = DB.personas.filter(p => p.estado === 'activo');
  const h = ptop(esNueva ? 'Crear actividad' : 'Cambiar fecha o editar', esNueva ? 'Antes de guardar revisamos si alguien ya tiene algo a esa hora, incluso en otra empresa.' : esc(it.nombre)) +
    '<form id="form" data-id="' + (it ? it.id : '') + '" style="display:flex;flex-direction:column;gap:14px">' + (it && it.personas.length > 1 ? '<div class="note info">Si cambias la fecha u hora, se vuelve a pedir confirmación a los participantes y se reprograman los recordatorios.</div>' : '') +
    '<div class="fsec"><h3>¿Qué vamos a hacer?</h3><div class="field"><input id="fNombre" required value="' + esc(it ? it.nombre : (pre.nombre || '')) + '" placeholder="Ej. Grabación reel apertura" aria-label="Nombre de la actividad"></div><div class="opts" id="tipoOpts">' + Object.keys(TIPOS).map(t => '<button type="button" class="opt' + (t === tipo0 ? ' on' : '') + '" data-act="opt-tipo" data-v="' + t + '">' + TIPOS[t] + ' ' + t + '</button>').join('') + '</div><input type="hidden" id="fTipo" value="' + tipo0 + '"></div>' +
    '<div class="fsec"><h3>¿Para qué empresas?</h3><p class="small muted" style="font-weight:700;margin:-4px 0 2px">Puedes marcar varias. ' + (esAdmin() ? '' : 'Solo aparecen las empresas donde estás.') + '</p><div class="opts" id="empOpts">' + DB.empresas.filter(e => permitidas.includes(e.id) || emps0.includes(e.id)).map(e => '<button type="button" class="opt emp' + (emps0.includes(e.id) ? ' on' : '') + '" style="--c:' + e.c + '" data-act="opt-emp" data-v="' + e.id + '">' + esc(e.nombre) + '</button>').join('') + '</div></div>' +
    '<div class="fsec"><h3>¿Cuándo?</h3><div class="grid2"><div class="field"><label for="fFecha">Fecha</label><input id="fFecha" type="date" required value="' + toISODate(inicio0) + '"></div><div class="field"><label for="fHora">Hora de inicio</label><input id="fHora" type="time" required value="' + toISOTime(inicio0) + '"></div></div><div class="field"><label>Duración</label><div class="opts" id="durOpts">' + [30, 45, 60, 90, 120, 180, 240].map(d => '<button type="button" class="opt' + ((it ? it.duracion : (pre.duracion || 60)) === d ? ' on' : '') + '" data-act="opt-dur" data-v="' + d + '">' + (d < 60 ? d + ' min' : Math.floor(d / 60) + ' h' + (d % 60 ? ' ' + (d % 60) + ' min' : '')) + '</button>').join('') + '</div><input type="hidden" id="fDur" value="' + (it ? it.duracion : (pre.duracion || 60)) + '"></div></div>' +
    '<div class="fsec"><h3>¿Quiénes?</h3><div class="field"><label for="fDueño">Responsable</label><select id="fDueño">' + act.map(p => '<option value="' + p.id + '"' + (dueño0 === p.id ? ' selected' : '') + '>' + esc(p.nombre) + ' · ' + esc(p.funcion.split(':')[0]) + '</option>').join('') + '</select></div><div class="field"><label>Participantes</label><div class="ppl" id="pplOpts">' + act.map(p => '<button type="button" class="pbtn' + (personas0.includes(p.id) ? ' on' : '') + '" data-act="opt-persona" data-v="' + p.id + '">' + av(p.id) + esc(p.nombre) + '</button>').join('') + '</div></div></div>' +
    '<div class="fsec" id="secContenido" style="display:' + (tipo0 === 'Publicación' ? '' : 'none') + '"><h3>Registro de contenido</h3><div class="field"><label>Plataforma</label><div class="opts" id="platOpts">' + PLATAFORMAS.map(pl => '<button type="button" class="opt' + ((it && it.plataforma) === pl ? ' on' : '') + '" data-act="opt-plat" data-v="' + pl + '">' + pl + '</button>').join('') + '</div><input type="hidden" id="fPlat" value="' + esc(it && it.plataforma ? it.plataforma : '') + '"></div><div class="grid2"><div class="field"><label for="fLinks">Links enviados</label><input id="fLinks" type="number" min="0" value="' + (it && it.links ? it.links : 0) + '"></div><div class="field"><label for="fCom">Comentarios respondidos</label><input id="fCom" type="number" min="0" value="' + (it && it.comentariosResp ? it.comentariosResp : 0) + '"></div></div><div class="field"><label for="fEnlacePub">Enlace de la publicación</label><input id="fEnlacePub" value="' + esc(it && it.enlacePub ? it.enlacePub : '') + '" placeholder="https://…"></div>' + (!it || it.estado !== 'hecha' ? '<label class="check"><input type="checkbox" id="fHecha"> Ya quedó hecha (para registrar trabajo realizado)</label>' : '') + '</div>' +
    '<div class="fsec" id="secLugar" style="display:' + (ES_TAREA(tipo0) || tipo0 === 'Publicación' ? 'none' : '') + '"><h3>¿Dónde?</h3><div class="field"><input id="fLugar" value="' + esc(it ? it.lugar : (pre.lugar || '')) + '" placeholder="Sede, estudio o enlace de reunión" aria-label="Lugar"></div><div class="opts">' + ['Sede Salitre', 'Estudio', 'Google Meet', 'Por definir'].map(l => '<button type="button" class="opt" data-act="opt-lugar" data-v="' + l + '">' + l + '</button>').join('') + '</div></div>' +
    '<details class="more"><summary>Agregar detalles</summary><div class="fsec" style="margin-top:8px"><div class="field"><label for="fProyecto">Proyecto</label><input id="fProyecto" list="proyectosLista" value="' + esc(it ? it.proyecto : '') + '" placeholder="Ej. Apertura sede Salitre"><datalist id="proyectosLista">' + DB.proyectos.map(p => '<option value="' + esc(p.nombre) + '">').join('') + '</datalist></div><div class="field"><label for="fNota">Guion, referencias o indicaciones</label><textarea id="fNota" placeholder="Ej. Revisa el guion antes de llegar">' + esc(it ? it.nota : '') + '</textarea></div><div class="field"><label for="fEnlace">Enlace de reunión (si es virtual)</label><input id="fEnlace" value="' + esc(it ? it.enlace : '') + '" placeholder="https://meet.google.com/…"></div><label class="btn sm" style="align-self:flex-start">Adjuntar archivo<input type="file" hidden id="fArchivo"></label><span class="small muted" id="fArchivoNombre"></span></div></details>' +
    '<div id="crucesBox"></div><p class="small muted" style="font-weight:600">La disponibilidad sale de lo registrado aquí. No incluye compromisos personales ni calendarios externos.</p>' +
    '<div class="btn-row stack"><button type="submit" class="btn primary" id="btnGuardar">' + (esNueva ? 'Crear actividad' : 'Guardar cambios') + '</button><button type="button" class="btn" data-act="cerrar">Cancelar</button></div></form>';
  openPanel(h, E(emp0).c); revisarCruces();
}
function leerForm() {
  const f = $('#form'); const fecha = $('#fFecha').value, hora = $('#fHora').value; if (!fecha || !hora) return null;
  const [y, m, d] = fecha.split('-').map(Number); const [hh, mm] = hora.split(':').map(Number);
  const personas = [...f.querySelectorAll('#pplOpts .pbtn.on')].map(b => b.dataset.v); const dueño = $('#fDueño').value; if (!personas.includes(dueño)) personas.unshift(dueño);
  const hechaBox = $('#fHecha');
  const empresas = [...f.querySelectorAll('#empOpts .opt.on')].map(b => b.dataset.v);
  return { nombre: $('#fNombre').value.trim(), tipo: $('#fTipo').value, empresa: empresas[0] || '', empresas, proyecto: $('#fProyecto').value.trim(), inicio: new Date(y, m - 1, d, hh, mm, 0, 0), duracion: Number($('#fDur').value), dueño, personas, lugar: $('#fLugar').value.trim(), nota: $('#fNota').value.trim(), enlace: $('#fEnlace').value.trim(), plataforma: $('#fPlat').value, links: Number($('#fLinks').value) || 0, comentariosResp: Number($('#fCom').value) || 0, enlacePub: $('#fEnlacePub').value.trim(), hechaNow: !!(hechaBox && hechaBox.checked) };
}
function revisarCruces() {
  const box = $('#crucesBox'); if (!box) return; const d = leerForm(); if (!d) { box.innerHTML = ''; return; }
  const id = $('#form').dataset.id || null; const cr = cruces(id, d.inicio, addMin(d.inicio, d.duracion), d.personas); const btn = $('#btnGuardar');
  if (!cr.length) { box.innerHTML = '<div class="note ok">✓ Sin cruces: todos están libres a esa hora.</div>'; btn.textContent = id ? 'Guardar cambios' : 'Crear actividad'; return; }
  box.innerHTML = '<div class="note warn"><b>⚠️ Cruce de horario</b><div class="list" style="gap:6px;margin-top:8px">' + cr.map(c => '<div class="conf" style="background:var(--surface)">' + av(c.persona) + '<span class="n"><b>' + esc(nombre(c.persona)) + '</b> ya tiene “' + esc(c.otra.nombre) + '” · ' + esc(E(c.otra.empresa).nombre) + '<div class="small muted num">' + cap(fFecha(c.otra.inicio)) + ' · ' + fHora(c.otra.inicio) + ' a ' + fHora(fin(c.otra)) + '</div></span></div>').join('') + '</div><div class="btn-row" style="margin-top:10px"><button type="button" class="btn sm" data-act="otro-horario">Elegir otra hora</button></div><p class="small" style="margin-top:8px">O guarda de todos modos: la decisión es del responsable.</p></div>';
  btn.textContent = 'Guardar de todos modos';
}
async function guardarForm() {
  const d = leerForm(); if (!d || !d.nombre) { toast('Falta el nombre o la fecha.'); $('#fNombre').focus(); return; }
  if (!d.empresas.length) { toast('Elige al menos una empresa.'); return; }
  const id = $('#form').dataset.id; const btn = $('#btnGuardar'); const txt = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Guardando…';
  try {
    const r = await api(id ? 'PUT' : 'POST', id ? '/api/items/' + id : '/api/items', d);
    const nuevoId = id || r.id; const fa = $('#fArchivo');
    if (fa && fa.files && fa.files[0]) { try { await subirArchivo(nuevoId, fa.files[0]); } catch (e) { toast('La actividad se guardó, pero el archivo no: ' + e.message); } }
    await cargar(); state.fecha = soloDia(d.inicio); render();
    const it = I(nuevoId); const otros = it ? it.personas.filter(p => p !== yo().id) : [];
    if (!id) { closePanel(); toast(d.hechaNow ? 'Registrada. Ya cuenta en los reportes.' : 'Listo: quedó en la agenda. Te avisamos ' + offsetsDe(it).map(o => OFFSET_LABELS[o].replace(' antes', '')).join(', ') + ' antes.' + (otros.length ? ' ' + otros.map(nombre).join(' y ') + (otros.length === 1 ? ' recibió' : ' recibieron') + ' el aviso para confirmar.' : ''), true); }
    else { closePanel(); panelItem(nuevoId); toast(r.movida && otros.length ? 'Se movió. Se pidió confirmar de nuevo y se reprogramaron los recordatorios.' : 'Cambios guardados.', true); }
  } catch (e) { toast(e.message); btn.disabled = false; btn.innerHTML = txt; }
}
async function subirArchivo(itemId, file) {
  if (file.size > 25 * 1024 * 1024) throw new Error('El archivo supera 25 MB.');
  const r = await fetch('/api/items/' + encodeURIComponent(itemId) + '/archivos?nombre=' + encodeURIComponent(file.name), { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' }, credentials: 'same-origin' });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'No se pudo subir el archivo.'); }
}
async function moverPorArrastre(id, nuevoInicio) {
  const it = I(id); if (!puedeEditar(it)) { toast('No puedes mover esta actividad. Pídele el cambio a ' + nombre(it.dueño) + '.'); return; }
  if (it.inicio.getTime() === nuevoInicio.getTime()) return;
  await accion('PUT', '/api/items/' + id, { inicio: nuevoInicio }, { toast: r => 'Se movió a ' + diaLabel(nuevoInicio).toLowerCase() + ' ' + fHora(nuevoInicio) + (it.personas.length > 1 ? '. Se pidió confirmar de nuevo y se reprogramaron los recordatorios.' : '.') });
}
function panelMotivo(titulo, sub, id, accionNombre, btnTxt) { openPanel(ptop(titulo, sub) + '<div class="field"><label for="motivo">Cuéntanos por qué (opcional)</label><textarea id="motivo" placeholder="Ej. Tengo otra grabación a esa hora"></textarea></div><div class="btn-row stack"><button class="btn primary" data-act="motivo-ok" data-accion="' + accionNombre + '" data-id="' + id + '">' + btnTxt + '</button><button class="btn" data-act="ver" data-id="' + id + '">Volver</button></div>'); }
function panelAjustarRec(id) { const it = I(id); const cur = offsetsDe(it); openPanel(ptop('Recordatorios de esta actividad', esc(it.nombre)) + '<p class="small muted" style="font-weight:700">Los del equipo son: ' + DB.offsetsEquipo.slice().sort((a, b) => b - a).map(o => OFFSET_LABELS[o]).join(', ') + '.</p><div class="checks">' + Object.keys(OFFSET_LABELS).map(Number).sort((a, b) => b - a).map(o => '<label class="check"><input type="checkbox" name="off" value="' + o + '"' + (cur.includes(o) ? ' checked' : '') + '> ' + OFFSET_LABELS[o] + '</label>').join('') + '</div>' + (esAdmin() ? '<label class="check"><input type="checkbox" id="paraEquipo"> Usar estos para todo el equipo</label>' : '') + '<div class="btn-row stack"><button class="btn primary" data-act="guardar-rec" data-id="' + id + '">Guardar</button><button class="btn" data-act="ver" data-id="' + id + '">Volver</button></div>', E(it.empresa).c); }
function panelInvitar() { openPanel(ptop('Invitar a una persona', 'Recibe un enlace seguro que vence en 7 días. Si el correo no está configurado, el enlace te aparece aquí para enviarlo por WhatsApp.') + '<form id="formInv" style="display:flex;flex-direction:column;gap:12px"><div class="grid2"><div class="field"><label for="iNombre">Nombre</label><input id="iNombre" required placeholder="Nombre y apellido"></div><div class="field"><label for="iCorreo">Correo</label><input id="iCorreo" type="email" required placeholder="persona@correo.com"></div></div><div class="grid2"><div class="field"><label for="iRol">Función</label><select id="iRol"><option>Colaborador</option><option>Coordinador</option><option>Líder</option><option>Administrador</option></select></div><div class="field"><label for="iFuncion">Cargo</label><input id="iFuncion" placeholder="Ej. Fotógrafo"></div></div><div class="field"><label>Empresas</label><div class="opts" id="invEmp">' + DB.empresas.map(e => '<button type="button" class="opt emp" style="--c:' + e.c + '" data-act="opt-multi" data-v="' + e.id + '">' + esc(e.nombre) + '</button>').join('') + '</div></div><div class="note">Si el correo ya está en el equipo, no se crea otra cuenta: se agrega a las empresas con su cuenta existente.</div><div class="btn-row stack"><button type="submit" class="btn primary">Crear invitación</button><button type="button" class="btn" data-act="cerrar">Cancelar</button></div></form>'); }
function panelEnlace(r, p) { openPanel(ptop('Enlace de acceso para ' + esc(p.nombre), (r.correoEnviado ? '✓ ' : '') + esc(r.detalle)) + '<div class="note ' + (r.correoEnviado ? 'ok' : 'info') + '">Vence ' + diaLabel(r.vence).toLowerCase() + '. Quien lo abra crea su contraseña y entra de una vez.</div><div class="field"><label for="enlace">Enlace</label><input id="enlace" readonly value="' + esc(r.enlace) + '"></div><div class="btn-row stack"><button class="btn primary" data-act="copiar-enlace">Copiar enlace</button><a class="btn" href="https://wa.me/?text=' + encodeURIComponent('Hola ' + p.nombre + ', este es tu acceso a la Agenda del Grupo (vence en 7 días): ' + r.enlace) + '" target="_blank" rel="noopener">Enviar por WhatsApp</a><button class="btn" data-act="cerrar">Listo</button></div>'); }
function panelEditarPersona(pid) { const p = P(pid); const admin = esAdmin(); openPanel(ptop('Editar a ' + esc(p.nombre), 'Datos, función y empresas.') + '<div class="grid2"><div class="field"><label for="cfNombre">Nombre</label><input id="cfNombre" value="' + esc(p.nombre) + '"></div><div class="field"><label for="cfCorreo">Correo</label><input id="cfCorreo" type="email" value="' + esc(p.correo) + '" placeholder="persona@correo.com"></div></div>' + (admin ? '<div class="field"><label for="cfFuncion">Cargo o responsabilidad</label><input id="cfFuncion" value="' + esc(p.funcion) + '"></div>' : '') + '<div class="field"><label>Foto</label><div class="meta">' + av(p.id, 'xl') + '<label class="btn sm">Subir foto<input type="file" accept="image/*" hidden id="cfFoto" data-act="foto" data-id="' + p.id + '"></label></div></div>' + (admin ? '<div class="field"><label for="cfRol">Función en la plataforma</label><select id="cfRol">' + ['Colaborador', 'Coordinador', 'Líder', 'Administrador'].map(r => '<option' + (p.rol === r ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></div><div class="field"><label>Empresas</label><div class="opts" id="cfEmp">' + DB.empresas.map(e => '<button type="button" class="opt emp' + (p.empresas.includes(e.id) ? ' on' : '') + '" style="--c:' + e.c + '" data-act="opt-multi" data-v="' + e.id + '">' + esc(e.nombre) + '</button>').join('') + '</div></div><div class="note">Colaborador: ve la agenda, se agenda, responde y entrega. Coordinador: además organiza actividades con otros. Líder: edita actividades de sus empresas y aprueba entregas. Administrador: todo, incluido el directorio.</div>' : '') + '<div class="btn-row stack"><button class="btn primary" data-act="confirmar-persona" data-id="' + pid + '">Guardar</button><button class="btn" data-act="cerrar">Cancelar</button></div>'); }
function panelDesactivar(pid) { const p = P(pid); const pend = DB.items.filter(i => i.dueño === pid && activo(i) && ES_TAREA(i.tipo)); openPanel(ptop('Desactivar acceso de ' + esc(p.nombre), 'Se conserva el historial, se detienen sus avisos y se revoca su acceso.') + (pend.length ? '<div class="card flat"><h3>Tareas pendientes para reasignar</h3><div class="list">' + pend.map(t => '<div class="field"><label>' + esc(t.nombre) + ' · ' + esc(E(t.empresa).nombre) + '</label><select data-reasignar="' + t.id + '">' + DB.personas.filter(x => x.estado === 'activo' && x.id !== pid).map(x => '<option value="' + x.id + '">' + esc(x.nombre) + '</option>').join('') + '</select></div>').join('') + '</div></div>' : '<div class="note ok">No tiene tareas pendientes.</div>') + '<div class="btn-row stack"><button class="btn danger" data-act="confirmar-desactivar" data-id="' + pid + '">Desactivar acceso</button><button class="btn" data-act="cerrar">Cancelar</button></div>'); }
function panelPush(paso) {
  paso = paso || 1; const ios = /iPhone|iPad|iPod/.test(navigator.userAgent); const instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let h = ptop('Activar avisos en el celular', 'Abrir la página no los activa: hay que dar permiso y, en iPhone, instalar la app primero.');
  if (!soportaPush()) h += '<div class="note bad">Este navegador no permite avisos push. ' + (ios ? 'En iPhone primero instala la app: Compartir → Agregar a pantalla de inicio, y ábrela desde el ícono.' : 'Prueba con Chrome.') + '</div><div class="btn-row stack"><button class="btn" data-act="instalar">Ver cómo instalar</button><button class="btn" data-act="cerrar">Cerrar</button></div>';
  else if (ios && !instalada) h += '<div class="note info">En iPhone los avisos solo funcionan desde la app instalada.</div><ol class="small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-weight:600"><li>Toca <b>Compartir</b> (cuadrado con flecha).</li><li>Elige <b>Agregar a pantalla de inicio</b>.</li><li>Abre la app desde el ícono nuevo y vuelve a Ajustes → Activar.</li></ol><div class="btn-row stack"><button class="btn" data-act="cerrar">Entendido</button></div>';
  else if (Notification.permission === 'denied') h += '<div class="note bad">Bloqueaste los avisos para esta dirección. Actívalos en la configuración del navegador (candado o ⋮ → Permisos → Notificaciones) y vuelve a intentar.</div><div class="btn-row stack"><button class="btn" data-act="cerrar">Cerrar</button></div>';
  else h += '<p class="small muted" style="font-weight:700">Al tocar el botón, el celular pregunta “¿Permitir notificaciones?”. Toca <b>Permitir</b>.</p><div class="btn-row stack"><button class="btn primary" data-act="push-permiso" id="btnPush">Activar avisos en este dispositivo</button><button class="btn" data-act="cerrar">Ahora no</button></div><p class="small muted" style="font-weight:600">Si no puedes, el correo queda como respaldo.</p>';
  openPanel(h);
}
function b64aUint8(b64) { const pad = '='.repeat((4 - b64.length % 4) % 4); const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))); }
async function activarPush() {
  const btn = $('#btnPush'); if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Activando…'; }
  try {
    const k = await api('GET', '/api/push/clave'); if (!k.clave) throw new Error('El servidor no tiene la clave push lista: ' + (k.detalle || ''));
    const perm = await Notification.requestPermission(); if (perm !== 'granted') throw new Error('No diste permiso. Seguirás recibiendo avisos en la app y por correo.');
    const reg = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription(); if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aUint8(k.clave) });
    await api('POST', '/api/push/suscribir', sub.toJSON());
    await cargar(); render(); closePanel(); toast('Listo: este dispositivo recibe avisos aunque la app esté cerrada.', true);
  } catch (e) { toast(e.message || 'No se pudo activar.'); if (btn) { btn.disabled = false; btn.textContent = 'Activar avisos en este dispositivo'; } }
}
async function desactivarPush() { try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); if (sub) { await api('DELETE', '/api/push/suscribir', { endpoint: sub.endpoint }); await sub.unsubscribe(); } else await api('DELETE', '/api/push/suscribir', {}); await cargar(); render(); toast('Avisos del celular desactivados.', true); } catch (e) { toast(e.message); } }
function panelCorreo() {
  const c = DB.canales && DB.canales.correo || {};
  openPanel(ptop('Configurar correo', 'Con esto las invitaciones y los avisos también salen por correo. Se guarda en el servidor; solo se hace una vez.') +
    '<form id="formCorreo" style="display:flex;flex-direction:column;gap:12px"><div class="seg" style="width:fit-content"><button type="button" class="active" data-act="correo-tipo" data-v="brevo">Brevo (gratis, recomendado)</button><button type="button" data-act="correo-tipo" data-v="smtp">Gmail por SMTP</button></div><input type="hidden" id="cTipo" value="brevo">' +
    '<div id="secBrevo" style="display:flex;flex-direction:column;gap:12px"><div class="note info">Railway bloquea el envío directo por Gmail en los planes gratis y Hobby. Brevo envía por internet normal, es gratis (300 correos al día) y los correos salen a nombre de tu Gmail.</div>' +
    '<div class="fsec"><h3>1. Crea la cuenta y verifica tu correo (5 minutos)</h3><ol class="small" style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-weight:600"><li>Entra a <a href="https://www.brevo.com" target="_blank" rel="noopener">brevo.com</a> y crea una cuenta gratis con tu Gmail.</li><li>En Brevo: menú de la izquierda <b>Senders &amp; IP</b> (o tu perfil → <b>Senders, Domains &amp; Dedicated IPs</b>) → <b>Senders</b> → <b>Add a sender</b>. Pon tu nombre y tu Gmail. Brevo te manda un código al correo: confírmalo.</li><li>Arriba a la derecha, tu perfil → <b>SMTP &amp; API</b> → pestaña <b>API Keys</b> → <b>Generate a new API key</b> → nombre “Agenda” → copia la clave (empieza por <b>xkeysib-</b>). Solo se muestra una vez.</li></ol></div>' +
    '<div class="fsec"><h3>2. Pégalo aquí</h3><div class="field"><label for="cFrom">Correo remitente (el que verificaste en Brevo)</label><input id="cFrom" type="email" value="' + esc(c.cuenta || yo().correo || '') + '" placeholder="nombre@gmail.com" autocomplete="off"></div><div class="field"><label for="cKey">Clave API de Brevo</label><input id="cKey" type="text" placeholder="xkeysib-…" autocomplete="off" spellcheck="false"></div></div></div>' +
    '<div id="secSmtp" style="display:none;flex-direction:column;gap:12px"><div class="note warn">Solo funciona si tu Railway es plan Pro (los planes gratis y Hobby bloquean los puertos de correo). Si no estás seguro, usa Brevo.</div><div class="fsec"><div class="field"><label for="cUser">Cuenta de Gmail</label><input id="cUser" type="email" placeholder="nombre@gmail.com" autocomplete="off"></div><div class="field"><label for="cPass">Contraseña de aplicación (16 letras)</label><input id="cPass" type="text" placeholder="abcd efgh ijkl mnop" autocomplete="off" spellcheck="false"></div><details class="more"><summary>Otro proveedor SMTP</summary><div class="grid2" style="margin-top:8px"><div class="field"><label for="cHost">Servidor SMTP</label><input id="cHost" placeholder="smtp.ejemplo.com"></div><div class="field"><label for="cPort">Puerto</label><input id="cPort" type="number" placeholder="587"></div></div></details></div></div>' +
    '<div class="note">Al guardar probamos la conexión y te enviamos un correo de prueba. Si algo falla, aquí te decimos por qué.</div>' +
    '<div class="btn-row stack"><button type="submit" class="btn primary" id="btnCorreo">Guardar y probar</button><button type="button" class="btn" data-act="cerrar">Cancelar</button></div></form>');
}
function panelInstalar() { openPanel(ptop('Instalar en el celular', 'Se abre desde la pantalla de inicio como una app.') + '<div class="card flat"><h3>Android (Chrome)</h3><p class="small" style="font-weight:600">Menú <b>⋮</b> → <b>Instalar app</b> (o “Agregar a pantalla de inicio”) → Confirmar.</p></div><div class="card flat"><h3>iPhone (Safari)</h3><p class="small" style="font-weight:600"><b>Compartir</b> → <b>Agregar a pantalla de inicio</b>. Luego abre la app desde el ícono y activa los avisos en Ajustes.</p></div><div class="btn-row stack"><button class="btn primary" data-act="cerrar">Entendido</button></div>'); }
function panelGuia() { const pf = DB.prefs; openPanel(ptop('¡Hola, ' + esc(yo().nombre) + '!', 'Tres cosas para empezar. Puedes volver aquí desde Ajustes.') + '<div class="card flat"><h3>1. Tu perfil</h3><p class="small muted" style="font-weight:600">' + esc(yo().funcion) + ' · ' + yo().empresas.map(e => E(e).nombre).join(', ') + '.</p><button class="btn sm" style="align-self:flex-start" data-act="editar-persona" data-id="' + yo().id + '">Revisar mis datos y foto</button></div><div class="card flat"><h3>2. Avisos en tu celular</h3><p class="small muted" style="font-weight:600">Correo ' + (pf.correo && yo().correo ? 'activo' : 'sin configurar') + ' · celular ' + (DB.push.dispositivos ? 'activo' : 'sin activar') + '.</p><button class="btn sm primary" style="align-self:flex-start" data-act="activar-push">Activar avisos en el celular</button></div><div class="card flat"><h3>3. Así funciona</h3><p class="small muted" style="font-weight:600">En <b>Inicio</b> ves tu día. En <b>Equipo</b> está la agenda de las ' + DB.empresas.length + ' empresas: toca una hora libre (o el botón <b>Crear</b>) para agendarte. Quien agregues recibe el aviso y confirma. En <b>Reportes</b> queda el registro del contenido publicado y los links enviados.</p></div><div class="btn-row stack"><button class="btn primary" data-act="guia-fin">Empezar</button></div>'); }

/* ---------- Acciones ---------- */
document.addEventListener('click', async e => {
  if (e.target === $('#overlay')) { closePanel(); return; }
  const el = e.target.closest('[data-act]'); if (!el) return; if (el.tagName === 'INPUT') return;
  const act = el.dataset.act, id = el.dataset.id; const u = yo() ? yo().id : null;
  switch (act) {
    case 'go': go(el.dataset.view); break;
    case 'cerrar': closePanel(); break;
    case 'salir': try { await api('POST', '/api/salir'); } catch (err) { } location.href = '/entrar'; break;
    case 'ver': { const n = DB.avisos.filter(x => x.itemId === id && !x.leida).map(x => x.id); panelItem(id); if (n.length) { api('POST', '/api/avisos/leer', { ids: n }).then(() => { DB.avisos.forEach(x => { if (n.includes(x.id)) x.leida = true; }); renderNav(); }).catch(() => { }); } break; }
    case 'crear': { try { await cargar(); } catch (err) { } const pre = {}; if (el.dataset.tipo) pre.tipo = el.dataset.tipo; if (el.dataset.fecha) { const [y, m, d] = el.dataset.fecha.split('-').map(Number); pre.inicio = new Date(y, m - 1, d, 10, 0, 0, 0); } panelForm(null, pre); break; }
    case 'slot': { if (e.target.closest('.blk')) break; const rect = el.getBoundingClientRect(); const y = e.clientY - rect.top; const mins = Math.floor(y / 64 * 2) / 2 * 60; const [yy, mm, dd] = el.dataset.fecha.split('-').map(Number); const inicio = new Date(yy, mm - 1, dd, H_INI, 0, 0, 0); inicio.setMinutes(mins); panelForm(null, { inicio, persona: el.dataset.persona || null, tipo: el.dataset.persona === u ? 'Tarea' : 'Reunión' }); break; }
    case 'editar': try { await cargar(); } catch (err) { } panelForm(id); break;
    case 'otro-horario': { const f = $('#fHora'); if (f) { f.focus(); f.scrollIntoView({ block: 'center' }); } break; }
    case 'opt-tipo': { el.parentElement.querySelectorAll('.opt').forEach(o => o.classList.remove('on')); el.classList.add('on'); $('#fTipo').value = el.dataset.v; const s = $('#secLugar'); if (s) s.style.display = (ES_TAREA(el.dataset.v) || el.dataset.v === 'Publicación') ? 'none' : ''; const c = $('#secContenido'); if (c) c.style.display = el.dataset.v === 'Publicación' ? '' : 'none'; break; }
    case 'opt-plat': { el.parentElement.querySelectorAll('.opt').forEach(o => o.classList.remove('on')); el.classList.add('on'); $('#fPlat').value = el.dataset.v; break; }
    case 'opt-emp': { el.classList.toggle('on'); const sel = [...el.parentElement.querySelectorAll('.opt.on')]; if (!sel.length) { el.classList.add('on'); toast('Debe quedar al menos una empresa.'); } $('#panel').style.setProperty('--c', E(el.parentElement.querySelector('.opt.on').dataset.v).c); break; }
    case 'opt-dur': { el.parentElement.querySelectorAll('.opt').forEach(o => o.classList.remove('on')); el.classList.add('on'); $('#fDur').value = el.dataset.v; revisarCruces(); break; }
    case 'opt-persona': el.classList.toggle('on'); revisarCruces(); break;
    case 'opt-lugar': $('#fLugar').value = el.dataset.v; break;
    case 'opt-multi': el.classList.toggle('on'); break;
    case 'confirmar': { const it = I(id); const txt = el.innerHTML; el.disabled = true; el.innerHTML = '<span class="spin"></span>'; const r = await accion('POST', '/api/items/' + id + '/accion', { accion: 'confirmar' }, { reabrir: $('#overlay').classList.contains('open') ? id : null, toast: 'Asistencia confirmada. ' + nombre(it.dueño) + ' ya lo sabe.' }); if (!r) { el.disabled = false; el.innerHTML = txt; } break; }
    case 'no-puedo': panelMotivo('No puedo asistir', 'Le avisamos a ' + nombre(I(id).dueño) + ' para que lo resuelva.', id, 'no_puedo', 'Enviar'); break;
    case 'pedir-cambio': panelMotivo('Pedir otra hora', 'No cambia la actividad: ' + nombre(I(id).dueño) + ' revisa y decide.', id, 'cambio', 'Enviar solicitud'); break;
    case 'cancelar-item': panelMotivo('Cancelar actividad', 'Se avisa a los participantes y se detienen sus recordatorios.', id, 'cancelar', 'Cancelar actividad'); break;
    case 'bloquear': panelMotivo('Reportar bloqueo', 'Le avisamos al líder para que ayude a destrabarla.', id, 'bloquear', 'Reportar'); break;
    case 'pedir-ajustes': panelMotivo('Pedir ajustes', 'Describe qué debe cambiar.', id, 'ajustes', 'Enviar'); break;
    case 'motivo-ok': { const a = el.dataset.accion; const motivo = ($('#motivo') || {}).value || ''; const msgs = { no_puedo: 'Enviado a ' + nombre(I(id).dueño) + '.', cambio: 'Solicitud enviada. ' + nombre(I(id).dueño) + ' decide.', cancelar: 'Cancelada. Participantes avisados, recordatorios detenidos.', bloquear: 'Bloqueo reportado.', ajustes: 'Ajustes pedidos.' }; el.disabled = true; await accion('POST', '/api/items/' + id + '/accion', { accion: a, motivo }, { toast: msgs[a] }); break; }
    case 'hecha': { const btn = el.classList.contains('checkbtn') ? el : null; if (btn) btn.classList.add('on'); else { el.disabled = true; } await accion('POST', '/api/items/' + id + '/accion', { accion: 'hecha' }, { reabrir: $('#overlay').classList.contains('open') ? id : null, toast: '✓ Hecha. Recordatorios detenidos.' }); break; }
    case 'entregar': { const it = I(id); await accion('POST', '/api/items/' + id + '/accion', { accion: 'entregar' }, { reabrir: id, toast: 'Entregada. ' + nombre(it.revisor || responsablesDe(it.empresa).find(x => x !== u) || 'el líder') + ' recibió el aviso.' }); break; }
    case 'desbloquear': await accion('POST', '/api/items/' + id + '/accion', { accion: 'desbloquear' }, { reabrir: id, toast: 'Desbloqueada.' }); break;
    case 'aprobar': { const it = I(id); await accion('POST', '/api/items/' + id + '/accion', { accion: 'aprobar' }, { reabrir: id, toast: 'Aprobada. Se avisó a ' + nombre(it.dueño) + '.' }); break; }
    case 'comentar': { const t = $('#comentario').value.trim(); if (!t) { toast('Escribe el comentario primero.'); break; } await accion('POST', '/api/items/' + id + '/accion', { accion: 'comentar', texto: t }, { reabrir: id, toast: 'Comentario publicado.' }); break; }
    case 'ajustar-rec': panelAjustarRec(id); break;
    case 'guardar-rec': { const offs = [...document.querySelectorAll('input[name=off]:checked')].map(i => Number(i.value)); if (!offs.length) { toast('Elige al menos un recordatorio.'); break; } const eq = $('#paraEquipo'); await accion('POST', '/api/items/' + id + '/accion', { accion: 'recordatorios', offsets: offs, paraEquipo: !!(eq && eq.checked) }, { reabrir: id, toast: 'Recordatorios guardados.' }); break; }
    case 'abrir-aviso': { const n = DB.avisos.find(x => x.id === Number(id)); if (!n) break; n.leida = true; api('POST', '/api/avisos/leer', { ids: [n.id] }).catch(() => { }); if (n.itemId && I(n.itemId)) panelItem(n.itemId); else if (esAdmin() && /correo|canal/i.test(n.titulo)) go('directorio'); else openPanel(ptop(esc(n.titulo), relativo(n.fecha)) + '<p style="white-space:pre-line;font-weight:600">' + esc(n.cuerpo) + '</p><div class="btn-row stack"><button class="btn primary" data-act="cerrar">Entendido</button></div>'); renderNav(); break; }
    case 'leer-todo': await accion('POST', '/api/avisos/leer', { todos: true }, { toast: 'Todo marcado como leído.' }); break;
    case 'fecha': { const [y, m, d] = el.dataset.fecha.split('-').map(Number); state.fecha = new Date(y, m - 1, d); render(); break; }
    case 'ir-dia': { const [y, m, d] = el.dataset.fecha.split('-').map(Number); state.fecha = new Date(y, m - 1, d); state.calMode = 'dia'; render(); break; }
    case 'nav': { const dir = Number(el.dataset.dir); const f = new Date(state.fecha); if (!isMobile() && state.calMode === 'semana') f.setDate(f.getDate() + 7 * dir); else if (!isMobile() && state.calMode === 'mes') f.setMonth(f.getMonth() + dir); else f.setDate(f.getDate() + dir); state.fecha = f; render(); break; }
    case 'hoy': state.fecha = soloDia(now); render(); break;
    case 'modo': state.calMode = el.dataset.modo; render(); break;
    case 'comparar': { const i = state.comparar.indexOf(id); if (i >= 0) state.comparar.splice(i, 1); else state.comparar.push(id); render(); break; }
    case 'femp': state.filtroEmp = el.dataset.emp; render(); break;
    case 'rep-periodo': state.repPeriodo = el.dataset.v; render(); break;
    case 'rep-emp': state.repEmp = el.dataset.emp; render(); break;
    case 'rep-persona': state.repPersona = (state.repPersona === id ? '' : id); render(); break;
    case 'copiar-reporte': { const txt = textoReporte(); try { await navigator.clipboard.writeText(txt); toast('Resumen copiado.', true); } catch (err) { openPanel(ptop('Resumen del reporte', 'Selecciona el texto y cópialo.') + '<textarea style="width:100%;min-height:260px;font:inherit;font-size:14px;border:1px solid var(--line);border-radius:12px;padding:10px;background:var(--surface);color:var(--text)">' + esc(txt) + '</textarea><div class="btn-row stack"><button class="btn" data-act="cerrar">Cerrar</button></div>'); } break; }
    case 'toggle': { const k = el.dataset.key; const pf = DB.prefs; const body = {}; if (k === 'correo') body.correo = !pf.correo; else if (k === 'resumen') body.resumen = !pf.resumen; else if (k === 'descanso') body.descanso = Object.assign({}, pf.descanso, { on: !pf.descanso.on }); else if (k === 'recCitas') body.recCitas = !pf.recCitas; else if (k === 'recTareas') body.recTareas = !pf.recTareas; await accion('PUT', '/api/prefs', body, { toast: 'Preferencia guardada.', cerrar: false }); break; }
    case 'activar-push': panelPush(1); break;
    case 'push-permiso': activarPush(); break;
    case 'desactivar-push': desactivarPush(); break;
    case 'instalar': panelInstalar(); break;
    case 'guia': panelGuia(); break;
    case 'guia-fin': try { localStorage.setItem('ag-guia-' + u, '1'); } catch (err) { } closePanel(); break;
    case 'invitar': try { await cargar(); } catch (err) { } panelInvitar(); break;
    case 'enlace-acceso': { const p = P(id); el.disabled = true; try { const r = await api('POST', '/api/personas/' + id + '/accion', { accion: 'enlace' }); await cargar(); render(); panelEnlace(r, p); } catch (err) { toast(err.message); el.disabled = false; } break; }
    case 'copiar-enlace': { const v = $('#enlace').value; try { await navigator.clipboard.writeText(v); toast('Enlace copiado.', true); } catch (err) { $('#enlace').select(); toast('Selecciona el enlace y cópialo.'); } break; }
    case 'cancelar-inv': await accion('POST', '/api/personas/' + id + '/accion', { accion: 'cancelar_invitacion' }, { toast: 'Invitación retirada.' }); break;
    case 'reactivar': await accion('POST', '/api/personas/' + id + '/accion', { accion: 'reactivar' }, { toast: nombre(id) + ' reactivado.' }); break;
    case 'editar-persona': panelEditarPersona(id); break;
    case 'editar-persona-yo': panelEditarPersona(u); break;
    case 'confirmar-persona': { const body = { nombre: $('#cfNombre').value, correo: $('#cfCorreo').value }; if (esAdmin()) { body.funcion = $('#cfFuncion').value; body.rol = $('#cfRol').value; body.empresas = [...document.querySelectorAll('#cfEmp .opt.on')].map(b => b.dataset.v); } el.disabled = true; await accion('PUT', '/api/personas/' + id, body, { toast: 'Datos actualizados.' }); break; }
    case 'desactivar': panelDesactivar(id); break;
    case 'confirmar-desactivar': { const reas = {}; document.querySelectorAll('[data-reasignar]').forEach(s => reas[s.dataset.reasignar] = s.value); el.disabled = true; await accion('POST', '/api/personas/' + id + '/accion', { accion: 'desactivar', reasignaciones: reas }, { toast: nombre(id) + ' quedó desactivado. Historial conservado, acceso revocado, avisos detenidos.' }); break; }
    case 'config-correo': panelCorreo(); break;
    case 'correo-tipo': { el.parentElement.querySelectorAll('button').forEach(x => x.classList.remove('active')); el.classList.add('active'); $('#cTipo').value = el.dataset.v; $('#secBrevo').style.display = el.dataset.v === 'brevo' ? 'flex' : 'none'; $('#secSmtp').style.display = el.dataset.v === 'smtp' ? 'flex' : 'none'; break; }
    case 'nueva-empresa': panelEmpresa(null); break;
    case 'editar-empresa': panelEmpresa(id); break;
    case 'eliminar-empresa': el.disabled = true; await accion('DELETE', '/api/empresas/' + id, {}, { toast: 'Empresa eliminada.' }); break;
    case 'quitar-correo': el.disabled = true; await accion('DELETE', '/api/admin/correo', {}, { toast: 'Cuenta de correo retirada.', cerrar: false }); break;
    case 'probar-correo': { el.disabled = true; try { const r = await api('POST', '/api/admin/probar-correo'); toast(r.mensaje, true); } catch (err) { toast(err.message); } el.disabled = false; break; }
    case 'guardar-offsets': { const offs = [...document.querySelectorAll('input[data-act="offset-equipo"]:checked')].map(i => Number(i.value)); await accion('PUT', '/api/config/offsets', { offsets: offs }, { toast: 'Recordatorios del equipo guardados.', cerrar: false }); break; }
  }
});
document.addEventListener('change', async e => {
  const el = e.target; const act = el.dataset.act;
  if (el.closest && el.closest('#form')) { if (el.id === 'fArchivo' && el.files[0]) $('#fArchivoNombre').textContent = '📎 ' + el.files[0].name; else revisarCruces(); return; }
  if (act === 'res-hora') await accion('PUT', '/api/prefs', { resumenHora: el.value }, { toast: 'Resumen diario a las ' + el.value + '.', cerrar: false });
  else if (act === 'desc') { const d = Object.assign({}, DB.prefs.descanso); d[el.dataset.key] = el.value; await accion('PUT', '/api/prefs', { descanso: d }, { toast: 'Horario de descanso guardado.', cerrar: false }); }
  else if (act === 'color-emp') await accion('PUT', '/api/empresas/' + el.dataset.id, { color: el.value }, { toast: 'Color de ' + E(el.dataset.id).nombre + ' actualizado.', cerrar: false });
  else if (act === 'foto') { const f = el.files && el.files[0]; if (!f) return; const img = new Image(); const url = URL.createObjectURL(f); img.onload = async () => { const c = document.createElement('canvas'); const S = 128; c.width = S; c.height = S; const x = c.getContext('2d'); const m = Math.min(img.width, img.height); x.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S); URL.revokeObjectURL(url); try { await api('PUT', '/api/personas/' + el.dataset.id, { foto: c.toDataURL('image/jpeg', .85) }); await cargar(); render(); panelEditarPersona(el.dataset.id); toast('Foto guardada.', true); } catch (err) { toast(err.message); } }; img.src = url; }
  else if (act === 'adjuntar') { const f = el.files && el.files[0]; if (!f) return; toast('Subiendo ' + f.name + '…'); try { await subirArchivo(el.dataset.id, f); await cargar(); render(); panelItem(el.dataset.id); toast('Archivo adjuntado: ' + f.name, true); } catch (err) { toast(err.message); } }
});
document.addEventListener('submit', async e => {
  e.preventDefault();
  if (e.target.id === 'form') { guardarForm(); return; }
  if (e.target.id === 'formCorreo') {
    const btn = $('#btnCorreo'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Probando conexión…';
    const tipo = $('#cTipo').value; const body = tipo === 'brevo' ? { tipo: 'brevo', apiKey: $('#cKey').value, from: $('#cFrom').value } : { tipo: 'smtp', user: $('#cUser').value, pass: $('#cPass').value, host: ($('#cHost').value || '').trim(), port: $('#cPort').value };
    try { const r = await api('POST', '/api/admin/correo', body); await cargar(); render(); closePanel(); toast('Correo configurado. ' + (r.prueba || ''), true); }
    catch (err) { toast(err.message); btn.disabled = false; btn.textContent = 'Guardar y probar'; }
    return;
  }
  if (e.target.id === 'formEmp') {
    const id = e.target.dataset.id; const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true;
    const body = { nombre: $('#eNombre').value, color: $('#eColor').value }; if (!id) body.agregarme = $('#eAgregarme').checked;
    await accion(id ? 'PUT' : 'POST', id ? '/api/empresas/' + id : '/api/empresas', body, { toast: id ? 'Empresa actualizada.' : 'Empresa agregada.' }); btn.disabled = false;
    return;
  }
  if (e.target.id === 'formInv') {
    const btn = e.target.querySelector('button[type=submit]'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Creando…';
    const body = { nombre: $('#iNombre').value, correo: $('#iCorreo').value, rol: $('#iRol').value, funcion: $('#iFuncion').value, empresas: [...document.querySelectorAll('#invEmp .opt.on')].map(b => b.dataset.v) };
    try { const r = await api('POST', '/api/personas', body); await cargar(); render(); if (r.existente) { closePanel(); toast(r.mensaje, true); } else panelEnlace(r, P(r.id)); }
    catch (err) { toast(err.message); btn.disabled = false; btn.textContent = 'Crear invitación'; }
  }
});
let dragId = null;
document.addEventListener('dragstart', e => { const b = e.target.closest && e.target.closest('.blk'); if (!b) return; dragId = b.dataset.id; b.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', dragId); } catch (err) { } });
document.addEventListener('dragend', () => { document.querySelectorAll('.blk.dragging').forEach(b => b.classList.remove('dragging')); document.querySelectorAll('.col.drop').forEach(c => c.classList.remove('drop')); });
document.addEventListener('dragover', e => { const c = e.target.closest && e.target.closest('.col'); if (!c || !dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; document.querySelectorAll('.col.drop').forEach(x => x.classList.remove('drop')); c.classList.add('drop'); });
document.addEventListener('drop', e => { const c = e.target.closest && e.target.closest('.col'); if (!c || !dragId) return; e.preventDefault(); const rect = c.getBoundingClientRect(); const y = e.clientY - rect.top; const mins = Math.max(0, Math.floor(y / 64 * 2) / 2 * 60); const [yy, mm, dd] = c.dataset.fecha.split('-').map(Number); const inicio = new Date(yy, mm - 1, dd, H_INI, 0, 0, 0); inicio.setMinutes(mins); const id = dragId; dragId = null; moverPorArrastre(id, inicio); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#overlay').classList.contains('open')) closePanel(); });
window.addEventListener('hashchange', () => { const v = location.hash.replace('#', ''); if (VIEWS[v] && v !== state.view) go(v); });
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(render, 150); });
window.addEventListener('offline', () => $('#offline').classList.add('show')); window.addEventListener('online', () => { $('#offline').classList.remove('show'); cargar().then(render).catch(() => { }); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) cargar().then(render).catch(() => { }); });
setInterval(() => { if (!document.hidden && !$('#overlay').classList.contains('open')) cargar().then(render).catch(() => { }); }, 60000);

/* ---------- Arranque ---------- */
(async function init() {
  const v = location.hash.replace('#', ''); if (VIEWS[v]) state.view = v;
  if (!navigator.onLine) $('#offline').classList.add('show');
  try { await cargar(); } catch (e) { $('#content').innerHTML = '<div class="empty"><span class="big">⚠️</span>' + esc(e.message) + '<button class="btn primary sm" onclick="location.reload()">Reintentar</button></div>'; return; }
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { });
  const params = new URLSearchParams(location.search); const itemId = params.get('item');
  if (itemId && I(itemId)) { panelItem(itemId); try { history.replaceState(null, '', '/' + location.hash); } catch (e) { } }
  else { let vista = false; try { vista = localStorage.getItem('ag-guia-' + yo().id) === '1'; } catch (e) { } if (!vista) panelGuia(); }
})();
