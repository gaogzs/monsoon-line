'use strict';

/* ============================================================
   战役

   一场战役 = 一组关卡的编组，外加一份"这场仗是什么"的展示文案。
   MISSIONS 仍然是**全局顺序**的权威来源 —— 关卡编号、finish()、
   btnNext 全部按它来；CAMPAIGNS 只负责"把哪几关归到一面旗下"。

   （v3.0.0 起 CAMPAIGNS 按关卡 id 引用，registry 封存时换成全局下标；下面的下标说明是旧写法的历史。）

   为什么 missions 里存的是**显式下标数组**，而不是 slice 或 length：
   CAMPAIGNS 在这里就定义了，而 MISSIONS 要到文件末尾才填满。
   用动态长度写会得到 0，而且还得依赖脚本内语句的先后顺序。

   加新战役：往下 push 一项，把它的关卡下标接着写进 missions，
   再在文件末尾按同样的全局顺序 MISSIONS.push 那些关卡即可。
   game.js 不用动。

   每关恰好属于一个战役这件事由 preflight() 兜底检查 ——
   漏挂的关卡会在世界里存在、但谁都选不到，是最容易静默发生的一类错误。
   ============================================================ */

Registry.campaign({
  order: 10,
  id: 'cmp1',
  no: 'CAMPAIGN 01',
  name: T('campaigns.cmp2.name'),
  en: 'WATERSHED',
  sub: 'OPERATION WATERSHED',
  loc: T('campaigns.cmp2.loc'),
  period: '2078.03.14 – 2078.04.25',
  desc: T('campaigns.cmp2.desc'),
  /* 数组下标 11（补给线 m9，04.16）排在 m8 之后，12（舷对舷 m11，04.22）排在指挥所 m12 之前 —— 按日期。
     id 和 OPERATION 编号按游玩顺序排，数组下标只是追加的先后 */
  missions: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10', 'm11', 'm12']
});

/* 第二场战役：没有名字的那片空域。
   停火没有条约，只有"第四周"这个说法 —— 它不是一段时间，是一种
   自我安慰的语法：又一周过去了，谁都没承认自己还在打。 */
Registry.campaign({
  order: 20,
  id: 'cmp2',
  no: 'CAMPAIGN 02',
  name: T('campaigns.cmp2.name_2'),
  en: 'THE FOURTH WEEK',
  sub: 'OPERATION NO MAN\u0027S AIR',
  loc: T('campaigns.cmp2.loc_2'),
  period: T('campaigns.cmp2.period'),
  desc: T('campaigns.cmp2.desc_2'),
  missions: ['sk1']
});
