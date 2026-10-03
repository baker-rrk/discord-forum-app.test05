# ブラウザでの自動テスト（開発用・本番には不要）。実際のChromiumでアプリを開き、画面を操作して確認します。
# 準備: pip install playwright && playwright install chromium
# 使い方: python dev_e2e_test36.py [HTML等のあるフォルダ]   （Discordへの通信は偽のレスポンスに差し替えるので、実際には送信されません）
import asyncio,sys,json,re
from playwright.async_api import async_playwright
import os,glob,pathlib
DIR=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else '.').resolve()   # HTML/CSS/JSのあるフォルダ（最新バージョンのHTMLを自動で選ぶ）
_h=sorted(glob.glob(str(DIR/'discord_forum_app_test*.html')),key=lambda p:int(re.search(r'test(\d+)',p).group(1)))[-1]; URL=pathlib.Path(_h).as_uri()
LAUNCH={'args':['--no-sandbox']}
if os.environ.get('CHROME_PATH'): LAUNCH['executable_path']=os.environ['CHROME_PATH']   # 既存のChromeを使う場合に指定
res=[]; 
def ok(c,m,extra=''):
    res.append(bool(c)); print(('OK  ' if c else 'NG  ')+m+((' ('+str(extra)+')') if (not c and extra!='') else ''))
async def newpage(b,hooks):
    ctx=await b.new_context(viewport={'width':1300,'height':900}); pg=await ctx.new_page(); pg.errs=[]; pg.reqs=[]
    pg.on('pageerror',lambda e:pg.errs.append(str(e)))
    async def wh(route):
        r=route.request; pg.reqs.append((r.method,r.url,r.post_data or ''))
        if r.method=='GET': return await route.fulfill(status=200,content_type='application/json',body=json.dumps({'id':'1','guild_id':'999','name':'wh'}))
        if r.method=='PATCH': return await route.fulfill(status=200,content_type='application/json',body='{}')
        return await route.fulfill(status=200,content_type='application/json',body=json.dumps({'id':'111','channel_id':'222','guild_id':'999'}))
    await pg.route('https://discord.com/api/webhooks/**',wh)
    await pg.route('https://www.gstatic.com/**',lambda r:r.abort()); await pg.route('https://*.googleapis.com/**',lambda r:r.abort())
    await pg.goto(URL); await pg.wait_for_timeout(1800); return pg
async def seed_channel(pg):
    await pg.evaluate("""()=>{appState.channels=[{id:'ch1',name:'テストフォーラム',webhookUrl:'https://discord.com/api/webhooks/1/abc',tags:[{name:'募集',id:'123456789012345678'}]}];saveState();renderChannelConfigList();renderChannelCheckboxes();updateTagCheckboxes();}""")
async def click_btn(pg,text):
    await pg.locator('button',has_text=text).last.click()
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(**LAUNCH)
        # T1 起動・タブ
        pg=await newpage(b,None); ok(not pg.errs,'T1 起動時にスクリプトエラーがない',pg.errs[:2])
        for t in ['databaseTab','historyTab','settingsTab','postTab']:
            await pg.locator(f'button[data-on-click="switchTab-{t}-event"]').click()
            ok(await pg.evaluate(f"document.getElementById('{t}').classList.contains('active')"),f'T1 タブ切替 {t}')
        # T2 ブロック操作
        n0=await pg.evaluate('blockOrder.length'); await pg.locator('button[data-on-click="addSplitBlock"]').click()
        ok(await pg.evaluate('blockOrder.length')==n0+1,'T2 分割ブロックを追加')
        ids=await pg.evaluate('blockOrder.map(b=>b.id)'); last=ids[-1]
        await pg.locator(f'#sortableBlockContainer [data-ba="up"][data-bid="{last}"]').click()
        ids2=await pg.evaluate('blockOrder.map(b=>b.id)'); ok(ids2[-2]==last,'T2 ↑で並び順が変わる(IDで特定)')
        await pg.locator(f'#sortableBlockContainer [data-ba="down"][data-bid="{last}"]').click()
        ok((await pg.evaluate('blockOrder.map(b=>b.id)'))[-1]==last,'T2 ↓で戻る')
        sid=await pg.evaluate("blockOrder.find(b=>b.type==='summary_container').id"); ni=await pg.evaluate("blockOrder.find(b=>b.type==='summary_container').items.length")
        if await pg.evaluate(f"blockOrder.find(b=>b.id==='{sid}').collapsed"): await pg.locator(f'[data-ba="toggle"][data-bid="{sid}"] .type-badge').first.click()
        await pg.locator(f'[data-ba="item-add"][data-bid="{sid}"]').click(); ok(await pg.evaluate("blockOrder.find(b=>b.type==='summary_container').items.length")==ni+1,'T2 概要項目の追加')
        await pg.locator(f'[data-ba="item-del"][data-bid="{sid}"]').last.click(); ok(await pg.evaluate("blockOrder.find(b=>b.type==='summary_container').items.length")==ni,'T2 概要項目の削除')
        c0=await pg.evaluate(f"blockOrder.find(b=>b.id==='{sid}').collapsed")
        await pg.locator(f'[data-ba="toggle"][data-bid="{sid}"] .type-badge').first.click(); ok(await pg.evaluate(f"blockOrder.find(b=>b.id==='{sid}').collapsed")!=c0,'T2 見出しクリックで折りたたみ')
        await pg.locator(f'[data-ba="del"][data-bid="{last}"]').click(); ok(await pg.evaluate('blockOrder.length')==n0,'T2 分割ブロックを削除')
        # T3 入力→プレビュー
        await pg.fill('#title','テスト卓A'); await pg.wait_for_timeout(400); ok('テスト卓A' in await pg.inner_text('#pvThreadTitle'),'T3 タイトルがプレビューに反映')
        await pg.evaluate("document.getElementById('summaryItemsContainer')&&0")
        if await pg.evaluate(f"blockOrder.find(b=>b.id==='{sid}').collapsed"): await pg.locator(f'[data-ba="toggle"][data-bid="{sid}"] .type-badge').first.click()
        first=pg.locator(f'[data-bi="item-val"][data-bid="{sid}"]').first
        if await first.count(): await first.fill('COC7版'); await pg.wait_for_timeout(400); ok('COC7版' in await pg.inner_text('#pvContent'),'T3 概要項目の入力がプレビューに反映')
        # T4 入力内容のみクリア
        order=await pg.evaluate('blockOrder.map(b=>b.id).join()')
        await pg.locator('button[data-on-click="resetInputs"]').click(); await click_btn(pg,'クリア')
        await pg.wait_for_timeout(300)
        ok(await pg.input_value('#title')=='' and await pg.evaluate('blockOrder.map(b=>b.id).join()')==order,'T4 入力内容のみクリア：本文は消え、ブロックの並びは残る')
        # T10 固定ヘッダー
        await pg.evaluate("window.scrollTo(0,800)"); await pg.wait_for_timeout(200)
        ok(await pg.evaluate("Math.round(document.querySelector('.app-header').getBoundingClientRect().top)")==0,'T10 スクロールしてもヘッダーが上部に固定')
        await pg.context.close()
        # T5/T6 投稿
        pg=await newpage(b,None); await seed_channel(pg)
        base=await pg.evaluate('appState.scenarios.length')   # 初期状態にはサンプルのシナリオが1件ある
        await pg.locator('#channelCheckboxContainer .chip').first.click()
        await pg.locator('#tagContainer .chip').first.click()   # フォーラムのタグ（必須）を選ぶ
        await pg.evaluate("blockOrder.find(b=>b.id==='intro').collapsed=false;renderBlockUI()"); await pg.fill('#intro','本文テスト')
        await pg.fill('#title','シナリオ壱'); await pg.locator('#submitBtn').click()
        await pg.wait_for_selector('text=投稿が完了しました',timeout=8000); ok(True,'T5 投稿成功のポップアップが出る')
        posts=[r for r in pg.reqs if r[0]=='POST']; ok(posts and 'シナリオ壱' in posts[0][2],'T5 Webhookへスレッド名つきでPOST',posts[:1])
        ok(await pg.evaluate('document.getElementById("statusMsg").style.display')in('','none'),'T5 画面下のバーは表示されない')
        await click_btn(pg,'閉じる'); n=await pg.evaluate('appState.scenarios.length'); ok(n==base+1,'T5 投稿後にシナリオがDBへ保存される',n)
        await pg.fill('#title','全く別のシナリオ'); await pg.locator('#submitBtn').click()
        await pg.wait_for_selector('text=投稿が完了しました',timeout=8000); await click_btn(pg,'閉じる')
        ok(await pg.evaluate('appState.scenarios.length')==base+2,'T6 連続投稿でもタイトルが違えば別DB（上書きしない）',await pg.evaluate('appState.scenarios.map(s=>s.title)'))
        await pg.fill('#title','全く別のシナリオ 後編'); await pg.locator('#submitBtn').click()
        await pg.wait_for_selector('text=投稿が完了しました',timeout=8000); await click_btn(pg,'閉じる')
        ok(await pg.evaluate('appState.scenarios.length')==base+3,'T6 部分一致でも確認なしで別DBとして保存',await pg.evaluate('appState.scenarios.map(s=>s.title)'))
        await pg.fill('#title','全く別のシナリオ 後編'); await pg.locator('#submitBtn').click(); await pg.wait_for_timeout(600)
        ok(await pg.locator('text=重複').count()>0 or await pg.locator('#duplicateWarning:visible').count()>0,'T6 完全一致＋同じチャンネルは重複投稿の警告が出る')
        ok(not pg.errs,'T5/T6 実行中にスクリプトエラーがない',pg.errs[:2]); await pg.context.close()
        # T7 画像のドラッグ＆ドロップ
        pg=await newpage(b,None)
        await pg.locator('button[data-on-click="addImageBlock"]').click()
        r=await pg.evaluate("""async()=>{const c=document.createElement('canvas');c.width=40;c.height=40;c.getContext('2d').fillRect(0,0,40,40);
          const blob=await new Promise(r=>c.toBlob(r,'image/png'));const f=new File([blob],'a.png',{type:'image/png'});const dt=new DataTransfer();dt.items.add(f);
          const before=blockOrder.length; const zone=[...document.querySelectorAll('[data-ba="pick"]')].pop();
          zone.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
          await new Promise(r=>setTimeout(r,1200));
          return {before,after:blockOrder.length,withImg:blockOrder.filter(b=>b.type==='image'&&b.previewUrl).length};}""")
        ok(r['withImg']==1 and r['after']==r['before'],'T7 画像ブロックへのドロップは1回だけ反映（2重にならない）',r); await pg.context.close()
        # T8 お気に入り
        pg=await newpage(b,None)
        await pg.evaluate("""()=>{appState.scenarios=[{id:'a',title:'A'},{id:'b',title:'B',favorite:true},{id:'c',title:'C'}];populateScenarioDBSelect();}""")
        o=await pg.evaluate("[...document.querySelectorAll('#dbScenarioSelect option')].map(o=>o.value).join('')+'|'+[...document.querySelectorAll('#dbScenarioSelect optgroup')].map(g=>g.label).join('/')")
        ok(o.startswith('bac') or o.startswith('b')and'ac'in o.split('|')[0],'T8 プルダウンはお気に入りが先頭',o)
        await pg.context.close()
        # T9 設定
        pg=await newpage(b,None); await pg.locator('button[data-on-click="switchTab-settingsTab-event"]').click()
        await pg.fill('#maxAttachMB','20'); ok(await pg.evaluate('appState.maxAttachMB')==20,'T9 添付上限の設定が保存される')
        await pg.locator('button',has_text='チャンネル').first.click() if False else None
        ok(not pg.errs,'T9 エラーなし',pg.errs[:2]); await pg.context.close()
        # T11 DBタブ：手動追加・お気に入り・編集・呼び出し・削除
        pg=await newpage(b,None); base=await pg.evaluate('appState.scenarios.length')
        await pg.locator('button[data-on-click="switchTab-databaseTab-event"]').click()
        await pg.locator('button[data-on-click="openAddScenarioModal"]').click(); await pg.fill('#mTitle','DBテスト卓'); await pg.fill('#mSystem','CoC')
        await pg.locator('#addScenarioModal button[type="submit"]').click(); await pg.wait_for_timeout(500)
        ok(await pg.evaluate('appState.scenarios.length')==base+1,'T11 シナリオを手動で追加できる')
        card=pg.locator('#dbCardContainer > *',has_text='DBテスト卓').first
        ok(await card.count()>0,'T11 追加したシナリオがDB一覧に表示される')
        await card.locator('[data-act="fav"]').click(); await pg.wait_for_timeout(300)
        ok(await pg.evaluate("appState.scenarios.find(s=>s.title==='DBテスト卓').favorite===true"),'T11 ★でお気に入りにできる')
        first=await pg.evaluate("[...document.querySelectorAll('#dbScenarioSelect option')][1].text")
        ok('DBテスト卓' in first and first.startswith('★'),'T11 お気に入りにするとプルダウンの先頭に出る（再読み込み不要）',first)
        await pg.locator('#dbCardContainer > *',has_text='DBテスト卓').first.locator('[data-act="edit"]').click(); await pg.wait_for_timeout(300)
        await pg.fill('#eTitle','DBテスト卓改'); await pg.locator('#editScenarioModal button[type="submit"]').click(); await pg.wait_for_timeout(400)
        ok(await pg.evaluate("appState.scenarios.some(s=>s.title==='DBテスト卓改')"),'T11 編集モーダルでタイトルを変更できる')
        await pg.locator('button[data-on-click="switchTab-postTab-event"]').click()
        await pg.evaluate("activeTagNames.add('前のシナリオのタグ')")
        sid2=await pg.evaluate("appState.scenarios.find(s=>s.title==='DBテスト卓改').id"); await pg.select_option('#dbScenarioSelect',sid2); await pg.wait_for_timeout(500)
        ok(await pg.input_value('#title')=='DBテスト卓改' and await pg.evaluate('activeTagNames.size')==0,'T11 プルダウンから呼び出すと入力欄に反映され、前のタグは持ち越さない')
        await pg.locator('button[data-on-click="switchTab-databaseTab-event"]').click()
        await pg.locator('#dbCardContainer > *',has_text='DBテスト卓改').first.locator('[data-act="del"]').click(); await pg.wait_for_timeout(300)
        await click_btn(pg,'削除'); await pg.wait_for_timeout(400)
        ok(await pg.evaluate('appState.scenarios.length')==base,'T11 削除できる（確認ダイアログ付き）'); ok(not pg.errs,'T11 エラーなし',pg.errs[:2]); await pg.context.close()
        # T12 設定タブ：チャンネルとタグ
        pg=await newpage(b,None); await pg.locator('button[data-on-click="switchTab-settingsTab-event"]').click()
        c0=await pg.evaluate('appState.channels.length'); await pg.locator('button[data-on-click="addChannelConfig"]').click(); await pg.wait_for_timeout(300)
        ok(await pg.evaluate('appState.channels.length')==c0+1,'T12 チャンネルを追加できる')
        await pg.locator('[data-on-input="ch-rename"]').last.fill('新チャンネル'); await pg.locator('[data-on-input="ch-webhook"]').last.fill('https://discord.com/api/webhooks/1/abc')
        ok(await pg.evaluate("appState.channels.at(-1).name==='新チャンネル'&&appState.channels.at(-1).webhookUrl.endsWith('/abc')"),'T12 名前とWebhook URLの入力が状態に反映')
        await pg.locator('button[data-on-click="tag-add"]').last.click(); await pg.wait_for_timeout(200)
        await pg.locator('[data-on-input="tag-name"]').last.fill('募集'); await pg.locator('[data-on-input="tag-id"]').last.fill('123456789012345678')
        ok(await pg.evaluate("(()=>{const t=appState.channels.at(-1).tags.at(-1);return t.name==='募集'&&t.id==='123456789012345678'})()"),'T12 タグの追加と入力')
        await pg.locator('button[data-on-click="ch-test"]').last.click(); await pg.wait_for_timeout(600)
        ok(any(r[0]=='GET' for r in pg.reqs),'T12 接続テストがWebhookへGETする（タイムアウトつきの共通処理経由）')
        await pg.locator('button[data-on-click="ch-del"]').last.click(); await pg.wait_for_timeout(300)
        if await pg.locator('button',has_text='削除').count(): await click_btn(pg,'削除'); await pg.wait_for_timeout(300)
        ok(await pg.evaluate('appState.channels.length')==c0,'T12 チャンネルを削除できる'); ok(not pg.errs,'T12 エラーなし',pg.errs[:2]); await pg.context.close()
        # T13 バックアップの書き出しと取り込み
        pg=await newpage(b,None); await pg.evaluate("appState.scenarios.push({id:'bk1',title:'バックアップ確認',tags:[],postedChannels:[],postedInfo:{}});saveState()"); await pg.wait_for_timeout(700)
        await pg.locator('button[data-on-click="switchTab-settingsTab-event"]').click()
        async with pg.expect_download() as dl: await pg.locator('button[data-on-click="exportData"]').click()
        path='/tmp/e2e/backup_test.json'; await (await dl.value).save_as(path); data=json.load(open(path,encoding='utf-8'))
        ok(isinstance(data.get('scenarios'),list) and any(s.get('title')=='バックアップ確認' for s in data['scenarios']),'T13 バックアップ(JSON)を書き出せる')
        await pg.context.close()
        pg=await newpage(b,None); await pg.locator('button[data-on-click="switchTab-settingsTab-event"]').click()
        await pg.set_input_files('#importFile',path); await pg.wait_for_timeout(500)
        for name in ['置き換え','取り込','上書き']:
            if await pg.locator('button:visible',has_text=name).count(): await pg.locator('button:visible',has_text=name).last.click(); break
        await pg.wait_for_timeout(2500)
        ok(await pg.evaluate("appState.scenarios.some(s=>s.title==='バックアップ確認')"),'T13 書き出したバックアップを取り込める（復元後の再読み込みまで）'); await pg.context.close()
        # T14 履歴・T15 自動分割・T16 フォーム初期化
        pg=await newpage(b,None); await seed_channel(pg)
        await pg.locator('#channelCheckboxContainer .chip').first.click(); await pg.locator('#tagContainer .chip').first.click()
        await pg.evaluate("blockOrder.find(b=>b.id==='intro').collapsed=false;renderBlockUI()"); await pg.fill('#intro','本文'); await pg.fill('#title','履歴確認')
        await pg.locator('#submitBtn').click(); await pg.wait_for_selector('text=投稿が完了しました',timeout=8000); await click_btn(pg,'閉じる')
        await pg.locator('button[data-on-click="switchTab-historyTab-event"]').click(); await pg.wait_for_timeout(300)
        ok(await pg.locator('#historyTableBody tr',has_text='履歴確認').count()>=1,'T14 投稿が履歴に残る')
        await pg.locator('button[data-on-click="clearHistory"]').click(); await pg.wait_for_timeout(300)
        for name in ['消去','削除']:
            if await pg.locator('button:visible',has_text=name).count(): await pg.locator('button:visible',has_text=name).last.click(); break
        await pg.wait_for_timeout(300); ok(await pg.evaluate('appState.history.length')==0,'T14 履歴を全消去できる')
        await pg.locator('button[data-on-click="switchTab-postTab-event"]').click()
        await pg.evaluate("blockOrder.find(b=>b.id==='intro').val='あ'.repeat(1500);blockOrder.find(b=>b.id==='notes').val='い'.repeat(1500);renderBlockUI();renderPreview()")
        await pg.locator('button[data-on-click="autoSplitBlocks"]').click(); await pg.wait_for_timeout(300)
        ok(await pg.evaluate("blockOrder.some(b=>b.type==='split')"),'T15 2000文字を超える内容に、自動で分割ポイントが入る')
        await pg.fill('#title','初期化確認'); await pg.locator('button[data-on-click="resetForm"]').click(); await pg.wait_for_timeout(300)
        for name in ['クリア']:   # ダイアログの実行ボタン（最後に追加された要素を押す）
            if await pg.locator('button:visible',has_text=name).count(): await pg.locator('button:visible',has_text=name).last.click(); break
        await pg.wait_for_timeout(400); ok(await pg.input_value('#title')=='' ,'T16 フォーム初期化でタイトルが空に戻る')
        ok(not pg.errs,'T14-16 エラーなし',pg.errs[:2]); await pg.context.close()
        await b.close()
    print(f'\n== {sum(res)}/{len(res)} passed ==')
asyncio.run(main())
