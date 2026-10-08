'use strict';
(() => {
  // An APK contains this file; the website and desktop build do not load it.
  if (!crypto.randomUUID) crypto.randomUUID = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(n => n.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  };
  const database = new Promise((resolve, reject) => {
    const open = indexedDB.open('tangwu_mobile_training_v1', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('data');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  async function request(body) {
    if (!body || !['profile', 'record', 'export'].includes(body.op))
      throw Object.assign(Error('手机训练请求无效'), {code:400});
    let record;
    try { if (body.op === 'record') record = window.__TWReplay.clean(body.record); }
    catch (error) { throw Object.assign(error, {code:400}); }
    const db = await database;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('data', 'readwrite');
      const store = transaction.objectStore('data'), get = store.get('profile');
      let result;
      get.onsuccess = () => {
        const data = get.result || {version:1, enabled:false, records:[], seen:[], total:0};
        if (body.op === 'profile' && typeof body.enabled === 'boolean') data.enabled = body.enabled;
        let accepted = false, duplicate = false;
        if (record && data.enabled) {
          accepted = true; duplicate = data.seen.includes(record.id);
          if (!duplicate) {
            data.records.push({...record, source:'android', collectedAt:Date.now()});
            data.records = data.records.slice(-500);
            data.seen = [...data.seen, record.id].slice(-1000); data.total++;
          }
        }
        store.put(data, 'profile');
        result = {ok:true, enabled:data.enabled, count:data.records.length, total:data.total, limit:500,
          ...(record ? {accepted, duplicate} : {}),
          ...(body.op === 'export' ? {version:1, records:data.records} : {})};
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || Error('手机记录保存失败'));
    });
  }
  window.TWDesktopTraining = Object.freeze({platform:'android', request,
    export(data, filename) {
      if (!window.TWAndroid?.postMessage) throw Error('请更新 Android System WebView 后再导出');
      window.TWAndroid.postMessage(JSON.stringify({type:'export', filename,
        mime:typeof data==='string'?'text/plain':'application/json',
        contents:typeof data==='string'?data:JSON.stringify(data,null,2)}));
    }
  });
  window.TWMobile = {
    back() {
      const visible = selector => { const element = document.querySelector(selector); return element && !element.classList.contains('hidden'); };
      if (visible('#rules-modal')) { document.querySelector('#btn-rules-close').click(); return true; }
      if (visible('#result-modal')) { document.querySelector('#btn-menu').click(); return true; }
      if (document.querySelector('#menu')?.classList.contains('hidden')) {
        document.querySelector('#btn-back').click(); return true;
      }
      return false;
    }
  };
  // Use same-view navigation for the packaged artbook; keep online play external.
  document.querySelectorAll('a[target="_blank"]').forEach(link => link.removeAttribute('target'));
})();
