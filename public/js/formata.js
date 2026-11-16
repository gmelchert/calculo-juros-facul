/* ===========================================================================
   Formata — funções puras que transformam o dado cru da API em texto de tela.
   ---------------------------------------------------------------------------
   Não mexem no HTML e não chamam a API: recebem um valor, devolvem uma string.
   Por isso dá para testar qualquer uma delas no console do navegador:
       Formata.moeda(10000)   // "R$ 10.000,00"
   =========================================================================== */

const Formata = {

  /* -- Texto ------------------------------------------------------------- */

  // Escapa o que vier da API antes de entrar em HTML.
  // Campos como `finops.erro` são texto de OUTRO serviço: se ele mandar
  // "<img onerror=...>" e nós jogarmos direto no innerHTML, o navegador executa.
  // Toda interpolação deste painel passa por aqui. É a regra, sem exceção.
  escapa(valor) {
    return String(valor ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  },

  // Valor ausente vira travessão em vez de "null" ou "undefined" na tela.
  ou(valor, vazio = '—') {
    return valor === null || valor === undefined || valor === '' ? vazio : valor;
  },

  /* -- Números ----------------------------------------------------------- */

  // 10000 → "R$ 10.000,00"
  moeda(valor) {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) return '—';
    return valor.toLocaleString('pt-BR', {
      style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
  },

  // 10000 → "R$ 10.000" (sem centavos; usado só nos cartões do topo, que são estimativa visual)
  moedaCurta(valor) {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) return '—';
    return valor.toLocaleString('pt-BR', {
      style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
    });
  },

  // 1.85 → "1,85%"   (a API já manda a taxa EM PORCENTAGEM, não em decimal:
  //                   1.85 quer dizer 1,85% ao mês. Não multiplicar por 100 aqui.)
  percentual(valor, casas = 2) {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) return '—';
    return `${valor.toLocaleString('pt-BR', {
      minimumFractionDigits: casas, maximumFractionDigits: casas,
    })}%`;
  },

  numero(valor) {
    if (typeof valor !== 'number' || !Number.isFinite(valor)) return '—';
    return valor.toLocaleString('pt-BR');
  },

  /* -- Datas ------------------------------------------------------------- */
  // ARMADILHA: a API manda data como TEXTO ("2026-10-30", "2026-11-10 13:54:34"),
  // já no fuso do servidor. Se jogássemos isso em `new Date(...)`, o navegador
  // trataria "2026-10-30" como UTC e, no Brasil, mostraria 29/10. Por isso aqui
  // a gente só recorta a string — nenhuma função destas cria um objeto Date.

  // "2026-10-30" → "30/10/2026"
  data(texto) {
    const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(texto ?? ''));
    return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : '—';
  },

  // "2026-11-10 13:54:34" → "10/11/2026 13:54"
  dataHora(texto) {
    const partes = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(texto ?? ''));
    if (!partes) return Formata.data(texto);
    return `${partes[3]}/${partes[2]}/${partes[1]} ${partes[4]}:${partes[5]}`;
  },

  // Hora do relógio do navegador, para o rodapé "atualizado às ...".
  horaAgora() {
    return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  },

  /* -- Campos do domínio ------------------------------------------------- */

  // O banco guarda só dígitos. Aqui a máscara é aplicada para leitura humana.
  documento(valor, tipoPessoa) {
    const digitos = String(valor ?? '').replace(/\D/g, '');
    if (tipoPessoa === 'PJ' && digitos.length === 14) {
      return digitos.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    }
    if (digitos.length === 11) {
      return digitos.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    }
    return digitos || '—';
  },

  // "CONSIGNADO_INSS" → "Consignado INSS" (só para caber na tabela; o nome
  // oficial da modalidade continua vindo de GET /api/modalidades).
  modalidade(codigo) {
    return String(codigo ?? '')
      .split('_')
      .map((p) => (p.length <= 4 ? p : p.charAt(0) + p.slice(1).toLowerCase()))
      .join(' ');
  },

  // Cor do selo de estado da operação.
  corEstado(estado) {
    return estado === 'DEFINIDA' ? 'selo--verde' : 'selo--ambar';
  },

  // Cor do selo do registro no FinOps.
  corFinops(status) {
    if (status === 'REGISTRADA') return 'selo--verde';
    if (status === 'FALHOU') return 'selo--vermelho';
    if (status === 'PENDENTE') return 'selo--ambar';
    return '';
  },
};
