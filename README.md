# POPA — conselheiro financeiro familiar (offline)

App de orçamento para uma família que vive de um único salário, pensada para a realidade de Cabo Verde.
Funciona como um conselheiro: diz, em português claro, **o que fazer com o dinheiro, por que ordem**, e avisa
cedo quando algo corre mal. Toda a lógica são regras fixas aplicadas aos seus números: sem IA, sem servidor,
sem contas, e os dados nunca saem do dispositivo.

Existe em duas versões com **o mesmo código**:

| | App Android (APK) | Versão web (PWA) |
|---|---|---|
| Instalação | APK por sideload | Abrir o endereço e "Adicionar ao ecrã inicial" |
| Dados | Ficheiro `db.json` na pasta privada da app | IndexedDB do navegador |
| Offline | Sempre | Sim, depois da primeira visita (service worker) |
| Desbloqueio | PIN + impressão digital/rosto | Só PIN |
| Lembretes | Notificações locais agendadas | Ao abrir a app (Notification API) + painel no Início |
| Exportar | Folha de partilha do Android | Descarregar ficheiro |
| Atualizar | Instalar o APK novo por cima | Aviso "Há uma versão nova" → Atualizar |

> **Orientação geral, não substitui aconselhamento profissional.** Os valores legais e fiscais (IRS, descontos
> para o INPS, taxas de juro de referência) e os preços de referência **não estão fixos no código**: começam
> vazios e preenchem-se em **Mais → Perfil do agregado e parâmetros**. Os valores dos modelos sazonais são
> exemplos para ajustar.

## Princípios

1. O essencial é pago primeiro.
2. Cada escudo tem um destino.
3. Imprevistos e custos sazonais planeiam-se com antecedência, nunca a crédito.
4. A dívida cara combate-se por ordem.
5. Mudanças pequenas e constantes valem mais do que planos perfeitos.

## O que a app faz

| Ecrã | O que mostra |
|---|---|
| **Início** | Dias até ao salário e dinheiro por dia; o plano do ciclo (cascata) com o que falta cobrir em cada nível; "livre para gastar" só quando os níveis anteriores estão cobertos; défice e cortes sugeridos; semana crítica; avisos; conselho do mês; lembretes. |
| **Plano → Cascata** | Distribuição do rendimento por ordem: 1) essenciais (incluindo prestações mínimas e ajuda a familiares planeada), 2) fundo de emergência, 3) fundos de provisão, 4) dívidas acima do mínimo, 5) metas, 6) livre. Botão **Reservar este mês**. |
| **Plano → Emergência** | Etapas de 1, 3 e 6 meses de despesas essenciais, contribuição (% do salário), data estimada de cada etapa, uso para imprevistos com plano de reposição, ligação opcional a uma conta de poupança. |
| **Plano → Fundos** | Fundos de provisão ("envelopes": não mexem nos saldos das contas) e de longo prazo. Modelos cabo-verdianos ativáveis com um toque: reentrada escolar (× filhos em idade escolar), Natal e Ano Novo, Carnaval e Páscoa (datas calculadas), Santo António, São João, São Pedro, festa do município, férias e viagens inter-ilhas, seguros, impostos e taxas, documentos, manutenção da casa, estudos superiores, casa, reforma. |
| **Plano → Calendário** | Próximos 12 meses com os custos sazonais e os meses mais pesados. |
| **Consumos** | Luz e água pré-pagas e botija de gás: registo, duração estimada, quando carregar e quanto reservar por semana. Cesta alimentar semanal por pessoa (com ponto de meio da semana). Telefone/internet com alerta de variação. |
| **Dívidas** | Crédito bancário, de consumo, fiado e familiares. Rácio de endividamento com semáforo (verde até 20%, amarelo até 30%, vermelho acima; editável). Avalanche vs. bola de neve com prazo e juros poupados; simulação de crédito novo antes de aceitar. |
| **Simulador "e se"** | Salário ±X%, alimentação +10%, mais um filho, dívida nova, perda de rendimento extra: impacto no livre, na emergência e no rácio, sem alterar os dados. |
| **Indicadores e conselhos** | Taxa de poupança, meses de emergência, % em essenciais, endividamento, pontualidade das reservas; todos os conselhos com o porquê nos seus números. |
| **Revisão** | Revisão semanal de 5 minutos e revisão mensal guiada. |
| **Perfil** | Salário, dia do pagamento, pessoas, filhos, ilha/concelho, rendimentos extra, limite de ajuda a familiares, regra dos rendimentos extra (50/30/20 por defeito), parâmetros legais e preços, limites dos alertas. |
| Movimentos, Contas, Categorias, Metas, Recorrentes, Resumo | Como antes: registo rápido, filtros, orçamentos, recorrências automáticas, gráficos. |

O "mês" da app é o **ciclo salarial**: do dia do salário à véspera do salário seguinte.

## Estrutura do código

```
src/
  main.js            arranque, navegação, lembretes, tema, bloqueio
  store.js           ÚNICO acesso aos dados: memória, debounce, escrita atómica, recuperação, backups, migrações
  storage.js         adaptadores de armazenamento com a mesma interface: ficheiro (APK) e IndexedDB (web)
  platform/          o que muda entre APK e web: index.js escolhe native.js (Capacitor) ou web.js (PWA)
  migrations.js      schemaVersion (v2) e migrações
  domain.js          dinheiro, datas, períodos, saldos, orçamentos, recorrências, CSV
  finance.js         cascata, emergência, fundos, consumos, fim do mês, dívidas, rendimentos extra, simulador
  advisor.js         indicadores, avisos, conselhos e lembretes (regras)
  templates.js       modelos sazonais de Cabo Verde, Páscoa/Carnaval calculados
  transfer.js        exportar/importar entre dispositivos (validação e pré-visualização)
  seed.js            dados de exemplo
  charts.js, ui.js, lock.js, styles.css, sw.js (service worker da web)
  views/             inicio, plano, fundos, consumos, dividas, simulador, conselheiro, perfil, extra, …
test/                node:test — 97 testes (os do store correm nos dois armazenamentos)
scripts/             gen-assets.mjs (ícones Android + PWA, sem dependências), gen-keystore.mjs, vite-pwa.mjs
.github/workflows/   android.yml (APK assinado) e pages.yml (versão web)
```

### Dados (`db.json`, esquema v2)

Valores em **centavos inteiros**; datas `AAAA-MM-DD`. Coleções: `accounts`, `categories` (com `nivel`
essencial/livre/família e `essencialTipo`), `transactions` (com `dividaId` opcional), `recurring`, `goals`,
`household` (perfil e parâmetros), `emergencyFund`, `funds`, `allocations` (reservas nos envelopes),
`debts`, `seasonalTemplates`, `utilityLogs`, `extraIncomeRules`, `scenarios`, `advice`, `settings`
(incluindo `limites` e `dividas`) e `meta`.

**Migração v1 → v2:** automática ao abrir a versão nova, com backup `pre-migracao-v1-…` antes. Não apaga nem
altera movimentos, contas, recorrências ou metas: só acrescenta o perfil, as coleções novas, a classificação das
categorias (editável) e categorias em falta (Eletricidade e água, Gás, Prestações e dívidas, Ajuda a familiares,
Remessas recebidas, Biscates e vendas). Se o dia de início do mês era diferente de 1, passa a ser o dia do salário.

## Desenvolvimento no PC (opcional)

Requer Node 22+.

```bash
npm install            # o .npmrc já ativa legacy-peer-deps
npm test               # 97 testes
npm run dev            # abre a app no browser
npm run build          # build do APK  → dist/
npm run build:web      # build da PWA  → dist-web/ (com manifest e service worker)
npx cap sync android   # copia dist/ para o projeto Android
npm run assets         # regenera ícones (Android, notificações e PWA) e splash
```

## Publicar (GitHub Actions)

O repositório só tem código: nenhum dado pessoal vai para o GitHub (o workflow da web até verifica que o build
não contém ficheiros `.json` de dados).

### Uma única vez

1. **Repositório.** O GitHub Pages gratuito só publica a partir de repositórios **públicos** (num repositório
   privado é preciso um plano pago). Como o repositório só tem código, pode ser público. A keystore e as
   passwords ficam nos *secrets*, que nunca são públicos.
   ```bash
   git init -b main
   git add .
   git update-index --chmod=+x android/gradlew
   git commit -m "POPA"
   git remote add origin https://github.com/clovisribeiro1611/popa.git
   git push -u origin main
   ```
2. **Assinatura do APK.** Corra `npm run keystore` uma vez e crie os secrets `KEYSTORE_BASE64`,
   `KEYSTORE_PASSWORD` e `KEY_ALIAS` (Settings → Secrets and variables → Actions). Guarde a pasta
   `popa-keystore` num local seguro, fora do repositório: **é sempre a mesma keystore** que permite instalar
   atualizações por cima sem perder dados.
3. **GitHub Pages.** Settings → Pages → *Source*: **GitHub Actions**.

### A cada push para `main`

- **Build APK** (`android.yml`): testes → build → APK assinado → artefacto + Release `v1.0.N`.
- **Publicar web** (`pages.yml`): testes → build web → publica em `https://clovisribeiro1611.github.io/popa/`.

Também se podem lançar à mão em **Actions → (workflow) → Run workflow**.

## Instalar e atualizar o APK (sideload)

1. No telemóvel, abra **Releases** no GitHub e descarregue `popa-1.0.N.apk`.
2. Abra o ficheiro; na primeira vez autorize o navegador a instalar apps; toque em **Instalar**
   (no aviso do Play Protect: *Mais detalhes → Instalar mesmo assim*).
3. **Atualizar sem perder dados:** instale o APK novo **por cima** (não desinstale). Funciona porque é assinado
   com a mesma keystore. Ao abrir, a app migra os dados para o esquema novo e guarda antes um backup.
   Por precaução, exporte uma cópia completa antes de atualizar.

## Instalar a versão web no ecrã inicial

Abra `https://clovisribeiro1611.github.io/popa/` uma vez com Internet (a partir daí funciona offline).

- **Android (Chrome / Samsung Internet):** menu ⋮ → **Adicionar ao ecrã principal** / **Instalar app**.
- **iPhone (Safari):** botão Partilhar → **Adicionar ao ecrã principal**.
- **PC (Chrome / Edge):** ícone de instalação na barra de endereço (ou menu → *Instalar POPA*).

Quando há uma versão nova aparece **"Há uma versão nova da app"**; toque em **Atualizar** quando quiser. Os dados
ficam e nada é substituído sem aviso.

> **Importante na web:** os dados ficam no navegador desse dispositivo. A app pede *armazenamento persistente*;
> se o navegador não o garantir, mostra um aviso. **"Limpar dados do site", limpar o histórico com dados de sites
> ou desinstalar o navegador apaga a base de dados.** Exporte cópias com regularidade.

## Backups

- **Automáticos:** um por dia (últimos 30), mais cópias antes de migrações, importações, restauros e "apagar tudo".
  Estão em **Definições → Backups automáticos**, onde podem ser **restaurados** ou **partilhados**. Ficam no
  próprio dispositivo: desinstalar a app (APK) ou limpar os dados do site (web) apaga-os também.
- **Fora do dispositivo (recomendado, pelo menos uma vez por mês):** **Definições → Cópia completa (.json)**.
  No APK abre a folha de partilha (e-mail para si, guardar em ficheiros, enviar para o PC); na web descarrega o
  ficheiro. A cópia inclui tudo **exceto o PIN**.
- **CSV:** "CSV do mês" ou "CSV completo" para o Excel (separador `;`, vírgula decimal).

### Restaurar

- **Cópia `.json`:** Definições → **Importar CSV ou cópia .json…** → escolher o ficheiro → ver o resumo → confirmar.
  Substitui todos os dados (os atuais ficam num backup `pre-importacao-…`).
- **CSV:** o mesmo botão; os movimentos são **acrescentados** (linhas repetidas são ignoradas).

## Passar dados entre o APK e a versão web

Não há sincronização automática. Para passar os dados de um dispositivo para o outro:

1. No dispositivo **com os dados**: **Definições → Cópia completa (.json)**.
2. Leve o ficheiro para o outro dispositivo (e-mail para si, cabo USB, pen).
3. No outro dispositivo: **Definições → Importar CSV ou cópia .json…**. A app:
   - valida o ficheiro e o `schemaVersion` (uma cópia de uma versão **mais recente** é recusada com o aviso para
     atualizar a app; uma **mais antiga** é migrada);
   - mostra a pré-visualização: movimentos, período, contas, fundos, dívidas, metas, salário e data da última
     alteração, **agora vs. depois**;
   - guarda um backup automático e só então substitui os dados.

O PIN, a biometria e o tema de cada dispositivo mantêm-se. Depois de passar os dados, use só um dos dispositivos
(ou repita a transferência), para não ficar com duas versões diferentes.

## Segurança e privacidade

- Nada sai do dispositivo: sem servidor, sem contas, sem analytics, sem bibliotecas carregadas por CDN.
  O APK nem tem permissão de Internet; a versão web tem uma política de segurança (CSP) que só permite
  ficheiros da própria app.
- PIN guardado como hash PBKDF2 com *salt* (nunca em texto); não vai nas cópias exportadas.
  O bloqueio é um ecrã de privacidade: não cifra os dados.
- Se esquecer o PIN: reinstale/limpe os dados e importe a última cópia `.json`.
