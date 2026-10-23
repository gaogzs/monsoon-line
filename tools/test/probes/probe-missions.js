/* 探针：逐关检查"把敌人清空之后到底能不能赢"。
   冒烟测试只保证 30 秒不崩、无 NaN，抓不到"胜利条件不可达"这类设计 bug。
   做法：后台模拟（tools/lib/sim.js）→ startMission(i) → 每 0.5 s 无条件清零所有敌机与敌方设施
   → 看 mission.win(world) 是否在合理时间内变成 true。
   固定种子：同一份代码每次跑出同样的结果。
   用法：node tools/test/probes/probe-missions.js [--seed N] */
'use strict';
const Sim = require('../../lib/sim');
const args = process.argv.slice(2);
const SEED = args.includes('--seed') ? +args[args.indexOf('--seed') + 1] : 1;
const S = Sim.load({ seed: SEED });
const G = S.sandbox.Game;
const MISSIONS = S.sandbox.MISSIONS;
const EntP = S.sandbox.Ent;

console.log('== 可完成性探针：清空敌人后能否取胜 ==\n');
const rows = [];
const bad = [];

for (let mi = 0; mi < MISSIONS.length; mi++) {
  const m = MISSIONS[mi];
  let err = null, won = false, wonAt = -1, lostAt = -1;
  let mountIssues = [];
  try {
    /* 每关开始前清空挂载问题记录：NPC 挂载写错时 mountPlan 会记一条，
       而这条只有真正把那一型飞起来才会出现 —— sk1 的七种随机机型
       在冒烟测试里根本不会被生成。 */
    EntP.clearMountIssues();
    G.startMission(mi);
    const w = G.__world();
    const pl = G.__player();
    pl.hp = pl.maxHp = 1e9;              // 玩家不死，排除"被打下来"的干扰

    const FPS = 60, LIMIT = 150;         // 最多跑 150 秒游戏时间
    for (let f = 0; f < FPS * LIMIT; f++) {
      // 每 0.5 秒清一次：新生成的增援/波次也一并清掉
      if (f % 30 === 0) {
        for (const a of w.actors) if (a.team === 1) a.alive = false;
        for (const t of w.targets) if (t.team === 1) { t.alive = false; t.dead = true; }
        // 玩家无敌（每帧都被 stepAircraft 写回，所以这里也补一次）
        pl.hp = pl.maxHp;
        pl.alive = true;
      }
      S.step(1 / 60);
      if (wonAt < 0 && m.win(w)) { won = true; wonAt = f / FPS; }
      if (lostAt < 0 && m.lose(w)) lostAt = f / FPS;
      if (wonAt >= 0) break;
    }
    mountIssues = (EntP.mountIssues || []).slice();
    /* 收尾诊断：胜不了的时候，把"卡在哪个条件上"打出来 */
    if (wonAt < 0) {
      const w2 = w;
      let liveFoe = 0, liveTgt = 0;
      for (const a of w2.actors) if (a.team === 1 && a.alive) liveFoe++;
      for (const t of w2.targets) if (t.team === 1 && t.alive) liveTgt++;
      let relay = 0, cellcnt = 0, lander = 0;
      for (const t of w2.targets) {
        if (!t.alive) continue;
        if (t.model === 'relay') relay++;
        if (t.model === 'cell') cellcnt++;
        if (t.model === 'seascorpion') lander++;
      }
      console.log('   [诊断 ' + m.id + '] 存活敌机=' + liveFoe + ' 存活敌目标=' + liveTgt +
        ' relay=' + relay + ' cell=' + cellcnt + ' 登陆舰=' + lander +
        ' ambushDone=' + !!w2.flags.ambushDone +
        ' skBatch=' + w2.skBatch +
        ' 已投放批次=' + (w2.skQueue ? w2.skQueue.filter(b => b.spawned).length : '—') +
        ' timeLeft=' + (w2.timeLeft === undefined ? '—' : w2.timeLeft.toFixed(1)));
    }
  } catch (e) {
    err = e.message + '  @  ' + (e.stack || '').split('\n')[1];
  }

  let verdict;
  if (err) verdict = 'THROW';
  else if (mountIssues.length) verdict = 'MOUNT';
  else if (!won) verdict = 'UNREACHABLE';
  else if (lostAt >= 0 && lostAt < wonAt) verdict = 'LOSE-FIRST';
  else verdict = 'OK';

  rows.push({ mi, id: m.id, name: m.name, verdict, wonAt, lostAt, err, mountIssues });
  if (verdict !== 'OK') {
    bad.push(m.id + ' ' + verdict + (err ? ' (' + err + ')' : '') +
      (mountIssues.length ? '\n      ' + mountIssues.join('\n      ') : ''));
  }
}

for (const r of rows) {
  const flag = r.verdict === 'OK' ? 'OK  ' : '!!  ';
  console.log(flag + String(r.mi).padStart(2) + ' ' + r.id.padEnd(4) + ' ' +
    r.name.padEnd(8) + ' ' + r.verdict.padEnd(12) +
    'win@' + (r.wonAt < 0 ? '—' : r.wonAt.toFixed(1) + 's') +
    '  lose@' + (r.lostAt < 0 ? '—' : r.lostAt.toFixed(1) + 's') +
    '  mount=' + (r.mountIssues ? r.mountIssues.length : 0) +
    (r.err ? '  ' + r.err : ''));
}
console.log('\n' + (bad.length ? '问题：\n  ' + bad.join('\n  ')
  : '全部 ' + rows.length + ' 关：清空敌人后都能取胜，且没有 NPC 挂载问题'));
process.exitCode = bad.length ? 1 : 0;      // 有关卡打不赢 / 抛异常 / NPC 挂载写错 → 非零，可当门禁
