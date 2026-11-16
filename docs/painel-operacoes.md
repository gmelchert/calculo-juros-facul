# Painel de Operações — frontend de acompanhamento

> **Para quem é**: qualquer pessoa do time que precise **ver** as operações que chegaram, sem abrir
> o MySQL nem montar requisição no Postman.
> **Estado descrito**: 16/11/2026. Reflete o código real em `public/`.

---

## 1. O que é (e o que não é)

É uma tela estática — **HTML, CSS e JavaScript puros**, sem framework, sem build, sem dependência
nova no `package.json` — servida pelo próprio Express na raiz do servidor.

| É | Não é |
|---|---|
| Janela de leitura sobre a API | Tela de cadastro: **não cria nem altera** nada |
| Lista, filtra e abre o detalhe de uma operação | Não tem login (foi pedido assim: é uso interno) |
| Consome os mesmos endpoints públicos documentados no Swagger | Não fala com o MySQL direto |
| Mostra o que a API já devolve | **Não recalcula nada**: todo número na tela veio pronto do servidor |

A última linha é a mais importante. Se um valor parecer errado no painel, o problema está no motor
de cálculo ou no banco — **não** no frontend. O painel só formata.

---

## 2. Como abrir

```bash
npm start
```

Abra **http://localhost:3000/**. É só isso: o `src/app.js` serve a pasta `public/` na raiz, então o
mesmo servidor que responde `/api/...` entrega a tela.

A mensagem de subida agora mostra os dois endereços:

```
API rodando em http://localhost:3000
Painel de operações: http://localhost:3000/ · documentação: http://localhost:3000/api/docs
```

### Abrindo sem servidor (plano B)

Dá para dar duplo clique em `public/index.html` e abrir pelo `file://`. Nesse caso o painel procura
a API em `http://localhost:3000/api` — e funciona porque o `src/app.js` libera CORS para qualquer
origem. Foi por isso que os scripts **não** são `type="module"`: módulo ESM é bloqueado em `file://`.

---

## 3. O que cada pedaço da tela mostra

### Cartões do topo

| Cartão | De onde vem | Cuidado |
|---|---|---|
| **Operações** | soma de definidas + simuladas | vale para o banco inteiro |
| **Definidas** | `GET /api/operacoes?estado=DEFINIDA&tamanho=1`, campo `total` | vale para o banco inteiro |
| **Simuladas** | o mesmo com `estado=SIMULADA` | desde a T-14 isso só conta operações **antigas** |
| **Valor na página** | soma feita no navegador | **só das linhas visíveis**, não do banco inteiro |

O truque dos dois do meio é pedir 1 item só e ler o `total`: a API calcula esse número com um
`COUNT` sobre o filtro, então ele é global e a resposta é minúscula.

### Tabela

Uma linha por operação, mais recentes primeiro (a ordem vem da API, `ORDER BY id DESC`).

- **CET a.a.** mostra o CET do sistema escolhido. Se a operação ainda estiver `SIMULADA` (legado),
  aparecem os dois valores, `PRICE / SAC`, porque ainda não há escolha.
- **FinOps** é o `finops_status`: `PENDENTE`, `REGISTRADA` ou `FALHOU`. Operação `SIMULADA` mostra
  travessão, porque só operação definida tem registro lá.
- Operação que apareceu **depois** da última atualização pisca em verde por 2 segundos.

### Filtros

- **Estado** e **Por página** vão para a API (`?estado=`, `?tamanho=`), então valem para o banco todo.
- **Filtrar nesta página** é filtro de tela: a API não tem busca por texto, então ele procura só
  entre as linhas já baixadas. O rótulo diz isso de propósito. Se precisar achar algo que não está
  na página, aumente o "Por página" para 100 primeiro.

### Atualização automática

Ligada por padrão, a cada 15 segundos (`INTERVALO_MS` em `public/js/app.js`). Duas economias:
aba em segundo plano não dispara requisição, e voltar para a aba atualiza na hora.

### Gaveta de detalhe

Clique em qualquer linha (ou Enter com a linha focada). Ela busca `GET /api/operacoes/:id` e mostra:

1. **Cliente** — tipo de pessoa, CPF/CNPJ com máscara, datas de criação e definição
2. **Condições** — modalidade (nome por extenso vem de `GET /api/modalidades`), valor, prazo, score
3. **Taxa aplicada** — faixa A–D, taxa base, teto e se o teto limitou a taxa
4. **Decisão de crédito** — só aparece nas operações da T-14 em diante, que trazem `decisao`,
   `probabilidadeDefault` e `contextoScore`
5. **Registro no FinOps** — status, id lá, erro e hora da última tentativa
6. **Simulação** — abas PRICE e SAC, com a escolhida marcada; encargos, CET, composição do total
   devido e o cronograma parcela a parcela

Fecha com o **×**, com **Esc** ou clicando fora.

> **Armadilha da escala dupla**: dentro de "Decisão de crédito" pode aparecer
> `contextoScore.faixaRisco` com valores tipo `EXCELENTE` ou `BOM`. Essa é a escala do **grupo de
> decisão**. A faixa `A`–`D` do bloco "Taxa aplicada" é a **nossa**, a que busca a taxa em
> `faixas_juros`. São coisas diferentes com o mesmo nome. Não compare uma com a outra.

---

## 4. Os arquivos

```
public/
├─ index.html          estrutura da página (só marcação; nenhum dado aqui)
├─ css/estilo.css      aparência, em 11 blocos numerados; cores no topo, em :root
└─ js/
   ├─ formata.js       número/data/documento → texto de tela. Funções puras.
   ├─ api.js           ÚNICO lugar que chama fetch. Trata erro e monta a URL.
   └─ app.js           monta a tela e responde aos cliques.
```

A divisão do `app.js` segue uma regra: **quem desenha não busca, quem busca não desenha**. As
funções `carrega*` pedem dados e guardam no objeto `estado`; as funções `desenha*` leem o `estado`
e escrevem na tela. Quando algo aparecer errado, isso diz onde olhar.

### Três decisões que parecem detalhe mas não são

1. **Nenhuma função cria um objeto `Date`.** A API manda data como texto (`"2026-10-30"`), já no
   fuso do servidor. `new Date("2026-10-30")` é interpretado como UTC pelo navegador e mostraria
   **29/10** no Brasil. Por isso `Formata.data` e `Formata.dataHora` recortam a string com regex.
   Se você for mexer nelas, mantenha assim.
2. **Tudo que vai para dentro de `innerHTML` passa por `Formata.escapa`.** Campos como
   `finops.erro` são texto de **outro serviço**; sem escapar, um `<img onerror=...>` vindo de lá
   executaria no navegador de quem está olhando o painel.
3. **Cada par rótulo/valor da gaveta fica num `<div class="dado">`.** Sem esse `<div>`, `<dt>` e
   `<dd>` entram como duas células soltas do grid e o valor sai embaixo do rótulo errado.

---

## 5. Mexendo no painel

| Quero… | Onde |
|---|---|
| mudar as cores | bloco 1 do `estilo.css` (`:root` e o `@media (prefers-color-scheme: dark)`) |
| mudar o intervalo de atualização | `INTERVALO_MS`, topo do `app.js` |
| acrescentar uma coluna na tabela | `<thead>` do `index.html` **e** `linhaDaOperacao()` no `app.js` (e some 1 no `colspan` das mensagens de vazio) |
| acrescentar um campo na gaveta | a função `bloco*()` correspondente no `app.js` |
| apontar para outra API | `Api.base`, topo do `api.js` |

Conferir uma função de formatação é rápido: abra o painel, aperte F12 e digite no console —
`Formata.moeda(1234.5)` deve devolver `"R$ 1.234,50"`.

---

## 6. Quando a tela não carrega

| Sintoma | Causa provável |
|---|---|
| Faixa vermelha "Não foi possível falar com a API" | a API não subiu, ou subiu em outra porta |
| Bolinha vermelha "Sem conexão" e tabela vazia | mesma coisa — confira o terminal do `npm start` |
| Painel abre mas a faixa fala em erro 500 | a API está de pé e o **MySQL** não |
| `Cannot GET /` | o servidor em execução é anterior a esta mudança: reinicie o `npm start` |
| Tabela diz "Nenhuma operação no estado SIMULADA" | é filtro ligado, não falta de dado: volte "Estado" para *Todos* |

---

## 7. O que ficou de fora de propósito

- **Sem autenticação** — pedido explícito: é um painel interno de acompanhamento.
- **Sem criar/editar operação** — quem cria é o grupo de decisão, pelo `POST /api/operacoes`.
- **Sem busca no servidor** — a API não tem `?busca=`; acrescentar isso é mudança de backend.
- **Sem gráficos e sem histórico** — a API não guarda série temporal; só o estado atual.
- **Sem tela do consolidado** — `GET /api/operacoes/:id/consolidado` existe e é o documento que a
  equipe de contrato consome; o painel mostra os mesmos números pela operação completa.
