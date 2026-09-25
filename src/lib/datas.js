const DIA_EM_MS = 24 * 60 * 60 * 1000;

// 'AAAA-MM-DD' → Date em UTC (meia-noite UTC daquele dia)
function paraData(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)); // mês em JS começa em 0 (janeiro = 0)
}

// Date → 'AAAA-MM-DD'
function paraIso(data) {
  return data.toISOString().slice(0, 10);
}

// Soma `meses` a uma data ISO, mantendo o dia; se o dia não existir no mês de destino,
// usa o último dia daquele mês.
export function adicionaMeses(iso, meses) {
  const base = paraData(iso);
  const ano = base.getUTCFullYear();
  const mes = base.getUTCMonth() + meses; // pode passar de 11 — Date.UTC ajusta o ano
  const dia = base.getUTCDate();
  const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate(); // dia 0 do mês seguinte
  return paraIso(new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDiaDoMes))));
}

// Se a data cair em sábado (6) ou domingo (0), avança até a próxima segunda.
export function proximoDiaUtil(iso) {
  let data = paraData(iso);
  while (data.getUTCDay() === 0 || data.getUTCDay() === 6) {
    data = new Date(data.getTime() + DIA_EM_MS);
  }
  return paraIso(data);
}

// Dias corridos entre duas datas ISO (fim − início).
export function diasEntre(isoInicio, isoFim) {
  return Math.round((paraData(isoFim) - paraData(isoInicio)) / DIA_EM_MS);
}

// Valida o formato 'AAAA-MM-DD' e se a data existe de verdade (rejeita 2026-02-30).
export function ehDataValida(texto) {
  if (typeof texto !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const data = paraData(texto);
  return !Number.isNaN(data.getTime()) && paraIso(data) === texto;
}
