/* app_test38_10_secret_ho.js — 秘匿HO（サブタブ・項目ブロック・DM風プレビュー）
 * 各HOは { name, tagline, blocks }。blocks は公開情報と同じ「項目ブロック」{ type:'item', keyName, val, decorStyle, subItems } と画像ブロック { type:'image', previewUrl }。
 * 出力の1行目は「# HO名：__tagline__」（tagline が空なら見出し行なし）。HOの内容はDiscordへは送信されません（DMへ手動で貼る下書き）。 */
const DECOR_LABELS = [['default', '引用（> ）'], ['simple', '簡易リスト'], ['fancy', '装飾リスト'], ['codeblock', 'コードブロック'], ['none', '装飾なし']];
let secretHOs = [], activeHO = -1;
const hoId = () => 'hb_' + Math.random().toString(36).slice(2, 9);
const newHOItem = () => ({ id: hoId(), type: 'item', keyName: '', val: '', decorStyle: 'default', subItems: [] });
const newHO = () => ({ name: 'HO' + (secretHOs.length + 1), tagline: '', blocks: [newHOItem()] });
const sanitizeSubs = list => (Array.isArray(list) ? list : []).filter(o => o && typeof o === 'object').map(o => ({ title: _s(o.title), val: _s(o.val), style: o.style === 'bold' ? 'bold' : 'plain' }));
function sanitizeHOs(list) {   // 取り込み・同期・旧形式（テキストだけのブロック）のデータを、今の形に整える
  return (Array.isArray(list) ? list : []).filter(h => h && typeof h === 'object').map(h => ({ name: _s(h.name), tagline: _s(h.tagline), blocks: (Array.isArray(h.blocks) ? h.blocks : []).filter(b => b && typeof b === 'object').map(b => b.type === 'image'
    ? { id: _s(b.id) || hoId(), type: 'image', previewUrl: _s(b.previewUrl) }
    : { id: _s(b.id) || hoId(), type: 'item', keyName: _s(b.keyName), val: _s(b.val), decorStyle: DECOR_STYLES.includes(b.decorStyle) ? b.decorStyle : 'default', subItems: sanitizeSubs(b.subItems) }) }));
}
const cloneHOs = () => sanitizeHOs(JSON.parse(JSON.stringify(secretHOs)));
let _hoDraftT = null;
function saveHoDraft() { clearTimeout(_hoDraftT); _hoDraftT = setTimeout(() => { try { window.idbSetRaw('draft_ho', JSON.stringify(secretHOs)).catch(e => logSoft('ho draft', e)); } catch (e) { logSoft('ho draft', e); } }, 600); }
function setHOs(list) { secretHOs = sanitizeHOs(list); activeHO = -1; renderHoAll(); saveHoDraft(); }
function renderHoAll() { renderHoTabs(); renderHoPanel(); applyHoView(); }
function renderHoTabs() {
  const box = document.getElementById('hoTabs'); if (!box) return;
  const tab = (label, cls, act, i) => `<button type="button" role="tab" aria-selected="${cls.includes('active')}" class="ho-tab ${cls}" data-ho-act="${act}" data-hi="${i}">${label}</button>`;
  box.innerHTML = tab('🌐 フォーラム公開情報', activeHO < 0 ? 'active' : '', 'tab', -1) + secretHOs.map((h, i) => tab('🔒 ' + escapeHTML(h.name || 'HO'), activeHO === i ? 'active' : '', 'tab', i)).join('') + tab('＋ HO追加', 'add', 'add-ho', -1);
}
function applyHoView() {   // HOタブの間は、入力欄もプレビューもHO用に切り替える
  const on = activeHO >= 0 && secretHOs[activeHO];
  document.getElementById('postForm').style.display = on ? 'none' : '';
  document.getElementById('hoPanel').style.display = on ? '' : 'none';
  document.getElementById('pubPreviewBox').style.display = on ? 'none' : '';
  document.getElementById('hoPreviewBox').style.display = on ? '' : 'none';
  if (on) renderHoPreview();
}
const hoDecorSelect = b => `<select data-ho-in="decor" title="本文の装飾">${DECOR_LABELS.map(([v, l]) => `<option value="${v}" ${b.decorStyle === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
function hoSubsHtml(b) {
  return (b.subItems || []).map((s, i) => `<div class="sub-item" data-si="${i}"><div class="sub-item-head"><input type="text" data-ho-in="sub-title" value="${escapeHTML(s.title)}" placeholder="サブタイトル（小見出し）"><select data-ho-in="sub-style" title="サブタイトルの表記（引用の外に出ます）"><option value="plain" ${s.style === 'bold' ? '' : 'selected'}>通常文字</option><option value="bold" ${s.style === 'bold' ? 'selected' : ''}>太字</option></select><button type="button" class="btn-sort btn-danger" data-ho-act="sub-del" data-si="${i}">✕ 削除</button></div><textarea data-ho-in="sub-text" placeholder="サブ項目の本文">${escapeHTML(s.val)}</textarea></div>`).join('')
    + '<button type="button" class="btn btn-secondary btn-sm sub-add" data-ho-act="sub-add">＋ サブ項目を追加</button>';
}
function renderHoPanel() {
  const box = document.getElementById('hoPanel'), h = secretHOs[activeHO]; if (!box || !h) { if (box) box.innerHTML = ''; return; }
  const ctl = '<span><button type="button" class="btn-sort" data-ho-act="up">▲</button><button type="button" class="btn-sort" data-ho-act="down">▼</button><button type="button" class="btn-sort btn-danger" data-ho-act="del-block">✕ 削除</button></span>';
  const blocks = h.blocks.map(b => b.type === 'image'
    ? `<div class="ho-block" data-hb="${b.id}"><div class="ho-bar"><span>🖼️ 画像</span>${ctl}</div><input type="file" accept="image/*" data-ho-in="file"><input type="text" data-ho-in="url" placeholder="画像URL（アップロードの代わりに入力も可）" value="${escapeHTML(/^(data|blob):/.test(b.previewUrl) ? '' : b.previewUrl)}" style="margin-top:6px">${b.previewUrl ? `<img class="ho-thumb" src="${escapeHTML(imgSrc(b.previewUrl))}" alt="">` : ''}</div>`
    : `<div class="ho-block" data-hb="${b.id}"><div class="ho-bar"><span style="display:flex;gap:6px;align-items:center;flex:1">📑 <input type="text" data-ho-in="key" value="${escapeHTML(b.keyName)}" placeholder="項目名（空欄なら見出しなし）" style="max-width:220px;font-weight:bold">${hoDecorSelect(b)}</span>${ctl}</div><textarea data-ho-in="text" placeholder="本文を入力">${escapeHTML(b.val)}</textarea>${hoSubsHtml(b)}</div>`).join('');
  box.innerHTML = `<div class="card"><div class="ho-head"><input type="text" data-ho-in="name" value="${escapeHTML(h.name)}" placeholder="HO名（例: HO2。タブ名に反映されます）" style="max-width:200px"><button type="button" class="btn-sort btn-danger" data-ho-act="del-ho">🗑 このHOを削除</button></div><input type="text" data-ho-in="tagline" value="${escapeHTML(h.tagline)}" placeholder="導入の一文（1行目「# HO名：__ここ__」。空欄なら見出し行なし）" style="margin-bottom:12px">${blocks}<div class="ho-add"><button type="button" class="btn btn-secondary" data-ho-act="add-item">＋ 項目ブロックを追加</button><button type="button" class="btn btn-secondary" data-ho-act="add-image">＋ 画像を追加</button></div></div>`;
}
const hoHeading = h => { const t = (h.tagline || '').trim(); return t ? `# ${(h.name || '').trim() || 'HO'}：__${t}__` : ''; };
function hoMessages(h) {   // DMに貼る単位（見出しは最初のテキストにまとめる。ブロック間は空行2つ）
  const cfg = appState.formatConfig || defaultFormatConfig, head = hoHeading(h), out = []; let used = false;
  h.blocks.forEach(b => {
    if (b.type === 'image') { if (b.previewUrl) out.push({ kind: 'image', url: b.previewUrl, id: b.id }); return; }
    const t = formatItemSection(b.keyName, b.val, b.subItems, b.decorStyle, cfg); if (!t) return;
    out.push({ kind: 'text', text: (!used && head ? head + '\n\n\n' : '') + t, id: b.id }); used = true;
  });
  if (head && !used) out.unshift({ kind: 'text', text: head, id: 'head' });
  return out;
}
async function copyTextToClipboard(t) {
  try { await navigator.clipboard.writeText(t); } catch (e) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (x) { logSoft('copy', x); } ta.remove(); }
  toast('📋 コピーしました');
}
async function hoImageBlob(url) { const r = await fetchRetry(imgSrc(url), {}, 1, 20000); return r.blob(); }
async function hoImagePng(url) { const bmp = await createImageBitmap(await hoImageBlob(url)), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; c.getContext('2d').drawImage(bmp, 0, 0); return new Promise(r => c.toBlob(r, 'image/png')); }
function renderHoPreview() {   // そのHOのDM風プレビュー。コピー・ダウンロードのボタンは、ここ（メッセージごと）にだけ置く
  const box = document.getElementById('hoPreviewBox'), h = secretHOs[activeHO]; if (!box || !h) return;
  const bot = document.getElementById('botName').value || '概要投稿Bot', av = appState.botAvatarData || 'https://cdn.discordapp.com/embed/avatars/0.png', msgs = hoMessages(h);
  const frame = inner => `<div class="discord-msg"><img class="discord-avatar" src="${escapeHTML(av)}"><div style="flex:1"><div><span class="discord-username">${escapeHTML(bot)}</span></div>${inner}</div></div>`;
  const html = msgs.map((m, i) => m.kind === 'image'
    ? frame(`<img class="pv-img" src="${escapeHTML(imgSrc(m.url))}"><div class="ho-copybar"><button type="button" data-ho-copy="img" data-mi="${i}">🖼️ 画像をコピー</button>${/^https?:/.test(m.url) ? `<button type="button" data-ho-copy="imgurl" data-mi="${i}">🔗 画像URLをコピー</button>` : ''}<button type="button" data-ho-copy="dl" data-mi="${i}">⬇ ダウンロード</button></div>`)
    : frame(`<div class="discord-text">${mdToHtml(m.text)}</div><div class="ho-copybar"><button type="button" data-ho-copy="text" data-mi="${i}">📋 このテキストをコピー</button><span class="ho-count${m.text.length > 2000 ? ' over' : ''}">約${m.text.length}文字${m.text.length > 2000 ? '（2000字超：Discordの上限に注意）' : ''}</span></div>`)).join('');
  const texts = msgs.filter(m => m.kind === 'text').length;
  box.innerHTML = `<div class="discord-header"><span>💬 DMプレビュー — 🔒 ${escapeHTML(h.name || 'HO')}</span>${texts > 1 ? '<button type="button" class="ho-copyall" data-ho-copy="all">📋 テキストをまとめてコピー</button>' : ''}</div><div class="ho-hint">上から順にボタンを押して、DiscordのDMへ貼り付けてください（画像は間に挟まります）。この内容はフォーラムには投稿されません。</div>${html || '<div class="ho-hint">まだ内容がありません。左で項目ブロックや画像を追加してください。</div>'}`;
}
// ===== 操作（data-ho-* 属性で委譲） =====
(function () {
  const cur = () => secretHOs[activeHO], blk = el => { const w = el.closest('[data-hb]'); return w && cur() && cur().blocks.find(b => b.id === w.dataset.hb); };
  const changed = () => { renderHoPreview(); saveHoDraft(); scheduleDraftSave(); };
  document.addEventListener('click', async e => {
    const c = e.target.closest && e.target.closest('[data-ho-copy]');
    if (c && cur()) { const msgs = hoMessages(cur()), m = msgs[Number(c.dataset.mi)], k = c.dataset.hoCopy;
      try {
        if (k === 'all') await copyTextToClipboard(msgs.filter(x => x.kind === 'text').map(x => x.text).join('\n\n\n'));
        else if (!m) return;
        else if (k === 'text') await copyTextToClipboard(m.text);
        else if (k === 'imgurl') await copyTextToClipboard(m.url);
        else if (k === 'img') { await navigator.clipboard.write([new ClipboardItem({ 'image/png': hoImagePng(m.url) })]); toast('🖼️ 画像をコピーしました'); }
        else if (k === 'dl') { const blob = await hoImageBlob(m.url), u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = (cur().name || 'HO') + '_' + m.id + '.' + ((blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')); a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
      } catch (err) { logSoft('ho copy', err); toast('⚠️ コピー／保存に失敗しました。「⬇ ダウンロード」をお試しください'); }
      return; }
    const el = e.target.closest && e.target.closest('[data-ho-act]'); if (!el) return; const act = el.dataset.hoAct, h = cur(), b = blk(el);
    if (act === 'tab') { activeHO = Number(el.dataset.hi); renderHoAll(); return; }
    if (act === 'add-ho') { secretHOs.push(newHO()); activeHO = secretHOs.length - 1; renderHoAll(); saveHoDraft(); scheduleDraftSave(); return; }
    if (!h) return;
    if (act === 'del-ho') { if (!(await appConfirm('このHO「' + (h.name || 'HO') + '」を削除しますか？', { okText: '削除', danger: true }))) return; secretHOs.splice(activeHO, 1); activeHO = -1; renderHoAll(); saveHoDraft(); scheduleDraftSave(); return; }
    if (act === 'add-item') h.blocks.push(newHOItem());
    else if (act === 'add-image') h.blocks.push({ id: hoId(), type: 'image', previewUrl: '' });
    else if (act === 'sub-add' && b) b.subItems.push({ title: '', val: '', style: 'plain' });
    else if (act === 'sub-del' && b) b.subItems.splice(Number(el.dataset.si), 1);
    else if (b) { const i = h.blocks.indexOf(b); if (act === 'del-block') h.blocks.splice(i, 1); else if (act === 'up' && i > 0) [h.blocks[i - 1], h.blocks[i]] = [h.blocks[i], h.blocks[i - 1]]; else if (act === 'down' && i < h.blocks.length - 1) [h.blocks[i + 1], h.blocks[i]] = [h.blocks[i], h.blocks[i + 1]]; }
    renderHoPanel(); changed();
  });
  document.addEventListener('input', e => {
    const el = e.target.closest && e.target.closest('[data-ho-in]'); if (!el || !cur()) return; const k = el.dataset.hoIn, b = blk(el), v = el.value, sub = () => { const w = el.closest('[data-si]'); return b && w && b.subItems[Number(w.dataset.si)]; };
    if (k === 'name') { cur().name = v; renderHoTabs(); }   // タブ名にすぐ反映
    else if (k === 'tagline') cur().tagline = v;
    else if (b && k === 'key') b.keyName = v; else if (b && k === 'text') b.val = v; else if (b && k === 'decor') b.decorStyle = v; else if (b && k === 'url') b.previewUrl = v.trim();
    else if (k === 'sub-title' && sub()) sub().title = v; else if (k === 'sub-text' && sub()) sub().val = v; else if (k === 'sub-style' && sub()) sub().style = v;
    changed();
  });
  document.addEventListener('change', async e => {
    const el = e.target.closest && e.target.closest('[data-ho-in="file"]'); if (!el || !cur() || !el.files[0]) return; const b = blk(el); if (!b) return;
    b.previewUrl = await compressImage(el.files[0], 1280, 1280, 0.8); renderHoPanel(); changed();
  });
  window.addEventListener('load', async () => {   // 作業中のHOを復元（シナリオを呼び出した後は、そのシナリオのHOが優先される）
    try { const raw = await window.idbGetRaw('draft_ho'); if (raw && !secretHOs.length) { secretHOs = sanitizeHOs(JSON.parse(raw)); renderHoAll(); } } catch (e) { logSoft('ho restore', e); }
  });
  renderHoAll();
})();
// プレビューの再描画に合わせて、HOタブ表示中はDMプレビューも更新する
(function () { const orig = renderPreviewNow; renderPreviewNow = function () { orig(); if (activeHO >= 0) renderHoPreview(); }; })();
