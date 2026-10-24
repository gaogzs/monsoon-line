/* 被动吊舱的两种防护要互相折算，不能一件吊舱两头都拉满：
     lockResist  缩短敌方锁定距离 —— 取所有吊舱里的最大值，不叠加
     ecmBonus    叠加到机体 ECM，削弱来袭弹的提前量 —— 每具都叠加
   折算口径：lockResist 0.10 ≈ 每具 ecmBonus 0.04（一组两具 ≈ 0.08 ECM）。
     ZUN-8  0.30 + 0.10/具   两头都给的通用干扰吊舱
     SAV-6  0.22 + 0.10/具   下游同款，抗锁弱一档
     GUS-9  0.15 + 0.03/具   本职是测距，干扰只是附带
     ZUN-4 / SAV-14          主动干扰机：不给 lockResist，只给 ECM */

/* ---------- 被动吊舱 ----------
   这几件不发射任何东西，装上去就一直在起作用。
   它们让"少带一枚弹"变成一个真实的取舍，而不只是纯损失。 */
Registry.weapon({
  order: 210,
  tags: ['passive'],
  id: 'ecm2', name: 'ZUN-8', cn: T('weapons.ecm2.cn'), kind: 'ecm',
  ecmBonus: 0.10,   // 每具吊舱叠加到机体 ECM 上（见 Ent.passiveEffects）
  model: 'pod',
  speed: 0, boost: 0, life: 0, vsLife: 0,
  turn: 0, seeker: 'none', lockCone: 0, lockDist: 0,
  dmg: 0, cd: 0, salvo: 0, flare: 1.0,
  target: 'none',
  lockResist: 0.30,
  /* 原文"拖曳式诱饵"—— 代码里它只有 lockResist，并不会把来袭弹引开。
     改成如实描述。 */
  desc: T('weapons.ecm2.desc'),
  stat: { dmg: 0, spd: 0, trn: 0, rng: 0, ecm: 0.92 },
  attr: { fits: ['tip', 'light', 'belly'], perPoint: 1,  mass: 240 },
  role: T('weapons.ecm2.role')
});
