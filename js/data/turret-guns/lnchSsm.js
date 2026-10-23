/* 旋转反舰弹发射架：和 lnchSam 同一套（转向目标再出膛），只是弹换成 ssm、只打海面。
   甲板下有弹库（现实里 Mk 26 那一类）：备弹是发射口的几倍，每发一次装填 reload 秒（10–30 s 随机） */
Registry.turretGun({ id: 'lnchSsm', order: 80, name: T('turretGuns.lnchSsm.name'), kind: 'launcher', weapon: 'ssm', cd: 8, reload: [10, 30], ammo: 4, loft: 0.05,
           air: false, surface: true, launchSpeed: 60 });
