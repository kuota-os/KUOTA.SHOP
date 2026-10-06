// KUOTA CRM de solicitudes: configuración de secciones/pasos y transiciones de estado (puro, sin base de datos)
export const ENTITIES = ['Addi', 'Sistecrédito', 'Banco de Bogotá', 'Brilla', 'Su+ Pay', 'Nequi Créditos', 'Bancolombia Créditos', 'Tarjeta de Crédito'];
const PRODUCT = { key: 'producto', title: 'Foto del producto + IMEI + accesorios', hint: 'Nuevo: mostrarlo en caja por todos lados. Exhibición: encendido y alrededores.', minPhotos: 1, fields: [{ key: 'imei', label: 'IMEI', required: true }] };
const DELIVERED = { key: 'entregado', title: 'Foto del producto entregado', minPhotos: 1, fields: [] };

export const SECTIONS = {
  envio_nacional: {
    label: 'Envíos nacionales', lead_type: 'envio_nacional', doneStage: 'finalizada', finishLabel: 'Envío terminado', doneLabel: 'Envíos finalizados',
    steps: [
      { key: 'transferencia', title: 'Foto de transferencia ya verificada', minPhotos: 1, fields: [] },
      PRODUCT,
      { key: 'empaquetado', title: 'Empaquetado', minPhotos: 1, fields: [] },
      { key: 'transportadora', title: 'Foto en la transportadora + guía', minPhotos: 1, fields: [{ key: 'guia', label: 'Número de guía', required: true }] },
      { key: 'entregado', title: 'Foto del producto entregado', minPhotos: 1, fields: [] }
    ]
  },
  buena_vida: {
    label: 'Buena vida crediticia', lead_type: 'plan_a', needsEntity: true, doneStage: 'finalizada', finishLabel: 'Crédito terminado', doneLabel: 'Créditos Buena Vida Crediticia finalizados', closing: [{ key: 'variant_id', label: 'Dispositivo (catálogo)', required: true, catalog: true }],
    steps: [{ key: 'credito', title: 'Foto de crédito aprobado o transacción verificada', minPhotos: 1, fields: [] }, PRODUCT, DELIVERED]
  },
  reportados: {
    label: 'Reportados / Sin vida crediticia', lead_type: 'plan_b', doneStage: 'cartera', finishLabel: 'Proceso de Crédito terminado', doneLabel: 'Créditos activos / Cartera',
    closing: [{ key: 'variant_id', label: 'Dispositivo (catálogo)', required: true, catalog: true }, { key: 'valor_credito', label: 'Valor del crédito', required: true, money: true }, { key: 'cuota_inicial', label: 'Cuota inicial recibida', required: true, money: true }],
    steps: [{ key: 'credito', title: 'Foto de crédito aprobado + cuota inicial recibida + remisión', minPhotos: 1, fields: [] }, PRODUCT, DELIVERED]
  },
  retoma: {
    label: 'Plan Retoma', lead_type: 'plan_c', doneStage: 'finalizada', finishLabel: 'Retoma terminada', doneLabel: 'Retomas finalizadas', closing: [{ key: 'variant_id', label: 'Dispositivo (catálogo)', required: true, catalog: true }],
    steps: [
      { key: 'recibido', title: 'Dispositivo recibido en parte de pago + valor recibido + IMEI + foto con el cliente', minPhotos: 1, fields: [{ key: 'variant_id', label: 'Dispositivo recibido (elige de la lista)', required: true, catalog: true }, { key: 'valor_recibido', label: 'Valor recibido por el equipo', required: true, money: true }, { key: 'imei_recibido', label: 'IMEI del equipo recibido', required: true }] },
      PRODUCT,
      { key: 'entregado', title: 'Foto del producto entregado + cómo pagó el restante', minPhotos: 1, fields: [
        { key: 'metodo', label: 'Método del restante', required: true, options: ['contado', 'buena_vida', 'reportados'] },
        { key: 'entidad', label: 'Entidad que financia', options: ENTITIES, required: d => d.metodo === 'buena_vida' },
        { key: 'restante', label: 'Restante a financiar', money: true, required: d => d.metodo === 'buena_vida' || d.metodo === 'reportados' },
        { key: 'valor_efectivo', label: 'Valor recibido en efectivo (si no subes comprobante como 2.ª foto)', money: true }
      ] }
    ]
  }
};
export const SECTION_BY_LEAD_TYPE = Object.fromEntries(Object.entries(SECTIONS).map(([k, s]) => [s.lead_type, k]));
export const STAGES = ['en_espera', 'rechazada', 'en_proceso', 'finalizada', 'cartera'];
const MAX_PHOTOS_PER_STEP = 12;

export function sectionOf(lead) {
  const k = SECTION_BY_LEAD_TYPE[lead.lead_type];
  if (!k) throw new Error('SECCION_DESCONOCIDA');
  return { key: k, ...SECTIONS[k] };
}

export function parseDate(s) {
  const m = String(s || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [+m[1], +m[2], +m[3]];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d && y >= 2024 && y <= 2100 ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
const clean = v => String(v ?? '').trim();
function person(input) {
  const by = clean(input.by), date = parseDate(input.date);
  if (by.length < 5 || !/\s/.test(by)) throw new Error('NOMBRE_Y_APELLIDO_REQUERIDOS');
  if (!date) throw new Error('FECHA_INVALIDA');
  return { by, date };
}
const isReq = (f, d) => (typeof f.required === 'function' ? f.required(d) : !!f.required);

export function missingInStep(step, data = {}) {
  const miss = [];
  const files = (data.files || []).length;
  if (files < step.minPhotos) miss.push('foto');
  // Retoma, restante en contado: comprobante (2.ª foto) o valor recibido en efectivo
  if (step.key === 'entregado' && data.fields?.metodo === 'contado' && !clean(data.fields?.valor_efectivo) && files < 2) miss.push('comprobante');
  for (const f of step.fields) {
    const v = clean(data.fields?.[f.key]);
    if (isReq(f, data.fields || {}) && !v) miss.push(f.key);
    if (v && f.options && !f.options.includes(v)) miss.push(f.key);
    if (v && f.money && !(Number(v) > 0)) miss.push(f.key);
  }
  return miss;
}

export function stepsState(lead) {
  const sec = sectionOf(lead), steps = lead.steps || {};
  let prevDone = !sec.needsEntity || !!lead.entity;
  return sec.steps.map(s => {
    const data = steps[s.key] || {};
    const st = { key: s.key, done: !!data.done, unlocked: prevDone };
    prevDone = prevDone && !!data.done;
    return st;
  });
}

function ensureOpen(lead) {
  if (lead.stage === 'finalizada' || lead.stage === 'cartera') throw new Error('SOLO_LECTURA');
}
function ensureProcess(lead) {
  ensureOpen(lead);
  if (lead.stage !== 'en_proceso') throw new Error('ETAPA_INVALIDA');
}
function stepAccess(lead, key, { allowDone = false } = {}) {
  ensureProcess(lead);
  const sec = sectionOf(lead), step = sec.steps.find(s => s.key === key);
  if (!step) throw new Error('PASO_DESCONOCIDO');
  const st = stepsState(lead).find(s => s.key === key);
  if (!st.unlocked) throw new Error('PASO_BLOQUEADO');
  if (st.done && !allowDone) throw new Error('PASO_YA_COMPLETADO');
  return step;
}

export function canAddFiles(lead, key, count) {
  stepAccess(lead, key);
  const have = (lead.steps?.[key]?.files || []).length;
  if (have + count > MAX_PHOTOS_PER_STEP) throw new Error('DEMASIADAS_FOTOS');
  return true;
}

// Devuelve { patch, event } o lanza Error con código. `now` inyectable para pruebas.
export function applyAction(lead, action, input = {}, now = new Date()) {
  const ts = now.toISOString();
  const steps = lead.steps || {};
  switch (action) {
    case 'approve': {
      ensureOpen(lead);
      if (lead.stage !== 'en_espera') throw new Error('ETAPA_INVALIDA');
      const d = person(input);
      return { patch: { stage: 'en_proceso', decision: { action: 'aprobada', ...d, at: ts } }, event: { action, data: d } };
    }
    case 'reject': {
      ensureOpen(lead);
      if (lead.stage !== 'en_espera') throw new Error('ETAPA_INVALIDA');
      const d = person(input), reason = clean(input.reason);
      if (reason.length < 5) throw new Error('MOTIVO_REQUERIDO');
      return { patch: { stage: 'rechazada', decision: { action: 'rechazada', ...d, reason, at: ts } }, event: { action, data: { ...d, reason } } };
    }
    case 'reopen': {
      ensureOpen(lead);
      if (lead.stage !== 'rechazada') throw new Error('ETAPA_INVALIDA');
      return { patch: { stage: 'en_espera', decision: null }, event: { action, data: { previous: lead.decision } } };
    }
    case 'set_entity': {
      ensureProcess(lead);
      if (!sectionOf(lead).needsEntity) throw new Error('SECCION_SIN_ENTIDAD');
      if (!ENTITIES.includes(input.entity)) throw new Error('ENTIDAD_INVALIDA');
      if (Object.values(steps).some(s => s.done) && lead.entity && lead.entity !== input.entity) throw new Error('ENTIDAD_BLOQUEADA');
      return { patch: { entity: input.entity }, event: { action, data: { entity: input.entity } } };
    }
    case 'save_step': {
      const step = stepAccess(lead, input.step);
      const fields = {};
      for (const f of step.fields) if (input.fields && f.key in input.fields) fields[f.key] = clean(input.fields[f.key]).slice(0, 200);
      const cur = steps[step.key] || {};
      return { patch: { steps: { ...steps, [step.key]: { ...cur, fields: { ...(cur.fields || {}), ...fields } } } }, event: { action, data: { step: step.key, fields } } };
    }
    case 'mark_done': {
      const step = stepAccess(lead, input.step);
      const data = steps[step.key] || {};
      const miss = missingInStep(step, data);
      if (miss.length) throw new Error('FALTAN_DATOS:' + miss.join(','));
      return { patch: { steps: { ...steps, [step.key]: { ...data, done: true, done_at: ts } } }, event: { action, data: { step: step.key } } };
    }
    case 'finish': {
      ensureProcess(lead);
      const sec = sectionOf(lead);
      if (stepsState(lead).some(s => !s.done)) throw new Error('PASOS_INCOMPLETOS');
      let closing = null;
      if (sec.closing) {
        closing = {};
        for (const f of sec.closing) {
          const v = clean(input.closing?.[f.key]);
          if (!v) throw new Error('FALTAN_DATOS:' + f.key);
          if (f.money && !(Number(v) > 0)) throw new Error('FALTAN_DATOS:' + f.key);
          closing[f.key] = v;
        }
      }
      return { patch: { stage: sec.doneStage, finalized_at: ts, ...(closing ? { closing } : {}) }, event: { action, data: { stage: sec.doneStage, closing } } };
    }
    case 'add_files': {
      const step = stepAccess(lead, input.step);
      const paths = Array.isArray(input.paths) ? input.paths : [];
      canAddFiles(lead, step.key, paths.length);
      const cur = steps[step.key] || {};
      return { patch: { steps: { ...steps, [step.key]: { ...cur, files: [...(cur.files || []), ...paths] } } }, event: { action, data: { step: step.key, count: paths.length } } };
    }
    case 'remove_file': {
      const step = stepAccess(lead, input.step);
      const cur = steps[step.key] || {};
      if (!(cur.files || []).includes(input.path)) throw new Error('ARCHIVO_NO_ENCONTRADO');
      return { patch: { steps: { ...steps, [step.key]: { ...cur, files: cur.files.filter(f => f !== input.path) } } }, event: { action, data: { step: step.key } } };
    }
    default: throw new Error('ACCION_DESCONOCIDA');
  }
}
