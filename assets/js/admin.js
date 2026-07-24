/* Punto Pelota — panel de catálogo
   Vault: PBKDF2-SHA256 (310k) -> AES-GCM 256. El token nunca se guarda en claro. */
(() => {
  'use strict';

  const VAULT_PATH = 'data/vault.json';
  const DATA_PATH = 'data/productos.json';
  const IMG_DIR = 'assets/img/productos/';
  const ITER = 310000;

  const $ = s => document.querySelector(s);
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  let cfg = null;        // {owner, repo, branch, token}
  let data = null;       // productos.json parseado
  let sha = null;        // sha del productos.json remoto
  let dirty = false;
  let filtro = 'todo';
  let editing = null;    // id en edición, o null si es nuevo
  const pendingImgs = new Map(); // ruta -> base64 (subir al publicar)

  /* ---------- utilidades base64 ---------- */
  const b64FromBytes = b => btoa(String.fromCharCode(...new Uint8Array(b)));
  const bytesFromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  function b64FromText(txt) {
    const bytes = enc.encode(txt);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  function textFromB64(b64) {
    const bin = atob(b64.replace(/\s/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return dec.decode(bytes);
  }

  /* ---------- cripto ---------- */
  async function deriveKey(pass, salt) {
    const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  }

  async function sealVault(pass, payload) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(pass, salt);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(payload)));
    return { v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64FromBytes(salt), iv: b64FromBytes(iv), data: b64FromBytes(ct) };
  }

  async function openVault(pass, vault) {
    const key = await deriveKey(pass, bytesFromB64(vault.salt));
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytesFromB64(vault.iv) }, key, bytesFromB64(vault.data)
    );
    return JSON.parse(dec.decode(pt));
  }

  /* ---------- GitHub ---------- */
  const api = p => `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/${p}`;

  async function gh(path, opts = {}) {
    const res = await fetch(api(path), {
      ...opts,
      headers: {
        'Authorization': 'Bearer ' + cfg.token,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.headers || {})
      }
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`GitHub ${res.status}: ${t.slice(0, 180)}`);
    }
    return res.json();
  }

  async function pullData() {
    const j = await gh(`contents/${DATA_PATH}?ref=${cfg.branch}&t=${Date.now()}`);
    sha = j.sha;
    data = JSON.parse(textFromB64(j.content));
    dirty = false;
    pendingImgs.clear();
  }

  async function putFile(path, contentB64, message, prevSha) {
    const body = { message, content: contentB64, branch: cfg.branch };
    if (prevSha) body.sha = prevSha;
    return gh(`contents/${path}`, { method: 'PUT', body: JSON.stringify(body) });
  }

  async function shaOf(path) {
    try {
      const j = await gh(`contents/${path}?ref=${cfg.branch}`);
      return j.sha;
    } catch { return null; }
  }

  /* ---------- login ---------- */
  $('#btnUnlock').addEventListener('click', unlock);
  $('#pass').addEventListener('keydown', e => e.key === 'Enter' && unlock());

  async function unlock() {
    const pass = $('#pass').value;
    const err = $('#loginErr');
    err.hidden = true;
    if (!pass) return showErr(err, 'Escribí la contraseña.');
    $('#btnUnlock').disabled = true;
    $('#btnUnlock').textContent = 'Desbloqueando…';
    try {
      const vres = await fetch(VAULT_PATH + '?t=' + Date.now(), { cache: 'no-store' });
      if (!vres.ok) throw new Error('no-vault');
      const vault = await vres.json();
      cfg = await openVault(pass, vault);
      await pullData();
      $('#pass').value = '';
      show('app');
      $('#repoLabel').textContent = `${cfg.owner}/${cfg.repo}`;
      renderFilters();
      render();
    } catch (e) {
      if (e.message === 'no-vault') {
        showErr(err, 'No encuentro data/vault.json. Configuralo primero.');
      } else if (e.name === 'OperationError') {
        showErr(err, 'Contraseña incorrecta.');
      } else {
        showErr(err, e.message);
      }
    } finally {
      $('#btnUnlock').disabled = false;
      $('#btnUnlock').textContent = 'Desbloquear';
    }
  }

  const showErr = (el, msg) => { el.textContent = msg; el.hidden = false; };

  function show(which) {
    $('#scLogin').hidden = which !== 'login';
    $('#scSetup').hidden = which !== 'setup';
    $('#scApp').hidden = which !== 'app';
  }

  $('#goSetup').addEventListener('click', () => show('setup'));
  $('#backLogin').addEventListener('click', () => show('login'));
  $('#btnLock').addEventListener('click', () => {
    if (dirty && !confirm('Tenés cambios sin publicar. ¿Salir igual?')) return;
    cfg = null; data = null; sha = null; dirty = false; pendingImgs.clear();
    show('login');
  });

  /* ---------- setup ---------- */
  $('#btnGenerate').addEventListener('click', async () => {
    const err = $('#setupErr'); err.hidden = true;
    const owner = $('#sOwner').value.trim();
    const repo = $('#sRepo').value.trim();
    const branch = $('#sBranch').value.trim() || 'main';
    const token = $('#sToken').value.trim();
    const p1 = $('#sPass1').value, p2 = $('#sPass2').value;

    if (!owner || !repo || !token) return showErr(err, 'Faltan usuario, repo o token.');
    if (p1.length < 10) return showErr(err, 'La contraseña tiene que tener 10 caracteres o más.');
    if (p1 !== p2) return showErr(err, 'Las contraseñas no coinciden.');

    const vault = await sealVault(p1, { owner, repo, branch, token });
    const txt = JSON.stringify(vault, null, 2);
    $('#vaultText').value = txt;
    $('#vaultOut').hidden = false;
    $('#sToken').value = ''; $('#sPass1').value = ''; $('#sPass2').value = '';
  });

  $('#btnCopy').addEventListener('click', () => {
    navigator.clipboard.writeText($('#vaultText').value).then(() => toast('Copiado'));
  });
  $('#btnDownload').addEventListener('click', () => {
    const blob = new Blob([$('#vaultText').value], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'vault.json'; a.click();
    URL.revokeObjectURL(a.href);
  });

  /* ---------- render lista ---------- */
  const money = n => '$' + Number(n).toLocaleString('es-AR');
  const catName = id => (data.categorias.find(c => c.id === id) || {}).nombre || id;

  function renderFilters() {
    const cats = [{ id: 'todo', nombre: 'Todo' }, ...data.categorias];
    $('#aFilters').innerHTML = cats.map(c =>
      `<button class="chip" data-cat="${c.id}" aria-selected="${c.id === filtro}">${c.nombre}</button>`).join('');
    $('#aFilters').querySelectorAll('.chip').forEach(b =>
      b.addEventListener('click', () => {
        filtro = b.dataset.cat;
        $('#aFilters').querySelectorAll('.chip').forEach(x =>
          x.setAttribute('aria-selected', x.dataset.cat === filtro));
        render();
      }));
  }

  function render() {
    const items = data.productos.filter(p => filtro === 'todo' || p.categoria === filtro);
    $('#aList').innerHTML = items.map(p => `
      <li class="item${p.stock ? '' : ' off'}" data-id="${p.id}">
        <img src="${pendingImgs.has(p.img) ? 'data:image/*;base64,' + pendingImgs.get(p.img) : p.img}" alt="" loading="lazy">
        <div class="it-txt">
          <b>${p.nombre}</b>
          <span>${catName(p.categoria)} · ${money(p.precio)}${p.destacado ? ' · destacado' : ''}${p.stock ? '' : ' · SIN STOCK'}</span>
        </div>
        <button class="mini" data-act="edit">Editar</button>
      </li>`).join('') || '<li class="none">No hay productos en esta categoría.</li>';

    $('#aList').querySelectorAll('[data-act="edit"]').forEach(b =>
      b.addEventListener('click', () => openSheet(b.closest('.item').dataset.id)));

    $('#dirtyBar').hidden = !dirty;
    $('#dirtyMsg').textContent = pendingImgs.size
      ? `Cambios sin publicar · ${pendingImgs.size} imagen(es) nueva(s)`
      : 'Tenés cambios sin publicar.';
  }

  /* ---------- editor ---------- */
  const sheet = $('#sheet'), scrim = $('#scrim');

  function openSheet(id) {
    editing = id;
    const p = id ? data.productos.find(x => x.id === id) : null;
    $('#sheetTitle').textContent = p ? 'Editar producto' : 'Producto nuevo';
    $('#fCategoria').innerHTML = data.categorias.map(c =>
      `<option value="${c.id}">${c.nombre}</option>`).join('');

    $('#fNombre').value = p ? p.nombre : '';
    $('#fId').value = p ? p.id : '';
    $('#fCategoria').value = p ? p.categoria : data.categorias[0].id;
    $('#fPrecio').value = p ? p.precio : '';
    $('#fDetalle').value = p ? (p.detalle || '') : '';
    $('#fImg').value = p ? p.img : '';
    $('#fStock').checked = p ? !!p.stock : true;
    $('#fDestacado').checked = p ? !!p.destacado : false;
    $('#btnDelete').hidden = !p;
    $('#sheetErr').hidden = true;
    updatePreview();

    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    scrim.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeSheet() {
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    scrim.hidden = true;
    document.body.style.overflow = '';
    editing = null;
  }
  $('#sheetClose').addEventListener('click', closeSheet);
  scrim.addEventListener('click', closeSheet);
  document.addEventListener('keydown', e => e.key === 'Escape' && sheet.classList.contains('open') && closeSheet());

  function updatePreview() {
    const path = $('#fImg').value;
    const img = $('#fPreview');
    img.src = pendingImgs.has(path) ? 'data:image/*;base64,' + pendingImgs.get(path) : (path || '');
  }
  $('#fImg').addEventListener('input', updatePreview);

  const slug = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  $('#fNombre').addEventListener('input', () => {
    if (!editing && !$('#fId').dataset.touched) $('#fId').value = slug($('#fNombre').value);
  });
  $('#fId').addEventListener('input', () => { $('#fId').dataset.touched = '1'; });

  $('#btnPick').addEventListener('click', () => $('#fFile').click());
  $('#fFile').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const name = (slug($('#fId').value || $('#fNombre').value) || 'producto') + '.' + (file.name.split('.').pop() || 'webp').toLowerCase();
    const path = IMG_DIR + name;
    const buf = await file.arrayBuffer();
    let bin = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    pendingImgs.set(path, btoa(bin));
    $('#fImg').value = path;
    updatePreview();
    toast('Imagen lista para publicar');
    e.target.value = '';
  });

  $('#btnSave').addEventListener('click', () => {
    const err = $('#sheetErr'); err.hidden = true;
    const id = $('#fId').value.trim();
    const nombre = $('#fNombre').value.trim();
    const precio = parseInt($('#fPrecio').value, 10);

    if (!nombre) return showErr(err, 'Falta el nombre.');
    if (!id) return showErr(err, 'Falta el ID.');
    if (!/^[a-z0-9-]+$/.test(id)) return showErr(err, 'El ID sólo admite minúsculas, números y guiones.');
    if (!Number.isFinite(precio) || precio < 0) return showErr(err, 'Precio inválido.');
    if (data.productos.some(p => p.id === id && p.id !== editing)) return showErr(err, 'Ya existe un producto con ese ID.');

    const rec = {
      id, nombre,
      categoria: $('#fCategoria').value,
      precio,
      img: $('#fImg').value.trim(),
      destacado: $('#fDestacado').checked,
      stock: $('#fStock').checked,
      detalle: $('#fDetalle').value.trim()
    };

    if (editing) {
      const i = data.productos.findIndex(p => p.id === editing);
      data.productos[i] = rec;
    } else {
      data.productos.push(rec);
    }
    dirty = true;
    closeSheet();
    render();
    toast('Guardado local. Falta publicar.');
  });

  $('#btnDelete').addEventListener('click', () => {
    if (!editing || !confirm('¿Eliminar este producto?')) return;
    data.productos = data.productos.filter(p => p.id !== editing);
    dirty = true;
    closeSheet();
    render();
  });

  $('#btnNew').addEventListener('click', () => { $('#fId').dataset.touched = ''; openSheet(null); });

  /* ---------- publicar ---------- */
  $('#btnPublish').addEventListener('click', async () => {
    const btn = $('#btnPublish');
    btn.disabled = true; btn.textContent = 'Publicando…';
    try {
      for (const [path, b64] of pendingImgs) {
        const prev = await shaOf(path);
        await putFile(path, b64, `admin: imagen ${path.split('/').pop()}`, prev);
      }
      pendingImgs.clear();

      data.actualizado = new Date().toISOString().slice(0, 10);
      const body = JSON.stringify(data, null, 2) + '\n';
      const res = await putFile(DATA_PATH, b64FromText(body), 'admin: catálogo actualizado', sha);
      sha = res.content.sha;
      dirty = false;
      render();
      toast('Publicado. En un minuto se ve online.');
    } catch (e) {
      alert('No se pudo publicar.\n\n' + e.message +
        '\n\nSi dice 409, alguien más editó el archivo: tocá Recargar y rehacé el cambio.');
    } finally {
      btn.disabled = false; btn.textContent = 'Publicar';
    }
  });

  $('#btnDiscard').addEventListener('click', async () => {
    if (!confirm('¿Descartar todos los cambios sin publicar?')) return;
    await pullData(); render(); toast('Cambios descartados');
  });

  $('#btnReload').addEventListener('click', async () => {
    if (dirty && !confirm('Tenés cambios sin publicar. ¿Recargar igual?')) return;
    await pullData(); render(); toast('Recargado desde GitHub');
  });

  window.addEventListener('beforeunload', e => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- toast ---------- */
  let tT;
  function toast(txt) {
    const t = $('#toast');
    t.textContent = txt; t.classList.add('show');
    clearTimeout(tT); tT = setTimeout(() => t.classList.remove('show'), 2200);
  }
})();
