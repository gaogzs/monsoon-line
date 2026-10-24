Registry.weapon({
  order: 170,
  tags: ['penetrator'],
  id: 'asl2', name: 'GUT-12', cn: T('weapons.asl2.cn'), kind: 'agm',
  model: 'missile',
  speed: 480, boost: 140, life: 10.0, vsLife: 22.0,
  turn: 0.90, seeker: 'radar', lockCone: 34 * Math.PI / 180, lockDist: 9000,
  dmg: 340,salvo: 1, flare: 0.75, blast: 45, blastCore: 10,
  target: 'ground',
  /* 侵彻：对加固目标（标签 hard，见 js/data/targets/）不打折，见 entities.js 的 warheadK */
  desc: T('weapons.asl2.desc'),
  stat: { dmg: 0.90, spd: 0.36, trn: 0.34, rng: 0.62, ecm: 0.30 },
  attr: { fits: ['heavy', 'belly'],        perPoint: 3,  mass: 520 },
  look: { len: 4.6, dia: 0.36, fin: 'cruise' },
  role: T('weapons.asl2.role'),
  /* 对地 / 对海 */
  /* SPO-8 追云**不在这里**。它原来被标成"反辐射弹"、要求 strike
     （对地火控），于是只有攻击机和多用途机能挂 —— 而它其实是一枚
     对空的重型拦截弹，最该带它的恰恰是制空/截击机（D-14、F-9），
     那些机型没有 strike，反而挂不上。那个门槛造成的是荒谬的分配，
     所以删掉。删掉 needs 之后，它只受 fits: ['heavy'] 约束 ——
     有重挂点的机型都能带。

     注意：**删的只是挂载门槛，不是"反辐射"这个语义。**
     当时它还背着另一个问题 ——「没有机制支撑」。现在世界里有了
     预警机与"雷达开机状态"，所以 antiRadar 写回去了（见上面的 arm
     条目与 entities.js 的 isRadiating）—— 只对正在辐射的空中目标
     （预警机、开机的干扰机）伤害翻倍，不打地面雷达站。 */
  needs: ['strike'], // 加固目标侵彻弹
  cd: 16,
  lead: 0.70,
  /* 对地 / 反大型：不装抗干扰设备，箔丝照样好使 */
  flareRD: 0.68 // GUT-12 凿岩
});
