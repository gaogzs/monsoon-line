/* 发射架示例（目前没有舰船装）：kind 'launcher' + weapon（WEAPONS 的 id），
   cd 每发间隔、ammo 备弹（0 = 不限）、loft 发射时按距离抬高的比例、air / surface 打什么。
   mounts 里照常写 gun: 'lnchSam'，有实体模型就像炮塔一样转。 */
Registry.turretGun({ id: 'lnchSam', order: 70, name: T('turretGuns.lnchSam.name'), kind: 'launcher', weapon: 'vlar', cd: 6, ammo: 8, loft: 0.15,
           air: true, surface: false, launchSpeed: 160 });
