# Regras de Negócio — Serviço de Cálculo de Juros

> **Para quem é**: gestão, produto e qualquer pessoa que precise entender **o que o sistema decide**
> sem ler código.
> **Estado descrito**: 16/11/2026. Todas as regras e números deste documento foram conferidos contra
> o sistema em funcionamento; o exemplo da §7 foi calculado pelo próprio motor.
> **Versão técnica**: [`onboarding-tecnico.md`](onboarding-tecnico.md).

---

## 1. Resumo executivo

O serviço é a **calculadora oficial de crédito da esteira**. Ele recebe uma proposta **já aprovada**
por outro time e responde, de forma definitiva e auditável:

- qual **taxa de juros** se aplica àquele cliente, naquele produto;
- quanto é **cada parcela** e quando ela vence;
- quanto o cliente paga de **IOF e tarifa**, e quanto efetivamente **recebe**;
- qual é o **CET** (Custo Efetivo Total) que a regulação obriga a informar;
- o **demonstrativo** que abre o custo total em componentes.

Em seguida ele **registra** a operação e **avisa automaticamente** os times de documentos e financeiro.

Três características importam para a gestão:

1. **O cálculo é imutável.** Uma operação calculada nunca é recalculada. Consultar a mesma operação
   um ano depois devolve exatamente os mesmos centavos. Isso é o que permite usá-la como base de contrato.
2. **O serviço não julga crédito.** Ele não calcula score nem decide aprovação — recebe a decisão pronta.
3. **Preço não é negociado no código.** As taxas vivem numa tabela de parâmetros. Mudar preço é
   mudar dado, não programa.

---

## 2. Onde o serviço começa e termina

```
   TIME DE DECISÃO                  ESTE SERVIÇO                    TIME FINANCEIRO
   ───────────────                  ────────────                    ───────────────
   • calcula o score                • escolhe a taxa                • registra o contrato
   • aprova ou nega                 • calcula parcelas              • controla o que foi pago
   • escolhe PRICE ou SAC    ───▶   • calcula IOF e tarifa    ───▶
                                    • calcula o CET
                                    • guarda a operação             TIME DE DOCUMENTOS
                                            │                       ──────────────────
                                            └────────────────▶      • gera o PDF do
                                                                      demonstrativo
```

**É responsabilidade deste serviço**: preço, cálculo financeiro, encargos, CET, cronograma,
guarda da operação e aviso aos outros times.

**NÃO é responsabilidade deste serviço** (§9 detalha): score, análise de crédito, verificação de
renda ou capacidade de pagamento, consulta a bureaus, limite de crédito do cliente, geração de
documento assinado, cobrança, liquidação antecipada, renegociação.

---

## 3. Glossário mínimo

| Termo | Em uma frase |
|---|---|
| **Score** | nota de risco do cliente, de 0 a 1000, recebida pronta do time de decisão |
| **Faixa de risco** | agrupamento do score em A, B, C, D ou E — é a faixa, não o score exato, que define o preço |
| **PRICE** | sistema em que **a parcela é fixa**: no começo paga-se mais juros e menos principal |
| **SAC** | sistema em que **a amortização é fixa**: a parcela começa mais alta e cai todo mês |
| **IOF** | imposto federal sobre a operação de crédito, cobrado na liberação |
| **Tarifa de cadastro** | tarifa única de abertura, permitida apenas no primeiro relacionamento |
| **Valor liberado** | o que o cliente recebe de fato: o valor contratado menos os encargos |
| **CET** | custo efetivo total em % ao ano, incluindo juros, impostos e tarifas; é o número que a regulação manda informar ao cliente |
| **Operação DEFINIDA** | operação com sistema de amortização escolhido — pronta para virar contrato |

---

## 4. Catálogo de produtos

Seis produtos. Cada um tem **teto de taxa** e **faixa de prazo** próprios, e o sistema recusa
qualquer pedido fora desses limites.

| Produto | Código | Teto de taxa | Prazo aceito | Referência BCB* |
|---|---|---|---|---|
| Crédito pessoal não consignado | `CREDITO_PESSOAL` | 12,00% a.m. | 3 a 48 meses | 5,25% a.m. |
| Crédito pessoal consignado INSS | `CONSIGNADO_INSS` | 1,85% a.m. | 6 a 84 meses | 1,83% a.m. |
| Crédito pessoal consignado público | `CONSIGNADO_PUBLICO` | 2,50% a.m. | 6 a 96 meses | 1,84% a.m. |
| Crédito pessoal consignado privado | `CONSIGNADO_PRIVADO` | 4,50% a.m. | 6 a 48 meses | 3,40% a.m. |
| Aquisição de veículos | `VEICULOS` | 3,00% a.m. | 12 a 60 meses | 1,77% a.m. |
| Aquisição de outros bens | `OUTROS_BENS` | 5,00% a.m. | 3 a 36 meses | 2,53% a.m. |

\* Mediana da série do Banco Central de 11–17/08/2026, usada **apenas para comparação de mercado**.
Ela já inclui IOF e **não** entra em nenhuma conta do sistema.

Um produto pode ser **desativado** sem apagar nada: as operações antigas continuam válidas e
consultáveis, mas novos pedidos naquele produto são recusados.

---

## 5. Tabela de preço vigente

A taxa de cada célula já é a **taxa final**: `menor( taxa base do produto + spread da faixa, teto do produto )`.
Os spreads são **A: 0,00 / B: +0,50 / C: +1,00 / D: +2,00** ponto percentual ao mês.

| Produto | A (800–1000) | B (600–799) | C (400–599) | D (200–399) | E (0–199) |
|---|---|---|---|---|---|
| `CREDITO_PESSOAL` | 4,50% | 5,00% | 5,50% | 6,50% | **recusa** |
| `CONSIGNADO_INSS` | 1,60% | 1,85%¹ | 1,85%¹ | 1,85%¹ | **recusa** |
| `CONSIGNADO_PUBLICO` | 1,60% | 2,10% | 2,50%¹ | 2,50%¹ | **recusa** |
| `CONSIGNADO_PRIVADO` | 2,80% | 3,30% | 3,80% | 4,50%¹ | **recusa** |
| `VEICULOS` | 1,50% | 2,00% | 2,50% | 3,00%¹ | **recusa** |
| `OUTROS_BENS` | 2,20% | 2,70% | 3,20% | 4,20% | **recusa** |

¹ **Teto atingido**: o preço de risco calculado seria maior, mas foi limitado pelo teto do produto.
A resposta do sistema marca esses casos com `tetoAplicado: true`.

**Leitura de gestão**: no `CONSIGNADO_INSS` o teto é tão apertado que **B, C e D pagam o mesmo preço**
— o produto não diferencia risco acima da faixa A. Clientes de risco mais alto nesse produto são
aceitos sem compensação no preço.

As taxas anuais equivalentes são derivadas da mensal por juros compostos
(`(1 + mensal)¹² − 1`) e ficam guardadas junto com cada faixa — ex.: 1,85% a.m. = **24,60% a.a.**

---

## 6. As regras, uma por uma

### Admissão do pedido

**RN-01 — Toda operação tem um identificador único.**
Formato `OP-AAAA-NNNN` (ex.: `OP-2026-0001`), no máximo 20 caracteres. Se chegar um pedido repetindo
identificador já usado, é recusado — inclusive quando dois pedidos idênticos chegam no mesmo instante.
*Por quê*: é a chave pela qual os outros times se referem à mesma operação.

**RN-02 — O cliente é obrigatório e o documento é validado de verdade.**
Pessoa física exige CPF; pessoa jurídica exige CNPJ. Os dígitos verificadores são conferidos
(mesmo cálculo da Receita Federal) e documentos com todos os dígitos iguais são rejeitados.
Pontos, barras, hífens e espaços são aceitos e descartados; o sistema guarda só os números.
*Consequência prática*: um CPF "de teste" como `12345678901` **é recusado**.

**RN-03 — O pedido precisa caber nos limites do produto.**
Valor acima de zero, no máximo **R$ 10.000.000,00**, com no máximo 2 casas decimais. Prazo em meses
inteiros, dentro da faixa do produto (§4). Score inteiro entre 0 e 1000. Produto existente e ativo.
Data de liberação opcional — se não vier, o sistema usa a data de hoje.
*Importante*: o sistema devolve **todos** os problemas de uma vez, não um por vez.

**RN-04 — Só crédito aprovado se transforma em operação.**
Se o time de decisão informar uma decisão diferente de `APROVADO`, o pedido é recusado e **nada é
gravado** — não se gera cronograma, CET nem documento para crédito negado. Se o campo de decisão
não vier, o pedido segue (compatibilidade com quem ainda não envia).

**RN-05 — O sistema de amortização vem de fora e é obrigatório.**
Quem escolhe entre PRICE e SAC é o time de decisão, não este serviço. A escolha chega no pedido e a
operação já nasce com ela. **A escolha é definitiva**: não há como trocar depois.

### Preço

**RN-06 — O preço sai da faixa de risco, não do score exato.**
O score é convertido em faixa (A–E) e a faixa determina a taxa (§5). Um cliente com score 600 e
outro com 799 pagam exatamente o mesmo. A taxa aplicada é lida da tabela — o sistema não soma
spread nem aplica teto em tempo de execução, porque a tabela já guarda o resultado final.

**RN-07 — Score abaixo de 200 é recusa.**
A faixa E não tem preço. O pedido é recusado com motivo explícito de score insuficiente.
*Observação*: essa é a **única** recusa por risco que este serviço faz por conta própria — todo o
resto da análise de crédito acontece antes, no time de decisão.

**RN-08 — Nenhum produto cobra acima do seu teto.**
Quando o preço de risco bateria no teto, cobra-se o teto, e a operação fica marcada como
"teto aplicado" para quem quiser auditar.

### Cálculo financeiro

**RN-09 — Vencimentos caem em dia útil.**
Cada parcela vence no "aniversário" mensal da liberação. Se cair em sábado ou domingo, **empurra
para a segunda-feira** seguinte. Se o dia não existir no mês de destino (ex.: liberação dia 31,
vencimento em fevereiro), usa-se o último dia daquele mês.
*Efeito colateral legítimo*: o adiamento aumenta os dias corridos e, com isso, o IOF daquela parcela.
**Feriados não são tratados** — só fim de semana (ver §10).

**RN-10 — IOF tem duas partes.**
- **Diário**: 0,0082% por dia sobre a amortização de cada parcela, proporcional aos dias corridos
  entre a liberação e o vencimento daquela parcela, **limitado a 365 dias**.
- **Adicional**: cobrado **uma única vez** sobre o valor total do crédito — **0,38% para pessoa
  física** e **0,95% para pessoa jurídica**.

*Leitura de gestão*: o limite de 365 dias faz com que, em operações longas, as últimas parcelas
praticamente não aumentem o IOF. E o IOF total depende do sistema escolhido, porque PRICE e SAC
amortizam em ritmos diferentes.

**RN-11 — Tarifa de cadastro só no primeiro relacionamento.**
**R$ 50,00**, cobrados apenas quando o pedido marca que é o primeiro relacionamento do cliente com a
instituição. Nas demais operações, zero. *Por quê*: é limitação legal (Tema 620 do STJ), não escolha
comercial.

**RN-12 — Os encargos são descontados na liberação.**
O cliente contrata R$ 10.000 e **recebe** R$ 10.000 menos IOF e tarifa. As parcelas, porém, são
calculadas sobre o valor **contratado**. É exatamente essa diferença que faz o CET ser maior que a
taxa de juros.

**RN-13 — O CET segue a fórmula do Banco Central.**
Calculado conforme a Resolução CMN 4.881/2020: é a taxa que iguala o valor **efetivamente liberado**
ao valor presente de **todas** as parcelas, usando os dias corridos reais e base de 365 dias.
Não existe fórmula fechada, então o sistema resolve numericamente. Se um fluxo não admitir solução
(situação anômala), a operação é recusada em vez de devolver um número errado.

**RN-14 — Todo custo é aberto em demonstrativo.**
Conforme o art. 7º da mesma resolução, a resposta traz principal, juros, IOF e tarifa, cada um em
reais e em percentual sobre o total devido.

**RN-15 — Os dois sistemas são sempre calculados e guardados.**
Mesmo com PRICE ou SAC já escolhido, o sistema calcula e arquiva **as duas** simulações. O documento
de contrato mostra apenas a escolhida; a outra fica disponível para comparação e auditoria.

### Guarda e ciclo de vida

**RN-16 — O cálculo é gravado uma vez e nunca alterado.**
O resultado completo é persistido no momento da criação e **nunca** recebe atualização. Consultas
repetidas devolvem o mesmo documento, centavo por centavo, sem recalcular nada.
*Por quê*: se o cálculo pudesse mudar, nenhuma operação serviria de base contratual.

**RN-17 — Avisar os outros times nunca invalida a operação.**
Assim que a operação é criada, ela é enviada ao time financeiro e ao time de documentos. Se um deles
estiver fora do ar, **a operação continua válida e gravada**; a falha é registrada para reenvio.
*Por quê*: indisponibilidade de um time parceiro não pode fazer o cliente perder a simulação.

---

## 7. Exemplo completo, ponta a ponta

Números **calculados pelo sistema real**, não ilustrativos.

**Pedido**: pessoa física, CPF válido, `CONSIGNADO_INSS`, **R$ 10.000,00**, **12 meses**,
score **650**, liberação em **30/10/2026**, **primeiro relacionamento**.

**Preço aplicado**: score 650 → faixa **B** → **1,85% a.m. (24,60% a.a.)**.
Teto do produto: 1,85% → **teto aplicado**.

| | **PRICE** (parcela fixa) | **SAC** (amortização fixa) |
|---|---|---|
| Parcela / amortização base | R$ 936,91 por mês | R$ 833,33 de amortização |
| Primeira parcela | R$ 936,91 | R$ 1.018,33 |
| Última parcela | R$ 936,87 | R$ 848,79 |
| Total de juros | R$ 1.242,88 | **R$ 1.202,50** |
| Soma das parcelas | R$ 11.242,88 | R$ 11.202,50 |
| IOF diário | R$ 167,65 | R$ 162,22 |
| IOF adicional (0,38%) | R$ 38,00 | R$ 38,00 |
| Tarifa de cadastro | R$ 50,00 | R$ 50,00 |
| **Total de encargos** | R$ 255,65 | R$ 250,22 |
| **Valor que o cliente recebe** | R$ 9.744,35 | R$ 9.749,78 |
| **Total devido** | R$ 11.498,53 | R$ 11.452,72 |
| **CET** | **30,89% a.a.** | **30,96% a.a.** |

Composição do custo no PRICE: principal 86,97% · juros 10,81% · IOF 1,79% · tarifa 0,43%.

### Dois pontos que costumam gerar dúvida

**"Por que o CET é 30,89% se a taxa é 24,60%?"**
Porque o CET inclui IOF e tarifa **e** considera que o cliente recebeu R$ 9.744,35, não R$ 10.000.
A diferença entre 24,60% e 30,89% é exatamente o peso dos encargos — e é por isso que o CET é o
número que deve ser informado ao cliente.

**"Por que o SAC tem menos juros mas CET maior?"**
São medidas diferentes. O SAC paga **menos juros em reais** (R$ 1.202,50 contra R$ 1.242,88) porque
amortiza mais rápido. Mas o CET é uma **taxa no tempo**, não uma soma: como no SAC o dinheiro fica
menos tempo com o cliente, o mesmo custo diluído em menos prazo médio resulta numa taxa ligeiramente
maior. Em resumo: **SAC é mais barato em reais, PRICE tem parcela menor e previsível.**
Nenhum dos dois é "melhor" — a escolha é do time de decisão (RN-05).

### Detalhe de arredondamento

A última parcela do PRICE é R$ 936,87, e não R$ 936,91. O sistema ajusta a última parcela para
**zerar o saldo devedor exatamente**, absorvendo os centavos de arredondamento dos 11 meses
anteriores. É proposital e evita saldo residual de centavos.

---

## 8. Quando o sistema recusa um pedido

| Motivo | O que significa para o negócio | O que fazer |
|---|---|---|
| Dados inválidos | campo faltando ou fora do formato (CPF inválido, prazo fora do produto, valor com 3 casas) | corrigir e reenviar — a resposta lista **todos** os problemas |
| Identificador duplicado | essa operação já foi criada | consultar a existente; não recriar |
| Decisão não aprovada | o time de decisão não aprovou o crédito | nada a fazer aqui; é decisão de crédito |
| Score insuficiente | score abaixo de 200 (faixa E) | produto não disponível para esse risco |
| Produto não encontrado / inativo | código errado ou produto descontinuado | conferir o catálogo (§4) |
| Operação não definida | tentou gerar documento de operação sem sistema escolhido | só acontece com operações antigas |
| Amortização já definida | tentou mudar PRICE/SAC de uma operação já definida | a escolha é definitiva (RN-05) |
| CET não converge | o fluxo de pagamentos não admite solução matemática | caso anômalo; acionar o time técnico |

Nenhuma dessas recusas grava operação. Nada "fica pela metade".

---

## 9. O que o sistema explicitamente não faz

Para evitar expectativa errada em reunião:

- **Não calcula score nem analisa crédito.** Recebe pronto.
- **Não verifica renda, margem consignável ou capacidade de pagamento.** Não há regra de
  comprometimento de renda.
- **Não consulta bureaus** (Serasa, SPC) nem o Banco Central em tempo real.
- **Não controla limite de crédito** do cliente, nem acumula exposição: dois pedidos do mesmo CPF são
  independentes.
- **Não gera o contrato nem o PDF.** Produz os dados; o PDF é do time de documentos.
- **Não trata liquidação antecipada, renegociação, atraso, mora ou multa.**
- **Não tem autenticação nem controle de acesso.** Qualquer um que alcance a rede da API pode criar
  operações (ver §10).
- **Não trata feriados** — só fins de semana (RN-09).
- **Não suporta taxa pós-fixada ou indexada.** Todos os produtos são prefixados.
- **Não trabalha com CNPJ alfanumérico** (novo formato da Receita a partir de 07/2026).

---

## 10. Pontos de atenção para a gestão

Ordenados por impacto.

**1. Sem autenticação.** Não há login, token ou controle de acesso. Qualquer cliente com acesso de
rede pode criar operações, e o sistema libera chamadas de qualquer origem. Aceitável em ambiente
acadêmico ou de rede fechada; **bloqueante para produção**.

**2. Parâmetros tributários marcados como provisórios.** As alíquotas de IOF estão documentadas no
próprio código com **confiança média**: baseiam-se no Decreto 6.306/2007 com as alterações dos
Decretos 12.466/2025 e 12.499/2025. A equipe registrou que o texto consolidado precisa ser conferido
antes de tratar os números como definitivos. O mesmo vale para o teto do `CONSIGNADO_INSS` (1,85%),
anotado como provisório. **Antes de qualquer uso real, isso precisa de validação jurídica.**

**3. As taxas da tabela de preço foram definidas pela equipe, não por política de crédito.** Os
spreads (0,00 / 0,50 / 1,00 / 2,00) e as taxas base são escolhas do projeto. Não há custo de
captação, nem campanha comercial, nem margem-alvo por trás delas.

**4. O catálogo diz "PF", mas o sistema aceita PJ em todos os produtos.** Os seis produtos estão
cadastrados com público-alvo pessoa física; ainda assim, uma empresa pode contratar qualquer um
deles (pagando o IOF adicional de PJ). Foi decisão consciente do projeto, mas é uma inconsistência
entre o catálogo e o comportamento — convém decidir se o catálogo deve passar a restringir.

**5. O registro no time financeiro não está sendo confirmado.** Hoje a operação é enviada ao time
financeiro, mas o sistema **não registra a confirmação de volta**: toda operação fica marcada como
"envio pendente", mesmo quando o outro lado aceitou. Na prática, não é possível responder pelo
sistema "esta operação já está registrada no financeiro". Há uma decisão técnica pendente para
resolver isso; é a pendência mais relevante do projeto hoje.

**6. Duas escalas de risco convivem.** O time de decisão manda a faixa dele (`EXCELENTE`, `BOM`…) e
este serviço usa a sua própria (A–E), que é a que define o preço. As duas ficam guardadas lado a
lado. Em relatório, é preciso dizer **de qual escala** se está falando.

**7. O `CONSIGNADO_INSS` não diferencia risco acima da faixa A** (§5). Vale checar se é o desenho
comercial desejado.

---

## 11. Fontes regulatórias citadas no sistema

| Tema | Base | Onde aparece |
|---|---|---|
| CET: fórmula e demonstrativo | Res. CMN 4.881/2020, arts. 4º e 7º | RN-13, RN-14 |
| IOF diário e adicional | Decreto 6.306/2007, arts. 7º e 7º-A; Decretos 12.466/2025 e 12.499/2025 | RN-10 |
| Tarifa de cadastro no primeiro relacionamento | Res. CMN 3.919/2010, art. 1º; Tema 620 do STJ | RN-11 |
| Validação de CPF/CNPJ | regra de módulo 11 da Receita Federal | RN-02 |
| Taxas de referência de mercado | série do Banco Central, 11–17/08/2026 | §4 |

> As referências acima são as que a equipe registrou no código e nos documentos de pesquisa
> (`docs/research_tabela-juros-brasil_20260831.md`). Nenhuma foi validada por área jurídica — ver §10,
> ponto 2.
