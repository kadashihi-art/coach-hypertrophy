/** Smoke reavaliação de nível (lote 7): cenários de subir, descer, não sugerir e "Agora não". */
import { gerarPlanoFromPerfil } from "../src/lib/plan/gerar-plano";
import { CATALOG_EXERCICIOS } from "../src/lib/catalog/exercicios";
import { AppStateSchema, type AppState, type Experiencia, type Perfil, type RegistroSerie, type Sessao } from "../src/lib/domain";
import { avaliarNivel, resumoMudancaNivel, silencioAte } from "../src/lib/nivel/reavaliacao";
import { GRUPO_LABEL } from "../src/lib/labels";

const DIA = 86_400_000;
const AGORA = Date.parse("2026-11-04T12:00:00-03:00");
let falhas = 0;
function ok(cond: boolean, msg: string) {
  console.log(`${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) falhas++;
}

type Cfg = {
  experiencia: Experiencia;
  peso?: number;
  sexo?: "masculino" | "feminino";
  /** Nº de sessões feitas. */
  sessoes: number;
  /** Dias cobertos (da 1ª à última). */
  dias: number;
  dias_semana?: number;
  /** e1RM ÷ peso no supino/agachamento/stiff no fim. */
  forca: { supino: number; agachamento: number; stiff: number };
  /** Ganho semanal relativo das cargas. */
  ganhoSemana: number;
  /** RIR marcado: "preciso" (alvo ±1, variado) ou "fixo_longe" (sempre 4). */
  rir: "preciso" | "fixo_longe";
  tempo_meses?: number;
};

function montar(c: Cfg): AppState {
  const perfil: Perfil = {
    id: "p-smoke", peso_kg: c.peso ?? 80, altura_cm: 178, experiencia: c.experiencia,
    dias_por_semana: c.dias_semana ?? 4, minutos_por_sessao: 70, cardio_min_semana: 0,
    equipamentos: ["barra", "halteres", "maquina", "cabo", "banco", "rack"], restricoes: [], objetivo: "hipertrofia",
    sexo: c.sexo ?? "masculino", onboarding_concluido: true, parq_liberado: true, parq_respondido_em: "2026-08-01T00:00:00Z", parq_respostas: [false, false, false, false, false, false, false],
    criado_em: new Date(AGORA - 90 * DIA).toISOString(),
    ...(c.tempo_meses != null ? { tempo_treino_meses: c.tempo_meses } : {}),
  };
  const g = gerarPlanoFromPerfil(perfil, CATALOG_EXERCICIOS);
  const tpls = g.sessoes;
  const sessoes: Sessao[] = [];
  const registros: RegistroSerie[] = [];
  const exPorId = new Map(CATALOG_EXERCICIOS.map((e) => [e.id, e]));
  const alvoRazao = (id: string) => {
    const e = exPorId.get(id);
    if (!e) return 0.5;
    if (e.padrao === "empurrar_horizontal") return c.forca.supino;
    if (e.padrao === "agachamento") return c.forca.agachamento;
    if (e.padrao === "dobradica_quadril") return c.forca.stiff;
    return 0.5;
  };
  for (let i = 0; i < c.sessoes; i++) {
    const t = AGORA - c.dias * DIA + (c.sessoes === 1 ? 0 : (i * c.dias * DIA) / (c.sessoes - 1));
    const semanasAteFim = (AGORA - t) / (7 * DIA);
    const fator = Math.pow(1 + c.ganhoSemana, -semanasAteFim);
    const tpl = tpls[i % tpls.length];
    const sid = `s${i}`;
    const prescricoes = tpl.prescricoes.map((p) => ({ ...p, id: `${sid}-${p.id}`, sessao_id: sid }));
    sessoes.push({ ...tpl, id: sid, status: "concluida", data: new Date(t).toISOString().slice(0, 10), finalizada_em: new Date(t).toISOString(), prescricoes });
    for (const p of prescricoes) {
      const reps = p.faixa_reps[1] - 1;
      const e1 = alvoRazao(p.exercicio_id) * perfil.peso_kg * fator;
      const carga = Math.round((e1 / (1 + reps / 30)) * 2) / 2;
      for (let n = 1; n <= p.series; n++) {
        const rir = c.rir === "preciso" ? Math.max(0, p.rir_alvo + ((n + i) % 3) - 1) : 4;
        registros.push({
          id: `${sid}-${p.id}-${n}`, sessao_id: sid, prescricao_id: p.id, exercicio_id: p.exercicio_id, numero: n,
          tipo_serie: "trabalho", carga_kg: carga, reps: c.rir === "fixo_longe" ? p.faixa_reps[1] + 1 : reps, rir_percebido: rir, dor: false,
          executado_em: new Date(t).toISOString(),
        });
      }
    }
  }
  return AppStateSchema.parse({ perfil, exercicios: CATALOG_EXERCICIOS, plano: g.plano, sessoes, registros, estados: g.estados });
}

// Textos sem código (mesmo critério de smoke:textos-alertas).
const SEM_ACENTO = Object.entries(GRUPO_LABEL).filter(([k, v]) => k !== v.toLowerCase()).map(([k]) => k);
const RE_SEM_ACENTO = new RegExp(String.raw`(?<![\p{L}_])(${SEM_ACENTO.join("|")})(?![\p{L}_])`, "iu");
function limpo(t: string): boolean {
  return !/\w+:\d{4}-W\d+/.test(t) && !/\bN[0-2]\b/.test(t) && !/\(s\)/.test(t) && !/\bmotor\b/i.test(t)
    && !RE_SEM_ACENTO.test(t) && !/\b[a-z]+_[a-z_]+\b/.test(t) && !/\bintermediario|avancado\b/.test(t);
}

// 1) Iniciante forte, consistente, RIR preciso → sugere subir.
{
  const s = montar({ experiencia: "iniciante", sessoes: 14, dias: 26, forca: { supino: 1.3, agachamento: 1.7, stiff: 1.6 }, ganhoSemana: 0.008, rir: "preciso", tempo_meses: 24 });
  const a = avaliarNivel(s, AGORA);
  ok(a.sugestao?.direcao === "subir" && a.sugestao.para === "intermediario", `iniciante forte → sugere subir (E=${a.estimativa}, adesão=${a.adesao?.toFixed(2)})`);
  ok((a.sugestao?.motivos.length ?? 0) >= 2 && (a.sugestao?.motivos.length ?? 0) <= 3, "2 ou 3 motivos");
  const textos = [a.sugestao?.titulo ?? "", a.sugestao?.frase ?? "", ...(a.sugestao?.motivos ?? [])];
  ok(textos.every(limpo), `textos sem código e com acento: "${a.sugestao?.titulo}"`);
  ok(a.sugestao?.titulo === "Seu treino está com cara de intermediário", "título humano");
  const r = resumoMudancaNivel({ de: "iniciante", para: "intermediario", antes: gerarPlanoFromPerfil(s.perfil!, CATALOG_EXERCICIOS), depois: gerarPlanoFromPerfil({ ...s.perfil!, experiencia: "intermediario" }, CATALOG_EXERCICIOS) });
  ok(r.length >= 2 && r.every(limpo), `resumo da mudança: ${r.join(" | ")}`);
  // "Agora não" silencia.
  const sil = { ...s, perfil: { ...s.perfil!, nivel_silenciado_ate: silencioAte(AGORA) } };
  ok(avaliarNivel(sil, AGORA).sugestao === null, "\"Agora não\" silencia");
  ok(avaliarNivel(sil, AGORA + 29 * DIA).bloqueio !== "silenciado", "silêncio acaba depois de 4 semanas");
  // Depois de mudar, espera 4 semanas.
  const mudou = { ...s, perfil: { ...s.perfil!, experiencia: "intermediario" as const, nivel_mudado_em: new Date(AGORA - 2 * DIA).toISOString() } };
  ok(avaliarNivel(mudou, AGORA).sugestao === null, "depois de mudar, não sugere de novo logo em seguida");
  // Determinístico.
  ok(JSON.stringify(avaliarNivel(s, AGORA)) === JSON.stringify(a), "mesma entrada, mesma resposta");
}

// 2) Avançado fraco e progredindo rápido → sugere descer.
{
  const s = montar({ experiencia: "avancado", sessoes: 14, dias: 26, forca: { supino: 0.7, agachamento: 0.9, stiff: 0.9 }, ganhoSemana: 0.03, rir: "fixo_longe" });
  const a = avaliarNivel(s, AGORA);
  ok(a.sugestao?.direcao === "descer" && a.sugestao.para === "intermediario", `avançado fraco → sugere descer (E=${a.estimativa})`);
  ok([a.sugestao?.titulo ?? "", ...(a.sugestao?.motivos ?? [])].every(limpo), `textos limpos: "${a.sugestao?.titulo}"`);
}

// 3) Avançado inconsistente (força média) → sugere descer.
{
  const s = montar({ experiencia: "avancado", sessoes: 7, dias: 40, forca: { supino: 1.0, agachamento: 1.3, stiff: 1.2 }, ganhoSemana: 0.02, rir: "preciso" });
  const a = avaliarNivel(s, AGORA);
  ok(a.sugestao?.direcao === "descer", `avançado inconsistente → sugere descer (E=${a.estimativa}, adesão=${a.adesao?.toFixed(2)})`);
}

// 4) Carga alta mas pouca consistência → não sugere subir.
{
  const s = montar({ experiencia: "iniciante", sessoes: 6, dias: 40, forca: { supino: 1.6, agachamento: 2.1, stiff: 2.0 }, ganhoSemana: 0.002, rir: "preciso", tempo_meses: 48 });
  const a = avaliarNivel(s, AGORA);
  ok(a.pronto && a.sugestao === null, `carga alta + pouca consistência → não sugere (adesão=${a.adesao?.toFixed(2)})`);
}

// 5) Só a carga alta (resto de iniciante) → não sugere.
{
  const s = montar({ experiencia: "iniciante", sessoes: 14, dias: 26, forca: { supino: 1.6, agachamento: 2.1, stiff: 2.0 }, ganhoSemana: 0.03, rir: "fixo_longe" });
  const a = avaliarNivel(s, AGORA);
  ok(a.sugestao === null, `só carga alta → não decide pela carga (E=${a.estimativa})`);
}

// 6) Poucas sessões / pouco tempo → não sugere.
{
  const s1 = montar({ experiencia: "iniciante", sessoes: 5, dias: 26, forca: { supino: 1.6, agachamento: 2.1, stiff: 2.0 }, ganhoSemana: 0.005, rir: "preciso", tempo_meses: 48 });
  const a1 = avaliarNivel(s1, AGORA);
  ok(a1.sugestao === null && a1.bloqueio === "poucos_dados", "5 sessões → não sugere");
  const s2 = montar({ experiencia: "iniciante", sessoes: 10, dias: 12, forca: { supino: 1.6, agachamento: 2.1, stiff: 2.0 }, ganhoSemana: 0.005, rir: "preciso", tempo_meses: 48 });
  const a2 = avaliarNivel(s2, AGORA);
  ok(a2.sugestao === null && a2.bloqueio === "poucos_dados", "10 sessões em 12 dias → não sugere");
}

// 7) Nível certo → fica quieto (histerese).
{
  const s = montar({ experiencia: "intermediario", sessoes: 14, dias: 26, forca: { supino: 1.15, agachamento: 1.5, stiff: 1.4 }, ganhoSemana: 0.01, rir: "preciso", tempo_meses: 20 });
  const a = avaliarNivel(s, AGORA);
  ok(a.sugestao === null, `intermediário típico → não sugere nada (E=${a.estimativa})`);
}

// 8) Avaliação não grava nada no estado.
{
  const s = montar({ experiencia: "iniciante", sessoes: 14, dias: 26, forca: { supino: 1.3, agachamento: 1.7, stiff: 1.6 }, ganhoSemana: 0.008, rir: "preciso", tempo_meses: 24 });
  const antes = JSON.stringify(s);
  avaliarNivel(s, AGORA);
  ok(JSON.stringify(s) === antes, "avaliar é só leitura");
}

if (falhas) { console.error(`\n${falhas} falha(s)`); process.exit(1); }
console.log("\nsmoke:reavaliacao-nivel OK");
