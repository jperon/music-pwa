/* ============================================================
   Partitura — PWA Music Score Viewer
   Formats: MusicXML (.xml, .musicxml, .mxl), MEI (.mei), LilyPond (.ly)
   Engine:  Verovio WASM
   ============================================================ */

'use strict';

/* ── State ────────────────────────────────────────────────── */
const STORAGE_KEY = 'partitura_zoom';

function loadZoom() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = parseInt(saved, 10);
    if (parsed >= 10 && parsed <= 200) return parsed;
    return window.innerHeight > window.innerWidth ? 50 : 100;
  } catch { return 100; }
}

function saveZoom(zoom) {
  try { localStorage.setItem(STORAGE_KEY, String(zoom)); } catch {}
}

const state = {
  vrvToolkit: null,
  vrvReady: false,
  pendingFile: null,
  currentFile: null,
  currentFormat: null,
  currentContent: null,
  pageCount: 0,
  currentPage: 1,
  zoom: loadZoom(),
};

/* ── DOM refs ─────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const els = {
  dropZone:       $('drop-zone'),
  fileInput:      $('file-input'),
  btnBrowse:      $('btn-browse'),
  scoreContainer: $('score-container'),
  verovioOutput:  $('verovio-output'),
  loading:        $('loading'),
  errorBox:       $('error-box'),
  errorMsg:       $('error-msg'),
  btnErrorRetry:  $('btn-error-retry'),
  btnZoomIn:      $('btn-zoom-in'),
  btnZoomOut:     $('btn-zoom-out'),
  zoomLabel:      $('zoom-label'),
  btnPagePrev:    $('btn-page-prev'),
  btnPageNext:    $('btn-page-next'),
  pageLabel:      $('page-label'),
  btnOpenNew:     $('btn-open-new'),
  toast:          $('toast'),
};

/* ── Toast ────────────────────────────────────────────────── */
let toastTimer = null;
function showToast(msg, duration = 2800) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), duration);
}

/* ── Verovio init ─────────────────────────────────────────── */
function initVerovio() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout initialisation Verovio (30s).')), 30000);

    function onReady() {
      clearTimeout(timeout);
      try {
        state.vrvToolkit = new verovio.toolkit();
        state.vrvReady = true;
        console.log('[Partitura] Verovio prêt, version :', state.vrvToolkit.getVersion());
        resolve();
      } catch (e) {
        reject(e);
      }
    }

    function setup() {
      if (verovio.module.calledRun) {
        onReady();
      } else {
        verovio.module.onRuntimeInitialized = onReady;
      }
    }

    if (typeof verovio !== 'undefined' && verovio.module) {
      setup();
    } else {
      let attempts = 0;
      const poll = setInterval(() => {
        attempts++;
        if (typeof verovio !== 'undefined' && verovio.module) {
          clearInterval(poll);
          setup();
        } else if (attempts > 150) {
          clearInterval(poll);
          clearTimeout(timeout);
          reject(new Error('Verovio WASM introuvable après 15s.'));
        }
      }, 100);
    }
  });
}

/* ── Format detection ─────────────────────────────────────── */
function detectFormat(filename, content) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.mei'))                          return 'mei';
  if (lower.endsWith('.ly') || lower.endsWith('.ily')) return 'lilypond';
  if (lower.endsWith('.musicxml'))                     return 'musicxml';
  if (lower.endsWith('.xml')) {
    if (content.includes('xmlns="http://www.music-encoding.org') || content.includes('<mei '))
      return 'mei';
    return 'musicxml';
  }
  const start = content.trimStart();
  if (start.includes('xmlns="http://www.music-encoding.org') || start.startsWith('<mei'))
    return 'mei';
  if (start.startsWith('<score-partwise') || start.startsWith('<score-timewise'))
    return 'musicxml';
  if (start.startsWith('<?xml'))
    return 'musicxml';
  if (content.includes('\\version') || content.includes('\\relative') || content.includes('\\score'))
    return 'lilypond';
  return 'unknown';
}

/* ── Apply Verovio options ────────────────────────────────── */
function applyOptions(format, pageWidth) {
  const inputFrom = format === 'mei'       ? 'mei'
                  : format === 'lilypond'  ? 'lilypond'
                  : 'musicxml';

  const pw = pageWidth || Math.round(window.innerWidth * 0.95);

  state.vrvToolkit.setOptions({
    inputFrom,
    scale:           100,
    pageWidth:       pw,
    adjustPageWidth: true,
    breaks:          'auto',
    svgHtml5:        true,
    svgViewBox:      true,
    footer:          'none',
    header:          'none',
  });
}

/* ── Render score ─────────────────────────────────────────── */
async function renderScore(content, filename, format) {
  if (!state.vrvReady) {
    state.pendingFile = { content, filename, format };
    return;
  }

  showLoading(true);
  hideError();
  hideDropZone();

  await tick();

  try {
    let loaded;
    if (format === 'mxl') {
      loaded = state.vrvToolkit.loadZipDataBase64(content);
    } else {
      loaded = state.vrvToolkit.loadData(content);
    }

    if (!loaded) {
      const log = state.vrvToolkit.getLog();
      throw new Error('Verovio n\'a pas pu charger le fichier.\n' + (log || 'Log vide.'));
    }

    const pageWidth = Math.round(window.innerWidth * 0.95);
    state.vrvToolkit.setOptions({
      scale: 100,
      pageWidth: pageWidth,
      adjustPageWidth: true,
      breaks: 'auto',
      svgHtml5: true,
      svgViewBox: true,
      footer: 'none',
      header: 'none',
    });

    state.pageCount = state.vrvToolkit.getPageCount();
    console.log('[Partitura]', filename, '— pages :', state.pageCount, '— format :', format);

    if (state.pageCount === 0) {
      const log = state.vrvToolkit.getLog();
      throw new Error('Aucune page générée.\n' + (log || 'Log vide.'));
    }

    state.currentPage = 1;
    state.currentContent = content;
    state.currentFormat = format;
    state.currentFile = filename;

    renderAllPages();
    showScoreContainer(filename, format);

  } catch (err) {
    console.error('[Partitura] Erreur rendu :', err);
    showError(err.message || 'Erreur de rendu.');
    showDropZone();
  } finally {
    showLoading(false);
  }
}

/* ── Render all pages (instant display) ────────────────────── */
function renderAllPages() {
  els.verovioOutput.innerHTML = '';

  for (let p = 1; p <= state.pageCount; p++) {
    const svg = state.vrvToolkit.renderToSVG(p, {});
    const wrapper = document.createElement('div');
    wrapper.className = 'page-wrapper';
    wrapper.dataset.page = String(p);
    wrapper.innerHTML = svg;
    const svgEl = wrapper.querySelector('svg');
    if (svgEl) {
      // Width/height will be overridden by CSS width: 100% !important
    }
    els.verovioOutput.appendChild(wrapper);
  }

  updatePageNav();
  showPage(state.currentPage);
}

/* ── Show specific page (instant, no scroll) ───────────────── */
function showPage(pageNum) {
  const clamped = Math.max(1, Math.min(state.pageCount, pageNum));
  state.currentPage = clamped;
  
  const wrappers = els.verovioOutput.querySelectorAll('.page-wrapper');
  wrappers.forEach((w, i) => {
    w.style.display = (i + 1) === clamped ? 'block' : 'none';
  });
  
  updatePrevNextState();
}

/* ── Zoom ─────────────────────────────────────────────────── */
function setZoom(newZoom) {
  state.zoom = Math.max(10, Math.min(200, newZoom));
  saveZoom(state.zoom);
  els.zoomLabel.textContent = state.zoom + '%';

  if (state.vrvReady && state.currentContent) {
    const baseWidth = Math.round(window.innerWidth * 0.95);
    const pageWidth = Math.round(baseWidth * (100 / state.zoom));
    
    state.vrvToolkit.setOptions({ 
      scale: 100,
      pageWidth: pageWidth
    });
    state.vrvToolkit.redoLayout({});
    state.pageCount = state.vrvToolkit.getPageCount();
    renderAllPages();
    if (state.currentPage > state.pageCount) {
      state.currentPage = state.pageCount;
    }
    showPage(state.currentPage);
  }
}

/* ── Page navigation ──────────────────────────────────────── */
function updatePageNav() {
  if (state.pageCount <= 1) {
    els.pageLabel.textContent = state.pageCount === 1 ? '1 / 1' : '—';
    els.btnPagePrev.disabled = true;
    els.btnPageNext.disabled = true;
    return;
  }
  
  els.btnPagePrev.onclick = () => showPage(state.currentPage - 1);
  els.btnPageNext.onclick = () => showPage(state.currentPage + 1);
  updatePrevNextState();
}

function updatePrevNextState() {
  els.btnPagePrev.disabled = state.currentPage <= 1;
  els.btnPageNext.disabled = state.currentPage >= state.pageCount;
  els.pageLabel.textContent = `${state.currentPage} / ${state.pageCount}`;
}

/* ── UI helpers ───────────────────────────────────────────── */
function showLoading(on)  { els.loading.classList.toggle('hidden', !on); }
function hideError()      { els.errorBox.classList.add('hidden'); }
function showDropZone()   { els.dropZone.classList.remove('hidden'); }
function hideDropZone()   { els.dropZone.classList.add('hidden'); }

function showError(msg) {
  els.errorMsg.textContent = msg;
  els.errorBox.classList.remove('hidden');
  els.scoreContainer.classList.add('hidden');
}

function showScoreContainer(filename, format) {
  els.scoreContainer.classList.remove('hidden');
}

function tick() {
  return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
}

/* ── File handling ────────────────────────────────────────── */
async function handleFile(file) {
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  const isMxl = ext === 'mxl';

  let content;
  try {
    if (isMxl) {
      const buffer = await file.arrayBuffer();
      const bytes  = new Uint8Array(buffer);
      let binary = '';
      const CHUNK = 8192;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      }
      content = btoa(binary);
    } else {
      content = await file.text();
    }
  } catch (e) {
    showError('Impossible de lire le fichier : ' + e.message);
    return;
  }

  const format = isMxl ? 'mxl' : detectFormat(file.name, content);

  if (format === 'unknown') {
    showError(
      `Format non reconnu pour « ${file.name} ».\n` +
      `Formats supportés : MusicXML (.xml, .musicxml, .mxl), MEI (.mei), LilyPond (.ly).`
    );
    return;
  }

  await renderScore(content, file.name, format);
}

/* ── Events ───────────────────────────────────────────────── */
els.fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (file) handleFile(file);
  els.fileInput.value = '';
});

els.btnBrowse.addEventListener('click', () => els.fileInput.click());

els.dropZone.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') els.fileInput.click();
});

els.dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  els.dropZone.classList.add('drag-over');
});
els.dropZone.addEventListener('dragleave', e => {
  if (!els.dropZone.contains(e.relatedTarget))
    els.dropZone.classList.remove('drag-over');
});
els.dropZone.addEventListener('drop', e => {
  e.preventDefault();
  els.dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

els.btnZoomIn.addEventListener('click',  () => setZoom(state.zoom + 5));
els.btnZoomOut.addEventListener('click', () => setZoom(state.zoom - 5));

els.btnErrorRetry.addEventListener('click', () => {
  hideError();
  showDropZone();
});

els.btnOpenNew.addEventListener('click', () => {
  hideError();
  els.scoreContainer.classList.add('hidden');
  els.verovioOutput.innerHTML = '';
  state.pageCount    = 0;
  state.currentPage  = 1;
  state.currentFile  = null;
  state.currentContent = null;
  els.pageLabel.textContent  = '—';
  els.btnPagePrev.disabled   = true;
  els.btnPageNext.disabled   = true;
  showDropZone();
});

/* ── Touch controls ───────────────────────────────────────── */
let touchStartX = 0;
els.verovioOutput.addEventListener('touchstart', e => {
  touchStartX = e.touches[0].clientX;
}, { passive: true });

els.verovioOutput.addEventListener('touchend', e => {
  const touchEndX = e.changedTouches[0].clientX;
  const deltaX = touchEndX - touchStartX;
  if (Math.abs(deltaX) < 30) return;
  
  const width = els.verovioOutput.clientWidth;
  const x = touchStartX;
  
  if (x < width / 3) {
    showPage(state.currentPage - 1);
  } else if (x > width * 2 / 3) {
    showPage(state.currentPage + 1);
  } else {
    els.fileInput.click();
  }
});

/* ── Bootstrap ────────────────────────────────────────────── */
(async () => {
  els.zoomLabel.textContent = state.zoom + '%';
  try {
    await initVerovio();
    if (state.pendingFile) {
      const { content, filename, format } = state.pendingFile;
      state.pendingFile = null;
      await renderScore(content, filename, format);
    }
  } catch (err) {
    console.error('[Partitura] Init échouée :', err);
    showToast('⚠ Verovio n\'a pas pu être chargé : ' + err.message, 7000);
  }
})();
