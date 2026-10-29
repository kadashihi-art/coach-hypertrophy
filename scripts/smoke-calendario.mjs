/**
 * Smoke de toque do calendário (Plano → Calendário), viewport mobile real
 * (hasTouch/isMobile + touchscreen.tap). Cria uma conta de teste nova.
 *
 *   SMOKE_URL=https://<preview> [SMOKE_SHARE=<_vercel_share>] [SMOKE_SHOTS=/dir/prefix] npm run smoke:calendario
 *
 * Cobre: mês anterior/próximo, tocar num dia, os 3 botões do card do dia
 * (incluindo trocar o status de um dia já "Feito"), "Começar hoje" e se o
 * salvamento persiste após reload. Em cada toque checa elementFromPoint no
 * centro do botão (nada por cima: BottomNav, pill do cronômetro, sheet…).
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const U = process.env.SMOKE_URL?.replace(/\/$/, "");
if (!U) throw new Error("Defina SMOKE_URL");
const SHARE = process.env.SMOKE_SHARE ?? "";
const SHOTS = process.env.SMOKE_SHOTS ?? "";
const KEY = "coach-hypertrophy:v5";
const seed = readFileSync(new URL("./fixtures/calendario-state.json", import.meta.url), "utf8");
const HOJE = "2026-10-29"; // fixture: Lower A concluída nesse dia, sem data_inicio

const b = await chromium.launch();
const fails = [];
const contas = [];

async function rodar(W, H) {
  const tag = `${W}x${H}`;
  const email = `teste-cal+preview${Date.now()}w${W}@example.com`;
  contas.push(email);
  const password = randomBytes(12).toString("hex");
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const erros = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  const saves = [];
  page.on("response", (r) => { if (r.url().includes("/api/state") && r.request().method() !== "GET") saves.push(r.status()); });
  const fail = (m) => { fails.push(`[${tag}] ${m}`); console.log(`  ✗ ${m}`); };
  const ok = (m) => console.log(`  ✓ ${m}`);

  await page.goto(`${U}/${SHARE ? `?_vercel_share=${SHARE}` : ""}`);
  const reg = await page.request.post(`${U}/api/auth/register`, { data: { email, password, passwordConfirm: password } });
  if (!reg.ok()) throw new Error(`register ${reg.status()}`);
  const { csrfToken } = await (await page.request.get(`${U}/api/auth/csrf`)).json();
  await page.request.post(`${U}/api/auth/callback/credentials`, { form: { csrfToken, email, password, callbackUrl: `${U}/hoje`, json: "true" } });
  await page.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, seed]);
  await page.goto(`${U}/plano/calendario`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  if (!page.url().includes("/plano/calendario")) throw new Error(`redirecionou para ${page.url()}`);

  const sessao = (id) => page.evaluate(([k, id]) => JSON.parse(localStorage.getItem(k)).sessoes.find((s) => s.id === id), [KEY, id]);
  const tap = async (loc, label) => {
    await loc.scrollIntoViewIfNeeded();
    await page.waitForTimeout(350);
    const bb = await loc.boundingBox();
    const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
    const coberto = await page.evaluate(([x, y]) => {
      const e = document.elementFromPoint(x, y);
      const alvo = e?.closest("button,a");
      return alvo ? null : (e ? `${e.tagName}.${e.className}` : "nada");
    }, [cx, cy]);
    const mesmo = await loc.evaluate((el, [x, y]) => el.contains(document.elementFromPoint(x, y)), [cx, cy]);
    if (coberto || !mesmo) fail(`${label}: algo por cima do botão (${coberto ?? "outro botão"})`);
    await page.touchscreen.tap(cx, cy);
    await page.waitForTimeout(600);
  };
  const titulo = () => page.locator("h1").innerText();
  const dia = (n) => page.locator("main .grid button").filter({ hasText: new RegExp(`^${n}$`) }).first();
  const card = page.getByTestId("card-dia");

  const t0 = await titulo();
  await tap(page.getByRole("button", { name: "Próximo mês" }), "próximo mês");
  const t1 = await titulo();
  t1 !== t0 ? ok(`próximo mês (${t1})`) : fail("próximo mês não mudou");
  await tap(page.getByRole("button", { name: "Mês anterior" }), "mês anterior");
  (await titulo()) === t0 ? ok("mês anterior") : fail("mês anterior não voltou");

  await tap(dia(29), "dia 29");
  const cab = (await card.locator("p").first().innerText()).trim();
  /^Qui, 29 out · Lower A$/.test(cab) ? ok(`card: ${cab}`) : fail(`cabeçalho do card: "${cab}"`);
  if (/proximaSessao|\d{4}-\d{2}-\d{2}/.test(await page.locator("main").innerText())) fail("texto interno/ISO vazando no calendário");

  const pressed = async (name) => (await card.getByRole("button", { name }).getAttribute("aria-pressed")) === "true";
  if (!(await pressed(/Feito/))) fail("botão Feito não aparece selecionado num dia feito");
  const passos = [
    [/Planejado/, "planejada", "planejado"],
    [/Pular/, "pulada", "pulado"],
    [/Feito/, "concluida", "feito"],
    [/Pular/, "pulada", "pulado"],
    [/Planejado/, "planejada", "planejado"],
  ];
  let ant = "feito";
  for (const [re, want, cel] of passos) {
    await tap(card.getByRole("button", { name: re }), `${ant} → ${cel}`);
    const s = await sessao("sess-lower-a");
    const st = await dia(29).getAttribute("data-status");
    s?.status === want && st === cel && (await pressed(re))
      ? ok(`${ant} → ${cel}`)
      : fail(`${ant} → ${cel}: storage=${s?.status} célula=${st}`);
    ant = cel;
  }
  await tap(card.getByRole("button", { name: /Feito/ }), "volta pra feito");

  if (SHOTS) await page.screenshot({ path: `${SHOTS}-${W}-dia-feito.png` });

  const comecar = page.getByRole("button", { name: "Começar hoje" });
  if (!(await comecar.count())) fail("sem botão Começar hoje");
  else {
    await tap(comecar, "começar hoje");
    const di = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).plano.mesociclo.data_inicio, KEY);
    /^\d{4}-\d{2}-\d{2}$/.test(di ?? "") ? ok(`começar hoje → data_inicio ${di}`) : fail(`começar hoje: data_inicio=${di}`);
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const di2 = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).plano.mesociclo.data_inicio, KEY);
    di2 === di ? ok("persistiu após reload") : fail(`não persistiu: ${di2}`);
    const planejados = await page.locator('main .grid button[data-status="planejado"]').count();
    planejados > 0 ? ok(`${planejados} dias planejados`) : fail("nenhum dia agendado");
    // dia futuro planejado: pular e voltar
    const fut = page.locator('main .grid button[data-status="planejado"]').first();
    await tap(fut, "dia planejado");
    await tap(card.getByRole("button", { name: /Pular/ }), "planejado → pulado");
    (await pressed(/Pular/)) ? ok("dia futuro pulado") : fail("dia futuro não pulou");
    await tap(card.getByRole("button", { name: /Planejado/ }), "pulado → planejado");
    (await pressed(/Planejado/)) ? ok("dia futuro replanejado") : fail("dia futuro não voltou");
    if (SHOTS) await page.screenshot({ path: `${SHOTS}-${W}-planejado.png` });
  }
  const ruins = saves.filter((s) => s >= 400);
  ruins.length ? fail(`save /api/state com erro: ${ruins}`) : ok(`saves /api/state: ${saves.join(",") || "nenhum"}`);
  if (erros.length) fail(`erros JS: ${erros.slice(0, 3)}`);
  await ctx.close();
}

for (const [w, h] of [[390, 844], [360, 780]]) {
  console.log(`viewport ${w}x${h}`);
  try { await rodar(w, h); } catch (e) { fails.push(`[${w}] ${e.message}`); console.log("  ✗", e.message); }
}
await b.close();
console.log("contas:", contas.join(", "));
console.log(fails.length ? `FALHOU (${fails.length})\n${fails.join("\n")}` : "OK smoke:calendario");
process.exit(fails.length ? 1 : 0);
