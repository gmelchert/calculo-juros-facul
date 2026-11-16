# -*- coding: utf-8 -*-
"""
Markdown -> HTML -> PDF (Chrome headless) com sumário paginado e marcadores (bookmarks).

Estratégia em 3 passagens, porque inserir o sumário desloca as páginas:
  passagem 1: renderiza sem sumário, descobre a página de cada título
  passagem 2: renderiza com o sumário (números da passagem 1) -> páginas mudam
  passagem 3: renderiza de novo com os números corrigidos -> converge

Os títulos carregam um marcador invisível (branco, 1pt) que o pypdf consegue extrair,
o que torna o mapeamento título -> página exato, sem depender de casar texto.
"""
import io
import os
import re
import subprocess
import sys
import html as htmlmod

import markdown
from pypdf import PdfReader, PdfWriter

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
MARCA = "\u27e6PG{}\u27e7"          # ⟦PG12⟧ — só existe para o pypdf achar
# O Chrome separa os glifos em runs distintos e o pypdf devolve "⟦ PG12 ⟧": daí o \s*.
MARCA_RE = re.compile("⟦\\s*PG\\s*(\\d+)\\s*⟧")

CSS = """
@page {
  size: A4;
  margin: 18mm 16mm 16mm 16mm;
  @top-right  { content: "__TITULO__"; font-family: "Segoe UI", sans-serif;
                font-size: 7.5pt; color: #94a3b8; }
  @bottom-center { content: counter(page); font-family: "Segoe UI", sans-serif;
                   font-size: 8pt; color: #64748b; }
}
@page :first { @top-right { content: ""; } @bottom-center { content: ""; } }

* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  font-family: "Segoe UI", "Calibri", sans-serif;
  font-size: 9.6pt; line-height: 1.55; color: #1e293b; margin: 0;
  hyphens: none;
}

/* ---------- capa ---------- */
.capa { page-break-after: always; padding-top: 40mm;
        min-height: 236mm; display: flex; flex-direction: column; }
.capa .eyebrow { font-size: 8.5pt; letter-spacing: .16em; text-transform: uppercase;
                 color: #64748b; font-weight: 600; }
.capa h1 { font-size: 30pt; line-height: 1.15; margin: 6mm 0 4mm; color: #0f172a;
           border: 0; padding: 0; font-weight: 650; }
.capa .sub { font-size: 12pt; color: #475569; margin-bottom: 14mm; max-width: 135mm; }
.capa .regua { height: 3px; width: 46mm; background: #2563eb; margin-bottom: 10mm; }
.capa dl { display: grid; grid-template-columns: 34mm 1fr; gap: 2.5mm 0;
           font-size: 9pt; max-width: 140mm; }
.capa dt { color: #64748b; font-weight: 600; }
.capa dd { margin: 0; color: #334155; }
/* margin-top:auto encosta no fim da CAPA. `position: fixed` repetiria em TODA pagina. */
.capa .rodape { margin-top: auto; font-size: 8pt; color: #94a3b8; }

/* ---------- sumário ---------- */
.sumario { page-break-after: always; }
.sumario h2 { border: 0; margin: 0 0 7mm; font-size: 15pt; color: #0f172a; }
.sumario ol { list-style: none; margin: 0; padding: 0; }
.sumario li { margin: 0 0 1.6mm; font-size: 9.5pt; }
.sumario li.n2 { margin-left: 7mm; font-size: 8.8pt; color: #475569; }
.sumario a { color: inherit; text-decoration: none; display: flex;
             align-items: baseline; gap: 2mm; }
.sumario .pontos { flex: 1; border-bottom: 1px dotted #cbd5e1; transform: translateY(-1mm); }
.sumario .pg { color: #64748b; font-variant-numeric: tabular-nums; font-size: 8.5pt; }
.sumario li.n1 > a > .rot { font-weight: 600; color: #0f172a; }

/* ---------- títulos ---------- */
h1, h2, h3, h4 { font-weight: 650; color: #0f172a; page-break-after: avoid; }
h1 { font-size: 19pt; margin: 0 0 4mm; }
h2 { font-size: 14pt; margin: 9mm 0 3.5mm; padding-bottom: 1.8mm;
     border-bottom: 1.5px solid #e2e8f0; }
h3 { font-size: 11pt; margin: 6mm 0 2.5mm; color: #1e3a8a; }
h4 { font-size: 9.8pt; margin: 4.5mm 0 2mm; }
h2 + h3 { margin-top: 3mm; }

p { margin: 0 0 2.8mm; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1.2mm; }
li > ul, li > ol { margin-top: 1.2mm; }
strong { font-weight: 650; color: #0f172a; }
a { color: #1d4ed8; text-decoration: none; }
hr { border: 0; border-top: 1px solid #e2e8f0; margin: 7mm 0; }

/* ---------- código ---------- */
code {
  font-family: "Cascadia Mono", Consolas, "Courier New", monospace;
  font-size: 8.4pt; background: #f1f5f9; color: #0f172a;
  padding: 0.3mm 1.1mm; border-radius: 2px;
}
pre {
  background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3px solid #2563eb;
  border-radius: 3px; padding: 3mm 3.5mm; margin: 0 0 3.5mm;
  page-break-inside: avoid; overflow: visible;
}
pre code {
  background: none; padding: 0; font-size: 8pt; line-height: 1.42;
  white-space: pre; display: block; color: #0f172a;
}

/* ---------- destaque (blockquote) ---------- */
blockquote {
  margin: 0 0 3.5mm; padding: 2.8mm 3.5mm; background: #fffbeb;
  border: 1px solid #fde68a; border-left: 3px solid #f59e0b; border-radius: 3px;
  color: #451a03; page-break-inside: avoid;
}
blockquote p { margin: 0 0 1.8mm; }
blockquote p:last-child { margin-bottom: 0; }
blockquote code { background: #fef3c7; }

/* ---------- tabelas ---------- */
table {
  border-collapse: collapse; width: 100%; margin: 0 0 4mm;
  font-size: 8.4pt; page-break-inside: auto;
}
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th {
  background: #1e293b; color: #f8fafc; font-weight: 600; text-align: left;
  padding: 1.8mm 2.2mm; font-size: 8.2pt; border: 1px solid #1e293b;
}
/* sem isto, **negrito** e `codigo` no cabecalho saem escuros sobre fundo escuro */
th strong, th code, th a { color: inherit; background: none; }
td { padding: 1.6mm 2.2mm; border: 1px solid #e2e8f0; vertical-align: top; }
tbody tr:nth-child(even) td { background: #f8fafc; }
td code, th code { font-size: 7.8pt; }

/* marcador invisível usado para mapear título -> página */
.pm { color: #ffffff; font-size: 1pt; }
"""

PAGINA = """<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>__TITULO__</title>
<style>__CSS__</style></head><body>__CORPO__</body></html>"""


def chrome_pdf(html_path, pdf_path):
    perfil = os.path.join(os.path.dirname(html_path), "chrome-perfil")
    cmd = [
        CHROME, "--headless=new", "--disable-gpu", "--no-sandbox",
        "--no-pdf-header-footer", f"--user-data-dir={perfil}",
        f"--print-to-pdf={pdf_path}", "--virtual-time-budget=10000",
        "file:///" + html_path.replace("\\", "/"),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if not os.path.exists(pdf_path):
        raise RuntimeError(f"Chrome nao gerou o PDF.\n{r.stdout}\n{r.stderr}")


def mapa_paginas(pdf_path):
    """marcador -> numero da pagina (1-based), lendo o texto de cada pagina."""
    mapa = {}
    leitor = PdfReader(pdf_path)
    for n, pagina in enumerate(leitor.pages, start=1):
        for ident in MARCA_RE.findall(pagina.extract_text() or ""):
            mapa.setdefault(int(ident), n)
    return mapa, len(leitor.pages)


def monta_html(titulo, subtitulo, meta, corpo_md, titulos, paginas):
    md = markdown.Markdown(extensions=["tables", "fenced_code", "toc", "attr_list", "sane_lists"])
    corpo = md.convert(corpo_md)

    # injeta o marcador invisivel logo depois da abertura de cada h2/h3
    seq = iter(titulos)

    def marca(m):
        t = next(seq)
        return f'{m.group(0)}<span class="pm">{MARCA.format(t["id"])}</span>'

    corpo = re.sub(r'<h[23][^>]*>', marca, corpo)

    # sumario
    if paginas:
        itens = []
        for t in titulos:
            pg = paginas.get(t["id"])
            if pg is None:
                continue
            cls = "n1" if t["nivel"] == 2 else "n2"
            itens.append(
                f'<li class="{cls}"><a href="#{t["slug"]}">'
                f'<span class="rot">{htmlmod.escape(t["texto"])}</span>'
                f'<span class="pontos"></span><span class="pg">{pg}</span></a></li>'
            )
        sumario = ('<section class="sumario"><h2>Sumário</h2><ol>'
                   + "".join(itens) + "</ol></section>")
    else:
        sumario = ""

    linhas_meta = "".join(
        f"<dt>{htmlmod.escape(k)}</dt><dd>{htmlmod.escape(v)}</dd>" for k, v in meta
    )
    capa = (
        '<section class="capa">'
        '<div class="eyebrow">Esteira de Crédito · Serviço de Cálculo de Juros</div>'
        # hífen comum deixa o Chrome quebrar "calculo-juros" ao meio no título grande:
        # o hífen não-separável (U+2011) evita isso sem mudar a aparência.
        f'<h1>{htmlmod.escape(titulo).replace("-", "‑")}</h1>'
        '<div class="regua"></div>'
        f'<div class="sub">{htmlmod.escape(subtitulo)}</div>'
        f'<dl>{linhas_meta}</dl>'
        '<div class="rodape">Documento gerado a partir do código-fonte do repositório '
        'calculo-juros.</div>'
        '</section>'
    )
    return (PAGINA.replace("__CSS__", CSS.replace("__TITULO__", htmlmod.escape(titulo)))
                  .replace("__TITULO__", htmlmod.escape(titulo))
                  .replace("__CORPO__", capa + sumario + corpo))


def extrai(md_texto):
    """Tira o H1 e o bloco de citação inicial; devolve titulo, subtitulo, meta e corpo."""
    linhas = md_texto.split("\n")
    titulo = ""
    i = 0
    while i < len(linhas):
        if linhas[i].startswith("# "):
            titulo = re.sub(r"[`*]", "", linhas[i][2:]).strip()
            i += 1
            break
        i += 1
    # O bloco de citação inicial vira os metadados da capa. Cada "**Chave**: valor" é uma
    # entrada, mas o valor pode continuar nas linhas ">" seguintes — por isso juntamos tudo
    # num texto só ANTES de separar, em vez de tratar linha a linha.
    bruto = []
    while i < len(linhas) and (linhas[i].strip() == "" or linhas[i].startswith(">")):
        if linhas[i].startswith(">"):
            bruto.append(linhas[i].lstrip("> ").strip())
        i += 1
    citacao = " ".join(bruto)

    def limpa(t):
        t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)   # [texto](link) -> texto
        return re.sub(r"\s+", " ", t.replace("`", "").replace("**", "")).strip(" .;")

    meta, sub = [], ""
    partes = re.split(r"\*\*([^*]+?)\*\*\s*:", citacao)
    if len(partes) > 1:
        if limpa(partes[0]):
            sub = limpa(partes[0])
        for chave, valor in zip(partes[1::2], partes[2::2]):
            meta.append((limpa(chave).rstrip(":"), limpa(valor)))
    elif citacao:
        sub = limpa(citacao)

    # Sem texto livre, a primeira entrada ("Para quem é") é a melhor legenda da capa.
    if not sub and meta:
        sub = meta.pop(0)[1]
    corpo = "\n".join(linhas[i:]).lstrip("\n")
    if corpo.startswith("---"):
        corpo = corpo[3:].lstrip("\n")
    return titulo, sub, meta, corpo


def slugify(texto):
    s = re.sub(r"[^\w\s-]", "", texto.lower(), flags=re.U)
    return re.sub(r"[\s]+", "-", s.strip())


def lista_titulos(corpo_md):
    """Títulos na ordem em que aparecem, ignorando os que estão dentro de ``` ```."""
    titulos, dentro, n = [], False, 0
    for linha in corpo_md.split("\n"):
        if linha.startswith("```"):
            dentro = not dentro
            continue
        if dentro:
            continue
        m = re.match(r"^(##|###)\s+(.*)", linha)
        if m:
            n += 1
            texto = re.sub(r"[*`]", "", m.group(2)).strip()
            titulos.append({"id": n, "nivel": len(m.group(1)),
                            "texto": texto, "slug": slugify(texto)})
    return titulos


def marcadores(pdf_entrada, pdf_saida, titulos, paginas):
    escritor = PdfWriter(clone_from=pdf_entrada)
    pai = None
    for t in titulos:
        pg = paginas.get(t["id"])
        if pg is None:
            continue
        if t["nivel"] == 2:
            pai = escritor.add_outline_item(t["texto"], pg - 1)
        else:
            escritor.add_outline_item(t["texto"], pg - 1, parent=pai)
    with open(pdf_saida, "wb") as f:
        escritor.write(f)


def main(md_path, pdf_path, tmp):
    origem = io.open(md_path, encoding="utf-8").read()
    titulo, sub, meta, corpo = extrai(origem)
    titulos = lista_titulos(corpo)
    base = os.path.splitext(os.path.basename(md_path))[0]

    paginas = {}
    for passagem in (1, 2, 3):
        html = monta_html(titulo, sub, meta, corpo, titulos, paginas if passagem > 1 else None)
        hp = os.path.join(tmp, f"{base}-p{passagem}.html")
        pp = os.path.join(tmp, f"{base}-p{passagem}.pdf")
        io.open(hp, "w", encoding="utf-8").write(html)
        chrome_pdf(hp, pp)
        novas, total = mapa_paginas(pp)
        estavel = novas == paginas
        paginas = novas
        print(f"  passagem {passagem}: {total} paginas, "
              f"{len(paginas)}/{len(titulos)} titulos mapeados"
              + (" (estavel)" if estavel and passagem > 1 else ""))
        if estavel and passagem > 1:
            break

    marcadores(pp, pdf_path, titulos, paginas)
    print(f"  -> {pdf_path}  ({os.path.getsize(pdf_path)/1024:.0f} KB, {total} paginas)")
    return total


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
