# Punto Pelota

Catálogo estático de pelotas de fútbol, medio pique y accesorios de entrenamiento.
Pedidos por WhatsApp, sin backend. Panel de administración desde el celular.

## Estructura

```
index.html              tienda
admin.html              panel de catálogo
assets/
  css/styles.css        tienda
  css/admin.css         panel
  js/app.js             tienda
  js/admin.js           panel (cripto + GitHub API)
  img/logo.webp         logo sobre fondo oscuro
  img/hero.webp         foto de portada
  img/banda.webp        foto seccion "Por qué duran"
  img/productos/*.webp  fotos recortadas
data/
  productos.json        catálogo
  vault.json            token de GitHub cifrado (lo generás vos, ver abajo)
```

## Probarlo local

El catálogo se carga con `fetch`, así que **no** funciona abriendo `index.html`
directo desde el explorador. Levantá un servidor:

```bash
python -m http.server 8080
# http://localhost:8080
```

---

## Panel de administración

Entrás por `/admin.html`, ponés la contraseña y editás el catálogo desde el celular.
Los cambios se commitean directo a GitHub y en un minuto están online.

### Qué hace

- Alta, edición y baja de productos
- Cambiar precio, categoría, detalle, destacado y stock
- Subir fotos nuevas (van a `assets/img/productos/`)
- Los cambios quedan locales hasta que tocás **Publicar**, así no hacés
  veinte commits por una sesión de edición

### Configuración inicial (una sola vez)

1. **Generá un token en GitHub.** Settings → Developer settings →
   Personal access tokens → **Fine-grained tokens**.
   - Repository access: **Only select repositories** → sólo este repo
   - Permissions → Repository permissions → **Contents: Read and write**
   - Poné fecha de expiración

2. **Abrí `/admin.html`** y tocá *Configurar por primera vez*.

3. Completá usuario, repo, rama, el token y una contraseña.
   Tocá **Generar vault.json**.

4. Descargá el archivo, guardalo como **`data/vault.json`** y subilo al repo.

5. Listo. A partir de ahí entrás sólo con la contraseña.

### Cómo se guarda el token

El token se cifra con **AES-GCM 256**, con clave derivada de tu contraseña por
**PBKDF2-SHA256 con 310.000 iteraciones** y salt aleatorio. El `vault.json` guarda
únicamente salt, IV y ciphertext. El token en claro no toca el disco ni el repo.

**Lo que tenés que tener claro:** si el repo es público, cualquiera puede bajarse
el `vault.json` y probar contraseñas offline sin límite de intentos. Las 310k
iteraciones hacen que cada intento cueste ~150 ms, lo cual mata la fuerza bruta
tonta, pero **no salva una contraseña débil**. Entonces:

- Usá una contraseña larga de verdad: 5 palabras al azar o 16+ caracteres.
  No la del resto de tus cuentas.
- Que el token sea fine-grained y toque **sólo este repo**. Si se filtra, lo peor
  que pueden hacer es editarte el catálogo, no entrar a tus otros proyectos.
- Ponele expiración y rotalo cada tanto. Para rotar: generás vault nuevo
  desde el panel y reemplazás el archivo.
- Si el repo es privado, el `vault.json` no queda expuesto y el problema desaparece.

### Errores comunes

| Qué dice | Qué pasó |
|---|---|
| `No encuentro data/vault.json` | Todavía no subiste el vault |
| `Contraseña incorrecta` | Contraseña mal, o el vault es de otra contraseña |
| `GitHub 401` | Token vencido o revocado. Generá vault nuevo |
| `GitHub 403` | Al token le falta permiso Contents: Read and write |
| `GitHub 409` | Alguien editó el archivo mientras vos editabas. Tocá Recargar |

---

## Editar productos a mano

Si preferís tocar el JSON directo, todo vive en `data/productos.json`:

```json
{
  "id": "nassau-pro-blanco",
  "nombre": "Nassau Pro Blanco",
  "categoria": "futbol",
  "precio": 35000,
  "img": "assets/img/productos/nassau-pro-blanco.webp",
  "destacado": false,
  "stock": true,
  "detalle": "Texto corto."
}
```

**Ojo con los IDs:** un mismo modelo que se vende en fútbol y en medio pique son dos
productos distintos con precios distintos. Por eso llevan sufijo
(`nassau-pro-naranja-futbol` y `nassau-pro-naranja-pique`). La imagen sí se repite.

Para agregar una categoría, sumala al array `categorias` y aparece sola como filtro.

## Imágenes

Cuadradas, fondo transparente, 560×560 `.webp`. Las actuales están recortadas con
flood-fill desde los bordes, así los paneles blancos de las pelotas no se pierden.

## Deploy en GitHub Pages

1. Push de todo a `main`.
2. Settings → Pages → Source: `Deploy from a branch` → `main` / `root`.
3. Listo, no hace falta build.

## Datos del negocio

Están en dos lugares, si cambian tocá los dos:

- `assets/js/app.js` → constantes `WHATSAPP` y `DESCUENTO_EFECTIVO`
- `index.html` → links `wa.me` del hero y del footer
