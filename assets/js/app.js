/* Punto Pelota — catálogo, carrito y checkout por WhatsApp */
(() => {
  'use strict';

  const WHATSAPP = '5493834608775';
  const DESCUENTO_EFECTIVO = 0.10;
  const CLAVE = 'pp_carrito_v1';
  const suave = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let DATA = { categorias: [], productos: [] };
  let filtro = 'todo';
  let abierto = null;               // id del producto en la ficha
  const carrito = new Map();

  const $ = s => document.querySelector(s);
  const grid = $('#grid');

  const money = n => '$' + Number(n).toLocaleString('es-AR');
  const find = id => DATA.productos.find(p => p.id === id);
  const catName = id => (DATA.categorias.find(c => c.id === id) || {}).nombre || '';
  const esConsulta = p => p.precio === null || p.precio === undefined;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- guardado del carrito ----------
     Algunos navegadores en modo privado tiran error al tocar el storage.
     Si pasa, el sitio sigue andando: sólo se pierde al recargar. */
  const store = {
    leer() { try { return localStorage.getItem(CLAVE); } catch { return null; } },
    grabar(v) { try { localStorage.setItem(CLAVE, v); } catch { } }
  };

  function guardarCarrito() {
    store.grabar(JSON.stringify([...carrito]));
  }

  function cargarCarrito() {
    try {
      const crudo = store.leer();
      if (!crudo) return;
      JSON.parse(crudo).forEach(([id, q]) => {
        const p = find(id);
        // ignorar lo que ya no existe o quedó sin stock
        if (p && p.stock && Number.isFinite(q) && q > 0) carrito.set(id, Math.min(q, 99));
      });
    } catch { }
  }

  /* ---------- carga ---------- */
  async function init() {
    try {
      const res = await fetch('data/productos.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      DATA = await res.json();
      $('#loading').hidden = true;
      renderTicker();
      renderFeat();
      renderFilters();
      renderGrid();
      cargarCarrito();
      renderCart();
    
  /* -------- SPA: mostrar/ocultar vistas -------- */
  function showView(name) {
    document.querySelectorAll('.view').forEach(v => {
      v.hidden = v.id !== 'view-' + name;
    });
    document.querySelectorAll('.bn[data-view]').forEach(b => {
      b.classList.toggle('active', b.dataset.view === name);
    });
    window.scrollTo(0, 0);
    // cuando el catalogo se abre por primera vez, el grid ya esta listo
    if (name === 'catalogo' && grid.children.length === 0) renderGrid();
  }

  function initNav() {
    // botones del bottom-nav
    document.querySelectorAll('.bn[data-view]').forEach(b => {
      b.addEventListener('click', e => { e.preventDefault(); showView(b.dataset.view); });
    });
    // links del header que tienen data-view
    document.querySelectorAll('[data-view]:not(.bn)').forEach(a => {
      a.addEventListener('click', e => {
        const v = a.dataset.view;
        if (!v) return;
        e.preventDefault();
        showView(v);
      });
    });
  }

  initNav();
  observeReveals();
      abrirDesdeURL();
      showView('inicio');
    } catch (e) {
      $('#loading').textContent =
        'No se pudo cargar el catálogo. Serví el sitio por HTTP (no abriendo el archivo directo) y recargá.';
    }
  }

  function renderTicker() {
    const frases = ['10% OFF en efectivo', 'Envíos a todo el país', 'Todas las tarjetas',
      'Nassau · Tango · Trionda', 'Elementos de entrenamiento', 'Catamarca · 383 460-8775'];
    // duplicamos 4 veces para que haya suficiente contenido sin importar el ancho del celular
    const bloque = frases.map(f => `<span>${f}</span>`).join('');
    const el = $('#tickerInner');
    el.innerHTML = bloque + bloque + bloque + bloque;
    // animacion JS: mas confiable que CSS en celulares (no se pausa, no desaparece)
    let x = 0;
    const mitad = el.scrollWidth / 2;  // recorremos la mitad y reiniciamos: seamless
    let last = 0;
    const SPEED = 0.10;  // px por ms
    function tick(now) {
      if (last) x += (now - last) * SPEED;
      if (x >= mitad) x -= mitad;
      el.style.transform = 'translateX(-' + x.toFixed(2) + 'px)';
      last = now;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ---------- tarjetas ---------- */
  const chipPrecio = p => esConsulta(p)
    ? '<span class="price ask">Consultar</span>'
    : `<span class="price">${money(p.precio)}</span>`;

  // botón ancho (escritorio) y botón redondo sobre la foto (celular)
  const btnAncho = p => p.stock
    ? `<button class="add" data-add="${p.id}">${esConsulta(p) ? 'Consultar' : 'Agregar'}</button>`
    : '<button class="add" disabled>Sin stock</button>';

  const btnRedondo = p => p.stock
    ? `<button class="addr" data-add="${p.id}" aria-label="Agregar ${esc(p.nombre)}">+</button>`
    : '<button class="addr" disabled aria-label="Sin stock">+</button>';

  function renderFeat() {
    $('#feat').innerHTML = DATA.productos.filter(p => p.destacado).map(p => `
      <article class="fcard reveal${p.stock ? '' : ' sold'}" data-ver="${p.id}">
        <div class="fimg">
          ${!p.stock ? '<span class="tag tag-off">Sin stock</span>' : ''}
          <img src="${p.img}" alt="${esc(p.nombre)}" loading="lazy">
          ${btnRedondo(p)}
        </div>
        <p class="cat">${catName(p.categoria)}</p>
        <h3>${esc(p.nombre)}</h3>
        <p class="det">${esc(p.detalle || '')}</p>
        <div class="fbot">${chipPrecio(p)}${btnAncho(p)}</div>
      </article>`).join('');
    enlazar($('#feat'));
  }

  function renderFilters() {
    const cats = [{ id: 'todo', nombre: 'Todas' }, ...DATA.categorias];
    $('#filters').innerHTML = cats.map(c => {
      const n = c.id === 'todo' ? DATA.productos.length
        : DATA.productos.filter(p => p.categoria === c.id).length;
      return `<button class="chip" role="tab" data-cat="${c.id}" aria-selected="${c.id === filtro}">${c.nombre}<span class="n">${n}</span></button>`;
    }).join('');
    $('#filters').querySelectorAll('.chip').forEach(b =>
      b.addEventListener('click', () => {
        filtro = b.dataset.cat;
        $('#filters').querySelectorAll('.chip').forEach(x =>
          x.setAttribute('aria-selected', x.dataset.cat === filtro));
        renderGrid();
      }));
  }

  function renderGrid() {
    const items = DATA.productos.filter(p => filtro === 'todo' || p.categoria === filtro);
    if (!items.length) {
      grid.innerHTML = `
        <div class="empty">
          <h3>Todavía no cargamos esta sección</h3>
          <p>Si buscás algo puntual, preguntanos y te lo conseguimos.</p>
          <a class="btn btn-lime" href="https://wa.me/${WHATSAPP}" target="_blank" rel="noopener">Preguntar por WhatsApp</a>
        </div>`;
      return;
    }
    grid.innerHTML = items.map(p => `
      <article class="card${p.stock ? '' : ' sold'}" data-ver="${p.id}">
        <div class="card-img">
          ${!p.stock ? '<span class="tag tag-off">Sin stock</span>'
            : p.destacado ? '<span class="tag">Destacada</span>' : ''}
          <img src="${p.img}" alt="${esc(p.nombre)}" loading="lazy">
          ${btnRedondo(p)}
        </div>
        <h3>${esc(p.nombre)}</h3>
        <p class="cat">${catName(p.categoria)}</p>
        <div class="card-foot">${chipPrecio(p)}${btnAncho(p)}</div>
      </article>`).join('');
    enlazar(grid);
  }

  function enlazar(scope) {
    scope.querySelectorAll('[data-add]').forEach(b =>
      b.addEventListener('click', e => { e.stopPropagation(); addToCart(b.dataset.add, b); }));
    scope.querySelectorAll('[data-ver]').forEach(c =>
      c.addEventListener('click', () => abrirFicha(c.dataset.ver)));
  }

  /* ---------- ficha de producto ---------- */
  const modal = $('#modal');

  function abrirFicha(id) {
    const p = find(id);
    if (!p) return;
    abierto = id;
    $('#mImg').src = p.img;
    $('#mImg').alt = p.nombre;
    $('#mCat').textContent = catName(p.categoria);
    $('#mNombre').textContent = p.nombre;
    $('#mDet').textContent = p.detalle || '';
    const talle = $('#mTalle');
    talle.hidden = !p.talle;
    if (p.talle) talle.textContent = 'Talle ' + p.talle;
    $('#mPrecio').outerHTML = chipPrecio(p).replace('<span', '<span id="mPrecio"');
    const add = $('#mAdd');
    add.textContent = !p.stock ? 'Sin stock' : esConsulta(p) ? 'Consultar' : 'Agregar';
    add.disabled = !p.stock;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    $('#scrim').hidden = false;
    document.body.style.overflow = 'hidden';
    history.replaceState(null, '', '#p=' + id);
  }

  function cerrarFicha() {
    abierto = null;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (!$('#cart').classList.contains('open')) {
      $('#scrim').hidden = true;
      document.body.style.overflow = '';
    }
    history.replaceState(null, '', location.pathname + location.search);
  }

  $('#modalClose').addEventListener('click', cerrarFicha);
  $('#mAdd').addEventListener('click', () => { if (abierto) { addToCart(abierto); cerrarFicha(); } });

  $('#mShare').addEventListener('click', async () => {
    if (!abierto) return;
    const p = find(abierto);
    const url = location.origin + location.pathname + '#p=' + abierto;
    const datos = { title: p.nombre + ' · Punto Pelota', text: `Mirá esta: ${p.nombre}`, url };
    try {
      if (navigator.share) { await navigator.share(datos); return; }
      await navigator.clipboard.writeText(url);
      toast('Link copiado');
    } catch { }
  });

  function abrirDesdeURL() {
    const m = location.hash.match(/^#p=(.+)$/);
    if (m && find(decodeURIComponent(m[1]))) abrirFicha(decodeURIComponent(m[1]));
  }

  /* ---------- carrito ---------- */
  function addToCart(id, btn) {
    const p = find(id);
    if (!p || !p.stock) return;
    carrito.set(id, (carrito.get(id) || 0) + 1);
    renderCart();
    if (suave && btn) volarAlCarrito(btn);
    const c = $('#cartCount');
    c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
    toast(p.nombre + ' agregada');
  }

  function volarAlCarrito(btn) {
    const img = btn.closest('.card, .fcard')?.querySelector('img');
    const destino = $('#bnCart').offsetParent ? $('#bnCart') : $('#cartOpen');
    if (!img || !destino) return;
    const a = img.getBoundingClientRect(), b = destino.getBoundingClientRect();
    if (!a.width || !b.width) return;
    const clon = img.cloneNode();
    clon.className = 'fly';
    Object.assign(clon.style, {
      left: a.left + 'px', top: a.top + 'px',
      width: a.width + 'px', height: a.height + 'px'
    });
    document.body.appendChild(clon);
    requestAnimationFrame(() => {
      const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
      const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
      clon.style.transform = `translate(${dx}px, ${dy}px) scale(.12) rotate(320deg)`;
      clon.style.opacity = '0';
    });
    setTimeout(() => clon.remove(), 780);
  }

  function setQty(id, delta) {
    const q = (carrito.get(id) || 0) + delta;
    if (q <= 0) carrito.delete(id); else carrito.set(id, q);
    renderCart();
  }

  function renderCart() {
    const body = $('#cartBody'), foot = $('#cartFoot');
    const count = [...carrito.values()].reduce((a, b) => a + b, 0);
    $('#cartCount').textContent = count;
    guardarCarrito();

    const subtotal = [...carrito].reduce((a, [id, q]) => {
      const p = find(id);
      return a + (!p || esConsulta(p) ? 0 : p.precio * q);
    }, 0);

    // contador del bottom-nav
    const bnCount = $('#bnCount');
    if (bnCount) bnCount.textContent = count;

    if (!carrito.size) {
      body.innerHTML = '<p class="cart-empty">Tu pedido está vacío.<br>Sumá algo del catálogo.</p>';
      foot.hidden = true;
      return;
    }

    body.innerHTML = [...carrito].map(([id, qty]) => {
      const p = find(id);
      return `
        <div class="ci">
          <img src="${p.img}" alt="">
          <div class="ci-info">
            <b>${esc(p.nombre)}</b>
            <span>${catName(p.categoria)}${p.talle ? ' · Talle ' + p.talle : ''} · ${esConsulta(p) ? 'a consultar' : money(p.precio)}</span>
          </div>
          <div class="qty">
            <button data-id="${id}" data-d="-1" aria-label="Quitar una">&minus;</button>
            <b>${qty}</b>
            <button data-id="${id}" data-d="1" aria-label="Sumar una">+</button>
          </div>
        </div>`;
    }).join('');
    body.querySelectorAll('.qty button').forEach(b =>
      b.addEventListener('click', () => setQty(b.dataset.id, +b.dataset.d)));

    const hayConsulta = [...carrito.keys()].some(id => esConsulta(find(id)));
    $('#subtotal').textContent = money(subtotal);
    $('#cash').textContent = money(Math.round(subtotal * (1 - DESCUENTO_EFECTIVO)));
    $('#cartNote').hidden = !hayConsulta;
    $('#checkout').href = armarWhatsApp(subtotal, hayConsulta);
    foot.hidden = false;
  }

  function armarWhatsApp(subtotal, hayConsulta) {
    const lineas = [...carrito].map(([id, q]) => {
      const p = find(id);
      const t = p.talle ? ` talle ${p.talle}` : '';
      return `• ${q}x ${p.nombre}${t} (${catName(p.categoria)}) — ${esConsulta(p) ? 'a consultar' : money(p.precio * q)}`;
    });
    const msg = [
      '¡Hola Punto Pelota! Quiero hacer este pedido:', '',
      ...lineas, '',
      `Total de lo que tiene precio: ${money(subtotal)}`,
      `Con 10% en efectivo: ${money(Math.round(subtotal * (1 - DESCUENTO_EFECTIVO)))}`,
      ...(hayConsulta ? ['', 'Me pasan el precio de lo que figura a consultar, por favor.'] : [])
    ].join('\n');
    return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(msg)}`;
  }

  /* ---------- drawer ---------- */
  const cart = $('#cart'), scrim = $('#scrim');
  const openCart = () => {
    if (modal.classList.contains('open')) cerrarFicha();
    cart.classList.add('open'); cart.setAttribute('aria-hidden', 'false');
    scrim.hidden = false; document.body.style.overflow = 'hidden';
  };
  const closeCart = () => {
    cart.classList.remove('open'); cart.setAttribute('aria-hidden', 'true');
    scrim.hidden = true; document.body.style.overflow = '';
  };
  $('#cartOpen').addEventListener('click', openCart);
  $('#bnCart').addEventListener('click', openCart);
  
  $('#cartClose').addEventListener('click', closeCart);
  scrim.addEventListener('click', () => { closeCart(); cerrarFicha(); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (modal.classList.contains('open')) cerrarFicha(); else closeCart();
  });

  /* ---------- detalles de movimiento ---------- */
  function observeReveals() {
    if (!suave) { document.querySelectorAll('.reveal').forEach(el => el.classList.add('in')); return; }
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((e, i) => {
        if (!e.isIntersecting) return;
        setTimeout(() => e.target.classList.add('in'), i * 70);
        obs.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
    document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  }

  document.addEventListener('pointermove', e => {
    const c = e.target.closest?.('.fcard');
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
    c.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
  }, { passive: true });

  const bar = $('#bar');
  addEventListener('scroll', () => bar.classList.toggle('stuck', scrollY > 40), { passive: true });

  let tT;
  function toast(txt) {
    const t = $('#toast');
    t.textContent = txt; t.classList.add('show');
    clearTimeout(tT); tT = setTimeout(() => t.classList.remove('show'), 1900);
  }

  renderCart();
  init();
})();