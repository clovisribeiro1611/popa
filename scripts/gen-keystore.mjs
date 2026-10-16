// Gera a keystore de assinatura (uma única vez!) e o texto base64 para o secret do GitHub.
// Uso: node scripts/gen-keystore.mjs [pasta-de-destino]
// Usa o `keytool` (JDK) se existir; caso contrário usa o `openssl` (incluído no Git for Windows).
// A keystore NUNCA deve ir para o repositório: guarde-a (e a password) num gestor de passwords
// ou noutro local seguro. Se a perder, não conseguirá atualizar a app sem a desinstalar.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';

const outDir = resolve(process.argv[2] || join(homedir(), 'popa-keystore'));
const ksFile = join(outDir, 'popa-release.keystore');
const alias = 'popa';
const password = randomBytes(18).toString('base64url');
const dname = 'CN=POPA, O=Uso pessoal, C=CV';

if (existsSync(ksFile)) {
  console.error(`Já existe ${ksFile}. Não gere outra: use sempre a mesma keystore.`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const has = (cmd) => spawnSync(cmd, ['-help'], { stdio: 'ignore', shell: false }).error === undefined;

if (has('keytool')) {
  execFileSync('keytool', ['-genkeypair', '-v', '-keystore', ksFile, '-storetype', 'PKCS12', '-alias', alias,
    '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000', '-dname', dname,
    '-storepass', password, '-keypass', password], { stdio: 'inherit' });
} else if (has('openssl')) {
  const key = join(outDir, 'tmp-key.pem'), cert = join(outDir, 'tmp-cert.pem');
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:4096', '-sha256', '-days', '10000', '-nodes',
      '-keyout', key, '-out', cert, '-subj', '/CN=POPA/O=Uso pessoal/C=CV'], { stdio: 'inherit' });
    execFileSync('openssl', ['pkcs12', '-export', '-inkey', key, '-in', cert, '-name', alias,
      '-out', ksFile, '-passout', `pass:${password}`], { stdio: 'inherit' });
  } finally {
    rmSync(key, { force: true });
    rmSync(cert, { force: true });
  }
} else {
  console.error('Não encontrei keytool nem openssl. Instale o Git for Windows (traz openssl) ou um JDK.');
  process.exit(1);
}

const b64 = readFileSync(ksFile).toString('base64');
writeFileSync(join(outDir, 'keystore.b64.txt'), b64);
writeFileSync(join(outDir, 'LEIA-ME.txt'), [
  'Keystore de assinatura da app POPA — GUARDE ESTA PASTA EM LOCAL SEGURO.',
  '',
  `Ficheiro:   ${ksFile}`,
  `Alias:      ${alias}`,
  `Password:   ${password}`,
  '',
  'Secrets a criar no GitHub (Settings → Secrets and variables → Actions → New repository secret):',
  '  KEYSTORE_BASE64   = conteúdo de keystore.b64.txt',
  `  KEYSTORE_PASSWORD = ${password}`,
  `  KEY_ALIAS         = ${alias}`,
  ''
].join('\n'));

console.log(`
Keystore criada em: ${ksFile}

Crie estes 3 secrets no GitHub (Settings → Secrets and variables → Actions):
  KEYSTORE_BASE64   = conteúdo do ficheiro ${join(outDir, 'keystore.b64.txt')}
  KEYSTORE_PASSWORD = ${password}
  KEY_ALIAS         = ${alias}

Os mesmos dados ficaram em ${join(outDir, 'LEIA-ME.txt')}.
Guarde a pasta ${outDir} num local seguro (fora do repositório) e apague keystore.b64.txt depois de criar o secret.
`);
