'use strict';
(() => {
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function summary(p,label) {
    const rank=window.__TWRank.progress(p);
    return `<div class="rank-heading"><span>${escape(label)}</span><b>${escape(rank.name)}</b></div>
      <div class="rank-rating">${p.rating}<small>积分</small><span>${p.wins} 胜 / ${p.losses} 负 / ${p.draws} 平</span></div>
      <div class="rank-track" role="progressbar" aria-label="段位进度" aria-valuenow="${Math.round(rank.percent)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${rank.percent}%"></i></div>
      <p class="rank-next">${p.games<5?'完成 5 局定级，积分每局更新。':rank.next?`距${escape(rank.next)}还需 ${rank.remaining} 分`:'已达最高段位，继续挑战个人纪录。'}</p>`;
  }
  function history(p) {
    return `<details class="rank-history"><summary>最近战绩 · ${p.games} 局 / 最高 ${p.best} 分</summary>${p.history.length?'<ol>'+p.history.slice(0,10).map(h=>`<li><b class="${h.score===1?'rank-win':'rank-loss'}">${h.score===1?'胜':h.score===0?'负':'平'}</b><span>${escape(h.opponent)}<small>${escape(h.reason)}</small></span><strong>${h.delta>0?'+':''}${h.delta}</strong></li>`).join('')+'</ol>':'<p>完成第一局后，战绩会出现在这里。</p>'}</details>`;
  }
  window.TW_RankUI={summary,history};
})();
