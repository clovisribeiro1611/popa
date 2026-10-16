// Gera o ícone (adaptativo + monocromático) e o splash do Android como vector drawables,
// a partir de uma única definição. Sem dependências: `npm run assets`.
// Também escreve resources/icon.svg (pré-visualização) e remove os PNG do template do Capacitor.

import { mkdirSync, writeFileSync, rmSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const BG = '#0F766E';        // verde-azulado da app
const FG = '#FFFFFF';
const ACCENT = '#FCC419';    // moeda

// Desenho numa grelha de 108×108 (ícone adaptativo; zona segura = círculo de raio 33 no centro).
// "P" com o interior recortado (evenOdd) e uma moeda.
const P_PATH = 'M40,32 H60 A13,13 0 0 1 60,58 H50 V76 H40 Z M50,41 V49 H59 A4,4 0 0 0 59,41 Z';
const COIN = { cx: 68, cy: 70, r: 7.5 };
const COIN_PATH = `M${COIN.cx - COIN.r},${COIN.cy} a${COIN.r},${COIN.r} 0 1 0 ${COIN.r * 2},0 a${COIN.r},${COIN.r} 0 1 0 ${-COIN.r * 2},0 Z`;

const RES = 'android/app/src/main/res';
if (!existsSync(RES)) {
  console.error(`Pasta ${RES} não encontrada. Corra primeiro: npx cap add android`);
  process.exit(1);
}

const write = (rel, content) => {
  const full = join(RES, rel);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content.trim() + '\n');
  console.log('  ✓', rel);
};

const vector = (paths) => `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
${paths}
</vector>`;

const fgPaths = (pColor, coinColor) => `
    <path android:fillColor="${pColor}" android:fillType="evenOdd" android:pathData="${P_PATH}"/>
    <path android:fillColor="${coinColor}" android:pathData="${COIN_PATH}"/>`;

// Remover recursos antigos do template
for (const dir of readdirSync(RES)) {
  const d = join(RES, dir);
  if (/^mipmap-(m|h|xh|xxh|xxxh)dpi$/.test(dir)) rmSync(d, { recursive: true, force: true });
  if (/^drawable(-land|-port)?(-\w+dpi)?$/.test(dir)) rmSync(join(d, 'splash.png'), { force: true });
  if (/^drawable-(land|port)-\w+dpi$/.test(dir) && readdirSync(d).length === 0) rmSync(d, { recursive: true });
}
rmSync(join(RES, 'drawable-v24/ic_launcher_foreground.xml'), { force: true });
rmSync(join(RES, 'drawable/ic_launcher_background.xml'), { force: true });

console.log('A gerar ícone e splash:');
write('values/ic_launcher_background.xml', `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BG}</color>
</resources>`);
write('drawable/ic_launcher_foreground.xml', vector(fgPaths(FG, ACCENT)));
write('drawable/ic_launcher_monochrome.xml', vector(fgPaths('#FFFFFFFF', '#FFFFFFFF')));
for (const name of ['ic_launcher', 'ic_launcher_round']) {
  write(`mipmap-anydpi-v26/${name}.xml`, `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>`);
}
// Ícone pequeno das notificações (só alfa: o Android pinta-o): o "P" ampliado para ocupar o quadrado.
write('drawable/ic_stat_popa.xml', `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="108" android:viewportHeight="108">
    <group android:translateX="-2.5" android:translateY="-0.5" android:scaleX="2" android:scaleY="2" android:pivotX="56.5" android:pivotY="55">
        <path android:fillColor="#FFFFFFFF" android:fillType="evenOdd" android:pathData="${P_PATH}"/>
        <path android:fillColor="#FFFFFFFF" android:pathData="${COIN_PATH}"/>
    </group>
</vector>`);
// Splash (Android < 12 e fundo enquanto o WebView arranca): fundo + logótipo centrado.
write('drawable/splash.xml', `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item><color android:color="${BG}"/></item>
    <item android:drawable="@drawable/ic_launcher_foreground" android:gravity="center"
        android:width="216dp" android:height="216dp"/>
</layer-list>`);
// Splash do Android 12+ (API SplashScreen): mesma cor e ícone.
write('values/styles.xml', `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="AppTheme" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="colorPrimary">${BG}</item>
        <item name="colorPrimaryDark">${BG}</item>
        <item name="colorAccent">${BG}</item>
    </style>

    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
    </style>

    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/splash</item>
        <item name="windowSplashScreenBackground">${BG}</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/ic_launcher_foreground</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>
</resources>`);

// ---------- Ícones PNG da PWA (rasterizador mínimo, sem dependências) ----------

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const inRightHalfDisk = (x, y, cx, cy, r) => x >= cx && (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
// Mesmo desenho do P_PATH: contorno exterior menos o interior (evenOdd).
const inP = (x, y) => {
  const outer = inRect(x, y, 40, 32, 60, 58) || inRightHalfDisk(x, y, 60, 45, 13) || inRect(x, y, 40, 58, 50, 76);
  const hole = inRect(x, y, 50, 41, 59, 49) || inRightHalfDisk(x, y, 59, 45, 4);
  return outer && !hole;
};
const inCoin = (x, y) => (x - COIN.cx) ** 2 + (y - COIN.cy) ** 2 <= COIN.r ** 2;
const inRounded = (x, y, r) => {
  const cx = Math.min(Math.max(x, r), 108 - r), cy = Math.min(Math.max(y, r), 108 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};

/** Renderiza o ícone em `size` px. `radius` = canto do fundo (0 = quadrado, para "maskable"); `scale` encolhe o desenho. */
function renderIcon(size, { radius = 24, scale = 1 } = {}) {
  const SS = 4; // supersampling 4×4
  const bg = hex(BG), fg = hex(FG), ac = hex(ACCENT);
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxx = 0; pxx < size; pxx++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const x = ((pxx + (sx + 0.5) / SS) / size) * 108, y = ((py + (sy + 0.5) / SS) / size) * 108;
        if (radius && !inRounded(x, y, radius)) continue;
        const dx = 54 + (x - 54) / scale, dy = 54 + (y - 54) / scale;
        const c = inCoin(dx, dy) ? ac : inP(dx, dy) ? fg : bg;
        r += c[0]; g += c[1]; b += c[2]; a += 255;
      }
      const n = SS * SS, i = (py * size + pxx) * 4, cov = a / n;
      if (cov) { px[i] = r / (a / 255); px[i + 1] = g / (a / 255); px[i + 2] = b / (a / 255); }
      px[i + 3] = cov;
    }
  }
  return encodePNG(size, size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; // RGBA 8 bits
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const ICONS = 'src/public/icons';
mkdirSync(ICONS, { recursive: true });
console.log('A gerar ícones da PWA:');
for (const [name, size, opts] of [
  ['icon-192.png', 192, {}], ['icon-512.png', 512, {}],
  ['maskable-512.png', 512, { radius: 0, scale: 0.8 }], // zona segura do Android
  ['apple-touch-icon.png', 180, { radius: 0 }]
]) {
  writeFileSync(join(ICONS, name), renderIcon(size, opts));
  console.log('  ✓', `${ICONS}/${name}`);
}

mkdirSync('resources', { recursive: true });
writeFileSync('resources/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="432" height="432">
  <rect width="108" height="108" rx="24" fill="${BG}"/>
  <path fill="${FG}" fill-rule="evenodd" d="${P_PATH}"/>
  <path fill="${ACCENT}" d="${COIN_PATH}"/>
</svg>\n`);
console.log('  ✓ resources/icon.svg (pré-visualização)');
copyFileSync('resources/icon.svg', join(ICONS, 'favicon.svg'));
