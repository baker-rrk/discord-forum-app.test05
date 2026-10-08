/* app_test48_00_block_common.js — 公開情報とHOで共通のブロック編集の部品
 * 以前は公開情報側（04・08）とHO側（10）に同じ処理が2つずつあったものを、ここ1か所にまとめてある。
 * 片方だけ直して動きが食い違う、という事故を防ぐため、サブ項目・並べ替え・書式の処理は必ずここを通す。 */

// ----- サブ項目（サブタイトル＋本文のペア） -----
const SUB_FIELD = { title: 'title', text: 'val', style: 'style' };   // 画面側の種類名 → データの項目名
const newSub = () => ({ title: '', val: '', style: 'plain' });
// サブ項目の編集UI。attrs(kind, i) が、各画面の操作用の属性文字列を返す（kind: title / text / style / del / add）
function subItemsEditorHtml(subs, attrs) {
  const rows = (subs || []).map((s, i) => `<div class="sub-item" data-si="${i}"><div class="sub-item-head"><input type="text" ${attrs('title', i)} value="${escapeHTML(s.title)}" placeholder="サブタイトル（小見出し）"><select ${attrs('style', i)} title="サブタイトルの表記（引用の外に出ます）"><option value="plain" ${s.style === 'bold' ? '' : 'selected'}>通常文字</option><option value="bold" ${s.style === 'bold' ? 'selected' : ''}>太字</option></select><button type="button" class="btn-sort btn-danger" ${attrs('del', i)}>✕ 削除</button></div><textarea ${attrs('text', i)} placeholder="サブ項目の本文">${escapeHTML(s.val)}</textarea></div>`).join('');
  return rows + `<button type="button" class="btn btn-secondary btn-sm sub-add" ${attrs('add', -1)}>＋ サブ項目を追加</button>`;
}

// ----- 並べ替え -----
const moveItem = (arr, i, dir) => { const j = i + dir; if (i < 0 || j < 0 || j >= arr.length) return false; const [m] = arr.splice(i, 1); arr.splice(j, 0, m); return true; };   // 動かしたら true

// ----- 書式ボタン（太字・スポイラー・引用） -----
// 選択範囲を before/after で囲む。after が空のときは「選択した各行の先頭」に before を付ける（引用など）。値の更新だけ行い、再描画は呼び出し側
function fmtSelection(ta, before, after) {
  const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, sel = v.slice(s, e);
  const rep = after ? before + sel + after : sel.split('\n').map(l => before + l).join('\n');
  ta.value = v.slice(0, s) + rep + v.slice(e); ta.focus(); ta.setSelectionRange(s + rep.length, s + rep.length);
}

// ----- 装飾スタイル（組み込み＋自分で作ったフォーマット） -----
const BUILTIN_DECOR = [['default', '通常'], ['simple', 'シンプル'], ['fancy', 'ファンシー'], ['codeblock', 'コードブロック'], ['none', '装飾なし']];
const isDecorStyle = v => ['default', 'simple', 'fancy', 'codeblock', 'none'].includes(v) || /^fmt_[\w-]+$/.test(String(v));   // 自分のフォーマットのIDは fmt_ で始まる
const decorOptions = () => [...BUILTIN_DECOR, ...((typeof appState !== 'undefined' && Array.isArray(appState.formats)) ? appState.formats : []).map(f => [f.id, '🎨 ' + (f.name || '無題')])];
const decorOptionsHtml = cur => decorOptions().map(([v, l]) => `<option value="${escapeHTML(v)}" ${cur === v ? 'selected' : ''}>${escapeHTML(l)}</option>`).join('');
const sanitizeFormats = list => (Array.isArray(list) ? list : []).filter(f => f && typeof f === 'object').map(f => ({ id: String(f.id == null ? '' : f.id).replace(/[^\w-]/g, '_'), name: _s(f.name), headPre: _s(f.headPre), headPost: _s(f.headPost), linePre: _s(f.linePre), wrap: f.wrap === 'code' ? 'code' : 'none' })).filter(f => /^fmt_[\w-]+$/.test(f.id));

// ----- JSONバックアップの「統合」：今のデータをベースに、ファイルの内容を追加・更新する（純粋関数。引数は書き換えない） -----
function mergeBackupInto(base, inc) {
  const S = { scenAdded: 0, scenUpdated: 0, scenSame: 0, scenKeptNewer: 0, chAdded: 0, chUpdated: 0, fmtAdded: 0, fmtUpdated: 0, histAdded: 0 };
  const clone = x => JSON.parse(JSON.stringify(x));
  const b = clone(base || {}), n = clone(inc || {});
  const posted = (w, o) => ({ ...w, postedChannels: [...new Set([...(w.postedChannels || []), ...(o.postedChannels || [])])], postedInfo: { ...(o.postedInfo || {}), ...(w.postedInfo || {}) } });   // 投稿済みの記録は両方を合算
  const upsert = (list, items, add, upd, rule, norm = x => x) => {
    const out = [...list], pos = new Map(out.map((x, i) => [x.id, i]));
    (items || []).forEach(it => {
      if (!it || it.id == null) return;
      if (!pos.has(it.id)) { out.push(it); pos.set(it.id, out.length - 1); S[add]++; return; }
      const cur = out[pos.get(it.id)], next = rule(cur, it);
      if (next === null) return;
      if (JSON.stringify(next) === JSON.stringify(norm(cur))) { if (S.scenSame !== undefined && add === 'scenAdded') S.scenSame++; return; }
      out[pos.get(it.id)] = next; S[upd]++;
    });
    return out;
  };
  const scenarios = upsert((b.scenarios || []).filter(x => x && x.id != null), n.scenarios, 'scenAdded', 'scenUpdated', (cur, it) => {
    if (it.updatedAt !== undefined && cur.updatedAt !== undefined && Number(it.updatedAt) < Number(cur.updatedAt)) { S.scenKeptNewer++; return null; }   // 今のデータのほうが新しければ、更新しない
    return posted({ ...cur, ...it }, cur);
  }, x => posted(x, x));   // 「変更なし」の判定は、投稿済みの記録の形をそろえてから比べる
  const channels = upsert((b.channels || []).filter(x => x && x.id != null), n.channels, 'chAdded', 'chUpdated', (cur, it) => ({ ...cur, ...it }));
  const formats = upsert((b.formats || []).filter(x => x && x.id != null), n.formats, 'fmtAdded', 'fmtUpdated', (cur, it) => ({ ...cur, ...it }));
  const key = h => h.date + '|' + h.title + '|' + h.channels, hm = new Map((b.history || []).filter(Boolean).map(h => [key(h), h]));
  const clearedIso = b.historyClearedAt ? new Date(b.historyClearedAt).toISOString() : '';
  (n.history || []).forEach(h => { if (h && !hm.has(key(h)) && !(clearedIso && String(h.date) <= clearedIso)) { hm.set(key(h), h); S.histAdded++; } });
  const history = [...hm.values()].sort((x, y) => String(x.date).localeCompare(String(y.date))).slice(-500);
  const dsc = { ...(b.deletedScenarios || {}) }, dch = { ...(b.deletedChannels || {}) };
  (n.scenarios || []).forEach(s => { if (s) delete dsc[s.id]; }); (n.channels || []).forEach(c => { if (c) delete dch[c.id]; });   // ファイルに含まれるものは、削除済みの記録を外して戻す
  return { merged: { ...b, scenarios, channels, formats, history, deletedScenarios: dsc, deletedChannels: dch }, summary: S };
}
const mergeSummaryText = S => `シナリオ：追加 ${S.scenAdded}件・更新 ${S.scenUpdated}件・変更なし ${S.scenSame}件` + (S.scenKeptNewer ? `・今のデータのほうが新しいため更新しない ${S.scenKeptNewer}件` : '') + `\nチャンネル：追加 ${S.chAdded}件・更新 ${S.chUpdated}件\nフォーマット：追加 ${S.fmtAdded}件・更新 ${S.fmtUpdated}件\n投稿履歴：追加 ${S.histAdded}件`;
