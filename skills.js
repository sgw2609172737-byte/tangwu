'use strict';
// 《唐五》技能表：0-9 每个数字对应的技能
// 字段说明：
//   star       — 带 * 的技能，受【强化】加成（加血值 +2）
//   isAttack   — 攻击类技能（对对方造成伤害），触发赌命"攻击后+1能量"、淬毒附加
//   isDigit    — 数字技能（一/三/四/八），计入 98K 连携
//   grantsAgain— 释放后获得一次"再次行动"
//   run(c)     — 技能效果，c 为上下文对象（见 engine.js actSkill）

function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; }
function frac(n, d = 1) { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d); return { n: n / g, d: d / g }; }
const fAdd = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const fSub = (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const fMul = (a, b) => frac(a.n * b.n, a.d * b.d);
const fDiv = (a, b) => (b.n === 0 ? null : frac(a.n * b.d, a.d * b.n));

// 24点求解：4个数字各用一次，仅加减乘除（可用括号），有理数精确运算
// 优化：对 (i,j) 只枚举一次（sub/div 双向），结果去重，排列去重
function solve24(nums) {
  const arr = nums.slice();
  const seenPerm = new Set();
  function dfs(list) {
    if (list.length === 1) return list[0].n === 24 && list[0].d === 1;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const rest = list.filter((_, k) => k !== i && k !== j);
        const a = list[i], b = list[j];
        const cands = [fAdd(a, b), fSub(a, b), fSub(b, a), fMul(a, b), fDiv(a, b), fDiv(b, a)];
        const seen = new Set();
        for (const c of cands) {
          if (!c) continue;
          const key = c.n + '/' + c.d;
          if (seen.has(key)) continue;
          seen.add(key);
          if (dfs(rest.concat([c]))) return true;
        }
      }
    }
    return false;
  }
  function perm(k) {
    if (k === arr.length) {
      const key = arr.join(',');
      if (seenPerm.has(key)) return false;
      seenPerm.add(key);
      return dfs(arr.map((n) => frac(n)));
    }
    for (let i = k; i < arr.length; i++) {
      [arr[k], arr[i]] = [arr[i], arr[k]];
      if (perm(k + 1)) return true;
      [arr[k], arr[i]] = [arr[i], arr[k]];
    }
    return false;
  }
  return perm(0);
}

// 玩家当前拥有的"正面buff"（可被【公平正义】去除）
function positiveBuffs(p) {
  const list = [];
  if (p.jingji) list.push({ key: 'jingji', name: '荆棘' });
  if (p.wudi) list.push({ key: 'wudi', name: '无敌' });
  if (p.yingneng.active) list.push({ key: 'yingneng', name: '盈能' });
  if (p.shuangbei > 0) list.push({ key: 'shuangbei', name: '双倍圣水' });
  if (p.huxi) list.push({ key: 'huxi', name: '呼吸回血' });
  if (p.qianghua) list.push({ key: 'qianghua', name: '强化' });
  if (p.bishi) list.push({ key: 'bishi', name: '鄙视' });
  if (p.cuidu) list.push({ key: 'cuidu', name: '淬毒' });
  return list;
}

const SKILLS = {
  '1': [
    { id: 'xiao', name: '笑', desc: '获得2点费用', star: false, isAttack: false, isDigit: false,
      run(c) { c.gain(2); } },
    { id: 'quan', name: '拳', desc: '对对方造成2点伤害', star: false, isAttack: true, isDigit: false,
      run(c) { c.dmg(c.o, 2); } },
    { id: 'yi', name: '一', desc: '数字技能：获得再次行动', star: false, isAttack: false, isDigit: true, grantsAgain: true,
      run(c) { c.log('一：获得再次行动'); } },
    { id: 'tao', name: '桃', desc: '回复1点生命（受强化影响：+3）', star: true, isAttack: false, isDigit: false,
      run(c) { c.healSelf(1 + (c.p.qianghua ? 2 : 0)); } },
  ],
  '2': [
    { id: 'huanwu', name: '幻雾', desc: '+1$；对方下回合跳过技能手相加', star: false, isAttack: false, isDigit: false,
      run(c) { c.gain(1); c.o.huanwuSkip = true; c.log('幻雾：对方下回合无法与你的手相加'); } },
    { id: 'huifu', name: '回复术士', desc: '回复2点生命（受强化影响：+4）', star: true, isAttack: false, isDigit: false,
      run(c) { c.healSelf(2 + (c.p.qianghua ? 2 : 0)); } },
    { id: 'jingji', name: '荆棘', desc: '下次受到伤害时，反弹⌈n/2⌉给伤害来源（一次性）', star: false, isAttack: false, isDigit: false,
      run(c) { c.p.jingji = true; c.log('荆棘已就绪（反弹一次伤害）'); } },
    { id: 'chaofeng', name: '嘲讽', desc: '对方下回合对你造成的伤害n<4时，你对对方造成(4-n)伤害', star: false, isAttack: false, isDigit: false,
      run(c) { c.p.chaofeng = { pending: true, dmg: 0 }; c.log('嘲讽已就绪'); } },
  ],
  '3': [
    { id: 'xiaolieyan', name: '小烈焰', desc: '立即3伤；你下回合开始时再自动造成2伤（可被净化）', star: false, isAttack: true, isDigit: false,
      run(c) { c.dmg(c.o, 3); c.o.delayed.push({ owner: c.pIdx, dmg: 2, desc: '小烈焰', noBonus: true }); } },
    { id: 'san', name: '三', desc: '数字技能：+2$，获得再次行动', star: false, isAttack: false, isDigit: true, grantsAgain: true,
      run(c) { c.gain(2); } },
    { id: 'hanfeng', name: '寒风', desc: '3伤并使对方-1$', star: false, isAttack: true, isDigit: false,
      run(c) { if (c.dmg(c.o, 3)) { const e = c.o.energy; c.o.energy = Math.max(0, e - 1); c.log(`寒风：对方费用 ${e}$ → ${c.o.energy}$`); } } },
    { id: 'tanghua', name: '假人唐化', desc: '永久：可无限次使用【假人】（同时最多1个）', star: false, isAttack: false, isDigit: false,
      run(c) { c.p.tanghua = true; c.log('假人唐化生效：可无限召唤假人'); } },
  ],
  '4': [
    { id: 'xiaoxiaotou', name: '小小偷', desc: '对方-4$（最低0）并造成1伤', star: false, isAttack: true, isDigit: false,
      run(c) { const e = c.o.energy; if (c.dmg(c.o, 1)) { c.o.energy = Math.max(0, e - 4); c.log(`小小偷：对方费用 ${e}$ → ${c.o.energy}$`); } } },
    { id: 'dian24', name: '24点', desc: '四手数字各用一次、加减乘除算出24 → +5血（强化+7）；算不出则空放', star: true, isAttack: false, isDigit: false,
      run(c) {
        const digs = [c.p.energy % 10, c.p.skill, c.o.energy % 10, c.o.skill];
        if (solve24(digs)) { const v = 5 + (c.p.qianghua ? 2 : 0); c.healSelf(v); c.log(`24点成功！${digs.join(' ')} 可算出24，+${v}血`); }
        else c.log(`24点失败，空放（${digs.join(' ')} 无法算出24）`);
      } },
    { id: 'yizhanyangzhan', name: '以战养战', desc: '按本局累计伤害n结算：n≥5/10/15各+2$（最多+6）', star: false, isAttack: false, isDigit: false,
      run(c) { const n = c.p.cumulativeDmg; const t = Math.min(3, Math.floor(n / 5)); c.gain(2 * t); c.log(`以战养战：累计${n}伤 → +${2 * t}$`); } },
    { id: 'si', name: '四', desc: '数字技能：+3$，获得再次行动', star: false, isAttack: false, isDigit: true, grantsAgain: true,
      run(c) { c.gain(3); } },
    { id: 'cuidu', name: '淬毒', desc: '永久：你的攻击类技能附带下回合1伤（毒伤不受增伤加成，可被净化）', star: false, isAttack: false, isDigit: false,
      run(c) { c.p.cuidu = true; c.log('淬毒生效：攻击技能将附带延迟毒伤'); } },
  ],
  '5': [
    { id: 'shangjin', name: '赏金', desc: '5伤，并按本回合已造成伤害n的⌈n/3⌉获得费用（含本次5伤）', star: false, isAttack: true, isDigit: false,
      run(c) { c.dmg(c.o, 5); const n = c.p.turnDmg; c.gain(Math.ceil(n / 3)); c.log(`赏金：本回合共${n}伤 → +${Math.ceil(n / 3)}$`); } },
    { id: 'touzi', name: '投资', desc: '费用先+3$再翻倍（封顶11）', star: false, isAttack: false, isDigit: false,
      run(c) { c.p.energy = Math.min(11, c.p.energy + 3); c.p.energy = Math.min(11, c.p.energy * 2); c.log(`投资：费用变为 ${c.p.energy}$`); } },
    { id: 'wudi', name: '无敌', desc: '免疫下次攻击（并+2血）及附带效果；未触发则一直保留', star: false, isAttack: false, isDigit: false,
      run(c) { c.p.wudi = true; c.log('无敌已就绪'); } },
  ],
  '6': [
    { id: 'yingneng', name: '盈能', desc: '+1$；此后你每n回合未攻击（n上限6），下次伤害+n（一次性）', star: false, isAttack: false, isDigit: false,
      run(c) { c.gain(1); c.p.yingneng = { active: true, idle: 0 }; c.log('盈能生效'); } },
    { id: 'jiubaK', name: '98K', desc: '9伤；本回合若已连续使用≥3次数字技能（一/三/四/八）且至少2种 → 114514秒杀（无视无敌/荆棘/假人）', star: false, isAttack: true, isDigit: false,
      run(c) {
        if (c.kill) { c.log('💥 98K 连携成功！114514 点伤害，无视一切！'); c.dmg(c.o, 114514, { ignoreWudi: true, ignoreJingji: true, bypassDummy: true }); }
        else c.dmg(c.o, 9);
      } },
    { id: 'qianghua', name: '强化', desc: '永久：所有带*技能的加血值+2', star: false, isAttack: false, isDigit: false,
      run(c) { c.p.qianghua = true; c.log('强化生效（永久）'); } },
    { id: 'bing', name: '冰！', desc: '+2血；对方接下来2回合无法行动（只能+1$）', star: false, isAttack: false, isDigit: false,
      run(c) { c.healSelf(2); c.o.freeze = Math.max(c.o.freeze, 2); c.log(`冰！：${c.o.name} 被冰封2回合`); } },
  ],
  '7': [
    { id: 'qibu', name: '七步', desc: '对方每回合结束时-4血；被净化1次降为-3，第2次解除；不触发无敌、不受增伤', star: false, isAttack: false, isDigit: false,
      run(c) { c.o.qibu = { stage: 1, owner: c.pIdx }; c.log(`七步：${c.o.name} 身中剧毒`); } },
    { id: 'shuangbei', name: '双倍圣水', desc: '此后你每回合额外+1$（可叠加）', star: false, isAttack: false, isDigit: false,
      run(c) { c.p.shuangbei = (c.p.shuangbei || 0) + 1; c.log(`双倍圣水生效（每回合额外+${c.p.shuangbei}$）`); } },
    { id: 'gongping', name: '公平正义', desc: '+1$；去除对方一个正面buff（荆棘/无敌/盈能/双倍圣水/呼吸回血/强化/鄙视/淬毒）', star: false, isAttack: false, isDigit: false,
      run(c) {
        c.gain(1);
        const list = positiveBuffs(c.o);
        if (!list.length) { c.log('公平正义：对方没有可去除的正面buff'); return; }
        const pick = (c.opts && c.opts.buffIdx != null && list[c.opts.buffIdx]) ? list[c.opts.buffIdx] : list[0];
        switch (pick.key) {
          case 'jingji': c.o.jingji = false; break;
          case 'wudi': c.o.wudi = false; break;
          case 'yingneng': c.o.yingneng.active = false; break;
          case 'shuangbei': c.o.shuangbei = 0; break;
          case 'huxi': c.o.huxi = false; break;
          case 'qianghua': c.o.qianghua = false; break;
          case 'bishi': c.o.bishi = false; break;
          case 'cuidu': c.o.cuidu = false; break;
        }
        c.log(`公平正义：去除了对方的【${pick.name}】`);
      } },
  ],
  '8': [
    { id: 'ba', name: '八', desc: '数字技能：+8$，获得再次行动', star: false, isAttack: false, isDigit: true, grantsAgain: true,
      run(c) { c.gain(8); } },
    { id: 'huxi', name: '呼吸回血', desc: '此后你每回合+1血', star: false, isAttack: false, isDigit: false,
      run(c) { c.p.huxi = true; c.log('呼吸回血生效'); } },
    { id: 'jijiu', name: '急救箱', desc: '回复10点生命（受强化影响：+12）', star: true, isAttack: false, isDigit: false,
      run(c) { c.healSelf(10 + (c.p.qianghua ? 2 : 0)); } },
    { id: 'duming', name: '赌命！', desc: '+4$、+6血并再次行动；6个你的回合（含释放回合）内未分胜负 → 血量清零直接败北（无视假人）；期间：每段伤害+3、攻击技能后+1$、瞬时伤害≥9可再次行动（整局限一次）', star: false, isAttack: false, isDigit: false, grantsAgain: true,
      run(c) { c.gain(4); c.healSelf(6); c.p.duming = { active: true, turnsLeft: 6, extraUsed: false }; c.log(`赌命！${c.p.name} 进入赌命状态（6回合倒计时）`); } },
  ],
  '9': [
    { id: 'youli', name: '尤里', desc: '+4$；你完全控制对方下个回合', star: false, isAttack: false, isDigit: false,
      run(c) { c.gain(4); c.o.controlledBy = c.pIdx; c.log(`尤里：${c.p.name} 将控制 ${c.o.name} 的下回合`); } },
    { id: 'yuandu', name: '元毒九泉', desc: '10伤，+3血，+2$，对方-2$', star: false, isAttack: true, isDigit: false,
      run(c) { const ok = c.dmg(c.o, 10); c.healSelf(3); c.gain(2); if (ok) { const e = c.o.energy; c.o.energy = Math.max(0, e - 2); c.log(`元毒：对方费用 ${e}$ → ${c.o.energy}$`); } } },
    { id: 'jidao', name: '极盗', desc: '1伤；对方费用清零，你获得其原费用⌈1/3⌉', star: false, isAttack: true, isDigit: false,
      run(c) { const e = c.o.energy; if (c.dmg(c.o, 1)) { c.o.energy = 0; c.gain(Math.ceil(e / 3)); c.log(`极盗：偷走 ${e}$ 费用，你获得 ${Math.ceil(e / 3)}$`); } } },
    { id: 'bishi', name: '鄙视', desc: '永久被动：每回合对方行动前，若你技能手数字>对方，你+1$、对方-1$', star: false, isAttack: false, isDigit: false,
      run(c) { c.p.bishi = true; c.log('鄙视生效（永久被动）'); } },
    { id: 'shipo', name: '识破', desc: '+1血，+6$；对方本体与假人血量互换，再对互换后的本体造成1伤（无假人则互换无效）', star: false, isAttack: true, isDigit: false,
      run(c) {
        c.healSelf(1); c.gain(6);
        if (c.o.wudi) { c.o.wudi = false; c.o.hp += 2; c.log('识破被无敌抵挡'); return; }
        if (c.o.dummy.alive) { const t = c.o.hp; c.o.hp = c.o.dummy.hp; c.o.dummy.hp = t; c.log(`识破：互换血量（本体${c.o.hp}，假人${c.o.dummy.hp}）`); }
        else c.log('识破：对方没有假人，互换无效');
        c.dmg(c.o, 1);
      } },
  ],
  '0': [
    { id: 'danxiao', name: '氮笑', desc: '+1$', star: false, isAttack: false, isDigit: false,
      run(c) { c.gain(1); } },
    { id: 'jinghua', name: '净化', desc: '+1血；解除自身所有延迟/持续伤害；七步：第1次降为-3，第2次解除', star: false, isAttack: false, isDigit: false,
      run(c) {
        c.healSelf(1);
        const nDelayed = c.p.delayed.length;
        c.p.delayed = [];
        if (c.p.qibu.stage === 1) { c.p.qibu.stage = 2; c.log('净化：七步降为每回合-3血'); }
        else if (c.p.qibu.stage === 2) { c.p.qibu.stage = 0; c.log('净化：七步已解除'); }
        else if (nDelayed) c.log(`净化：解除了${nDelayed}层延迟伤害`);
        else c.log('净化：+1血');
      } },
    { id: 'jiaren', name: '假人', desc: '获得1血假人（第二条命）；全局限1次（假人唐化可无限次，同时上限1）', star: false, isAttack: false, isDigit: false,
      run(c) {
        if (c.p.dummy.alive) { c.log('假人：已有假人，无法再召唤'); return; }
        if (!c.p.tanghua && c.p.dummy.castBefore) { c.log('假人：本局已使用过（全局限1次）'); return; }
        c.p.dummy = { alive: true, hp: 1, castBefore: true };
        c.log('🤖 假人已召唤（1血）');
      } },
    { id: 'jiarenqh', name: '假人强化', desc: '假人+2血（假人作战状态下无法使用）', star: false, isAttack: false, isDigit: false,
      run(c) {
        if (!c.p.dummy.alive) { c.log('假人强化：没有假人'); return; }
        if (c.p.inDummyCombat) { c.log('假人强化：假人作战中，无法强化'); return; }
        c.p.dummy.hp += 2; c.log(`假人强化：假人变为 ${c.p.dummy.hp} 血`);
      } },
  ],
};

module.exports = { SKILLS, positiveBuffs, solve24 };
