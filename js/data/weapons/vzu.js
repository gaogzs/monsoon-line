/* ============================================================
   下游同盟与分水群岛国的装备

   它们和上游共用逻辑语这套编号语言，但**词根分属两方**：
   DAR / BIN / BAD / SAV / TUM / BOX 只用在下游的挂架上
   （例如反舰弹，上游叫 SPO-（daspo 摧毁），下游叫 BOX-（boxna 浪））。

   fits 留空 = 玩家挂不上，只作为 NPC 的制式装备存在。

   给 NPC 备的那张挂点适配表叫 npcFits（见文件末尾"挂载属性"一节）。
   两张表必须分开：fits 空数组的语义是"没有实物可挂"，
   不是"挂不上"—— 渲染实体挂载时读错表，敌机的弹会被全部过滤掉。
   ============================================================ */

/* --- 下游：认知电子战是他们的看家本事 --- */
Registry.weapon({
  order: 400,
  tags: ['passive'],
  id: 'vzu', name: 'SAV-6', cn: T('weapons.vzu.cn'), kind: 'ecm',
  ecmBonus: 0.10,   // 每具吊舱叠加到机体 ECM 上（见 Ent.passiveEffects）
  model: 'pod',
  speed: 0, boost: 0, life: 0, vsLife: 0,
  turn: 0, seeker: 'none', lockCone: 0, lockDist: 0,
  dmg: 0, ammo: 0, cd: 6.8, salvo: 1, flare: 1.0,
  target: 'air',
  /* 顶层字段，不是嵌套的 passiveEffect。

     原来写的是 `passiveEffect: { lockResist: 0.30 }` —— 多包了一层，
     而 passiveEffects() 汇总时读的是 w.lockResist（顶层）。
     结果是这枚吊舱的锁抗加成**完全没有生效**：
     它是六个被动吊舱里唯一用嵌套写法的，其余五个都写顶层。 */
  lockResist: 0.22,
  fits: [], perPoint: 0, mass: 0,
  npcFits: ['light', 'belly'],
  desc: T('weapons.vzu.desc'),
  stat: { dmg: 0, spd: 0, trn: 0, rng: 0, ecm: 0.78 },
  role: T('weapons.vzu.role')
});
