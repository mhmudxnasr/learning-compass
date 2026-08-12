#!/usr/bin/env python3
"""Render delegated Markdown drafts into self-contained companion HTML files.

This renderer is deliberately deterministic. AGY writes only Markdown; this
script owns HTML structure, metadata, embedded visuals, and the later PDF gate.
"""
from __future__ import annotations

import html
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path('/home/mahmud/visual-learn-artifacts')
WORK = ROOT / 'rebuild-20260812'
CURRENT = ROOT
SLUGS = ['power-dynamics','paths-power','business-acquisitions','negotiation','cashflow','psych-safety','decisions','cpr-aed']

STYLE = '''<style>
:root{--bg:#FAF6EF;--ink:#2B2620;--muted:#5D554C;--accent:#8C5A2B;--green:#3E6B5E}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"Noto Naskh Arabic","Amiri",Georgia,serif;font-size:20px;line-height:1.8;overflow-wrap:anywhere}header,main,footer{max-width:980px;margin:auto;padding-inline:28px}header{padding-block:60px 30px;border-bottom:1px solid #cbbda9}h1{font-size:clamp(2.1rem,5vw,3.4rem);line-height:1.15;margin:0 0 20px}h2{font-size:clamp(1.5rem,3vw,2.1rem);border-inline-start:5px solid var(--accent);padding-inline-start:14px;line-height:1.25;margin-top:2.4em}h3{font-size:1.25em;line-height:1.35}p{max-width:72ch}.lead{font-size:1.25em}.meta{display:flex;gap:12px;flex-wrap:wrap;color:var(--muted);font-family:system-ui;font-size:.78em;margin-top:20px}.meta-badge{border-bottom:2px solid var(--accent);padding:2px 7px}.reader-map{padding:15px 24px;border-bottom:1px solid #cbbda9}.reader-map a{margin-inline-end:8px}figure{margin:35px 0}figure img{display:block;width:100%;height:auto;border:1px solid #cbbda9}figcaption{font-size:.82em;color:var(--muted);margin-top:10px}pre{white-space:pre-wrap;word-break:break-word;background:#F1E6D6;padding:18px;direction:ltr;text-align:left;font:14px/1.5 system-ui;overflow:auto}code{font-family:"IBM Plex Mono",monospace;background:#F1E6D6;padding:0 4px}blockquote{border-inline-start:4px solid var(--green);padding-inline:18px;color:#3e6b5e}ul,ol{max-width:72ch;padding-inline-start:2em}table{border-collapse:collapse;width:100%;margin:24px 0;font-size:.9em;table-layout:fixed}th,td{border:1px solid #cbbda9;padding:8px;text-align:start;vertical-align:top;overflow-wrap:anywhere}th{background:#F1E6D6}a{color:#75491f;overflow-wrap:anywhere}.source-anchor{font-family:system-ui;font-size:.9em}.skip{position:absolute;inset-inline-start:-999px}.skip:focus{inset-inline-start:12px;top:12px;background:white;padding:10px;z-index:5}footer{border-top:1px solid #cbbda9;margin-top:50px;padding-block:30px;color:var(--muted)}@media(max-width:768px){body{font-size:18px}header,main,footer{padding-inline:18px}table{display:block;overflow-x:auto}}@media print{@page{size:A4 portrait;margin:18mm}body{font-size:18pt;line-height:1.6}header,main,footer{max-width:none;padding-inline:0}nav,.skip{display:none}figure{break-inside:avoid-page}h2,h3{break-after:avoid-page}p{orphans:3;widows:3}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
</style>'''


class Visible(HTMLParser):
    def __init__(self): super().__init__(); self.parts=[]; self.hidden=0
    def handle_starttag(self, tag, attrs):
        if tag in {'style','script'}: self.hidden += 1
    def handle_endtag(self, tag):
        if tag in {'style','script'} and self.hidden: self.hidden -= 1
    def handle_data(self, data):
        if not self.hidden: self.parts.append(data)


def inline(text: str) -> str:
    text = html.escape(text, quote=False)
    text = re.sub(r'\[([^]]+)\]\((https?://[^)]+)\)', r'<a href="\2">\1</a>', text)
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'__([^_]+)__', r'<strong>\1</strong>', text)
    text = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<em>\1</em>', text)
    return text


def slug_id(title: str, number: int) -> str:
    return f'section-{number}'


def extract_figures(current_html: str) -> list[str]:
    return re.findall(r'<figure\b.*?</figure>', current_html, flags=re.S | re.I)


def render_markdown(md: str, figures: list[str]) -> tuple[str, list[str]]:
    lines = md.replace('\r\n','\n').split('\n')
    # Delegated drafts sometimes flatten the outline by one level. Restore a
    # meaningful reader structure before rendering so visual anchors can map
    # to real sections instead of dumping every figure into one giant section.
    headings = [line for line in lines if re.match(r'^#{1,4}\s+', line)]
    has_h2 = any(line.startswith('## ') for line in headings)
    normalized = []
    for line in lines:
        m = re.match(r'^(#{1,4})\s+(.+?)\s*$', line)
        if m and len(m.group(1)) == 3:
            title = m.group(2).strip()
            top_level = re.match(r'^(?:\d+\.|القسم\b|جدول\b|تقديم\b|Comprehensive\b|\[\d)', title, re.I)
            if not has_h2 or top_level:
                line = '## ' + title
        elif m and len(m.group(1)) == 4:
            # Once a flattened ### heading is promoted, its #### children are
            # the next level down and must remain readable as h3.
            line = '### ' + m.group(2).strip()
        normalized.append(line)
    lines = normalized
    out=[]; nav=[]; i=0; section=0; inserted=0
    while i < len(lines):
        line=lines[i]
        if not line.strip(): i+=1; continue
        if line.startswith('```'):
            lang=line[3:].strip(); buf=[]; i+=1
            while i<len(lines) and not lines[i].startswith('```'): buf.append(lines[i]); i+=1
            i+=1; code_text = html.escape("\n".join(buf)); out.append(f'<pre lang="en" dir="ltr">{code_text}</pre>'); continue
        m=re.match(r'^(#{1,3})\s+(.+?)\s*$',line)
        if m:
            level=len(m.group(1)); title=re.sub(r'\s*\[[^]]+\]\s*$','',m.group(2)).strip()
            if level==1:
                i+=1; continue
            if level==2:
                if section: out.append('</section>')
                section+=1; sid=slug_id(title,section); nav.append((sid,title)); out.append(f'<section id="{sid}"><h2>{inline(title)}</h2>')
                if inserted < len(figures):
                    fig=figures[inserted]; out.append(fig)
                    anchors = re.findall(r'href="#(timestamp-[^"]+)"', fig)
                    anchors += [f'timestamp-{value}' for value in re.findall(r'data-source-anchor="timestamp:([^"]+)"', fig)]
                    for anchor in anchors: out.append(f'<span id="{anchor}"></span>')
                    inserted+=1
                i+=1; continue
            out.append(f'<h3>{inline(title)}</h3>'); i+=1; continue
        if line.startswith('>'):
            buf=[]
            while i<len(lines) and lines[i].startswith('>'):
                buf.append(lines[i][1:].lstrip()); i+=1
            out.append(f'<blockquote>{inline(" ".join(buf))}</blockquote>'); continue
        if re.match(r'^\s*[-*+]\s+',line):
            items=[]
            while i<len(lines) and re.match(r'^\s*[-*+]\s+',lines[i]): items.append(re.sub(r'^\s*[-*+]\s+','',lines[i])); i+=1
            out.append('<ul>'+''.join(f'<li>{inline(x)}</li>' for x in items)+'</ul>'); continue
        if re.match(r'^\s*\d+[.)]\s+',line):
            items=[]
            while i<len(lines) and re.match(r'^\s*\d+[.)]\s+',lines[i]): items.append(re.sub(r'^\s*\d+[.)]\s+','',lines[i])); i+=1
            out.append('<ol>'+''.join(f'<li>{inline(x)}</li>' for x in items)+'</ol>'); continue
        if line.startswith('|') and i+1<len(lines) and '---' in lines[i+1]:
            headers=[x.strip() for x in line.strip('|').split('|')]; i+=2; rows=[]
            while i<len(lines) and lines[i].startswith('|'):
                rows.append([x.strip() for x in lines[i].strip('|').split('|')]); i+=1
            out.append('<table><caption>جدول تلخيصي مستخرج من المصدر</caption><thead><tr>'+''.join(f'<th scope="col">{inline(x)}</th>' for x in headers)+'</tr></thead><tbody>')
            out.append(''.join('<tr>'+''.join(f'<td>{inline(x)}</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table>'); continue
        buf=[line.strip()]; i+=1
        while i<len(lines) and lines[i].strip() and not re.match(r'^(#{1,3})\s|^```|^>|^\s*[-*+]\s+|^\s*\d+[.)]\s+|^\s*\|',lines[i]): buf.append(lines[i].strip()); i+=1
        out.append(f'<p>{inline(" ".join(buf))}</p>')
    if section: out.append('</section>')
    return ''.join(out),nav


def main():
    for slug in SLUGS:
        work=WORK/slug; manifest=json.loads((CURRENT/slug/'images.json').read_text())
        current=(CURRENT/slug/f'{slug}.html').read_text()
        figures=extract_figures(current)
        body,nav=render_markdown((work/'companion.md').read_text(encoding='utf-8'),figures)
        title=manifest['source_title']; url=manifest['source_url']
        nav_html=' · '.join(f'<a href="#{sid}">{inline(t)}</a>' for sid,t in nav[:12])
        doc=f'''<!doctype html><html lang="ar-EG" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{html.escape(title)}</title>{STYLE}</head><body><a class="skip" href="#main">تخطى للمحتوى</a><header><p>مرافق قراءة شامل · source-grounded reading guide</p><h1>{html.escape(title)}</h1><p class="lead">مرافق مبني على التفريغ الكامل للمصدر، يحافظ على التسلسل والأمثلة والآليات والحدود بدل اختزاله في ملخص سريع.</p><div class="meta"><a href="{html.escape(url,quote=True)}">المصدر الأصلي</a><span class="meta-badge" data-meta="reading-time">محسوبة بعد البناء</span><span class="meta-badge" data-meta="word-count">محسوبة بعد البناء</span><span class="meta-badge" data-meta="evidence-count">محسوبة بعد البناء</span></div></header><main id="main"><article><nav class="reader-map" aria-label="خريطة القراءة"><strong>خريطة القراءة:</strong> {nav_html}</nav>{body}</article></main><footer><p>النص الأساسي محرر من المصدر مع فصل واضح بين كلام المتحدث والتحليل التطبيقي. راجع المصدر الأصلي لأي قرار طبي أو مالي أو مهني عالي المخاطر.</p></footer></body></html>'''
        parser=Visible(); parser.feed(doc); visible=' '.join(parser.parts); words=re.findall(r"\b[\w’'-]+\b",visible); evidence=len(re.findall(r'class=["\'][^"\']*source-anchor',doc,re.I)); mins=max(1,round(len(words)/200))
        doc=re.sub(r'<meta name="word-count"[^>]*>','',doc)
        doc=doc.replace('محسوبة بعد البناء</span><span class="meta-badge" data-meta="word-count">محسوبة بعد البناء','محسوبة بعد البناء</span><span class="meta-badge" data-meta="word-count">'+str(len(words))+' words')
        doc=doc.replace('محسوبة بعد البناء</span><span class="meta-badge" data-meta="evidence-count">محسوبة بعد البناء','محسوبة بعد البناء</span><span class="meta-badge" data-meta="evidence-count">'+str(evidence)+' evidence points')
        doc=doc.replace('data-meta="reading-time">محسوبة بعد البناء','data-meta="reading-time">'+str(mins)+' min read')
        doc=doc.replace('<title>',f'<meta name="word-count" content="{len(words)}"><meta name="evidence-count" content="{evidence}"><title>',1)
        # Badge text is visible text, so inserting its final number changes the
        # count by a token. Recompute once from the finished document and make
        # the metadata agree with what the validator/user actually sees.
        final_parser=Visible(); final_parser.feed(doc)
        final_words=len(re.findall(r"\b[\w’'-]+\b", ' '.join(final_parser.parts)))
        doc=re.sub(r'(<meta name="word-count" content=")\d+(">)', rf'\g<1>{final_words}\g<2>', doc)
        doc=re.sub(r'(data-meta="word-count">)\d+ words', rf'\g<1>{final_words} words', doc)
        (work/f'{slug}.html').write_text(doc,encoding='utf-8')
        print(slug,final_words,evidence,len(figures))

if __name__=='__main__': main()
