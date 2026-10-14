/* ============================================================
   KUOTA — Conexión a Supabase y datos remotos
   Todo lo que antes era catálogo fijo ahora se carga desde la base de datos,
   así el admin puede cambiar precios, colores, disponibilidad y configuración
   sin tocar este archivo.
   ============================================================ */

const SUPABASE_URL = "https://dzssywablehebwqfkozp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_70cuGOwkrWGzQHGnItIE3Q_4NH8jI1O";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let CATALOG_NUEVOS = [];
let CATALOG_EXHIBICION = [];
let PLANB_NUEVOS = [];
let PLANB_EXHIBICION = [];
let ENTITIES = [];
let WOMPI_LINK = "https://checkout.wompi.co/l/VPOS_ci7Enu";
let WHATSAPP_BASE = "https://wa.me/573052890679";
let CASH_TRANSFER_PCT = 0.004;
const API_CREATE_ORDER = "/api/create-order";
const WOMPI_CHECKOUT_FORM_URL = "https://checkout.wompi.co/p/";

async function loadRemoteData(){
  const [{ data: productsRaw, error: pErr }, { data: variantsRaw }, { data: planbRaw }, { data: settingsRaw }] = await Promise.all([
    sb.from("products").select("*").eq("active", true).order("sort_order"),
    sb.from("variants").select("*").eq("active", true),
    sb.from("planb_plans").select("*").eq("active", true).order("model"),
    sb.from("settings").select("*"),
  ]);

  if(pErr){
    throw new Error("No se pudo conectar con la base de datos: " + pErr.message);
  }

  const grouped = (productsRaw || []).map(p => ({
    id: p.id,
    family: p.family,
    model: p.model,
    colors: p.colors || [],
    category: p.category,
    image_url: p.image_url || null,
    variants: (variantsRaw || [])
      .filter(v => v.product_id === p.id)
      .map(v => ({ id: v.id, storage: v.storage, price: Number(v.price) })),
  })).filter(p => p.variants.length > 0);

  CATALOG_NUEVOS = grouped.filter(p => p.category === "nuevo");
  CATALOG_EXHIBICION = grouped.filter(p => p.category === "exhibicion");

  PLANB_NUEVOS = (planbRaw || [])
    .filter(p => p.category === "nuevo")
    .map(p => ({ model: p.model, storage: p.storage, inicial: Number(p.inicial), cuota: Number(p.cuota) }));
  PLANB_EXHIBICION = (planbRaw || [])
    .filter(p => p.category === "exhibicion")
    .map(p => ({ model: p.model, storage: p.storage, inicial: Number(p.inicial), cuota: Number(p.cuota) }));

  const settingsMap = {};
  (settingsRaw || []).forEach(row => { settingsMap[row.key] = row.value; });

  ENTITIES = settingsMap.entities || [];
  WOMPI_LINK = settingsMap.wompi_link || WOMPI_LINK;
  WHATSAPP_BASE = "https://wa.me/" + (settingsMap.whatsapp_number || "573052890679");
  CASH_TRANSFER_PCT = settingsMap.cash_transfer_pct != null ? Number(settingsMap.cash_transfer_pct) : 0.004;
}
/* ============================================================
   KUOTA — Lógica de navegación, render, ilustraciones y cálculos
   ============================================================ */

const state = {
  historyStack: [],
  currentScreen: "home",
  homeTab: "nuevos",
  planBTab: "nuevos",
  selection: { product:null, variantIndex:0, color:null, flow:null },
  activeEntity: null,
};

let uidCounter = 0;

function money(n){
  return "$" + Math.round(n).toLocaleString("es-CO");
}

// ---------- Navegación ----------
function show(screenName, opts){
  opts = opts || {};
  if(!opts.skipHistory){
    state.historyStack.push(state.currentScreen);
  }
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const target = document.querySelector(`[data-screen="${screenName}"]`);
  if(target) target.classList.add("active");
  state.currentScreen = screenName;
  document.getElementById("backBtn").style.visibility = screenName === "home" ? "hidden" : "visible";
  window.scrollTo({top:0, behavior:"smooth"});
}

function setActiveNav(name){document.querySelectorAll('.nav-link').forEach(n=>n.classList.toggle('active',n.dataset.nav===name));}
function toggleMobileMenu(){document.getElementById('mobileNav').classList.toggle('open');}
function goCatalog(){state.historyStack=[];setActiveNav('catalogo');show('catalogo',{skipHistory:true});renderCatalog();}
function goContacto(){state.historyStack=[];setActiveNav('contacto');show('contacto',{skipHistory:true});}
function goCliente(){state.historyStack=[];setActiveNav('cliente');show('cliente',{skipHistory:true});}

function goBack(){
  const prev = state.historyStack.pop();
  if(prev){
    show(prev, {skipHistory:true});
  } else {
    goHome();
  }
}

function goHome(){
  state.historyStack = [];
  setActiveNav('home');
  show("home", {skipHistory:true});
}

function catTag(category){
  return category === "nuevo"
    ? `<span class="tag">Nuevo</span>`
    : `<span class="tag gold">Exhibición</span>`;
}

// Usa la foto real subida desde el admin si existe; si no, la ilustración vectorial propia.
function productVisual(product, colorHex, size){
  if(product.image_url){
    return `<img src="${product.image_url}" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:10px;" alt="${product.model}">`;
  }
  return deviceSVG(product, colorHex, size);
}

// ---------- Ilustraciones de producto (vectoriales, propias — sin fotos de terceros) ----------
function classify(product){
  const model = product.model;
  if(/iPad/.test(model)) return {type:"ipad"};
  if(/Watch/.test(model)) return {type:"watch"};
  const m = model.match(/iPhone\s+(\d+)/);
  const gen = m ? parseInt(m[1], 10) : 17;
  const isPro = /Pro/.test(model);
  const island = (isPro && gen >= 14) || (!isPro && gen >= 15);
  return {type:"phone", island};
}

function deviceSVG(product, colorHex, size){
  const uid = "g" + (uidCounter++);
  const info = classify(product);
  size = size || 72;
  const glare = `<defs><linearGradient id="${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.32"/>
      <stop offset="40%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient></defs>`;

  if(info.type === "ipad"){
    return `<svg viewBox="0 0 100 130" width="${size*0.86}" height="${size*1.12}" xmlns="http://www.w3.org/2000/svg">
      ${glare}
      <rect x="6" y="4" width="88" height="122" rx="10" fill="${colorHex}" stroke="rgba(0,0,0,.3)" stroke-width="2"/>
      <rect x="12" y="10" width="76" height="110" rx="4" fill="#0d0d0d"/>
      <circle cx="50" cy="7" r="1.6" fill="rgba(255,255,255,.5)"/>
      <rect x="6" y="4" width="88" height="122" rx="10" fill="url(#${uid})"/>
    </svg>`;
  }
  if(info.type === "watch"){
    return `<svg viewBox="0 0 100 130" width="${size*0.78}" height="${size*1.05}" xmlns="http://www.w3.org/2000/svg">
      ${glare}
      <rect x="30" y="0" width="40" height="18" rx="6" fill="${colorHex}" opacity="0.55"/>
      <rect x="30" y="112" width="40" height="18" rx="6" fill="${colorHex}" opacity="0.55"/>
      <rect x="18" y="14" width="64" height="102" rx="22" fill="${colorHex}" stroke="rgba(0,0,0,.3)" stroke-width="2"/>
      <rect x="27" y="23" width="46" height="84" rx="14" fill="#0d0d0d"/>
      <rect x="82" y="50" width="7" height="16" rx="3" fill="${colorHex}"/>
      <rect x="18" y="14" width="64" height="102" rx="22" fill="url(#${uid})"/>
    </svg>`;
  }
  const notchShape = info.island
    ? `<rect x="38" y="15" width="24" height="8" rx="4" fill="#0d0d0d"/>`
    : `<path d="M36 9 h28 v5 a7 7 0 0 1 -7 7 h-14 a7 7 0 0 1 -7 -7 z" fill="#0d0d0d"/>`;
  return `<svg viewBox="0 0 100 160" width="${size*0.62}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    ${glare}
    <rect x="10" y="4" width="80" height="152" rx="20" fill="${colorHex}" stroke="rgba(0,0,0,.3)" stroke-width="2"/>
    <rect x="15" y="9" width="70" height="142" rx="14" fill="#0d0d0d"/>
    ${notchShape}
    <rect x="10" y="4" width="80" height="152" rx="20" fill="url(#${uid})"/>
  </svg>`;
}

// ---------- HOME: catálogo ----------
function setTab(tab){
  state.homeTab = tab;
  document.querySelectorAll('[data-screen="home"] .tab').forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  renderCatalog();
}

function priceLabel(product){
  if(product.variants.length === 1) return money(product.variants[0].price);
  const min = Math.min(...product.variants.map(v => v.price));
  return "Desde " + money(min);
}

function renderCatalog(){
  const data = state.homeTab === "nuevos" ? CATALOG_NUEVOS : CATALOG_EXHIBICION;
  const groups = {};
  data.forEach(item => { (groups[item.family] = groups[item.family] || []).push(item); });

  let html = "";
  Object.keys(groups).forEach(family => {
    html += `<div class="family"><div class="family-title">${family}</div>`;
    groups[family].forEach(product => {
      const defaultColor = product.colors[0][1];
      html += `
        <div class="device-card">
          <div class="row-top">
            <div style="display:flex;gap:14px;align-items:center;">
              <div class="row-glyph">${productVisual(product, defaultColor, 56)}</div>
              <div class="row-info">
                ${catTag(product.category)}
                <div class="row-name">${product.model}</div>
                <div class="row-storage">${product.variants.length > 1 ? product.variants.map(v=>v.storage).join(" / ") : product.variants[0].storage}</div>
              </div>
            </div>
            <div class="row-price">${priceLabel(product)}</div>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" onclick="startContado('${product.id}')">Comprar de contado</button>
            <button class="btn btn-outline" onclick="startCredito('${product.id}')">Quiero llevarlo a crédito</button>
          </div>
        </div>`;
    });
    html += `</div>`;
  });
  document.getElementById("catalogList").innerHTML = html;
}

// ---------- CONFIGURAR (gigas + color) ----------
function findProduct(id){
  return CATALOG_NUEVOS.concat(CATALOG_EXHIBICION).find(p => p.id === id);
}

function currentVariant(){
  return state.selection.product.variants[state.selection.variantIndex];
}

function startContado(productId){
  const product = findProduct(productId);
  state.selection = { product, variantIndex:0, color:product.colors[0][0], flow:"contado" };
  openConfigurar();
}

function startCredito(productId){
  const product = findProduct(productId);
  state.selection = { product, variantIndex:0, color:product.colors[0][0], flow:"credito" };
  openConfigurar();
}

function openConfigurar(){
  const { product, flow } = state.selection;
  document.getElementById("cfgEyebrow").textContent = flow === "contado" ? "Compra de contado" : "Compra a crédito";
  document.getElementById("cfgTitle").textContent = product.model;
  document.getElementById("cfgSub").textContent = state.selection.flow === "contado"
    ? "Elige el almacenamiento y el color de tu preferencia. Sujeto a disponibilidad en tienda."
    : "Elige el almacenamiento y el color. El valor de tu crédito se calcula sobre esta configuración.";
  renderConfigurar();
  document.getElementById("cfgContinueBtn").textContent = state.selection.flow === "contado"
    ? "Continuar al carrito" : "Ver formas de pago a crédito";
  show("configurar");
}

function renderConfigurar(){
  const { product, variantIndex, color } = state.selection;
  const variant = product.variants[variantIndex];

  document.getElementById("cfgIllustration").innerHTML = productVisual(product, product.colors.find(c=>c[0]===color)[1], 150);

  // Selector de gigas (solo si hay más de una variante en inventario)
  const storageWrap = document.getElementById("storageSelector");
  if(product.variants.length > 1){
    storageWrap.style.display = "";
    storageWrap.innerHTML = product.variants.map((v, i) => `
      <button class="storage-chip ${i === variantIndex ? "selected" : ""}" onclick="selectVariant(${i})">
        <span class="sc-storage">${v.storage}</span>
        <span class="sc-price">${money(v.price)}</span>
      </button>`).join("");
  } else {
    storageWrap.style.display = "none";
    storageWrap.innerHTML = "";
  }

  document.getElementById("cfgSummary").innerHTML = `
    <div class="summary-line"><span class="k">Catálogo</span><span class="v">${catTag(product.category)}</span></div>
    <div class="summary-line"><span class="k">Equipo</span><span class="v">${product.model}</span></div>
    <div class="summary-line"><span class="k">Almacenamiento</span><span class="v">${variant.storage}</span></div>
    <div class="summary-line"><span class="k">Precio de lista</span><span class="v" style="color:var(--lime);font-family:'Space Grotesk';">${money(variant.price)}</span></div>`;

  renderSwatches();
}

function selectVariant(idx){
  state.selection.variantIndex = idx;
  renderConfigurar();
}

function renderSwatches(){
  const product = state.selection.product;
  const html = product.colors.map(([name, hex]) => `
    <button class="swatch ${name === state.selection.color ? "selected" : ""}" onclick="pickColor('${name.replace(/'/g,"\\'")}')">
      <span class="swatch-dot" style="background:${hex};"></span>
      <span class="swatch-label">${name}</span>
    </button>`).join("");
  document.getElementById("colorGrid").innerHTML = html;
}

function pickColor(name){
  state.selection.color = name;
  renderConfigurar();
}

function cfgContinue(){
  if(state.selection.flow === "contado"){
    goCarrito();
  } else {
    goCreditoPlansFromConfig();
  }
}

// ---------- CARRITO (contado: transferencia + envío/domicilio opcional) ----------
function goCarrito(){
  const { product, color } = state.selection;
  const variant = currentVariant();
  document.getElementById("cartSummary").innerHTML = `
    <div class="summary-line"><span class="k">Catálogo</span><span class="v">${catTag(product.category)}</span></div>
    <div class="summary-line"><span class="k">Equipo</span><span class="v">${product.model} ${variant.storage}</span></div>
    <div class="summary-line"><span class="k">Color</span><span class="v">${color}</span></div>`;

  document.getElementById("shipCheckbox").checked = false;
  document.getElementById("domCheckbox").checked = false;
  document.getElementById("shipForm").style.display = "none";
  document.getElementById("domForm").style.display = "none";
  ["shipName","shipCedula","shipDept","shipCity","shipAddress","shipWhatsapp","domName","domCedula","domAddress","domWhatsapp"].forEach(id => {
    document.getElementById(id).value = "";
  });

  renderCartBreakdown();
  document.getElementById("copyAmountBtn").textContent = "Copiar valor a pagar";
  show("carrito");
}

function onDeliveryToggle(which){
  if(which === "shipping" && document.getElementById("shipCheckbox").checked){
    document.getElementById("domCheckbox").checked = false;
    document.getElementById("domForm").style.display = "none";
  }
  if(which === "domestic" && document.getElementById("domCheckbox").checked){
    document.getElementById("shipCheckbox").checked = false;
    document.getElementById("shipForm").style.display = "none";
  }
  document.getElementById("shipForm").style.display = document.getElementById("shipCheckbox").checked ? "" : "none";
  document.getElementById("domForm").style.display = document.getElementById("domCheckbox").checked ? "" : "none";
  renderCartBreakdown();
}

function cartTotals(){
  const variant = currentVariant();
  const productPrice = variant.price;
  const tax = Math.round(productPrice * CASH_TRANSFER_PCT);
  const shippingSelected = document.getElementById("shipCheckbox").checked;
  const domesticSelected = document.getElementById("domCheckbox").checked;

  let shippingFee = 0, domesticFee = 0, total = productPrice + tax;
  if(shippingSelected){
    shippingFee = Math.round(productPrice * 0.05) + 50000;
    total += shippingFee;
  } else if(domesticSelected){
    domesticFee = Math.round(productPrice * 0.007);
    total += domesticFee;
  }
  return { productPrice, tax, shippingSelected, domesticSelected, shippingFee, domesticFee, total };
}

function renderCartBreakdown(){
  const t = cartTotals();
  state.cartTotal = t.total;
  let rows = `
    <div class="summary-line"><span class="k">Producto</span><span class="v">${money(t.productPrice)}</span></div>
    <div class="summary-line"><span class="k">4x1000</span><span class="v">${money(t.tax)}</span></div>`;
  if(t.shippingSelected){
    rows += `
    <div class="summary-line"><span class="k">Envío (5%) + flete</span><span class="v">${money(t.shippingFee)}</span></div>`;
  }
  if(t.domesticSelected){
    rows += `
    <div class="summary-line"><span class="k">Domicilio (0,7%)</span><span class="v">${money(t.domesticFee)}</span></div>`;
  }
  rows += `
    <div class="summary-line"><span class="k">Total</span><span class="v" style="color:var(--lime);font-family:'Space Grotesk';font-size:16px;">${money(t.total)}</span></div>`;
  document.getElementById("cartBreakdown").innerHTML = rows;
  document.getElementById("payBtn").textContent = `Pagar ${money(t.total)}`;
}

function copyCartAmount(){
  const raw = Math.round(state.cartTotal).toString();
  const btn = document.getElementById("copyAmountBtn");

  const showCopied = () => {
    btn.textContent = `Copiado: ${money(state.cartTotal)}`;
    setTimeout(() => { btn.textContent = "Copiar valor a pagar"; }, 2000);
  };
  const showFailed = () => {
    btn.textContent = `Valor: ${money(state.cartTotal)} (selecciónalo y cópialo)`;
    setTimeout(() => { btn.textContent = "Copiar valor a pagar"; }, 3000);
  };
  const legacyCopy = () => {
    try{
      const ta = document.createElement("textarea");
      ta.value = raw;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, raw.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      if(ok) showCopied(); else showFailed();
    } catch(e){
      showFailed();
    }
  };
  if(navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext){
    navigator.clipboard.writeText(raw).then(showCopied).catch(legacyCopy);
  } else {
    legacyCopy();
  }
}

async function goPagar(){
  const t = cartTotals();
  const shippingSelected = t.shippingSelected;
  const domesticSelected = t.domesticSelected;

  let shippingForm = null, domesticForm = null;
  if(shippingSelected){
    const vals = {
      name: document.getElementById("shipName").value.trim(),
      cedula: document.getElementById("shipCedula").value.trim(),
      department: document.getElementById("shipDept").value.trim(),
      city: document.getElementById("shipCity").value.trim(),
      address: document.getElementById("shipAddress").value.trim(),
      whatsapp: document.getElementById("shipWhatsapp").value.trim(),
    };
    if(Object.values(vals).some(v => !v)){
      alert("Completa todos los datos de envío para continuar.");
      return;
    }
    shippingForm = vals;
  }
  if(domesticSelected){
    const vals = {
      name: document.getElementById("domName").value.trim(),
      cedula: document.getElementById("domCedula").value.trim(),
      address: document.getElementById("domAddress").value.trim(),
      whatsapp: document.getElementById("domWhatsapp").value.trim(),
    };
    if(Object.values(vals).some(v => !v)){
      alert("Completa todos los datos de domicilio para continuar.");
      return;
    }
    domesticForm = vals;
  }

  const btn = document.getElementById("payBtn");
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Preparando pago…";

  try{
    const variant = currentVariant();
    const resp = await fetch(API_CREATE_ORDER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variantId: variant.id,
        color: state.selection.color,
        shippingSelected, domesticSelected, shippingForm, domesticForm,
      }),
    });
    if(!resp.ok){
      const status = resp.status;
      const bodyText = await resp.text();
      let errMsg = bodyText;
      try{ const j = JSON.parse(bodyText); errMsg = j.error || bodyText; } catch(e){ /* no era JSON */ }
      throw new Error(`(HTTP ${status}) ${errMsg}`.slice(0, 400));
    }
    const order = await resp.json();

    const form = document.createElement("form");
    form.method = "GET";
    form.action = WOMPI_CHECKOUT_FORM_URL;
    const fields = {
      "public-key": order.publicKey,
      "currency": order.currency,
      "amount-in-cents": order.amountInCents,
      "reference": order.reference,
      "signature:integrity": order.signature,
    };
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  } catch(e){
    alert("No pudimos iniciar el pago: " + e.message + ". Intenta de nuevo.");
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ---------- CRÉDITO: barra de contexto del equipo ----------
function deviceBarHTML(extra){
  const { product } = state.selection;
  const variant = currentVariant();
  return `
    <div class="summary-line"><span class="k">Catálogo</span><span class="v">${catTag(product.category)}</span></div>
    <div class="summary-line"><span class="k">Equipo</span><span class="v">${product.model} ${variant.storage}</span></div>
    <div class="summary-line"><span class="k">Precio de lista</span><span class="v">${money(variant.price)}</span></div>
    ${extra || ""}`;
}

// Guarda el lead y (si hay datos) un cliente en Supabase, sin bloquear el flujo si falla.
async function saveLead(leadType, deviceLabel, payload, customerFields){
  // Pasa por el backend (/api/leads) en vez de escribir directo a Supabase:
  // el servidor normaliza la cédula, busca si el cliente ya existe (evita duplicados
  // y evita que un formulario público sobrescriba un customer ya vinculado a una
  // cuenta), y valida consentimiento antes de guardar.
  try{
    const resp = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lead_type: leadType,
        device_label: deviceLabel,
        consent: true,
        full_name: customerFields?.full_name || null,
        cedula: customerFields?.cedula || null,
        whatsapp: customerFields?.whatsapp || null,
        email: customerFields?.email || null,
        birth_date: customerFields?.birth_date || null,
        image_urls: payload.image_urls || [],
        ...payload,
      }),
    });
    if(!resp.ok){
      const t = await resp.text();
      throw new Error(`(HTTP ${resp.status}) ${t}`.slice(0, 300));
    }
  } catch(e){
    console.warn("No se pudo guardar el lead en la base de datos:", e);
  }
}

function planBHasModel(product){
  if(!/^iPhone/.test(product.model)) return false;
  const list = product.category === "nuevo" ? PLANB_NUEVOS : PLANB_EXHIBICION;
  return list.some(p => p.model.toLowerCase() === product.model.toLowerCase());
}

// Plan C (parte de pago): solo iPhone, y solo desde el 12 Pro en adelante.
// No aplica a iPad, Apple Watch, ni al iPhone 12 base (sin "Pro").
function planCEligible(product){
  if(!/^iPhone/.test(product.model)) return false;
  const m = product.model.match(/iPhone\s+(\d+)/);
  const gen = m ? parseInt(m[1], 10) : 0;
  const isPro = /Pro/.test(product.model);
  if(gen > 12) return true;
  if(gen === 12 && isPro) return true;
  return false;
}

function goCreditoPlansFromConfig(){
  document.getElementById("creditDeviceBar").innerHTML = deviceBarHTML();
  const planBOk = planBHasModel(state.selection.product);
  document.getElementById("planBOptionCard").style.display = planBOk ? "" : "none";
  document.getElementById("planBUnavailableNote").style.display = planBOk ? "none" : "";
  document.getElementById("planCOptionCard").style.display = planCEligible(state.selection.product) ? "" : "none";
  show("credito-plans");
}

// ---------- PLAN A: entidades ----------
function renderEntities(){
  if(!state.selection.product) return;
  document.getElementById("entityDeviceBar").innerHTML = deviceBarHTML();
  const variant = currentVariant();
  const html = ENTITIES.map(e => {
    const monto = (e.pct != null) ? money(variant.price * (1 + e.pct)) : null;
    const sub = monto ? `${e.pct*100}% de recargo · ${monto}` : (e.kind === "brilla" ? "Punto físico" : "Cupo o validación");
    return `
    <button class="entity-btn" onclick="openEntity('${e.key}')">
      ${e.name}
      <span>${sub}</span>
    </button>`;
  }).join("");
  document.getElementById("entityGrid").innerHTML = html;
}

function openEntity(key){
  const entity = ENTITIES.find(e => e.key === key);
  const variant = currentVariant();
  state.activeEntity = entity;
  const montoHTML = (entity.pct != null)
    ? `<div class="summary-line"><span class="k">${entity.name} (+${entity.pct*100}%)</span><span class="v" style="color:var(--lime);">${money(variant.price * (1 + entity.pct))}</span></div>`
    : "";

  if(entity.kind === "brilla"){
    document.getElementById("brillaDeviceBar").innerHTML = deviceBarHTML(montoHTML);
    show("planA-brilla");
  } else if(entity.kind === "direct"){
    document.getElementById("directEyebrow").textContent = `Plan A · ${entity.name}`;
    document.getElementById("directTitle").textContent = `Continuar con ${entity.name}`;
    document.getElementById("directText").textContent =
      `Tu ${state.selection.product.model} ${variant.storage} con ${entity.name} queda en ${money(variant.price * (1 + entity.pct))} (precio de lista + ${entity.pct*100}%).`;
    document.getElementById("directLink").href = WOMPI_LINK;
    show("planA-direct");
  } else {
    document.getElementById("choiceEyebrow").textContent = `Plan A · ${entity.name}`;
    document.getElementById("choiceTitle").textContent = `¿Ya tienes cupo con ${entity.name}?`;
    document.getElementById("choiceDeviceBar").innerHTML = deviceBarHTML(montoHTML);
    show("planA-choice");
  }
}

// ---------- PLAN A: formulario cupo ----------
function submitPlanAForm(){
  const entity = state.activeEntity;
  const variant = currentVariant();
  const cedula = document.getElementById("fCedula").value.trim();
  const nombre = document.getElementById("fNombre").value.trim();
  const cupoUsar = document.getElementById("fCupoUsar").value.trim();
  const cupoTotal = document.getElementById("fCupoTotal").value.trim();
  const ciudad = document.getElementById("fCiudad").value.trim();

  if(!cedula || !nombre || !cupoUsar || !cupoTotal || !ciudad){
    alert("Por favor completa los 5 datos para continuar.");
    return;
  }

  const montoLine = (entity.pct != null)
    ? `<div class="summary-line"><span class="k">Valor con ${entity.name}</span><span class="v" style="color:var(--lime);">${money(variant.price * (1 + entity.pct))}</span></div>`
    : "";

  document.getElementById("formEyebrow").textContent = `Plan A · ${entity.name}`;
  document.getElementById("confirmSummary").innerHTML = `
    <div class="summary-line"><span class="k">Equipo</span><span class="v">${state.selection.product.model} ${variant.storage}</span></div>
    ${montoLine}
    <div class="summary-line"><span class="k">Entidad</span><span class="v">${entity.name}</span></div>
    <div class="summary-line"><span class="k">Cédula</span><span class="v">${cedula}</span></div>
    <div class="summary-line"><span class="k">Nombre</span><span class="v">${nombre}</span></div>
    <div class="summary-line"><span class="k">Cupo a utilizar</span><span class="v">${cupoUsar}</span></div>
    <div class="summary-line"><span class="k">Cupo total</span><span class="v">${cupoTotal}</span></div>
    <div class="summary-line"><span class="k">Ciudad</span><span class="v">${ciudad}</span></div>`;

  const msg = `Hola, quiero continuar con mi solicitud de crédito con ${entity.name} para ${state.selection.product.model} ${variant.storage}.\nCédula: ${cedula}\nNombre: ${nombre}\nValor del cupo a utilizar: ${cupoUsar}\nValor total del cupo: ${cupoTotal}\nCiudad de residencia: ${ciudad}`;
  document.getElementById("waFormLink").href = `${WHATSAPP_BASE}?text=${encodeURIComponent(msg)}`;

  saveLead("plan_a", `${state.selection.product.model} ${variant.storage}`, {
    entidad: entity.name, cedula, nombre, cupoUsar, cupoTotal, ciudad
  }, { full_name: nombre, cedula, whatsapp: null, email: null });

  show("planA-confirm");
}

// ---------- PLAN A: quiero validarme ----------
function renderValidateScreenFor(entity){
  document.getElementById("valEyebrow").textContent = `Plan A · ${entity.name}`;
  document.getElementById("valText").textContent = entity.validateText;
  document.getElementById("valExternalLink").href = entity.validateUrl;
  document.getElementById("valDeviceBar").innerHTML = deviceBarHTML();
  const msg = `Hola, ya tengo cupo con ${entity.name} y quiero terminar el proceso de compra con un asesor de Kuota.`;
  document.getElementById("waValidateLink").href = `${WHATSAPP_BASE}?text=${encodeURIComponent(msg)}`;
}

// ---------- PLAN B: catálogo reportados ----------
// ---------- PLAN B: catálogo reportados (filtrado solo al equipo elegido) ----------
function goPlanBFromCredito(){
  const product = state.selection.product;
  if(!planBHasModel(product)){
    // Salvaguarda: este equipo no tiene Plan B, esta pantalla no debería alcanzarse.
    return;
  }
  document.getElementById("planBDeviceBar").innerHTML = deviceBarHTML();
  renderPlanB();
  show("planB-catalog");
}

function renderPlanB(){
  const product = state.selection.product;
  const list = product.category === "nuevo" ? PLANB_NUEVOS : PLANB_EXHIBICION;
  const matches = list.filter(p => p.model.toLowerCase() === product.model.toLowerCase());

  if(matches.length === 0){
    document.getElementById("planBList").innerHTML = `
      <div class="note">Este equipo específico aún no tiene un plan de cuota inicial configurado. Escríbenos por WhatsApp y te contamos las opciones disponibles.</div>
      <a class="btn btn-outline btn-block" target="_blank" rel="noopener"
         href="${WHATSAPP_BASE}?text=${encodeURIComponent("Hola, quiero consultar el Plan B (cuota inicial) para " + product.model + ".")}">
        Escríbenos por WhatsApp
      </a>`;
    return;
  }

  const html = matches.map((p) => {
    const idx = list.indexOf(p);
    return `
    <div class="device-card">
      <div class="row-top">
        <div style="display:flex;gap:12px;align-items:center;">
          <div class="row-glyph">${deviceSVG({model:p.model, colors:[["", "#8fada3"]]}, "#8fada3", 56)}</div>
          <div class="row-info">
            <div class="row-name">${p.model}</div>
            <div class="row-storage">${p.storage}</div>
          </div>
        </div>
      </div>
      <div class="summary-card" style="margin:10px 0 12px;padding:12px 14px;">
        <div class="summary-line"><span class="k">Cuota inicial</span><span class="v">${money(p.inicial)}</span></div>
        <div class="summary-line"><span class="k">14 cuotas de</span><span class="v">${money(p.cuota)}</span></div>
      </div>
      <button class="btn btn-gold btn-block" onclick="openPlanBForm('${product.category === "nuevo" ? "nuevos" : "exhibicion"}', ${idx})">
        Cuentas con la inicial o podrías conseguirla
      </button>
    </div>`;
  }).join("");
  document.getElementById("planBList").innerHTML = html;
}

// ---------- PLAN B: formulario de solicitud ----------
const PB_REQUIRED_IDS = ["pbNombre","pbCedula","pbFechaExp","pbLugarExp","pbWhatsapp","pbFechaNac","pbCorreo"];

function openPlanBForm(tab, idx){
  const list = tab === "nuevos" ? PLANB_NUEVOS : PLANB_EXHIBICION;
  const item = list[idx];
  state.planBItem = { ...item, tab };

  document.getElementById("pbCelular").value = `${item.model} ${item.storage}`;
  document.getElementById("pbDeviceBar").innerHTML = `
    <div class="summary-line"><span class="k">Catálogo</span><span class="v">${catTag(tab === "nuevos" ? "nuevo" : "exhibicion")}</span></div>
    <div class="summary-line"><span class="k">Equipo</span><span class="v">${item.model} ${item.storage}</span></div>
    <div class="summary-line"><span class="k">Cuota inicial</span><span class="v">${money(item.inicial)}</span></div>
    <div class="summary-line"><span class="k">14 cuotas de</span><span class="v">${money(item.cuota)}</span></div>`;

  resetPlanBForm();
  show("planB-form");
}

function resetPlanBForm(){
  PB_REQUIRED_IDS.forEach(id => { document.getElementById(id).value = ""; });
  document.getElementById("pbCheckCodigo").checked = false;
  document.getElementById("pbCheckTerms").checked = false;
  document.getElementById("termsBox").style.display = "none";
  validatePlanBForm();
}

function toggleTerms(){
  const box = document.getElementById("termsBox");
  box.style.display = box.style.display === "none" ? "" : "none";
}

function validatePlanBForm(){
  const allFilled = PB_REQUIRED_IDS.every(id => document.getElementById(id).value.trim() !== "");
  const bothChecked = document.getElementById("pbCheckCodigo").checked && document.getElementById("pbCheckTerms").checked;
  document.getElementById("pbSubmitBtn").disabled = !(allFilled && bothChecked);
}

function submitPlanBForm(){
  const item = state.planBItem;
  const vals = {};
  PB_REQUIRED_IDS.forEach(id => { vals[id] = document.getElementById(id).value.trim(); });
  const celular = document.getElementById("pbCelular").value;
  const catalogoLabel = item.tab === "nuevos" ? "Nuevo" : "Exhibición";

  document.getElementById("pbConfirmSummary").innerHTML = `
    <div class="summary-line"><span class="k">Catálogo</span><span class="v">${catTag(item.tab === "nuevos" ? "nuevo" : "exhibicion")}</span></div>
    <div class="summary-line"><span class="k">Equipo</span><span class="v">${celular}</span></div>
    <div class="summary-line"><span class="k">Nombre</span><span class="v">${vals.pbNombre}</span></div>
    <div class="summary-line"><span class="k">Cédula</span><span class="v">${vals.pbCedula}</span></div>`;

  const msg = `Hola, quiero continuar con mi compra a crédito (Plan Reportado / poco historial) del ${celular} — catálogo ${catalogoLabel}.
Cuota inicial: ${money(item.inicial)} · 14 cuotas de ${money(item.cuota)}

Nombre completo: ${vals.pbNombre}
Cédula: ${vals.pbCedula}
Fecha de expedición: ${vals.pbFechaExp}
Lugar de expedición: ${vals.pbLugarExp}
Número de WhatsApp: ${vals.pbWhatsapp}
Fecha de nacimiento: ${vals.pbFechaNac}
Correo: ${vals.pbCorreo}

Confirmo que estaré pendiente al código de verificación y acepto la Política de Tratamiento de Datos (Habeas Data) de Kuota.`;

  document.getElementById("pbWaLink").href = `${WHATSAPP_BASE}?text=${encodeURIComponent(msg)}`;

  saveLead("plan_b", celular, {
    catalogo: catalogoLabel, inicial: item.inicial, cuota: item.cuota, ...vals
  }, { full_name: vals.pbNombre, cedula: vals.pbCedula, whatsapp: vals.pbWhatsapp, email: vals.pbCorreo, birth_date: vals.pbFechaNac || null });

  show("planB-confirm");
}

// ---------- PLAN C: iPhone en parte de pago ----------
const PC_REQUIRED_IDS = ["pcNombre","pcCedula","pcFechaExp","pcLugarExp","pcWhatsapp","pcFechaNac","pcCorreo"];

function startPlanC(){
  const product = state.selection.product;
  if(!planCEligible(product)){
    return; // salvaguarda: esta pantalla no debería alcanzarse para equipos no elegibles
  }
  document.getElementById("pcCelular").value = product ? `${product.model} ${currentVariant().storage}` : "";
  document.getElementById("pcDeviceBar").innerHTML = product ? deviceBarHTML() : "";
  PC_REQUIRED_IDS.forEach(id => { document.getElementById(id).value = ""; });
  document.querySelectorAll('input[name="pcOption"]').forEach(r => { r.checked = false; });
  document.querySelectorAll(".radio-row").forEach(r => r.classList.remove("selected"));
  document.getElementById("pcCheckTerms").checked = false;
  document.getElementById("termsBoxC").style.display = "none";
  state.planC = { files: { fotos: [], truetone: null, bateria: null, piezas: null } };
  validatePlanCStep1();
  show("planC-step1");
}

function toggleTermsC(){
  const box = document.getElementById("termsBoxC");
  box.style.display = box.style.display === "none" ? "" : "none";
}

function validatePlanCStep1(){
  const allFilled = PC_REQUIRED_IDS.every(id => document.getElementById(id).value.trim() !== "");
  const optionPicked = !!document.querySelector('input[name="pcOption"]:checked');
  const termsOk = document.getElementById("pcCheckTerms").checked;
  document.getElementById("pcNextBtn").disabled = !(allFilled && optionPicked && termsOk);
}

function goPlanCStep2(){
  const vals = {};
  PC_REQUIRED_IDS.forEach(id => { vals[id] = document.getElementById(id).value.trim(); });
  vals.pcOption = document.querySelector('input[name="pcOption"]:checked').value;
  vals.pcCelular = document.getElementById("pcCelular").value;
  state.planC.step1 = vals;
  ["thumbsFotos","thumbsTrueTone","thumbsBateria","thumbsPiezas"].forEach(id => { document.getElementById(id).innerHTML = ""; });
  ["slotFotos","slotTrueTone","slotBateria","slotPiezas"].forEach(id => document.getElementById(id).classList.remove("done"));
  state.planC.files = { fotos: [], truetone: null, bateria: null, piezas: null };
  validatePlanCStep2();
  show("planC-step2");
}

function handlePcFiles(slot, fileList){
  const files = Array.from(fileList);
  if(slot === "fotos"){
    state.planC.files.fotos = files;
  } else {
    state.planC.files[slot] = files[0] || null;
  }
  const thumbsId = { fotos:"thumbsFotos", truetone:"thumbsTrueTone", bateria:"thumbsBateria", piezas:"thumbsPiezas" }[slot];
  const slotId = { fotos:"slotFotos", truetone:"slotTrueTone", bateria:"slotBateria", piezas:"slotPiezas" }[slot];
  const thumbsWrap = document.getElementById(thumbsId);
  thumbsWrap.innerHTML = "";
  files.forEach(f => {
    const url = URL.createObjectURL(f);
    thumbsWrap.innerHTML += `<img src="${url}">`;
  });
  document.getElementById(slotId).classList.toggle("done", files.length > 0);
  validatePlanCStep2();
}

function validatePlanCStep2(){
  const ok = state.planC.files.fotos.length > 0 && !!state.planC.files.truetone && !!state.planC.files.bateria;
  document.getElementById("pcSubmitBtn").disabled = !ok;
}



const PC_OPTION_LABELS = {
  efectivo: "Entregará el excedente en efectivo (precio de lista − precio del celular evaluado)",
  cupos: "Financiará el restante con cupos en entidades (Buena vida crediticia)",
  reportado: "Está reportado / sin vida crediticia y quiere financiar el restante",
};

async function submitPlanCForm(){
  const btn = document.getElementById("pcSubmitBtn");
  btn.disabled = true;
  btn.textContent = "Subiendo fotos…";
  try{
    const v = state.planC.step1;
    const optionLabel = PC_OPTION_LABELS[v.pcOption];

    // Las fotos son sensibles (bucket privado trade-in-photos): se envían al backend
    // en un solo multipart/form-data a /api/lead-upload, que valida tipo/tamaño real
    // de archivo y las sube con la Service Role Key. El navegador nunca escribe
    // directo al storage ni conoce una URL pública de las fotos.
    const fd = new FormData();
    fd.append("consent", "true");
    fd.append("full_name", v.pcNombre);
    fd.append("cedula", v.pcCedula);
    fd.append("whatsapp", v.pcWhatsapp);
    fd.append("email", v.pcCorreo || "");
    fd.append("birth_date", v.pcFechaNac || "");
    fd.append("device_label", v.pcCelular);
    // TODO: no existe todavía un campo propio en el formulario para "qué iPhone
    // estás entregando" (distinto del que se quiere comprar); se usa pcCelular
    // como valor temporal para satisfacer la validación del backend.
    fd.append("trade_in_device", v.pcCelular);
    fd.append("notes", `Opción elegida: ${optionLabel}. Fecha de expedición: ${v.pcFechaExp}. Lugar de expedición: ${v.pcLugarExp}.`);
    for(const f of state.planC.files.fotos) fd.append("foto", f, f.name);
    fd.append("truetone", state.planC.files.truetone, state.planC.files.truetone.name);
    fd.append("bateria", state.planC.files.bateria, state.planC.files.bateria.name);
    if(state.planC.files.piezas) fd.append("piezas", state.planC.files.piezas, state.planC.files.piezas.name);

    const resp = await fetch("/api/lead-upload", { method: "POST", body: fd });
    if(!resp.ok){
      const t = await resp.text();
      throw new Error(`(HTTP ${resp.status}) ${t}`.slice(0, 300));
    }
    const uploadResult = await resp.json();
    const imageUrls = new Array(uploadResult.file_count || 0).fill("(foto privada — verificable desde el panel admin)");

    document.getElementById("pcConfirmSummary").innerHTML = `
      <div class="summary-line"><span class="k">Celular a adquirir</span><span class="v">${v.pcCelular}</span></div>
      <div class="summary-line"><span class="k">Nombre</span><span class="v">${v.pcNombre}</span></div>
      <div class="summary-line"><span class="k">Cédula</span><span class="v">${v.pcCedula}</span></div>
      <div class="summary-line"><span class="k">Opción elegida</span><span class="v">${optionLabel}</span></div>
      <div class="summary-line"><span class="k">Fotos enviadas</span><span class="v">${imageUrls.length}</span></div>`;

    const msg = `Hola, quiero entregar mi iPhone en parte de pago (Plan C) por el ${v.pcCelular}.

Nombre completo: ${v.pcNombre}
Cédula: ${v.pcCedula}
Fecha de expedición: ${v.pcFechaExp}
Lugar de expedición: ${v.pcLugarExp}
Número de WhatsApp: ${v.pcWhatsapp}
Fecha de nacimiento: ${v.pcFechaNac}
Correo: ${v.pcCorreo}

Opción elegida: ${optionLabel}

Fotos de mi equipo para evaluación:
${imageUrls.map((u,i) => `${i+1}. ${u}`).join("\n")}

Confirmo que acepto la Política de Tratamiento de Datos (Habeas Data) de Kuota.`;

    document.getElementById("pcWaLink").href = `${WHATSAPP_BASE}?text=${encodeURIComponent(msg)}`;

    // El lead de Plan C ya quedó creado por /api/lead-upload junto con las fotos;
    // no se vuelve a guardar aquí (evita un lead duplicado sin fotos).

    show("planC-confirm");
  } catch(e){
    alert("No pudimos subir las fotos. Revisa tu conexión e inténtalo de nuevo.");
    console.error(e);
  } finally {
    btn.disabled = false;
    btn.textContent = "Enviar";
  }
}

// Algunas pantallas necesitan recalcularse justo antes de mostrarse.
const _origShow = show;
show = function(screenName, opts){
  if(screenName === "planA-validate" && state.activeEntity){
    renderValidateScreenFor(state.activeEntity);
  }
  if(screenName === "planA-entities"){
    renderEntities();
  }
  _origShow(screenName, opts);
};

// ---------- Init ----------
async function initApp(){
  try{
    await loadRemoteData();
    renderCatalog();
    document.getElementById("loadingOverlay").style.display = "none";
  } catch(e){
    document.getElementById("loadingText").textContent = "No pudimos cargar el catálogo. Verifica tu conexión y recarga la página.";
    console.error(e);
  }
}
initApp();

PB_REQUIRED_IDS.forEach(id => {
  document.getElementById(id).addEventListener("input", validatePlanBForm);
});
document.getElementById("pbCheckCodigo").addEventListener("change", validatePlanBForm);
document.getElementById("pbCheckTerms").addEventListener("change", validatePlanBForm);

PC_REQUIRED_IDS.forEach(id => {
  document.getElementById(id).addEventListener("input", validatePlanCStep1);
});
document.querySelectorAll('input[name="pcOption"]').forEach(radio => {
  radio.addEventListener("change", () => {
    document.querySelectorAll(".radio-row").forEach(r => r.classList.remove("selected"));
    radio.closest(".radio-row").classList.add("selected");
    validatePlanCStep1();
  });
});
document.getElementById("pcCheckTerms").addEventListener("change", validatePlanCStep1);

