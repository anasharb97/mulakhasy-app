const STORAGE_KEY = 'malahithati_v3';

let appData = {
  notebooks: [],   // {id, title, expanded}
  chapters: [],    // {id, title, notebookId, expanded}
  notes: [],       // {id, title, content, notebookId, chapterId, ink, paper, pinned, tags, drawing, pageSize, font, date}
  tags: ['مهم', 'عاجل', 'لاحقاً'],
  settings: { voiceCorrection: false },
  noteCount: 0
};
let currentNoteId = null;
let currentFilter = 'all';
let isPinned = false;
let selectedInk = 'black';
let selectedPaper = 'plain';
let selectedNotebookId = null;
let selectedChapterId = null;
let selectedPageSize = 'compact';
let selectedFont = 'ArefRuqaa';
let noteToDelete = null;
let isDrawMode = false;
let brushSize = 2;
let canvas, ctx;
let isDrawing = false;
let strokes = [];
let currentStrokePoints = null;
let mergeTargetIndex = null;
let cleanedStrokeIndexes = [];
let drawHistory = [];
let drawStep = -1;
let recognition = null;
let isRecording = false;
let pickerCallback = null;

const INK_COLORS = { black: '#2C2420', blue: '#1E3A5F', red: '#B85450', green: '#4A7C59' };
const FONTS = [
  { id: 'ArefRuqaa', name: 'Aref Ruqaa', family: "'Aref Ruqaa', 'Patrick Hand', serif", unlockAt: 0 },
  { id: 'Rakkas', name: 'Rakkas', family: "'Rakkas', 'Patrick Hand', serif", unlockAt: 15 }
];
const TEMPLATES = {
  meeting: 'اجتماع: \nالتاريخ: \nالحاضرين: \n\nالمواضيع:\n• \n\nالقرارات:\n• \n\nالمهام:\n• \n',
  study: 'الموضوع: \n\nالنقاط الرئيسية:\n• \n• \n• \n\nالملخص:\n\nالأسئلة:\n• \n',
  journal: 'يوم \nالتاريخ: \n\nاليوم كان: \n\nأهم شي حصل: \n\nشكراً لـ: \n\nأهداف الغد: \n',
  todo: 'المهام اليوم:\n☐ \n☐ \n☐ \n\nأولوية عالية:\n☐ \n\nلاحقاً:\n☐ \n',
  idea: 'الفكرة: \n\nالمشكلة: \n\nالحل المقترح: \n\nالخطوات:\n1. \n2. \n3. \n\nالموارد المطلوبة: \n',
  empty: ''
};

function init() {
  loadData();
  renderTree();
  renderNotes();
  setupSearch();
  setupCanvas();
  setupVoiceRecognition();
  updateSettingsUI();
}

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      appData = { ...appData, ...parsed };
      if (!appData.settings) appData.settings = { voiceCorrection: false };
      if (!appData.notebooks) appData.notebooks = [];
      if (!appData.chapters) appData.chapters = [];
      if (!appData.noteCount) appData.noteCount = appData.notes.length;
    }
  } catch (e) { console.error(e); }
  if (appData.notebooks.length === 0) addSampleData();
}

function saveData() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appData)); } catch (e) { console.error(e); }
}

function generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); }

function addSampleData() {
  const nbId = generateId();
  const ch1 = generateId();
  const ch2 = generateId();
  appData.notebooks.push({ id: nbId, title: 'دفتري الأول', expanded: true });
  appData.chapters.push({ id: ch1, title: 'أفكار ومشاريع', notebookId: nbId, expanded: true });
  appData.chapters.push({ id: ch2, title: 'اجتماعات', notebookId: nbId, expanded: true });
  appData.notes = [
    { id: generateId(), title: 'أفكار لمشروع جديد', content: '1. تطبيق لإدارة المهام بتصميم بسيط وجميل\n2. موقع لتبادل الكتب بين الطلاب\n3. أداة لتحويل النصوص إلى ملخصات ذكية', notebookId: nbId, chapterId: ch1, ink: 'black', paper: 'plain', pageSize: 'compact', font: 'ArefRuqaa', pinned: true, tags: ['مهم'], drawing: null, date: new Date(Date.now() - 86400000).toISOString() },
    { id: generateId(), title: 'اجتماع الفريق', content: '• مراجعة التقدم في المشروع الحالي\n• مناقشة الخطط للربع القادم\n• توزيع المهام على أعضاء الفريق', notebookId: nbId, chapterId: ch2, ink: 'blue', paper: 'lined', pageSize: 'compact', font: 'ArefRuqaa', pinned: false, tags: ['عاجل'], drawing: null, date: new Date(Date.now() - 172800000).toISOString() }
  ];
  appData.noteCount = appData.notes.length;
  saveData();
}

/* ============ الشجرة: دفاتر ← فصول ← ملاحظات ============ */
function renderTree() {
  const container = document.getElementById('treeContainer');
  if (!container) return;
  if (appData.notebooks.length === 0) {
    container.innerHTML = `<div class="tree-empty">لا توجد دفاتر بعد<br>اضغط "+ دفتر جديد" بالأعلى للبدء</div>`;
    return;
  }
  let html = '';
  appData.notebooks.forEach(nb => {
    const chapters = appData.chapters.filter(c => c.notebookId === nb.id);
    html += `<div class="nb-card">
      <div class="nb-row" onclick="toggleNotebook('${nb.id}')">
        <span class="nb-chev"><i class="fas fa-chevron-${nb.expanded ? 'down' : 'left'}"></i></span>
        <div class="nb-icon"><i class="fas fa-book"></i></div>
        <div class="nb-title">${escapeHtml(nb.title)}</div>
        <button class="nb-menu-btn" onclick="event.stopPropagation();showTreeMenu('nb','${nb.id}')"><i class="fas fa-ellipsis-v"></i></button>
        ${renderTreeMenu('nb', nb.id)}
      </div>`;
    if (nb.expanded) {
      html += `<div class="ch-wrap">`;
      chapters.forEach(ch => {
        const notes = appData.notes.filter(n => n.chapterId === ch.id);
        html += `<div>
          <div class="ch-row" onclick="toggleChapter('${ch.id}')">
            <span class="nb-chev"><i class="fas fa-chevron-${ch.expanded ? 'down' : 'left'}" style="font-size:9px;"></i></span>
            <div class="ch-icon"><i class="fas fa-folder-open"></i></div>
            <div class="ch-title">${escapeHtml(ch.title)}</div>
            <button class="ch-menu-btn" onclick="event.stopPropagation();showTreeMenu('ch','${ch.id}')"><i class="fas fa-ellipsis-v"></i></button>
            ${renderTreeMenu('ch', ch.id)}
          </div>`;
        if (ch.expanded) {
          html += `<div class="notes-under-chapter">`;
          if (notes.length === 0) {
            html += `<div style="font-size:12px;color:#A09080;padding:4px 8px;">لا توجد ملاحظات بهذا الفصل</div>`;
          }
          notes.forEach(note => {
            html += `<div class="mini-note-row" onclick="openEditor('${note.id}')">
              <i class="fas ${note.pinned ? 'fa-thumbtack' : 'fa-sticky-note'}"></i>
              <span>${escapeHtml(note.title || 'بدون عنوان')}</span>
            </div>`;
          });
          html += `</div>`;
        }
        html += `</div>`;
      });
      html += `</div>`;
    }
    html += `</div>`;
  });
  container.innerHTML = html;
}

let openTreeMenuKey = null;
function renderTreeMenu(kind, id) {
  const key = kind + '_' + id;
  if (openTreeMenuKey !== key) return '';
  if (kind === 'nb') {
    return `<div class="dropdown-menu">
      <button onclick="event.stopPropagation();addChapterPrompt('${id}')">+ فصل جديد</button>
      <button onclick="event.stopPropagation();renameNotebook('${id}')">تعديل الاسم</button>
      <button onclick="event.stopPropagation();openTreeMenuKey=null;renderTree();exportScope('notebook','${id}')"><i class="fas fa-file-pdf"></i> تصدير الدفتر PDF</button>
      <button class="danger" onclick="event.stopPropagation();deleteNotebookConfirm('${id}')">حذف الدفتر</button>
    </div>`;
  }
  return `<div class="dropdown-menu">
    <button onclick="event.stopPropagation();quickAddNote('${id}')">+ ملاحظة جديدة</button>
    <button onclick="event.stopPropagation();renameChapter('${id}')">تعديل الاسم</button>
    <button onclick="event.stopPropagation();openTreeMenuKey=null;renderTree();exportScope('chapter','${id}')"><i class="fas fa-file-pdf"></i> تصدير الفصل PDF</button>
    <button class="danger" onclick="event.stopPropagation();deleteChapterConfirm('${id}')">حذف الفصل</button>
  </div>`;
}
function showTreeMenu(kind, id) {
  const key = kind + '_' + id;
  openTreeMenuKey = openTreeMenuKey === key ? null : key;
  renderTree();
}
document.addEventListener('click', () => { if (openTreeMenuKey) { openTreeMenuKey = null; renderTree(); } });

function toggleNotebook(id) {
  const nb = appData.notebooks.find(n => n.id === id);
  nb.expanded = !nb.expanded; saveData(); renderTree();
}
function toggleChapter(id) {
  const ch = appData.chapters.find(c => c.id === id);
  ch.expanded = !ch.expanded; saveData(); renderTree();
}
function addNotebookPrompt() {
  const title = prompt('اسم الدفتر الجديد:');
  if (!title || !title.trim()) return;
  appData.notebooks.push({ id: generateId(), title: title.trim(), expanded: true });
  saveData(); renderTree(); showToast('تم إنشاء الدفتر');
}
function addChapterPrompt(notebookId) {
  openTreeMenuKey = null;
  const title = prompt('اسم الفصل الجديد:');
  if (!title || !title.trim()) return;
  appData.chapters.push({ id: generateId(), title: title.trim(), notebookId, expanded: true });
  saveData(); renderTree(); showToast('تم إنشاء الفصل');
}
function renameNotebook(id) {
  openTreeMenuKey = null;
  const nb = appData.notebooks.find(n => n.id === id);
  const title = prompt('الاسم الجديد:', nb.title);
  if (!title || !title.trim()) return;
  nb.title = title.trim(); saveData(); renderTree();
}
function renameChapter(id) {
  openTreeMenuKey = null;
  const ch = appData.chapters.find(c => c.id === id);
  const title = prompt('الاسم الجديد:', ch.title);
  if (!title || !title.trim()) return;
  ch.title = title.trim(); saveData(); renderTree();
}
function deleteNotebookConfirm(id) {
  openTreeMenuKey = null;
  if (!confirm('حذف الدفتر وكل فصوله وملاحظاته؟ لا يمكن التراجع.')) return;
  const chIds = appData.chapters.filter(c => c.notebookId === id).map(c => c.id);
  appData.notes = appData.notes.filter(n => !chIds.includes(n.chapterId));
  appData.chapters = appData.chapters.filter(c => c.notebookId !== id);
  appData.notebooks = appData.notebooks.filter(n => n.id !== id);
  saveData(); renderTree(); renderNotes(); showToast('تم حذف الدفتر');
}
function deleteChapterConfirm(id) {
  openTreeMenuKey = null;
  if (!confirm('حذف الفصل وكل ملاحظاته؟ لا يمكن التراجع.')) return;
  appData.notes = appData.notes.filter(n => n.chapterId !== id);
  appData.chapters = appData.chapters.filter(c => c.id !== id);
  saveData(); renderTree(); renderNotes(); showToast('تم حذف الفصل');
}
function quickAddNote(chapterId) {
  openTreeMenuKey = null;
  const ch = appData.chapters.find(c => c.id === chapterId);
  selectedNotebookId = ch.notebookId;
  selectedChapterId = chapterId;
  openEditor(null, true);
}

/* ============ منتقي عام (نوت بوك/فصل) ============ */
function openPicker(title, options, onPick) {
  document.getElementById('pickerTitle').innerHTML = `<i class="fas fa-folder"></i> ${title}`;
  const wrap = document.getElementById('pickerOptions');
  wrap.innerHTML = options.map((o, i) => `<div class="picker-option" data-i="${i}"><i class="fas ${o.icon || 'fa-book'}"></i> ${escapeHtml(o.label)}</div>`).join('');
  wrap.querySelectorAll('.picker-option').forEach(el => {
    el.onclick = () => { onPick(options[+el.dataset.i]); closePicker(); };
  });
  document.getElementById('pickerModal').classList.add('show');
}
function closePicker() { document.getElementById('pickerModal').classList.remove('show'); }

function ensureDefaultNotebook() {
  if (appData.notebooks.length === 0) {
    const nbId = generateId(); const chId = generateId();
    appData.notebooks.push({ id: nbId, title: 'دفتر عام', expanded: true });
    appData.chapters.push({ id: chId, title: 'ملاحظات سريعة', notebookId: nbId, expanded: true });
    saveData();
  }
}
function pickNotebookAndChapter(onDone) {
  ensureDefaultNotebook();
  const nbOptions = appData.notebooks.map(nb => ({ label: nb.title, value: nb.id, icon: 'fa-book' }));
  nbOptions.push({ label: '+ دفتر جديد', value: '__new__', icon: 'fa-plus' });
  openPicker('اختر الدفتر', nbOptions, (picked) => {
    let nbId = picked.value;
    if (nbId === '__new__') {
      const title = prompt('اسم الدفتر الجديد:');
      if (!title || !title.trim()) return;
      nbId = generateId();
      appData.notebooks.push({ id: nbId, title: title.trim(), expanded: true });
      saveData();
    }
    const chapters = appData.chapters.filter(c => c.notebookId === nbId);
    const chOptions = chapters.map(c => ({ label: c.title, value: c.id, icon: 'fa-folder-open' }));
    chOptions.push({ label: '+ فصل جديد', value: '__new__', icon: 'fa-plus' });
    openPicker('اختر الفصل', chOptions, (pickedCh) => {
      let chId = pickedCh.value;
      if (chId === '__new__') {
        const title = prompt('اسم الفصل الجديد:');
        if (!title || !title.trim()) return;
        chId = generateId();
        appData.chapters.push({ id: chId, title: title.trim(), notebookId: nbId, expanded: true });
        saveData();
      }
      onDone(nbId, chId);
    });
  });
}

/* ============ قائمة الملاحظات المسطّحة (بحث/تبويبات) ============ */
function renderNotes(notesToRender = null) {
  const list = document.getElementById('notesList');
  const emptyState = document.getElementById('emptyState');
  const treeSection = document.getElementById('treeSection');
  const showFlat = notesToRender !== null || currentFilter !== 'all';
  treeSection.style.display = showFlat ? 'none' : 'block';
  list.style.display = showFlat ? 'flex' : 'none';
  list.innerHTML = '';
  if (!showFlat) { emptyState.style.display = 'none'; return; }

  let notes = notesToRender || getFilteredNotes();
  notes.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.date) - new Date(a.date);
  });
  if (notes.length === 0) { emptyState.style.display = 'block'; return; }
  emptyState.style.display = 'none';
  notes.forEach(note => list.appendChild(createNoteCard(note)));
}

function getFilteredNotes() {
  let notes = [...appData.notes];
  if (currentFilter === 'pinned') notes = notes.filter(n => n.pinned);
  else if (currentFilter === 'recent') { const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000; notes = notes.filter(n => new Date(n.date) > weekAgo); }
  return notes;
}

function noteCrumb(note) {
  const ch = appData.chapters.find(c => c.id === note.chapterId);
  const nb = ch ? appData.notebooks.find(n => n.id === ch.notebookId) : null;
  if (!nb || !ch) return '';
  return `${nb.title} › ${ch.title}`;
}

function createNoteCard(note) {
  const card = document.createElement('div');
  card.className = `note-card ${note.pinned ? 'pinned' : ''}`;
  const inkColor = INK_COLORS[note.ink || 'black'];
  card.style.color = inkColor;
  card.onclick = () => openEditor(note.id);
  const dateStr = formatDate(note.date);
  const tagsHtml = (note.tags || []).map(tag => {
    const colors = getTagColor(tag);
    return `<span class='note-tag' style='background:${colors.bg};color:${colors.text}'>${tag}</span>`;
  }).join('');
  const hasDrawing = note.drawing ? '<div style="margin-top:8px;font-size:11px;color:#8B7E6A"><i class="fas fa-pen"></i> يحتوي على رسم</div>' : '';
  const crumb = noteCrumb(note);
  card.innerHTML = `<div class='note-header'><div class='note-title' style='color:${inkColor}'>${escapeHtml(note.title || 'بدون عنوان')}</div>${note.pinned ? `<div class='note-pin'><i class='fas fa-thumbtack'></i></div>` : ''}</div><div class='note-preview' style='color:${inkColor}'>${escapeHtml(note.content || '')}</div>${hasDrawing}<div class='note-footer'><div class='note-date'><i class='far fa-clock'></i> ${dateStr}</div><div style="display:flex;gap:6px;align-items:center;">${crumb ? `<span class="note-crumb">${escapeHtml(crumb)}</span>` : ''}<div class='note-tags'>${tagsHtml}</div></div></div>`;
  return card;
}

function getTagColor(tag) {
  const colors = { 'مهم': { bg: '#F7E8E8', text: '#C75B5B' }, 'عاجل': { bg: '#F7F0E8', text: '#C49464' }, 'لاحقاً': { bg: '#E8F0E8', text: '#6B9E75' } };
  return colors[tag] || { bg: '#F0EBE0', text: '#8B7E6A' };
}

function formatDate(dateStr) {
  const date = new Date(dateStr), now = new Date(), diff = now - date, days = Math.floor(diff / 86400000);
  if (days === 0) { const h = Math.floor(diff / 3600000); if (h === 0) { const m = Math.floor(diff / 60000); return m < 1 ? 'الآن' : `منذ ${m} دقيقة`; } return `منذ ${h} ساعة`; }
  if (days === 1) return 'أمس'; if (days < 7) return `منذ ${days} أيام`;
  return date.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

/* ============ المحرر ============ */
function openEditor(noteId = null, skipPicker = false) {
  currentNoteId = noteId;
  isPinned = false;
  selectedInk = 'black';
  selectedPaper = 'plain';
  selectedPageSize = 'compact';
  selectedFont = 'ArefRuqaa';
  isDrawMode = false;
  drawHistory = [];
  drawStep = -1;
  strokes = [];
  cleanedStrokeIndexes = [];
  isRecording = false;

  const launch = () => {
    const titleInput = document.getElementById('noteTitle');
    const contentInput = document.getElementById('noteContent');
    const pinBtn = document.getElementById('pinBtn');
    const drawSection = document.getElementById('drawSection');
    const voiceBtn = document.getElementById('voiceBtn');
    if (noteId) {
      const note = appData.notes.find(n => n.id === noteId);
      if (note) {
        titleInput.value = note.title || '';
        contentInput.value = note.content || '';
        isPinned = note.pinned || false;
        selectedInk = note.ink || 'black';
        selectedPaper = note.paper || 'plain';
        selectedPageSize = note.pageSize || 'compact';
        selectedFont = note.font || 'ArefRuqaa';
        selectedNotebookId = note.notebookId;
        selectedChapterId = note.chapterId;
        if (note.drawing) { setTimeout(() => loadDrawing(note.drawing), 350); }
      }
    } else {
      titleInput.value = '';
      contentInput.value = '';
    }
    pinBtn.classList.toggle('active', isPinned);
    updateInkPicker();
    updatePaperPicker();
    setPaperClass();
    updateTextareaColor();
    updatePageSizeUI();
    updateFontUI();
    updateCrumbUI();
    drawSection.style.display = 'none';
    contentInput.style.display = 'block';
    document.getElementById('modeText').textContent = 'رسم';
    document.getElementById('modeIcon').className = 'fas fa-pen';
    if (voiceBtn) { voiceBtn.classList.remove('active'); voiceBtn.innerHTML = '<i class="fas fa-microphone"></i> اقرأ'; }
    document.getElementById('editorScreen').classList.add('open');
    setTimeout(() => { if (!noteId) titleInput.focus(); }, 300);
  };

  if (!noteId && !skipPicker && !selectedNotebookId) {
    pickNotebookAndChapter((nbId, chId) => {
      selectedNotebookId = nbId; selectedChapterId = chId; launch();
    });
  } else if (!noteId && !selectedChapterId) {
    pickNotebookAndChapter((nbId, chId) => {
      selectedNotebookId = nbId; selectedChapterId = chId; launch();
    });
  } else {
    launch();
  }
}

function updateCrumbUI() {
  const ch = appData.chapters.find(c => c.id === selectedChapterId);
  const nb = ch ? appData.notebooks.find(n => n.id === ch.notebookId) : null;
  document.getElementById('editorCrumb').textContent = (nb && ch) ? `${nb.title} › ${ch.title}` : '';
}

function showFolderSelect() {
  pickNotebookAndChapter((nbId, chId) => {
    selectedNotebookId = nbId; selectedChapterId = chId; updateCrumbUI(); showToast('تم تحديد الموقع الجديد');
  });
}

function closeEditor() {
  if (isRecording && recognition) { recognition.stop(); isRecording = false; }
  document.getElementById('editorScreen').classList.remove('open');
  currentNoteId = null;
  selectedNotebookId = null; selectedChapterId = null;
}

function saveNote() {
  if (isRecording && recognition) { recognition.stop(); isRecording = false; }
  const title = document.getElementById('noteTitle').value.trim();
  const content = document.getElementById('noteContent').value.trim();
  if (!title && !content && !hasDrawing()) { showToast('الملاحظة فارغة!'); return; }
  ensureDefaultNotebook();
  if (!selectedChapterId) {
    const firstNb = appData.notebooks[0];
    let firstCh = appData.chapters.find(c => c.notebookId === firstNb.id);
    if (!firstCh) { firstCh = { id: generateId(), title: 'ملاحظات سريعة', notebookId: firstNb.id, expanded: true }; appData.chapters.push(firstCh); }
    selectedNotebookId = firstNb.id; selectedChapterId = firstCh.id;
  }
  const drawingData = hasDrawing() ? canvas.toDataURL('image/png') : null;
  const noteData = {
    title: title || 'بدون عنوان', content: content,
    notebookId: selectedNotebookId, chapterId: selectedChapterId,
    ink: selectedInk, paper: selectedPaper, pageSize: selectedPageSize, font: selectedFont,
    pinned: isPinned, tags: currentNoteId ? (appData.notes.find(n => n.id === currentNoteId)?.tags || []) : [],
    drawing: drawingData, date: new Date().toISOString()
  };
  if (currentNoteId) {
    const index = appData.notes.findIndex(n => n.id === currentNoteId);
    if (index !== -1) { noteData.id = currentNoteId; noteData.tags = appData.notes[index].tags; appData.notes[index] = noteData; showToast('تم حفظ الملاحظة'); }
  } else {
    noteData.id = generateId(); appData.notes.unshift(noteData);
    appData.noteCount = (appData.noteCount || 0) + 1;
    showToast('تم إنشاء الملاحظة');
  }
  saveData(); renderTree(); renderNotes(); closeEditor();
}

function togglePin() {
  isPinned = !isPinned;
  document.getElementById('pinBtn').classList.toggle('active', isPinned);
  showToast(isPinned ? 'تم تثبيت الملاحظة' : 'تم إلغاء التثبيت');
}

function deleteCurrentNote() {
  if (!currentNoteId) { closeEditor(); return; }
  noteToDelete = currentNoteId;
  document.getElementById('deleteModal').classList.add('show');
}
function confirmDelete() {
  if (noteToDelete) {
    appData.notes = appData.notes.filter(n => n.id !== noteToDelete);
    saveData(); renderTree(); renderNotes(); showToast('تم حذف الملاحظة');
  }
  closeDeleteModal(); closeEditor();
}
function closeDeleteModal() { document.getElementById('deleteModal').classList.remove('show'); noteToDelete = null; }

function selectInk(el) {
  document.querySelectorAll('.ink-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  selectedInk = el.dataset.color;
  updateTextareaColor();
  if (ctx) { ctx.strokeStyle = INK_COLORS[selectedInk]; }
}
function updateInkPicker() {
  document.querySelectorAll('.ink-option').forEach(o => o.classList.toggle('selected', o.dataset.color === selectedInk));
}
function updateTextareaColor() {
  const ta = document.getElementById('noteContent');
  ta.style.color = INK_COLORS[selectedInk];
}
function selectPaper(el, type) {
  document.querySelectorAll('.paper-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  selectedPaper = type;
  setPaperClass();
}
function updatePaperPicker() {
  document.querySelectorAll('.paper-option').forEach((o, i) => {
    const types = ['plain', 'lined', 'dotted', 'grid'];
    o.classList.toggle('selected', types[i] === selectedPaper);
  });
}
function setPaperClass() {
  const ta = document.getElementById('noteContent');
  ta.classList.remove('lined', 'dotted', 'grid');
  if (selectedPaper !== 'plain') ta.classList.add(selectedPaper);
}

/* ============ حجم الصفحة (مضغوط / A4) ============ */
function togglePageSize() {
  selectedPageSize = selectedPageSize === 'compact' ? 'a4' : 'compact';
  updatePageSizeUI();
}
function updatePageSizeUI() {
  const ta = document.getElementById('noteContent');
  const btn = document.getElementById('pageSizeBtn');
  const txt = document.getElementById('pageSizeText');
  ta.classList.toggle('page-a4', selectedPageSize === 'a4');
  btn.classList.toggle('gold-active', selectedPageSize === 'a4');
  txt.textContent = selectedPageSize === 'a4' ? 'صفحة A4 ✓' : 'صفحة A4';
}

/* ============ الخط (فتح تدريجي حسب عدد الملاحظات) ============ */
function cycleFont() {
  const notesCount = appData.noteCount || 0;
  const options = FONTS.map(f => {
    const locked = notesCount < f.unlockAt;
    return { label: locked ? `${f.name} 🔒 (يفتح بعد ${f.unlockAt} ملاحظة)` : (f.id === selectedFont ? `${f.name} ✓` : f.name), value: f.id, icon: 'fa-font', locked };
  });
  openPicker('اختر خط الملاحظة', options, (picked) => {
    const f = FONTS.find(x => x.id === picked.value);
    if (picked.locked) { showToast(`هذا الخط يفتح بعد ${f.unlockAt} ملاحظة (${notesCount}/${f.unlockAt} الآن)`); return; }
    selectedFont = f.id;
    updateFontUI();
    showToast(`تم اختيار خط ${f.name}`);
  });
}
function updateFontUI() {
  const ta = document.getElementById('noteContent');
  const f = FONTS.find(x => x.id === selectedFont) || FONTS[0];
  ta.style.fontFamily = f.family;
  document.getElementById('fontText').textContent = f.name;
}

function setupCanvas() {
  canvas = document.getElementById('drawCanvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  resizeCanvas();
  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };
  const startDraw = (e) => {
    e.preventDefault(); isDrawing = true; const p = getPos(e);
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    mergeTargetIndex = null;
    if (strokes.length) {
      const last = strokes[strokes.length - 1];
      const lastPoint = last[last.length - 1];
      if (distance(p, lastPoint) < 30) mergeTargetIndex = strokes.length - 1;
    }
    currentStrokePoints = [p];
  };
  const moveDraw = (e) => {
    e.preventDefault(); if (!isDrawing) return; const p = getPos(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
    currentStrokePoints.push(p);
  };
  const endDraw = () => {
    if (!isDrawing) return; isDrawing = false; ctx.closePath();
    if (currentStrokePoints && currentStrokePoints.length >= 3) {
      if (mergeTargetIndex !== null && strokes[mergeTargetIndex]) {
        strokes[mergeTargetIndex] = strokes[mergeTargetIndex].concat(currentStrokePoints);
      } else {
        strokes.push(currentStrokePoints);
      }
    }
    currentStrokePoints = null;
    saveDrawState();
  };
  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', moveDraw);
  canvas.addEventListener('mouseup', endDraw);
  canvas.addEventListener('mouseleave', endDraw);
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', moveDraw, { passive: false });
  canvas.addEventListener('touchend', endDraw);
  window.addEventListener('resize', () => { if (isDrawMode) resizeCanvas(); });
}
function resizeCanvas() {
  if (!canvas) return;
  const parent = canvas.parentElement;
  canvas.width = parent.clientWidth;
  canvas.height = 200;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK_COLORS[selectedInk];
  ctx.lineWidth = brushSize;
}
function toggleMode() {
  isDrawMode = !isDrawMode;
  const drawSection = document.getElementById('drawSection');
  const textarea = document.getElementById('noteContent');
  const modeText = document.getElementById('modeText');
  const modeIcon = document.getElementById('modeIcon');
  if (isDrawMode) {
    textarea.style.display = 'none';
    drawSection.style.display = 'block';
    modeText.textContent = 'كتابة';
    modeIcon.className = 'fas fa-keyboard';
    setTimeout(resizeCanvas, 50);
  } else {
    textarea.style.display = 'block';
    drawSection.style.display = 'none';
    modeText.textContent = 'رسم';
    modeIcon.className = 'fas fa-pen';
  }
}
function selectBrush(size, el) {
  brushSize = size;
  if (ctx) ctx.lineWidth = size;
  document.querySelectorAll('.size-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
}
function saveDrawState() {
  drawStep++;
  if (drawStep < drawHistory.length) drawHistory.length = drawStep;
  drawHistory.push(canvas.toDataURL());
}
function undoDraw() {
  if (drawStep > 0) {
    drawStep--;
    const img = new Image();
    img.src = drawHistory[drawStep];
    img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); };
  } else if (drawStep === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawStep = -1;
  }
}
function clearDraw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawHistory = [];
  drawStep = -1;
  strokes = [];
  cleanedStrokeIndexes = [];
}
function hasDrawing() { return isDrawMode && drawHistory.length > 0; }

/* ============ تنظيف الأشكال (دوائر/خطوط) — تحليل هندسي محلي بالكامل، بدون أي خدمة خارجية ============ */
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function analyzeStroke(points) {
  const n = points.length;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = maxX - minX, h = maxY - minY;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const start = points[0], end = points[n - 1];
  const closed = distance(start, end) < Math.max(w, h) * 0.4;

  const radii = points.map(p => distance(p, { x: cx, y: cy }));
  const meanR = radii.reduce((a, b) => a + b, 0) / n;
  const variance = radii.reduce((a, r) => a + Math.pow(r - meanR, 2), 0) / n;
  const circularity = meanR > 0 ? Math.sqrt(variance) / meanR : 1;
  const aspect = Math.min(w, h) / Math.max(w, h || 1);

  if (closed && w > 20 && h > 20 && circularity < 0.38 && aspect > 0.5) {
    return { type: 'circle', minX, minY, maxX, maxY, cx, cy, rx: w / 2, ry: h / 2 };
  }

  const lineLen = distance(start, end);
  if (!closed && lineLen > 24) {
    let maxDev = 0;
    for (const p of points) {
      const t = ((p.x - start.x) * (end.x - start.x) + (p.y - start.y) * (end.y - start.y)) / (lineLen * lineLen || 1);
      const projX = start.x + t * (end.x - start.x), projY = start.y + t * (end.y - start.y);
      maxDev = Math.max(maxDev, distance(p, { x: projX, y: projY }));
    }
    if (maxDev < Math.max(6, lineLen * 0.07)) {
      return { type: 'line', minX, minY, maxX, maxY, start, end };
    }
  }
  return { type: 'other' };
}

function cleanupShapes() {
  if (!strokes.length) { showToast('لا توجد أشكال مرسومة لتنظيفها'); return; }
  let cleanedCount = 0;
  strokes.forEach((points, idx) => {
    if (cleanedStrokeIndexes.includes(idx)) return;
    const shape = analyzeStroke(points);
    if (shape.type === 'other') return;

    const pad = 6;
    ctx.clearRect(shape.minX - pad, shape.minY - pad, (shape.maxX - shape.minX) + pad * 2, (shape.maxY - shape.minY) + pad * 2);
    ctx.strokeStyle = INK_COLORS[selectedInk] || '#24303D';
    ctx.lineWidth = Math.max(2, brushSize);
    ctx.lineCap = 'round';

    if (shape.type === 'circle') {
      ctx.beginPath();
      ctx.ellipse(shape.cx, shape.cy, shape.rx, shape.ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shape.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(shape.start.x, shape.start.y);
      ctx.lineTo(shape.end.x, shape.end.y);
      ctx.stroke();
    }
    cleanedStrokeIndexes.push(idx);
    cleanedCount++;
  });
  if (cleanedCount === 0) {
    showToast('لم أميّز أشكالاً واضحة (دوائر/خطوط) بالرسمة الحالية');
  } else {
    saveDrawState();
    showToast(`✅ تم تنظيف ${cleanedCount} شكل هندسي`);
  }
}

/* ============ تحويل الكتابة بالقلم (إنجليزي حالياً) — ينظّف كل كلمة بمكانها بالضبط، ويحافظ على الأسهم/الأشكال كما هي ============ */
async function convertPenToText() {
  if (!hasDrawing()) { showToast('ارسم أو اكتب بالقلم أولاً'); return; }
  const btn = document.getElementById('convertPenBtn');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحويل...';
  btn.disabled = true;
  try {
    const dataUrl = canvas.toDataURL('image/png');
    const res = await fetch('/api/azure-ocr', {
      method: 'POST',
      body: JSON.stringify({ imageBase64: dataUrl })
    });
    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      throw new Error('السيرفر رجّع رد غير متوقع (status ' + res.status + '): ' + rawText.slice(0, 150));
    }
    if (data.error) throw new Error(data.error);
    if (!data.lines || data.lines.length === 0) {
      showToast('⚠️ لم يتم التعرف على نص (تذكر: العربي غير مدعوم حالياً)');
      return;
    }

    const readResults = (data.raw && data.raw.analyzeResult && data.raw.analyzeResult.readResults) || [];

    const cleaned = document.createElement('canvas');
    cleaned.width = canvas.width;
    cleaned.height = canvas.height;
    const cctx = cleaned.getContext('2d');
    cctx.drawImage(canvas, 0, 0);

    let wordCount = 0;
    readResults.forEach(page => {
      (page.lines || []).forEach(line => {
        (line.words || []).forEach(word => {
          const box = word.boundingBox;
          if (!box || box.length < 8) return;
          const xs = [box[0], box[2], box[4], box[6]];
          const ys = [box[1], box[3], box[5], box[7]];
          const x = Math.min(...xs), y = Math.min(...ys);
          const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
          cctx.clearRect(x - 3, y - 3, w + 6, h + 6);
          cctx.fillStyle = INK_COLORS[selectedInk] || '#24303D';
          cctx.font = `${Math.max(16, h * 0.9)}px 'Patrick Hand', cursive`;
          cctx.textBaseline = 'top';
          cctx.fillText(word.text, x, y);
          wordCount++;
        });
      });
    });

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cleaned, 0, 0);
    ctx.restore();
    saveDrawState();

    showToast(`✅ تم تنظيف ${wordCount} كلمة إنجليزية — الأشكال والأسهم بقيت كما رسمتها`);
  } catch (e) {
    showToast('❌ فشل التحويل: ' + e.message);
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}
function loadDrawing(dataUrl) {
  if (!ctx) return;
  const img = new Image();
  img.src = dataUrl;
  img.onload = () => { resizeCanvas(); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); drawHistory = [dataUrl]; drawStep = 0; };
}
function applyTemplate(type, el) {
  const content = document.getElementById('noteContent');
  content.value = TEMPLATES[type] || '';
  document.querySelectorAll('.template-chip').forEach(c => c.classList.remove('selected'));
  if (el) el.classList.add('selected');
  showToast('تم تطبيق القالب');
}

function renderNoteToCanvasPromise(note) {
  return new Promise((resolve) => {
    const exportCanvas = document.createElement('canvas');
    const eCtx = exportCanvas.getContext('2d');
    const width = 800;
    const lineHeight = 32;
    const padding = 40;
    const lines = (note.content || '').split('\n');
    const textHeight = lines.length * lineHeight + 60;
    const hasDraw = !!note.drawing;
    const drawHeight = hasDraw ? 220 : 0;
    exportCanvas.width = width;
    exportCanvas.height = Math.max(400, textHeight + drawHeight + padding * 2);
    eCtx.fillStyle = '#FFFBF2';
    eCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    const paper = note.paper || 'plain';
    if (paper === 'lined') {
      eCtx.strokeStyle = '#E8E0D0'; eCtx.lineWidth = 1;
      for (let y = padding; y < exportCanvas.height; y += lineHeight) { eCtx.beginPath(); eCtx.moveTo(0, y); eCtx.lineTo(width, y); eCtx.stroke(); }
    } else if (paper === 'dotted') {
      eCtx.fillStyle = '#D0C8B8';
      for (let x = 20; x < width; x += 20) { for (let y = 20; y < exportCanvas.height; y += 20) { eCtx.beginPath(); eCtx.arc(x, y, 1, 0, Math.PI * 2); eCtx.fill(); } }
    } else if (paper === 'grid') {
      eCtx.strokeStyle = '#E8E0D0'; eCtx.lineWidth = 1;
      for (let x = 0; x < width; x += 32) { eCtx.beginPath(); eCtx.moveTo(x, 0); eCtx.lineTo(x, exportCanvas.height); eCtx.stroke(); }
      for (let y = 0; y < exportCanvas.height; y += 32) { eCtx.beginPath(); eCtx.moveTo(0, y); eCtx.lineTo(width, y); eCtx.stroke(); }
    }
    const fontFam = (FONTS.find(f => f.id === note.font) || FONTS[0]).name;
    const inkColor = INK_COLORS[note.ink || 'black'];
    eCtx.font = `bold 28px "${fontFam}", serif`;
    eCtx.fillStyle = inkColor;
    eCtx.textAlign = 'right';
    eCtx.fillText(note.title || 'بدون عنوان', width - padding, padding + 10);
    eCtx.font = `20px "${fontFam}", serif`;
    let y = padding + 50;
    lines.forEach(line => { if (y < exportCanvas.height - padding) { eCtx.fillText(line, width - padding, y); y += lineHeight; } });
    if (hasDraw) {
      const img = new Image();
      img.onload = () => { eCtx.drawImage(img, padding, y + 10, width - padding * 2, 200); resolve(exportCanvas); };
      img.onerror = () => resolve(exportCanvas);
      img.src = note.drawing;
    } else {
      resolve(exportCanvas);
    }
  });
}

async function exportScope(scope, id) {
  let notes = [];
  let fileLabel = '';
  if (scope === 'chapter') {
    notes = appData.notes.filter(n => n.chapterId === id).sort((a, b) => new Date(a.date) - new Date(b.date));
    const ch = appData.chapters.find(c => c.id === id);
    fileLabel = 'فصل-' + (ch ? ch.title : 'بدون-اسم');
  } else {
    const chIds = appData.chapters.filter(c => c.notebookId === id).map(c => c.id);
    notes = appData.notes.filter(n => chIds.includes(n.chapterId)).sort((a, b) => new Date(a.date) - new Date(b.date));
    const nb = appData.notebooks.find(n => n.id === id);
    fileLabel = 'دفتر-' + (nb ? nb.title : 'بدون-اسم');
  }
  if (notes.length === 0) { showToast('لا توجد ملاحظات لتصديرها بهذا النطاق'); return; }
  showToast('جاري تجهيز PDF... (' + notes.length + ' ملاحظة)');
  const canvases = await Promise.all(notes.map(renderNoteToCanvasPromise));
  const { jsPDF } = window.jspdf;
  let pdf = null;
  canvases.forEach((cv, i) => {
    const w = cv.width, h = cv.height;
    if (i === 0) { pdf = new jsPDF({ unit: 'px', format: [w, h] }); }
    else { pdf.addPage([w, h]); }
    pdf.addImage(cv.toDataURL('image/png'), 'PNG', 0, 0, w, h);
  });
  pdf.save(`${fileLabel.replace(/\s+/g, '-')}.pdf`);
  showToast('تم تصدير PDF بنجاح ✅');
}

function exportNote() {
  const title = document.getElementById('noteTitle').value.trim() || 'ملاحظة';
  const content = document.getElementById('noteContent').value.trim();
  if (!content && !hasDrawing()) { showToast('لا يوجد شيء للتصدير'); return; }
  const exportCanvas = document.createElement('canvas');
  const eCtx = exportCanvas.getContext('2d');
  const width = 800;
  const lineHeight = 32;
  const padding = 40;
  const lines = content.split('\n');
  const textHeight = lines.length * lineHeight + 60;
  const drawHeight = hasDrawing() ? 220 : 0;
  exportCanvas.width = width;
  exportCanvas.height = Math.max(400, textHeight + drawHeight + padding * 2);
  eCtx.fillStyle = '#FFFBF2';
  eCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  if (selectedPaper === 'lined') {
    eCtx.strokeStyle = '#E8E0D0'; eCtx.lineWidth = 1;
    for (let y = padding; y < exportCanvas.height; y += lineHeight) { eCtx.beginPath(); eCtx.moveTo(0, y); eCtx.lineTo(width, y); eCtx.stroke(); }
  } else if (selectedPaper === 'dotted') {
    eCtx.fillStyle = '#D0C8B8';
    for (let x = 20; x < width; x += 20) { for (let y = 20; y < exportCanvas.height; y += 20) { eCtx.beginPath(); eCtx.arc(x, y, 1, 0, Math.PI * 2); eCtx.fill(); } }
  } else if (selectedPaper === 'grid') {
    eCtx.strokeStyle = '#E8E0D0'; eCtx.lineWidth = 1;
    for (let x = 0; x < width; x += 32) { eCtx.beginPath(); eCtx.moveTo(x, 0); eCtx.lineTo(x, exportCanvas.height); eCtx.stroke(); }
    for (let y = 0; y < exportCanvas.height; y += 32) { eCtx.beginPath(); eCtx.moveTo(0, y); eCtx.lineTo(width, y); eCtx.stroke(); }
  }
  const fontFam = (FONTS.find(f => f.id === selectedFont) || FONTS[0]).name;
  eCtx.font = `bold 28px "${fontFam}", serif`;
  eCtx.fillStyle = INK_COLORS[selectedInk];
  eCtx.textAlign = 'right';
  eCtx.fillText(title, width - padding, padding + 10);
  eCtx.font = `20px "${fontFam}", serif`;
  let y = padding + 50;
  lines.forEach(line => { if (y < exportCanvas.height - padding) { eCtx.fillText(line, width - padding, y); y += lineHeight; } });
  if (hasDrawing()) {
    const img = new Image();
    img.src = canvas.toDataURL();
    img.onload = () => { eCtx.drawImage(img, padding, y + 10, width - padding * 2, 200); downloadImage(exportCanvas, title); };
  } else { downloadImage(exportCanvas, title); }
}
function downloadImage(canvas, title) {
  const link = document.createElement('a');
  link.download = `ملاحظة-${title.replace(/\s+/g, '-')}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast('تم تصدير الملاحظة');
}

function addTag() {
  const tag = prompt('أدخل الوسم (مهم، عاجل، لاحقاً):');
  if (!tag) return;
  if (currentNoteId) {
    const note = appData.notes.find(n => n.id === currentNoteId);
    if (note) { if (!note.tags) note.tags = []; if (!note.tags.includes(tag)) { note.tags.push(tag); showToast(`تم إضافة الوسم: ${tag}`); } }
  } else {
    showToast('احفظ الملاحظة أولاً ثم أضف الوسم');
  }
}

function setupSearch() {
  document.getElementById('searchInput').addEventListener('input', function (e) {
    document.getElementById('searchClear').style.display = e.target.value ? 'block' : 'none';
  });
}
function handleSearch(query) {
  const clearBtn = document.getElementById('searchClear');
  clearBtn.style.display = query ? 'block' : 'none';
  if (!query.trim()) { renderNotes(); return; }
  const q = query.toLowerCase();
  const filtered = appData.notes.filter(note =>
    (note.title && note.title.toLowerCase().includes(q)) ||
    (note.content && note.content.toLowerCase().includes(q)) ||
    (note.tags && note.tags.some(t => t.toLowerCase().includes(q)))
  );
  renderNotes(filtered);
}
function clearSearch() { document.getElementById('searchInput').value = ''; document.getElementById('searchClear').style.display = 'none'; renderNotes(); }
function filterNotes(filter) {
  currentFilter = filter;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  renderNotes();
}

function openSettings() {
  const notesCount = appData.noteCount || 0;
  const locked = FONTS.filter(f => notesCount < f.unlockAt);
  document.getElementById('fontProgressDesc').textContent = locked.length
    ? `${locked[0].name}: يفتح بعد ${locked[0].unlockAt} ملاحظة (${notesCount}/${locked[0].unlockAt})`
    : 'كل الخطوط مفتوحة! 🎉';
  document.getElementById('settingsModal').classList.add('show');
}
function closeSettings() { document.getElementById('settingsModal').classList.remove('show'); }
function openPolicies() { document.getElementById('policiesModal').classList.add('show'); }
function closePolicies() { document.getElementById('policiesModal').classList.remove('show'); }
function toggleVoice() {
  const toggle = document.getElementById('voiceToggle');
  appData.settings.voiceCorrection = !appData.settings.voiceCorrection;
  toggle.classList.toggle('active', appData.settings.voiceCorrection);
  saveData();
  showToast(appData.settings.voiceCorrection ? 'تم تفعيل التصحيح الصوتي' : 'تم إلغاء التصحيح الصوتي');
}
function updateSettingsUI() {
  const toggle = document.getElementById('voiceToggle');
  if (toggle) toggle.classList.toggle('active', appData.settings.voiceCorrection);
}

function setupVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { console.log('Web Speech API not supported'); return; }
  recognition = new SpeechRecognition();
  recognition.lang = 'ar-SA';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onstart = () => { isRecording = true; showToast('🎤 جاري الاستماع... اقرأ ما كتبته'); updateVoiceButton(); };
  recognition.onresult = (event) => {
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += transcript + ' ';
    }
    const contentInput = document.getElementById('noteContent');
    if (finalTranscript) {
      const currentValue = contentInput.value;
      const cursorPosition = contentInput.selectionStart;
      const newValue = currentValue.slice(0, cursorPosition) + finalTranscript + currentValue.slice(cursorPosition);
      contentInput.value = newValue;
      contentInput.selectionStart = cursorPosition + finalTranscript.length;
      contentInput.selectionEnd = cursorPosition + finalTranscript.length;
    }
  };
  recognition.onerror = (event) => {
    if (event.error === 'not-allowed') showToast('يرجى السماح بالوصول للميكروفون');
    else if (event.error === 'no-speech') showToast('لم يتم اكتشاف صوت، جرب مرة أخرى');
    else showToast('حدث خطأ، جرب مرة أخرى');
    isRecording = false; updateVoiceButton();
  };
  recognition.onend = () => { isRecording = false; updateVoiceButton(); showToast('✅ تم إيقاف التسجيل'); };
}
function toggleVoiceRecording() {
  if (!recognition) { showToast('المتصفح لا يدعم التسجيل الصوتي'); return; }
  if (isRecording) { recognition.stop(); isRecording = false; }
  else {
    try { recognition.start(); } catch (e) { setTimeout(() => { if (recognition) recognition.start(); }, 500); }
  }
}
function updateVoiceButton() {
  const voiceBtn = document.getElementById('voiceBtn');
  if (!voiceBtn) return;
  if (isRecording) {
    voiceBtn.classList.add('active');
    voiceBtn.innerHTML = '<i class="fas fa-stop"></i> إيقاف';
  } else {
    voiceBtn.classList.remove('active');
    voiceBtn.innerHTML = '<i class="fas fa-microphone"></i> اقرأ';
  }
}

/* ============ بريد صوتي: تحويل الكلام المنطوق لبريد منسّق ============ */
let emailRecognition = null;
let isEmailRecording = false;
let emailSegments = [];

function setupEmailRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;
  emailRecognition = new SpeechRecognition();
  emailRecognition.lang = 'ar-SA';
  emailRecognition.continuous = true;
  emailRecognition.interimResults = false;
  emailRecognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        const seg = event.results[i][0].transcript.trim();
        if (seg) emailSegments.push(seg);
      }
    }
    updateEmailStatus();
  };
  emailRecognition.onerror = (event) => {
    if (event.error === 'not-allowed') showToast('يرجى السماح بالوصول للميكروفون');
    else if (event.error !== 'no-speech') showToast('حدث خطأ بالتسجيل، جرب مرة أخرى');
  };
  emailRecognition.onend = () => {
    if (isEmailRecording) {
      try { emailRecognition.start(); } catch (e) {}
    }
  };
}

function updateEmailStatus() {
  const btn = document.getElementById('emailVoiceBtn');
  if (btn && isEmailRecording) {
    btn.innerHTML = `<i class="fas fa-microphone-alt"></i> جاري التسجيل (${emailSegments.length} جملة) — اضغط للإيقاف`;
  }
}

function toggleEmailVoice() {
  if (!emailRecognition) setupEmailRecognition();
  if (!emailRecognition) { showToast('المتصفح لا يدعم التسجيل الصوتي'); return; }

  if (isEmailRecording) {
    isEmailRecording = false;
    emailRecognition.stop();
    const btn = document.getElementById('emailVoiceBtn');
    btn.classList.remove('active');
    btn.innerHTML = '<i class="fas fa-envelope"></i> بريد صوتي';
    buildFormattedEmail();
  } else {
    if (isRecording && recognition) { recognition.stop(); isRecording = false; updateVoiceButton(); }
    emailSegments = [];
    isEmailRecording = true;
    const btn = document.getElementById('emailVoiceBtn');
    btn.classList.add('active');
    btn.innerHTML = '<i class="fas fa-microphone-alt"></i> جاري التسجيل... اضغط للإيقاف';
    showToast('🎙️ تكلّم الآن — كل وقفة طبيعية تُعتبر جملة منفصلة');
    try { emailRecognition.start(); } catch (e) { setTimeout(() => { try { emailRecognition.start(); } catch (e2) {} }, 400); }
  }
}

function buildFormattedEmail() {
  if (emailSegments.length === 0) { showToast('لم يتم تسجيل أي كلام'); return; }
  const body = emailSegments.map(s => {
    let seg = s.trim();
    if (!/[.!؟]$/.test(seg)) seg += '.';
    return seg;
  }).join('\n\n');
  const formatted = `السلام عليكم ورحمة الله وبركاته،\n\n${body}\n\nوتقبلوا تحياتي،\n[اسمك]`;
  const contentInput = document.getElementById('noteContent');
  const titleInput = document.getElementById('noteTitle');
  if (contentInput.value.trim()) {
    contentInput.value += '\n\n---\n\n' + formatted;
  } else {
    contentInput.value = formatted;
  }
  if (!titleInput.value.trim()) {
    titleInput.value = 'بريد إلكتروني - ' + new Date().toLocaleDateString('ar-SA');
  }
  showToast(`✅ تم تنسيق البريد (${emailSegments.length} جملة) — راجعه وعدّل قبل الإرسال`);
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.log('SW failed:', err));
}

document.addEventListener('DOMContentLoaded', init);

// © 2026 ملاحظاتي - جميع الحقوق محفوظة
// Developed by Anas Harb Salah Al-Qadomi
