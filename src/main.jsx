import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import katex from 'katex';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import 'katex/dist/katex.min.css';
import './styles.css';

const UNKNOWN_CHAPTER = 'Unknown chapter';
const SECTION_FILTERS = ['All', 'B', 'C'];

function Icon({ name, size = 18 }) {
  const paths = {
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 20h14a2 2 0 0 0 2-2v-4M3 14v4a2 2 0 0 0 2 2"/></>,
    layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
    sliders: <><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/></>,
    shuffle: <><path d="M3 6h2.5c2.5 0 3.5 1 5 3l4 6c1.5 2 2.5 3 5 3H21"/><path d="m18 15 3 3-3 3M3 18h2.5c1.8 0 2.8-.7 3.9-2M14.5 7c1.3-1.3 2.2-1.8 4-1.8H21"/><path d="m18 2 3 3-3 3"/></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
    download: <><path d="M12 3v12M7 11l5 5 5-5M4 21h16"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    x: <><path d="m6 6 12 12M18 6 6 18"/></>,
    pdf: <><path d="M6 2h8l4 4v16H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v5h5M8 15h2a1.5 1.5 0 0 0 0-3H8v6M13 18v-6h2a3 3 0 0 1 0 6h-2M19 12h-3v6"/></>,
    word: <><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M6.5 8.5 8 16l2-4 2 4 1.5-7.5M15 8.5h3"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    back: <><path d="M19 12H5M11 18l-6-6 6-6"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
    close: <><path d="M6 6l12 12M18 6 6 18"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>
  };
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function richTextHtml(value) {
  const source = String(value ?? '').replace(/\\n/g, '\n');
  const matcher = /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\])/g;
  let html = '';
  let cursor = 0;
  let match;
  while ((match = matcher.exec(source))) {
    html += escapeHtml(source.slice(cursor, match.index)).replace(/\n/g, '<br/>');
    const token = match[0];
    const displayMode = token.startsWith('$$') || token.startsWith('\\[');
    const latex = token.replace(/^\$\$|\$\$$/g, '').replace(/^\$|\$$/g, '').replace(/^\\\(|\\\)$/g, '').replace(/^\\\[|\\\]$/g, '');
    try {
      html += katex.renderToString(latex, { displayMode, throwOnError: false, output: 'htmlAndMathml' });
    } catch {
      html += `<span class="math-fallback">${escapeHtml(latex)}</span>`;
    }
    cursor = matcher.lastIndex;
  }
  html += escapeHtml(source.slice(cursor)).replace(/\n/g, '<br/>');
  return html;
}

function RichText({ text }) {
  return <span className="rich-text" dangerouslySetInnerHTML={{ __html: richTextHtml(text) }} />;
}

function makeChapterName(index) {
  return `Chapter ${String(index).padStart(2, '0')}`;
}

function inferChapters(rawQuestions, sourceKey) {
  let chapterNumber = 0;
  let currentChapter = null;
  let hasStarted = false;
  let previousWasC = false;
  const questions = (Array.isArray(rawQuestions) ? rawQuestions : []).map((raw, index) => {
    const section = String(raw?.section ?? '').trim().toUpperCase();
    if (section === 'B') {
      if (!hasStarted) {
        chapterNumber = 1;
        currentChapter = makeChapterName(chapterNumber);
        hasStarted = true;
      } else if (previousWasC) {
        chapterNumber += 1;
        currentChapter = makeChapterName(chapterNumber);
      }
      previousWasC = false;
    } else if (section === 'C') {
      previousWasC = true;
    }
    const chapter = section === 'B' || section === 'C' ? (currentChapter || UNKNOWN_CHAPTER) : UNKNOWN_CHAPTER;
    return {
      id: `${sourceKey}::${index}`,
      section: section || '?',
      number: raw?.number ?? '',
      year: raw?.year ?? '',
      text: raw?.text ?? '',
      parts: Array.isArray(raw?.parts) ? raw.parts.map((part, partIndex) => ({ label: part?.label || `(${partIndex + 1})`, text: part?.text ?? '' })) : [],
      chapter,
      raw
    };
  });
  const chapters = [];
  questions.forEach((question) => {
    if (!chapters.includes(question.chapter)) chapters.push(question.chapter);
  });
  return { questions, chapters };
}

function normalizeBank(payload, sourceName, sourceKey = sourceName) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.questions)) {
    throw new Error('Expected an object with a questions[] array.');
  }
  const inferred = inferChapters(payload.questions, sourceKey);
  return {
    id: sourceKey,
    sourceName,
    subject: String(payload.subject || 'Untitled subject'),
    className: String(payload.class || 'Unassigned class'),
    questions: inferred.questions,
    chapters: inferred.chapters
  };
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function allocateQuestions(candidates, count, percentages) {
  if (!count || !candidates.length) return [];
  const byChapter = candidates.reduce((acc, question) => {
    (acc[question.chapter] ||= []).push(question);
    return acc;
  }, {});
  const eligible = Object.keys(byChapter).filter((chapter) => byChapter[chapter].length > 0);
  if (!eligible.length) return [];
  const totalWeight = eligible.reduce((sum, chapter) => sum + Math.max(0, Number(percentages[chapter] ?? 0)), 0);
  const weight = (chapter) => totalWeight ? Math.max(0, Number(percentages[chapter] ?? 0)) / totalWeight : 1 / eligible.length;
  const target = Math.min(count, candidates.length);
  const chosen = [];
  const chosenIds = new Set();
  const orderedChapters = shuffle(eligible).sort((a, b) => weight(b) - weight(a));
  const chapterSlots = target >= eligible.length ? orderedChapters : orderedChapters.slice(0, target);
  chapterSlots.forEach((chapter) => {
    const question = shuffle(byChapter[chapter])[0];
    if (question && !chosenIds.has(question.id)) {
      chosen.push(question);
      chosenIds.add(question.id);
    }
  });
  const remaining = shuffle(candidates.filter((question) => !chosenIds.has(question.id)))
    .map((question) => ({ question, score: Math.random() * (0.12 + weight(question.chapter)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, target - chosen.length)
    .map(({ question }) => question);
  return shuffle([...chosen, ...remaining]);
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function PaperQuestion({ question, index }) {
  return (
    <div className="paper-question">
      <div className="paper-number">{index + 1}.</div>
      <div className="paper-question-body">
        <div className="paper-question-text"><RichText text={question.text} /></div>
        {question.parts.length > 0 && (
          <div className="paper-parts">
            {question.parts.map((part, partIndex) => (
              <div className="paper-part" key={`${question.id}-part-${partIndex}`}>
                <span className="part-label">{part.label}</span>
                <RichText text={part.text} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StepRail({ activeStep, onStep }) {
  const steps = [
    { number: '01', label: 'Load banks', icon: 'upload' },
    { number: '02', label: 'Curate pool', icon: 'layers' },
    { number: '03', label: 'Shape paper', icon: 'sliders' },
    { number: '04', label: 'Preview & export', icon: 'eye' }
  ];
  return (
    <aside className="step-rail">
      <div className="brand-lockup">
        <div className="brand-mark"><Icon name="file" size={20} /></div>
        <div><div className="wordmark">Paperloom</div><div className="brand-caption">question studio</div></div>
      </div>
      <div className="rail-intro">Turn a question bank into a paper that feels considered.</div>
      <nav className="steps" aria-label="Workflow steps">
        {steps.map((step, index) => (
          <button key={step.number} className={`step-button ${activeStep === index + 1 ? 'active' : ''} ${activeStep > index + 1 ? 'done' : ''}`} onClick={() => onStep(index + 1)}>
            <span className="step-icon"><Icon name={activeStep > index + 1 ? 'check' : step.icon} size={16} /></span>
            <span className="step-copy"><small>{step.number}</small><strong>{step.label}</strong></span>
          </button>
        ))}
      </nav>
      <div className="rail-note"><Icon name="info" size={15} /><span>Chapter rules follow the ordering inside each JSON bank.</span></div>
      <div className="rail-footer"><span className="status-dot" /> Local session · your files stay here</div>
    </aside>
  );
}

function QuestionRow({ question, checked, onToggle }) {
  const displaySection = question.section === 'B' || question.section === 'C' ? question.section : '?';
  return (
    <label className={`question-row ${checked ? 'checked' : ''}`}>
      <input type="checkbox" checked={checked} onChange={() => onToggle(question.id)} />
      <span className="custom-check"><Icon name="check" size={13} /></span>
      <span className="question-row-copy">
        <span className="question-meta"><span className={`section-chip section-${displaySection === '?' ? 'unknown' : displaySection}`}>{displaySection}</span><span>{question.chapter}</span>{question.section !== 'B' && question.section !== 'C' && <span className="parts-badge">not eligible for B/C output</span>}{question.parts.length > 0 && <span className="parts-badge">{question.parts.length} parts</span>}</span>
        <span className="question-row-text"><RichText text={question.text} /></span>
      </span>
    </label>
  );
}

function App() {
  const [banks, setBanks] = useState([]);
  const [selectedBankId, setSelectedBankId] = useState('');
  const [loadState, setLoadState] = useState('loading');
  const [notice, setNotice] = useState('');
  const [activeStep, setActiveStep] = useState(1);
  const [chapterConfig, setChapterConfig] = useState({});
  const [selectedQuestionIds, setSelectedQuestionIds] = useState(new Set());
  const [sectionFilter, setSectionFilter] = useState('All');
  const [questionSearch, setQuestionSearch] = useState('');
  const [shortCount, setShortCount] = useState(5);
  const [longCount, setLongCount] = useState(3);
  const [generatedPaper, setGeneratedPaper] = useState({ B: [], C: [] });
  const [pdfFiles, setPdfFiles] = useState([]);
  const [previewPdf, setPreviewPdf] = useState(null);
  const jsonInputRef = useRef(null);
  const pdfInputRef = useRef(null);
  const paperRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function loadBundledBanks() {
      try {
        const manifestResponse = await fetch('/question-banks/manifest.json', { cache: 'no-store' });
        if (!manifestResponse.ok) throw new Error(`Manifest request failed (${manifestResponse.status}).`);
        const manifestText = await manifestResponse.text();
        if (!manifestText.trim()) throw new Error('The bundled-bank manifest was empty.');
        const manifest = JSON.parse(manifestText);
        const settled = await Promise.allSettled(manifest.files.map(async (path) => {
          const encodedPath = path.split('/').map(encodeURIComponent).join('/');
          const response = await fetch(`/question-banks/${encodedPath}`, { cache: 'no-store' });
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          const text = await response.text();
          if (!text.trim()) throw new Error('empty response');
          const payload = JSON.parse(text);
          return normalizeBank(payload, path, `bundled-${path}`);
        }));
        const loaded = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
        const failed = settled.filter((result) => result.status === 'rejected');
        if (!cancelled) {
          if (!loaded.length) throw new Error('No bundled question banks could be parsed.');
          setBanks(loaded);
          setSelectedBankId(loaded[0]?.id || '');
          setLoadState('ready');
          if (failed.length) setNotice(`${failed.length} bundled bank${failed.length > 1 ? 's were' : ' was'} skipped because its response was empty or invalid.`);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadState('error');
          setNotice(`Bundled banks could not load: ${error.message}`);
        }
      }
    }
    loadBundledBanks();
    return () => { cancelled = true; };
  }, []);

  const selectedBank = useMemo(() => banks.find((bank) => bank.id === selectedBankId) || null, [banks, selectedBankId]);
  const classOptions = useMemo(() => [...new Set(banks.map((bank) => bank.className))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [banks]);
  const subjectOptions = useMemo(() => [...new Set(banks.map((bank) => bank.subject))].sort(), [banks]);
  const selectedClass = selectedBank?.className || '';
  const selectedSubject = selectedBank?.subject || '';
  const chapters = selectedBank?.chapters || [];
  const activeChapters = useMemo(() => chapters.filter((chapter) => chapterConfig[chapter]?.selected), [chapters, chapterConfig]);
  const percentages = useMemo(() => Object.fromEntries(chapters.map((chapter) => [chapter, chapterConfig[chapter]?.percent ?? 0])), [chapters, chapterConfig]);

  useEffect(() => {
    if (!selectedBank) return;
    const defaultPercent = Math.floor(100 / Math.max(selectedBank.chapters.length, 1));
    const remainder = 100 - defaultPercent * selectedBank.chapters.length;
    const nextConfig = Object.fromEntries(selectedBank.chapters.map((chapter, index) => [chapter, { selected: true, percent: defaultPercent + (index === 0 ? remainder : 0) }]));
    const eligible = selectedBank.questions.filter((question) => question.section === 'B' || question.section === 'C');
    setChapterConfig(nextConfig);
    setSelectedQuestionIds(new Set(eligible.map((question) => question.id)));
    setShortCount(Math.min(5, eligible.filter((question) => question.section === 'B').length));
    setLongCount(Math.min(3, eligible.filter((question) => question.section === 'C').length));
    setGeneratedPaper({ B: [], C: [] });
    setSectionFilter('All');
    setQuestionSearch('');
  }, [selectedBankId]);

  const selectedPool = useMemo(() => {
    if (!selectedBank) return [];
    return selectedBank.questions.filter((question) => selectedQuestionIds.has(question.id) && activeChapters.includes(question.chapter) && (question.section === 'B' || question.section === 'C'));
  }, [selectedBank, selectedQuestionIds, activeChapters]);
  const poolBySection = useMemo(() => ({
    B: selectedPool.filter((question) => question.section === 'B'),
    C: selectedPool.filter((question) => question.section === 'C')
  }), [selectedPool]);
  const visibleQuestions = useMemo(() => {
    if (!selectedBank) return [];
    const query = questionSearch.trim().toLowerCase();
    return selectedBank.questions.filter((question) => {
      const matchingSection = sectionFilter === 'All' || question.section === sectionFilter;
      const matchingText = !query || String(question.text).toLowerCase().includes(query) || question.parts.some((part) => String(part.text).toLowerCase().includes(query));
      return matchingSection && matchingText;
    });
  }, [selectedBank, sectionFilter, questionSearch]);
  const visibleSelected = visibleQuestions.filter((question) => selectedQuestionIds.has(question.id)).length;
  const allocationTotal = activeChapters.reduce((sum, chapter) => sum + Number(chapterConfig[chapter]?.percent || 0), 0);

  function showNotice(message) {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? '' : current), 4200);
  }

  async function handleJsonFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => file.name.toLowerCase().endsWith('.json'));
    if (!files.length) return;
    const nextBanks = [];
    for (const file of files) {
      try {
        const payload = JSON.parse(await file.text());
        nextBanks.push(normalizeBank(payload, file.name, `upload-${file.name}-${file.lastModified}-${Math.random()}`));
      } catch (error) {
        showNotice(`${file.name}: ${error.message}`);
      }
    }
    if (nextBanks.length) {
      setBanks((current) => [...nextBanks, ...current]);
      setSelectedBankId(nextBanks[0].id);
      setActiveStep(2);
      showNotice(`${nextBanks.length} JSON bank${nextBanks.length > 1 ? 's' : ''} added to the studio.`);
    }
  }

  function handlePdfFiles(fileList) {
    const next = Array.from(fileList || []).filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')).map((file) => ({ file, url: URL.createObjectURL(file) }));
    if (next.length) {
      setPdfFiles((current) => [...current, ...next]);
      setPreviewPdf(next[0]);
      showNotice(`${next.length} source PDF${next.length > 1 ? 's' : ''} ready to preview.`);
    }
  }

  function toggleQuestion(id) {
    setSelectedQuestionIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleVisibleQuestions() {
    const shouldSelect = visibleSelected !== visibleQuestions.length;
    setSelectedQuestionIds((current) => {
      const next = new Set(current);
      visibleQuestions.forEach((question) => shouldSelect ? next.add(question.id) : next.delete(question.id));
      return next;
    });
  }

  function toggleChapter(chapter) {
    setChapterConfig((current) => ({ ...current, [chapter]: { ...current[chapter], selected: !current[chapter]?.selected } }));
  }

  function changePercent(chapter, value) {
    const numeric = Math.max(0, Math.min(100, Number(value) || 0));
    setChapterConfig((current) => ({ ...current, [chapter]: { ...current[chapter], percent: numeric } }));
  }

  function generatePaper() {
    if (!activeChapters.length) {
      showNotice('Select at least one chapter before generating.');
      return;
    }
    const paper = {
      B: allocateQuestions(poolBySection.B, Math.max(0, Number(shortCount) || 0), percentages),
      C: allocateQuestions(poolBySection.C, Math.max(0, Number(longCount) || 0), percentages)
    };
    setGeneratedPaper(paper);
    setActiveStep(4);
    showNotice('Paper generated from a shuffled, chapter-aware pool.');
  }

  function downloadWord() {
    if (!paperRef.current) return;
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;color:#111;line-height:1.6;padding:36pt}.section-title{font-weight:700;font-size:15pt;margin:0 0 16pt}.paper-question{display:flex;gap:12pt;margin:0 0 14pt}.paper-number{font-weight:700}.paper-question-body{flex:1}.paper-part{margin:7pt 0 0 16pt}.part-label{display:inline-block;width:28pt;font-weight:700}</style></head><body>${paperRef.current.innerHTML}</body></html>`;
    downloadBlob(html, 'paperloom-paper.doc', 'application/msword');
  }

  async function downloadPdf() {
    if (!paperRef.current || (!generatedPaper.B.length && !generatedPaper.C.length)) return;
    const canvas = await html2canvas(paperRef.current, { scale: 2, backgroundColor: '#fffdf8', useCORS: true });
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imageHeight = canvas.height * pageWidth / canvas.width;
    const image = canvas.toDataURL('image/png');
    let offset = 0;
    while (offset < imageHeight) {
      if (offset > 0) pdf.addPage();
      pdf.addImage(image, 'PNG', 0, -offset, pageWidth, imageHeight);
      offset += pageHeight;
    }
    pdf.save('paperloom-paper.pdf');
  }

  const hasPaper = generatedPaper.B.length > 0 || generatedPaper.C.length > 0;
  const totalQuestions = (selectedBank?.questions || []).filter((question) => question.section === 'B' || question.section === 'C').length;

  return (
    <div className="app-shell">
      <StepRail activeStep={activeStep} onStep={setActiveStep} />
      <main className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">QUESTION PAPER GENERATOR <span className="eyebrow-line" /></div>
            <h1>Build a paper with <em>intent.</em></h1>
            <p className="topbar-subtitle">Choose a bank, tune the balance, and leave the formatting to Paperloom.</p>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button" onClick={() => pdfInputRef.current?.click()}><Icon name="pdf" size={16} /> Source PDFs <span className="tiny-count">{pdfFiles.length}</span></button>
            <div className="session-pill"><span className="status-dot" /> Local session</div>
          </div>
        </header>

        {notice && <div className="notice"><Icon name="info" size={16} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notification"><Icon name="x" size={15} /></button></div>}

        <section className="control-bar">
          <div className="control-group wide"><label>Class</label><div className="select-wrap"><select value={selectedClass} onChange={(event) => { const bank = banks.find((item) => item.className === event.target.value && item.subject === selectedSubject) || banks.find((item) => item.className === event.target.value); if (bank) setSelectedBankId(bank.id); }}><option value="">Select class</option>{classOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select><Icon name="chevron" size={15} /></div></div>
          <div className="control-group wide"><label>Subject</label><div className="select-wrap"><select value={selectedSubject} onChange={(event) => { const bank = banks.find((item) => item.subject === event.target.value && item.className === selectedClass) || banks.find((item) => item.subject === event.target.value); if (bank) setSelectedBankId(bank.id); }}><option value="">Select subject</option>{subjectOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select><Icon name="chevron" size={15} /></div></div>
          <div className="control-group bank-control"><label>Question bank</label><div className="select-wrap"><select value={selectedBankId} onChange={(event) => setSelectedBankId(event.target.value)}><option value="">Choose a bank</option>{banks.map((bank) => <option value={bank.id} key={bank.id}>{bank.className} · {bank.subject} · {bank.sourceName}</option>)}</select><Icon name="chevron" size={15} /></div></div>
          <button className="upload-button" onClick={() => jsonInputRef.current?.click()}><Icon name="upload" size={16} /> Load JSON</button>
          <input ref={jsonInputRef} type="file" accept=".json,application/json" multiple hidden onChange={(event) => handleJsonFiles(event.target.files)} />
          <input ref={pdfInputRef} type="file" accept=".pdf,application/pdf" multiple hidden onChange={(event) => handlePdfFiles(event.target.files)} />
        </section>

        {loadState === 'loading' ? <div className="loading-state"><div className="loader" /> Loading bundled question banks…</div> : selectedBank ? (
          <div className="content-grid">
            <div className="left-column">
              <section className="panel pool-panel">
                <div className="panel-heading">
                  <div><div className="panel-kicker">STEP 01 — CURATE</div><h2>Question pool</h2><p>Select the questions you want the generator to draw from.</p></div>
                  <div className="pool-stat"><strong>{selectedPool.length}</strong><span>in selected pool</span></div>
                </div>
                <div className="pool-toolbar">
                  <div className="search-field"><Icon name="search" size={16} /><input value={questionSearch} onChange={(event) => setQuestionSearch(event.target.value)} placeholder="Search question text…" /></div>
                  <div className="filter-pills">{SECTION_FILTERS.map((filter) => <button key={filter} className={sectionFilter === filter ? 'active' : ''} onClick={() => setSectionFilter(filter)}>{filter === 'All' ? 'All sections' : `Section ${filter}`}</button>)}</div>
                  <button className="text-button" onClick={toggleVisibleQuestions}>{visibleSelected === visibleQuestions.length ? 'Deselect visible' : 'Select visible'}</button>
                </div>
                <div className="pool-summary"><span><b>{visibleQuestions.length}</b> shown</span><span className="summary-divider" /><span><b>{poolBySection.B.length}</b> short</span><span><b>{poolBySection.C.length}</b> long</span><span className="summary-spacer" /><span className="legend-item"><i className="legend-dot dot-b" /> B</span><span className="legend-item"><i className="legend-dot dot-c" /> C</span><span className="legend-item"><i className="legend-dot dot-unknown" /> ?</span></div>
                <div className="question-list">
                  {visibleQuestions.length ? visibleQuestions.map((question) => <QuestionRow key={question.id} question={question} checked={selectedQuestionIds.has(question.id)} onToggle={toggleQuestion} />) : <div className="empty-list"><Icon name="search" size={22} /><strong>No questions match</strong><span>Try a different search or section filter.</span></div>}
                </div>
              </section>

              <section className="panel source-panel">
                <div className="panel-heading compact"><div><div className="panel-kicker">REFERENCE MATERIAL</div><h2>Related source PDFs</h2><p>Keep the original paper beside your question bank.</p></div><button className="icon-button" onClick={() => pdfInputRef.current?.click()} aria-label="Add source PDF"><Icon name="plus" size={17} /></button></div>
                {pdfFiles.length ? <div className="pdf-list">{pdfFiles.map((item, index) => <div className={`pdf-row ${previewPdf?.url === item.url ? 'selected' : ''}`} key={item.url}><div className="pdf-icon"><Icon name="pdf" size={18} /></div><div className="pdf-copy"><strong>{item.file.name}</strong><span>{(item.file.size / 1024).toFixed(0)} KB</span></div><button className="small-button" onClick={() => setPreviewPdf(item)}>{previewPdf?.url === item.url ? 'Viewing' : 'Preview'}</button><button className="remove-button" onClick={() => { URL.revokeObjectURL(item.url); setPdfFiles((current) => current.filter((pdf) => pdf.url !== item.url)); if (previewPdf?.url === item.url) setPreviewPdf(null); }} aria-label={`Remove ${item.file.name}`}><Icon name="x" size={15} /></button></div>)}</div> : <button className="pdf-dropzone" onClick={() => pdfInputRef.current?.click()}><span className="dropzone-icon"><Icon name="pdf" size={22} /></span><span><strong>Drop a source PDF here</strong><small>or browse your files to preview related papers</small></span><Icon name="arrow" size={17} /></button>}
              </section>
            </div>

            <div className="right-column">
              <section className="panel chapter-panel">
                <div className="panel-heading compact"><div><div className="panel-kicker">STEP 02 — BALANCE</div><h2>Chapter contribution</h2><p>Every selected chapter gets a fair chance when the pool allows.</p></div><div className={`total-badge ${allocationTotal === 100 ? 'valid' : ''}`}><strong>{allocationTotal}%</strong><span>{allocationTotal === 100 ? 'balanced' : 'adjust to 100%'}</span></div></div>
                <div className="chapter-list">{chapters.map((chapter, index) => { const chapterQuestions = selectedBank.questions.filter((question) => question.chapter === chapter); return <div className={`chapter-row ${chapterConfig[chapter]?.selected ? 'selected' : ''}`} key={chapter}><button className="chapter-toggle" onClick={() => toggleChapter(chapter)} aria-label={`Toggle ${chapter}`}><span className="chapter-check"><Icon name="check" size={13} /></span></button><div className="chapter-stamp">{chapter === UNKNOWN_CHAPTER ? '?' : String(index + 1).padStart(2, '0')}</div><div className="chapter-name"><strong>{chapter}</strong><span>{chapterQuestions.length} questions</span></div><div className="percent-input"><input type="number" min="0" max="100" value={chapterConfig[chapter]?.percent ?? 0} onChange={(event) => changePercent(chapter, event.target.value)} /><span>%</span></div></div>})}</div>
                <div className="chapter-footnote"><Icon name="info" size={14} /> Percentages are normalized during generation; 100% keeps the plan easiest to read.</div>
              </section>

              <section className="panel shape-panel">
                <div className="panel-heading compact"><div><div className="panel-kicker">STEP 03 — SHAPE</div><h2>Paper structure</h2><p>Choose how many questions to draw from the curated pool.</p></div><div className="shape-icon"><Icon name="sliders" size={20} /></div></div>
                <div className="count-grid"><label className="count-card"><span className="count-label"><i className="legend-dot dot-b" /> Section B <small>short questions</small></span><input type="number" min="0" max={poolBySection.B.length} value={shortCount} onChange={(event) => setShortCount(event.target.value)} /><span className="availability">of {poolBySection.B.length} available</span></label><label className="count-card"><span className="count-label"><i className="legend-dot dot-c" /> Section C <small>long questions</small></span><input type="number" min="0" max={poolBySection.C.length} value={longCount} onChange={(event) => setLongCount(event.target.value)} /><span className="availability">of {poolBySection.C.length} available</span></label></div>
                <button className="generate-button" onClick={generatePaper}><span><Icon name="shuffle" size={18} /> Generate random paper</span><Icon name="arrow" size={18} /></button>
                <div className="generation-note"><span className="spark">✦</span> Randomized within your chapter percentages. Optional parts stay attached.</div>
              </section>

              <section className="panel preview-panel">
                <div className="panel-heading compact preview-heading"><div><div className="panel-kicker">STEP 04 — REVIEW</div><h2>Paper preview</h2><p>The export surface contains only the required sections and selected questions.</p></div><div className="export-actions"><button className="small-button" onClick={downloadWord} disabled={!hasPaper}><Icon name="word" size={15} /> Word</button><button className="small-button dark" onClick={downloadPdf} disabled={!hasPaper}><Icon name="pdf" size={15} /> PDF</button></div></div>
                <div className="paper-frame">
                  <div className="paper-sheet" id="paper-print" ref={paperRef}>
                    {hasPaper ? <><section className="paper-section"><h3>Section B</h3>{generatedPaper.B.map((question, index) => <PaperQuestion key={question.id} question={question} index={index} />)}</section><section className="paper-section"><h3>Section C</h3>{generatedPaper.C.map((question, index) => <PaperQuestion key={question.id} question={question} index={index} />)}</section></> : <div className="paper-empty"><div className="empty-paper-mark"><Icon name="file" size={24} /></div><strong>Your paper will appear here</strong><span>Set the balance, then generate a random paper.</span></div>}
                  </div>
                </div>
                {hasPaper && <div className="preview-foot"><span><span className="status-dot" /> Ready to export</span><span>{generatedPaper.B.length + generatedPaper.C.length} questions selected</span></div>}
              </section>
            </div>
          </div>
        ) : <div className="loading-state">No bank selected. Use Load JSON to add a question bank.</div>}
      </main>

      {previewPdf && <div className="modal-backdrop" onClick={() => setPreviewPdf(null)}><div className="pdf-modal" onClick={(event) => event.stopPropagation()}><div className="modal-header"><div><div className="panel-kicker">SOURCE PDF</div><h2>{previewPdf.file.name}</h2></div><button className="icon-button" onClick={() => setPreviewPdf(null)} aria-label="Close PDF preview"><Icon name="close" size={18} /></button></div><iframe src={previewPdf.url} title={`Preview of ${previewPdf.file.name}`} /></div></div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
