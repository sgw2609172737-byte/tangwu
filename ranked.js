'use strict';
// Local AI and server PvP use the same rating rules and separate profiles.
(function () {
  const tiers=[{name:'青铜',min:0},{name:'白银',min:1100},{name:'黄金',min:1250},{name:'铂金',min:1450},{name:'钻石',min:1650},{name:'大师',min:1850},{name:'宗师',min:2050},{name:'超影',min:3000}];
  function profile(name='你') { return {name,rating:1000,games:0,wins:0,losses:0,draws:0,best:1000,history:[]}; }
  function tier(rating) { return [...tiers].reverse().find(t=>rating>=t.min) || tiers[0]; }
  function progress(p) {
    const current=tier(p.rating),next=tiers[tiers.indexOf(current)+1];
    return {name:p.games<5?`定级赛 ${p.games}/5`:current.name,tier:current.name,next:next?.name,
      remaining:next?Math.max(0,next.min-p.rating):0,percent:p.games<5?p.games/5*100:next?Math.max(0,Math.min(100,(p.rating-current.min)/(next.min-current.min)*100)):100};
  }
  function delta(p,opponentRating,score) { return Math.round((p.games<5?64:32)*(score-1/(1+10**((opponentRating-p.rating)/400)))); }
  function settle(p,matchId,opponent,score,reason='对局结束',now=Date.now()) {
    const previous=p.history.find(h=>h.id===matchId); if(previous) return previous;
    const before=p.rating; p.rating=Math.max(0,before+delta(p,opponent.rating,score)); p.games++;
    p[score===1?'wins':score===0?'losses':'draws']++; p.best=Math.max(p.best,p.rating);
    const result={id:matchId,opponent:opponent.name,opponentRating:opponent.rating,score,before,after:p.rating,delta:p.rating-before,reason,at:now};
    p.history=[result,...p.history].slice(0,50); return result;
  }
  function opponent(p) {
    const difficulty=p.rating<1100?'normal':p.rating<1450?'hard':'expert';
    return {name:`${difficulty==='expert'?'宗师':difficulty==='hard'?'进阶':'标准'} AI`,rating:difficulty==='expert'?Math.max(1550,p.rating):difficulty==='hard'?1250:1050,difficulty};
  }
  const api={tiers,profile,tier,progress,delta,settle,opponent};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  if(typeof window!=='undefined') window.__TWRank=api;
})();
