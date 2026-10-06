import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import katex from 'katex';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import 'katex/dist/katex.min.css';
import './styles.css';

const embeddedBankModules = import.meta.glob('../Data/**/*.json', { eager: true, import: 'default' });
const embeddedPdfModules = import.meta.glob(
  [
    '../Data/Class */Biology.pdf',
    '../Data/Class */Chemistry.pdf',
    '../Data/Class */Computer.pdf',
    '../Data/Class XII/Computer (Programming using C).pdf',
    '../Data/Class */Maths.pdf',
    '../Data/Class */Physics.pdf'
  ],
  { eager: true, query: '?url', import: 'default' }
);
const embeddedPdfUrls = Object.fromEntries(
  Object.entries(embeddedPdfModules).map(([modulePath, url]) => [
    modulePath.replace(/^\.\.\/Data\//, ''),
    url
  ])
);
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

function inferChapters(rawQuestions, sourceKey) {
  const questions = (Array.isArray(rawQuestions) ? rawQuestions : []).map((raw, index) => {
    const section = String(raw?.section ?? '').trim().toUpperCase();
    const chapter = String(raw?.chapter || '').trim() || UNKNOWN_CHAPTER;
    const type = ['short', 'long', 'numerical'].includes(raw?.type)
      ? raw.type
      : (section === 'C' ? 'long' : 'short');
    const source = ['past_paper', 'important_book'].includes(raw?.source)
      ? raw.source
      : 'past_paper';
    return {
      id: `${sourceKey}::${index}`,
      section: section || '?',
      type,
      source,
      year: Number.isInteger(raw?.year) ? raw.year : null,
      text: raw?.text ?? '',
      parts: Array.isArray(raw?.parts) ? raw.parts.map((part, partIndex) => (
        typeof part === 'string'
          ? { label: `(${partIndex + 1})`, text: part }
          : { label: part?.label || `(${partIndex + 1})`, text: part?.text ?? '' }
      )) : [],
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
  let pdfName = sourceName.replace(/\.json$/i, '.pdf');
  if (!embeddedPdfUrls[pdfName] && sourceName === 'Class XII/Computer.json') {
    pdfName = 'Class XII/Computer (Programming using C).pdf';
  }
  return {
    id: sourceKey,
    sourceName,
    subject: String(payload.subject || 'Untitled subject'),
    className: String(payload.class || 'Unassigned class'),
    pdfName,
    pdfUrl: embeddedPdfUrls[pdfName] || '',
    questions: inferred.questions,
    chapters: inferred.chapters
  };
}

function seededRandom(seedText = '') {
  let seed = 2166136261;
  for (const char of String(seedText)) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return () => {
    seed += 0x6D2B79F5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function allocateQuestions(candidates, count, percentages, random = Math.random) {
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
  const orderedChapters = shuffle(eligible, random).sort((a, b) => weight(b) - weight(a));
  const chapterSlots = target >= eligible.length ? orderedChapters : orderedChapters.slice(0, target);
  chapterSlots.forEach((chapter) => {
    const question = shuffle(byChapter[chapter], random)[0];
    if (question && !chosenIds.has(question.id)) {
      chosen.push(question);
      chosenIds.add(question.id);
    }
  });
  const remaining = shuffle(candidates.filter((question) => !chosenIds.has(question.id)), random)
    .map((question) => ({ question, score: random() * (0.12 + weight(question.chapter)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, target - chosen.length)
    .map(({ question }) => question);
  return shuffle([...chosen, ...remaining], random);
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

function PaperQuestion({ question, index, marks, showMarks, showChapter, showSource }) {
  return (
    <div className="paper-question">
      <div className="paper-number">{index + 1}.</div>
      <div className="paper-question-body">
        <div className="paper-question-text">
          <RichText text={question.text} />
          {showMarks && <span className="question-marks">[{marks}]</span>}
        </div>
        {(showChapter || showSource) && (
          <div className="paper-question-meta">
            {showChapter && <span>{question.chapter}</span>}
            {showSource && <span>{question.source === 'past_paper' ? `Past paper${question.year ? ` · ${question.year}` : ''}` : 'Important book'}</span>}
          </div>
        )}
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
    { number: '01', label: 'Questions', icon: 'layers' },
    { number: '02', label: 'Chapters', icon: 'check' },
    { number: '03', label: 'Structure', icon: 'sliders' },
    { number: '04', label: 'Preview', icon: 'eye' }
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

function QuestionRow({ question, checked, onToggle, position }) {
  const displaySection = question.section === 'B' || question.section === 'C' ? question.section : '?';
  return (
    <label className={`question-row section-row-${displaySection === '?' ? 'unknown' : displaySection} ${checked ? 'checked' : ''}`}>
      <input type="checkbox" checked={checked} onChange={() => onToggle(question.id)} />
      <span className="custom-check"><Icon name="check" size={13} /></span>
      <span className="question-index" aria-hidden="true">Q{position}</span>
      <span className="question-row-copy">
        <span className="question-meta">
          <span className={`section-chip section-${displaySection === '?' ? 'unknown' : displaySection}`}>{displaySection}</span>
          <span>{question.chapter}</span>
          <span className="parts-badge">{question.type}</span>
          <span className="parts-badge">{question.source === 'past_paper' ? `Past paper${question.year ? ` · ${question.year}` : ''}` : 'Important book'}</span>
          {question.section !== 'B' && question.section !== 'C' && <span className="parts-badge">not eligible for B/C output</span>}
          {question.parts.length > 0 && <span className="parts-badge">{question.parts.length} parts</span>}
        </span>
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
  const [typeFilter, setTypeFilter] = useState('All');
  const [sourceFilter, setSourceFilter] = useState('All');
  const [yearFilter, setYearFilter] = useState('All');
  const [questionSearch, setQuestionSearch] = useState('');
  const [shortCount, setShortCount] = useState(5);
  const [longCount, setLongCount] = useState(3);
  const [shortMarks, setShortMarks] = useState(2);
  const [longMarks, setLongMarks] = useState(5);
  const [seed, setSeed] = useState('');
  const [paperMeta, setPaperMeta] = useState({
    institution: '',
    exam: '',
    time: '2 hours',
    instructionsB: 'Attempt all questions.',
    instructionsC: 'Attempt any required questions.',
    showHeader: true,
    showMarks: true,
    showChapter: false,
    showSource: false
  });
  const [generatedPaper, setGeneratedPaper] = useState({ B: [], C: [] });
  const [previewPdf, setPreviewPdf] = useState(null);
  const jsonInputRef = useRef(null);
  const paperRef = useRef(null);
  const sectionRefs = useRef({});

  useEffect(() => {
    let cancelled = false;

    function readEmbeddedBanks() {
      return Object.entries(embeddedBankModules).flatMap(([modulePath, payload]) => {
        const sourceName = modulePath.replace(/^\.\.\/Data\//, '');
        try {
          return [normalizeBank(payload, sourceName, `embedded-${sourceName}`)];
        } catch {
          return [];
        }
      });
    }

    async function loadBundledBanks() {
      const embedded = readEmbeddedBanks();
      if (cancelled) return;
      if (!embedded.length) throw new Error('No bundled question banks could be parsed.');
      setBanks(embedded);
      setSelectedBankId(embedded[0]?.id || '');
      setLoadState('ready');
      setNotice(`Loaded ${embedded.length} validated question banks.`);
    }

    loadBundledBanks().catch((error) => {
      if (!cancelled) {
        setLoadState('error');
        setNotice(`Bundled banks could not load: ${error.message}`);
      }
    });
    return () => { cancelled = true; };
  }, []);
  const selectedBank = useMemo(() => banks.find((bank) => bank.id === selectedBankId) || null, [banks, selectedBankId]);
  const classOptions = useMemo(() => [...new Set(banks.map((bank) => bank.className))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [banks]);
  const selectedClass = selectedBank?.className || '';
  const selectedSubject = selectedBank?.subject || '';
  const selectedSourcePdf = useMemo(() => selectedBank?.pdfUrl ? {
    name: selectedBank.pdfName,
    url: selectedBank.pdfUrl,
    builtIn: true
  } : null, [selectedBank]);
  const subjectOptions = useMemo(() => [...new Set(banks.filter((bank) => !selectedClass || bank.className === selectedClass).map((bank) => bank.subject))].sort(), [banks, selectedClass]);
  const chapters = selectedBank?.chapters || [];
  const availableYears = useMemo(() => [...new Set((selectedBank?.questions || []).map((question) => question.year).filter(Boolean))].sort((a, b) => b - a), [selectedBank]);
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
    setTypeFilter('All');
    setSourceFilter('All');
    setYearFilter('All');
    setQuestionSearch('');
  }, [selectedBankId]);

  const selectedPool = useMemo(() => {
    if (!selectedBank) return [];
    return selectedBank.questions.filter((question) =>
      selectedQuestionIds.has(question.id)
      && activeChapters.includes(question.chapter)
      && (question.section === 'B' || question.section === 'C')
    );
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
      const matchingType = typeFilter === 'All' || question.type === typeFilter;
      const matchingSource = sourceFilter === 'All' || question.source === sourceFilter;
      const matchingYear = yearFilter === 'All' || String(question.year) === String(yearFilter);
      const matchingText = !query || String(question.text).toLowerCase().includes(query) || question.parts.some((part) => String(part.text).toLowerCase().includes(query));
      const matchingChapter = activeChapters.includes(question.chapter);
      return matchingChapter && matchingSection && matchingType && matchingSource && matchingYear && matchingText;
    });
  }, [selectedBank, activeChapters, sectionFilter, typeFilter, sourceFilter, yearFilter, questionSearch]);
  const visibleSelected = visibleQuestions.filter((question) => selectedQuestionIds.has(question.id)).length;
  const allocationTotal = activeChapters.reduce((sum, chapter) => sum + Number(chapterConfig[chapter]?.percent || 0), 0);

  function showNotice(message) {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? '' : current), 4200);
  }

  function goToStep(step) {
    setActiveStep(step);
    window.requestAnimationFrame(() => {
      sectionRefs.current[step]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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
      setActiveStep(1);
      showNotice(`${nextBanks.length} JSON bank${nextBanks.length > 1 ? 's' : ''} added to the studio.`);
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

  function balanceSelectedChapters() {
    const selected = chapters.filter((chapter) => chapterConfig[chapter]?.selected);
    if (!selected.length) return;
    const base = Math.floor(100 / selected.length);
    let remainder = 100 - base * selected.length;
    setChapterConfig((current) => Object.fromEntries(chapters.map((chapter) => [
      chapter,
      {
        ...current[chapter],
        percent: current[chapter]?.selected ? base + (remainder-- > 0 ? 1 : 0) : 0
      }
    ])));
  }

  function generatePaper() {
    if (!activeChapters.length) {
      showNotice('Select at least one chapter before generating.');
      return;
    }
    if (!poolBySection.B.length && !poolBySection.C.length) {
      showNotice('No questions match the current chapter and metadata filters.');
      return;
    }
    const random = seededRandom(seed.trim() || `${Date.now()}-${selectedBankId}`);
    const paper = {
      B: allocateQuestions(poolBySection.B, Math.max(0, Number(shortCount) || 0), percentages, random),
      C: allocateQuestions(poolBySection.C, Math.max(0, Number(longCount) || 0), percentages, random)
    };
    setGeneratedPaper(paper);
    goToStep(4);
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
  const totalMarks = generatedPaper.B.length * Math.max(0, Number(shortMarks) || 0) + generatedPaper.C.length * Math.max(0, Number(longMarks) || 0);

  return (
    <div className="app-shell">
      <StepRail activeStep={activeStep} onStep={goToStep} />
      <main className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">QUESTION PAPER GENERATOR <span className="eyebrow-line" /></div>
            <h1>Build a paper with <em>intent.</em></h1>
            <p className="topbar-subtitle">Choose a class and subject, tune the balance, and leave the formatting to Paperloom.</p>
          </div>
        </header>

        {notice && <div className="notice"><Icon name="info" size={16} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notification"><Icon name="x" size={15} /></button></div>}

        <section className="control-bar">
          <div className="control-group wide"><label>Class</label><div className="select-wrap"><select aria-label="Class" value={selectedClass} onChange={(event) => { const bank = banks.find((item) => item.className === event.target.value && item.subject === selectedSubject) || banks.find((item) => item.className === event.target.value); if (bank) setSelectedBankId(bank.id); }}><option value="">Select class</option>{classOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select><Icon name="chevron" size={15} /></div></div>
          <div className="control-group wide"><label>Subject</label><div className="select-wrap"><select aria-label="Subject" value={selectedSubject} onChange={(event) => { const bank = banks.find((item) => item.subject === event.target.value && item.className === selectedClass) || banks.find((item) => item.subject === event.target.value); if (bank) setSelectedBankId(bank.id); }}><option value="">Select subject</option>{subjectOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select><Icon name="chevron" size={15} /></div></div>
          <div className="control-actions">
            <button className="control-button secondary" onClick={() => selectedSourcePdf && setPreviewPdf(selectedSourcePdf)} disabled={!selectedSourcePdf}><Icon name="eye" size={16} /> View source PDF</button>
            <button className="control-button primary" onClick={() => jsonInputRef.current?.click()}><Icon name="upload" size={16} /> Import JSON</button>
          </div>
          <input ref={jsonInputRef} type="file" accept=".json,application/json" multiple hidden onChange={(event) => { handleJsonFiles(event.target.files); event.target.value = ''; }} />
        </section>

        {loadState === 'loading' ? <div className="loading-state"><div className="loader" /> Loading bundled question banks…</div> : selectedBank ? (
          <div className="content-grid">
            <div className="left-column">
              <section className="panel pool-panel" ref={(node) => { sectionRefs.current[1] = node; }}>
                <div className="panel-heading">
                  <div><div className="panel-kicker">STEP 01 — CURATE</div><h2>Question pool</h2><p>Select the questions you want the generator to draw from.</p></div>
                  <div className="pool-stat"><strong>{selectedPool.length}</strong><span>in selected pool</span></div>
                </div>
                <div className="pool-toolbar">
                  <div className="search-field"><Icon name="search" size={16} /><input value={questionSearch} onChange={(event) => setQuestionSearch(event.target.value)} placeholder="Search question text…" /></div>
                  <div className="filter-pills">{SECTION_FILTERS.map((filter) => <button key={filter} className={sectionFilter === filter ? 'active' : ''} onClick={() => setSectionFilter(filter)}>{filter === 'All' ? 'All sections' : `Section ${filter}`}</button>)}</div>
                  <button className="text-button" onClick={toggleVisibleQuestions}>{visibleSelected === visibleQuestions.length ? 'Deselect visible' : 'Select visible'}</button>
                </div>
                <div className="metadata-filters">
                  <label>Type<select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option>All</option><option value="short">Short</option><option value="numerical">Numerical</option><option value="long">Long</option></select></label>
                  <label>Source<select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option>All</option><option value="past_paper">Past paper</option><option value="important_book">Important book</option></select></label>
                  <label>Year<select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}><option>All</option>{availableYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
                  {(typeFilter !== 'All' || sourceFilter !== 'All' || yearFilter !== 'All') && <button className="text-button" onClick={() => { setTypeFilter('All'); setSourceFilter('All'); setYearFilter('All'); }}>Clear filters</button>}
                </div>
                <div className="pool-summary"><span><b>{visibleQuestions.length}</b> shown</span><span className="summary-divider" /><span><b>{poolBySection.B.length}</b> short</span><span><b>{poolBySection.C.length}</b> long</span><span className="summary-spacer" /><span className="legend-item"><i className="legend-dot dot-b" /> B</span><span className="legend-item"><i className="legend-dot dot-c" /> C</span><span className="legend-item"><i className="legend-dot dot-unknown" /> ?</span></div>
                <div className="question-list">
                  {visibleQuestions.length ? visibleQuestions.map((question, index) => <QuestionRow key={question.id} question={question} position={index + 1} checked={selectedQuestionIds.has(question.id)} onToggle={toggleQuestion} />) : <div className="empty-list"><Icon name="search" size={22} /><strong>No questions match</strong><span>Select a chapter or try different filters.</span></div>}
                </div>
              </section>

            </div>

            <div className="right-column">
              <section className="panel chapter-panel" ref={(node) => { sectionRefs.current[2] = node; }}>
                <div className="panel-heading compact"><div><div className="panel-kicker">STEP 02 — BALANCE</div><h2>Chapter contribution</h2><p>Every selected chapter gets a fair chance when the pool allows.</p></div><div className={`total-badge ${allocationTotal === 100 ? 'valid' : ''}`}><strong>{allocationTotal}%</strong><span>{allocationTotal === 100 ? 'balanced' : 'adjust to 100%'}</span></div></div>
                <div className="chapter-list">{chapters.map((chapter, index) => { const chapterQuestions = selectedBank.questions.filter((question) => question.chapter === chapter); return <div className={`chapter-row ${chapterConfig[chapter]?.selected ? 'selected' : ''}`} key={chapter}><button className="chapter-toggle" onClick={() => toggleChapter(chapter)} aria-label={`Toggle ${chapter}`}><span className="chapter-check"><Icon name="check" size={13} /></span></button><div className="chapter-stamp">{chapter === UNKNOWN_CHAPTER ? '?' : String(index + 1).padStart(2, '0')}</div><div className="chapter-name"><strong>{chapter}</strong><span>{chapterQuestions.length} questions</span></div><div className="percent-input"><input type="number" min="0" max="100" value={chapterConfig[chapter]?.percent ?? 0} onChange={(event) => changePercent(chapter, event.target.value)} /><span>%</span></div></div>})}</div>
                <div className="chapter-footnote"><span><Icon name="info" size={14} /> Percentages are normalized during generation.</span><button className="text-button" onClick={balanceSelectedChapters}>Balance evenly</button></div>
              </section>

              <section className="panel shape-panel" ref={(node) => { sectionRefs.current[3] = node; }}>
                <div className="panel-heading compact"><div><div className="panel-kicker">STEP 03 — SHAPE</div><h2>Paper structure</h2><p>Choose how many questions to draw from the curated pool.</p></div><div className="shape-icon"><Icon name="sliders" size={20} /></div></div>
                <div className="count-grid">
                  <label className="count-card"><span className="count-label"><i className="legend-dot dot-b" /> Section B <small>questions</small></span><input type="number" min="0" max={poolBySection.B.length} value={shortCount} onChange={(event) => setShortCount(event.target.value)} /><span className="availability">of {poolBySection.B.length} available</span><span className="inline-setting">Marks each <input type="number" min="0" value={shortMarks} onChange={(event) => setShortMarks(event.target.value)} /></span></label>
                  <label className="count-card"><span className="count-label"><i className="legend-dot dot-c" /> Section C <small>questions</small></span><input type="number" min="0" max={poolBySection.C.length} value={longCount} onChange={(event) => setLongCount(event.target.value)} /><span className="availability">of {poolBySection.C.length} available</span><span className="inline-setting">Marks each <input type="number" min="0" value={longMarks} onChange={(event) => setLongMarks(event.target.value)} /></span></label>
                </div>
                <div className="paper-settings">
                  <label>Institution<input value={paperMeta.institution} onChange={(event) => setPaperMeta({ ...paperMeta, institution: event.target.value })} placeholder="School or college name" /></label>
                  <label>Exam title<input value={paperMeta.exam} onChange={(event) => setPaperMeta({ ...paperMeta, exam: event.target.value })} placeholder="Midterm examination" /></label>
                  <label>Time allowed<input value={paperMeta.time} onChange={(event) => setPaperMeta({ ...paperMeta, time: event.target.value })} /></label>
                  <label>Repeatable seed<input value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="Leave blank for new random paper" /></label>
                  <label className="wide-setting">Section B instructions<input value={paperMeta.instructionsB} onChange={(event) => setPaperMeta({ ...paperMeta, instructionsB: event.target.value })} /></label>
                  <label className="wide-setting">Section C instructions<input value={paperMeta.instructionsC} onChange={(event) => setPaperMeta({ ...paperMeta, instructionsC: event.target.value })} /></label>
                </div>
                <div className="toggle-grid">
                  {[['showHeader', 'Paper header'], ['showMarks', 'Marks'], ['showChapter', 'Chapter labels'], ['showSource', 'Source/year']].map(([key, label]) => <label key={key}><input type="checkbox" checked={paperMeta[key]} onChange={(event) => setPaperMeta({ ...paperMeta, [key]: event.target.checked })} /><span>{label}</span></label>)}
                </div>
                <button className="generate-button" onClick={generatePaper}><span><Icon name="shuffle" size={18} /> Generate random paper</span><Icon name="arrow" size={18} /></button>
                <div className="generation-note"><span className="spark">✦</span> Chapter-aware, filter-aware, and reproducible when you provide a seed.</div>
              </section>

              <section className="panel preview-panel" ref={(node) => { sectionRefs.current[4] = node; }}>
                <div className="panel-heading compact preview-heading"><div><div className="panel-kicker">STEP 04 — REVIEW</div><h2>Paper preview</h2><p>Review the exact printable output before export.</p></div><div className="export-actions"><button className="small-button" onClick={() => window.print()} disabled={!hasPaper}>Print</button><button className="small-button" onClick={downloadWord} disabled={!hasPaper}><Icon name="word" size={15} /> Word</button><button className="small-button dark" onClick={downloadPdf} disabled={!hasPaper}><Icon name="pdf" size={15} /> PDF</button></div></div>
                <div className="paper-frame">
                  <div className="paper-sheet" id="paper-print" ref={paperRef}>
                    {hasPaper ? <>
                      {paperMeta.showHeader && <header className="exam-header"><h2>{paperMeta.institution || 'Question Paper'}</h2>{paperMeta.exam && <h4>{paperMeta.exam}</h4>}<div><span>Class: {selectedClass}</span><span>Subject: {selectedSubject}</span><span>Time: {paperMeta.time}</span><span>Total marks: {totalMarks}</span></div></header>}
                      {generatedPaper.B.length > 0 && <section className="paper-section"><h3>Section B <small>{paperMeta.instructionsB}</small></h3>{generatedPaper.B.map((question, index) => <PaperQuestion key={question.id} question={question} index={index} marks={shortMarks} {...paperMeta} />)}</section>}
                      {generatedPaper.C.length > 0 && <section className="paper-section"><h3>Section C <small>{paperMeta.instructionsC}</small></h3>{generatedPaper.C.map((question, index) => <PaperQuestion key={question.id} question={question} index={index} marks={longMarks} {...paperMeta} />)}</section>}
                    </> : <div className="paper-empty"><div className="empty-paper-mark"><Icon name="file" size={24} /></div><strong>Your paper will appear here</strong><span>Set the balance, then generate a random paper.</span></div>}
                  </div>
                </div>
                {hasPaper && <div className="preview-foot"><span><span className="status-dot" /> Ready to export</span><span>{generatedPaper.B.length + generatedPaper.C.length} questions · {totalMarks} marks</span></div>}
              </section>
            </div>
          </div>
        ) : <div className="loading-state">No bank selected. Use Load JSON to add a question bank.</div>}
      </main>

      {previewPdf && <div className="modal-backdrop" onClick={() => setPreviewPdf(null)}><div className="pdf-modal" onClick={(event) => event.stopPropagation()}><div className="modal-header"><div><div className="panel-kicker">SOURCE PDF</div><h2>{previewPdf.name}</h2></div><div className="modal-actions"><a className="small-button" href={previewPdf.url} target="_blank" rel="noreferrer">Open in new tab</a><button className="icon-button" onClick={() => setPreviewPdf(null)} aria-label="Close PDF preview"><Icon name="close" size={18} /></button></div></div><iframe src={previewPdf.url} title={`Preview of ${previewPdf.name}`} /></div></div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
