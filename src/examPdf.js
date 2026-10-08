import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import katex from 'katex';

// A4 exam layout. Prose and code are real PDF text; only mathematics is rendered
// as high-resolution black-on-white formula artwork, never a page screenshot.
const BODY = 14, PART = 13.5, MARGIN = 44;
const clean = value => String(value ?? '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\u00a0/g, ' ');
const mathPattern = /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|`[^`\n]+`)/g;

// Render numeric output tables in aligned monospace columns, without changing
// the underlying question bank or interpreting literal C string escapes.
export function formatExamText(value) {
  return String(value ?? '').split(/(```[\s\S]*?```)/g).map(block => {
    if (block.startsWith('```')) return block;
    return block.replace(/(^|\n)((?:[ \t]*[+-]?\d+(?:[ \t]+[+-]?\d+)+[ \t]*(?:\n|$)){2,})/g, (_, prefix, matrix) => {
      const rows = matrix.trim().split('\n').map(line => line.trim().split(/\s+/));
      const widths = rows.reduce((sizes, row) => row.map((n,i) => Math.max(sizes[i] || 0, n.length)), []);
      const aligned = rows.map(row => row.map((n,i) => n.padStart(widths[i])).join('  ')).join('\n');
      return prefix + '```text\n' + aligned + '\n```\n';
    });
  }).join('');
}

export async function createExamPdf({ paper, meta, className, subject, shortMarks, longMarks }) {
  if (!paper.B.length && !paper.C.length) return;
  await document.fonts.ready;
  const pdf = new jsPDF({ compress: true, orientation: 'portrait', unit: 'pt', format: 'a4' });
  pdf.setProperties({ title: `Class ${className} - ${subject}${meta.exam ? ' - ' + meta.exam : ''}`, subject: 'Question paper', creator: 'Paperloom' });
  pdf.setTextColor(0); pdf.setDrawColor(0);
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), RIGHT = W - MARGIN, BOTTOM = H - 56;
  const total = paper.B.length * shortMarks + paper.C.length * longMarks;
  const formulaCache = new Map();
  let y = MARGIN, page = 1;
  function font(size, style = 'normal', family = 'helvetica') { pdf.setFont(family, style); pdf.setFontSize(size); }
  function newPage() {
    pdf.addPage(); page++; font(10, 'bold');
    pdf.text(clean(`Class ${className} - ${subject}${meta.exam ? ' | ' + meta.exam : ''}`), MARGIN, 36, { maxWidth: W - 2 * MARGIN });
    pdf.setLineWidth(.5); pdf.line(MARGIN, 46, RIGHT, 46); y = 64;
  }
  function ensure(height) { if (y + height > BOTTOM) newPage(); }
  async function formula(token, size) {
    const key = size + ':' + token;
    if (formulaCache.has(key)) return formulaCache.get(key);
    const display = token.startsWith('$$') || token.startsWith('\\[');
    const latex = token.replace(/^\$\$|\$\$$/g, '').replace(/^\$|\$$/g, '').replace(/^\\\(|\\\)$/g, '').replace(/^\\\[|\\\]$/g, '');
    const wrapper = document.createElement('div');
    Object.assign(wrapper.style, { position: 'fixed', left: '-20000px', top: '0', display: 'inline-block', width: 'max-content', padding: '2px 3px', background: '#fff', color: '#000', fontSize: `${size * 96 / 72}px`, lineHeight: 'normal', whiteSpace: 'nowrap', zIndex: '-1' });
    wrapper.innerHTML = katex.renderToString(latex, { displayMode: display, throwOnError: false, errorColor: '#000000', output: 'html', trust: false });
    const rendered = wrapper.querySelector('.katex'); if (rendered) rendered.style.fontSize = '1em';
    const probe = document.createElement('span'); Object.assign(probe.style, { display: 'inline-block', width: '0', height: '0', verticalAlign: 'baseline' }); wrapper.append(probe);
    document.body.append(wrapper);
    try {
      await document.fonts.ready;
      const rect = wrapper.getBoundingClientRect(); const baseline = probe.getBoundingClientRect().top - rect.top;
      const canvas = await html2canvas(wrapper, { scale: 3, backgroundColor: '#fff', logging: false, useCORS: true });
      const result = { image: canvas.toDataURL('image/png'), width: rect.width * .75, height: rect.height * .75, ascent: display ? rect.height * .75 : Math.max(size * .8, baseline * .75), display };
      result.descent = Math.max(0, result.height - result.ascent); formulaCache.set(key, result); return result;
    } finally { wrapper.remove(); }
  }
  async function rowsFor(text, width, size = BODY) {
    text = formatExamText(text);
    const rows = []; let row = { segments: [], width: 0, ascent: size * .82, descent: size * .25 };
    function flush(force = false) { if (row.segments.length || force) { row.height = Math.max(size * 1.5, row.ascent + row.descent + 4); rows.push(row); } row = { segments: [], width: 0, ascent: size * .82, descent: size * .25 }; }
    function append(segment) {
      if (segment.blank && !row.segments.length) return;
      if (row.width + segment.width > width && row.segments.length) flush();
      if (segment.blank && !row.segments.length) return;
      row.segments.push(segment); row.width += segment.width; row.ascent = Math.max(row.ascent, segment.ascent || 0); row.descent = Math.max(row.descent, segment.descent || 0);
    }
    function words(value, family = 'helvetica', tokenSize = size) {
      for (const word of clean(value).split(/(\n|[^\S\n]+)/)) {
        if (!word) continue;
        if (word === '\n') { flush(true); continue; }
        font(tokenSize, 'normal', family);
        let pieces = [word];
        if (pdf.getTextWidth(word) > width && !/^\s+$/.test(word)) pieces = pdf.splitTextToSize(word, width);
        for (const piece of pieces) { font(tokenSize, 'normal', family); append({ text: piece, family, size: tokenSize, width: pdf.getTextWidth(piece), ascent: tokenSize * .82, descent: tokenSize * .25, blank: /^\s+$/.test(piece) }); }
      }
    }
    async function prose(value) {
      let cursor = 0;
      for (const match of value.matchAll(mathPattern)) {
        words(value.slice(cursor, match.index)); const token = match[0];
        if (token.startsWith('`')) words(token.slice(1,-1), 'courier', size * .95);
        else {
          const f = { ...(await formula(token, size)) }; const ratio = Math.min(1, width / f.width);
          f.width *= ratio; f.height *= ratio; f.ascent *= ratio; f.descent *= ratio;
          // Keep trailing punctuation with an inline formula, rather than leaving
          // a full stop or comma alone on the next line.
          const punctuation = value.slice(match.index + token.length).match(/^[ \t]*[.,;:!?]/)?.[0];
          font(size);
          if (!f.display && punctuation && row.segments.length && row.width + f.width + pdf.getTextWidth(punctuation) > width) flush();
          if (f.display) { flush(); append(f); flush(); } else append(f);
        }
        cursor = match.index + token.length;
      }
      words(value.slice(cursor));
    }
    let cursor = 0;
    for (const match of String(text ?? '').matchAll(/```[^\n]*\n([\s\S]*?)```/g)) {
      await prose(String(text).slice(cursor, match.index)); flush();
      for (const codeLine of match[1].replace(/\n$/, '').split('\n')) {
        font(size * .9, 'normal', 'courier');
        const lines = pdf.splitTextToSize(codeLine.replace(/\t/g, '    '), width);
        for (const line of lines) { const codeSize = size * .9; rows.push({ height: codeSize * 1.45, ascent: codeSize * .82, descent: codeSize * .25, segments: [{ text: line, family: 'courier', size: codeSize, width: pdf.getTextWidth(line) }] }); }
      }
      cursor = match.index + match[0].length;
    }
    await prose(String(text ?? '').slice(cursor)); flush(); return rows;
  }
  function drawRow(row, x, first = false, number = '', marks = null, label = '') {
    ensure(row.height); const baseline = y + row.ascent;
    if (first && number) { font(BODY, 'bold'); pdf.text(number + '.', MARGIN, baseline); }
    if (first && marks !== null && meta.showMarks) { font(12, 'bold'); pdf.text('[' + marks + ']', RIGHT, baseline, { align: 'right' }); }
    if (first && label) { font(PART); pdf.text(clean(label), x - 32, baseline); }
    let cursor = x;
    for (const segment of row.segments) {
      if (segment.image) pdf.addImage(segment.image, 'PNG', cursor, baseline - segment.ascent, segment.width, segment.height);
      else { font(segment.size || BODY, 'normal', segment.family || 'helvetica'); pdf.text(segment.text, cursor, baseline); }
      cursor += segment.width;
    }
    y += row.height;
  }
  const bodyX = MARGIN + 27, partX = bodyX + 37, textRight = RIGHT - (meta.showMarks ? 36 : 0);
  const prepared = {};
  for (const section of ['B','C']) {
    prepared[section] = [];
    for (const q of paper[section]) {
      const rows = await rowsFor(q.text, textRight - bodyX);
      const parts = [];
      for (const part of q.parts || []) parts.push({ label: part.label, rows: await rowsFor(part.text, textRight - partX, PART) });
      const height = rows.reduce((n,r)=>n+r.height,0) + parts.reduce((n,p)=>n+5+p.rows.reduce((a,r)=>a+r.height,0),0) + 14 + (meta.showChapter || meta.showSource ? 18 : 0);
      prepared[section].push({ q, rows, parts, height });
    }
  }
  if (meta.showHeader) {
    font(22, 'bold');
    const titleLines = pdf.splitTextToSize(clean(meta.institution || 'Question Paper'), W - 2 * MARGIN);
    pdf.text(titleLines, W / 2, y + 20, { align: 'center', lineHeightFactor: 1.25 }); y += titleLines.length * 27.5 + 6.5;
    if (meta.exam) {
      font(14, 'bold'); const examLines = pdf.splitTextToSize(clean(meta.exam), W - 2 * MARGIN);
      pdf.text(examLines, W / 2, y + 12, { align: 'center', lineHeightFactor: 1.3 }); y += examLines.length * 18.2 + 8.8;
    }
    font(12); pdf.text('Class: ' + clean(className), MARGIN, y + 12); pdf.text('Subject: ' + clean(subject), RIGHT, y + 12, { align: 'right' }); y += 22;
    pdf.text('Time: ' + clean(meta.time), MARGIN, y + 12); pdf.text('Total marks: ' + total, RIGHT, y + 12, { align: 'right' }); y += 25;
    pdf.setLineWidth(.8); pdf.line(MARGIN, y, RIGHT, y); y += 24;
  }
  for (const section of ['B','C']) {
    const items = prepared[section]; if (!items.length) continue;
    const instructions = clean(section === 'B' ? meta.instructionsB : meta.instructionsC);
    font(11.5); const instructionRows = pdf.splitTextToSize(instructions, W - 2 * MARGIN);
    const sectionHeight = 27 + instructionRows.length * 16 + 12 + items.reduce((n,item) => n + item.height, 0) + 8;
    if (section === 'C' && sectionHeight <= BOTTOM - 64 && y + sectionHeight > BOTTOM) newPage();
    ensure(28 + instructionRows.length * 16 + Math.min(items[0].height, 100));
    font(18, 'bold'); pdf.text('Section ' + section, MARGIN, y + 16); y += 27;
    font(11.5); for (const line of instructionRows) { pdf.text(line, MARGIN, y + 10); y += 16; } y += 12;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // Keep normal questions and subparts together. Oversized questions continue
      // line-by-line without cutting text or formula artwork across page edges.
      if (item.height <= BOTTOM - 64) ensure(item.height);
      for (let j = 0; j < item.rows.length; j++) drawRow(item.rows[j], bodyX, j === 0, String(i+1), section === 'B' ? shortMarks : longMarks);
      for (const part of item.parts) { y += 5; ensure(Math.min(part.rows.reduce((n,r)=>n+r.height,0), BOTTOM-64)); for (let j=0;j<part.rows.length;j++) drawRow(part.rows[j], partX, j===0, '', null, part.label); }
      if (meta.showChapter || meta.showSource) {
        const detail = [meta.showChapter ? item.q.chapter : '', meta.showSource ? `${item.q.source === 'past_paper' ? 'Past paper' : 'Important book'}${item.q.year ? ' - ' + item.q.year : ''}` : ''].filter(Boolean).join(' | ');
        font(10); const lines = pdf.splitTextToSize(clean(detail), textRight - bodyX); ensure(lines.length*14); pdf.text(lines, bodyX, y + 10); y += lines.length*14;
      }
      y += 14;
    }
    y += 8;
  }
  const pages = pdf.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i); font(9); pdf.setLineWidth(.4); pdf.line(MARGIN, H - 44, RIGHT, H - 44);
    pdf.text(clean(`Class ${className} - ${subject}`), MARGIN, H - 28); pdf.text(`Page ${i} of ${pages}`, RIGHT, H - 28, { align: 'right' });
  }
  return pdf;
}
