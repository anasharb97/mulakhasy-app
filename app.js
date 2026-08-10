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
