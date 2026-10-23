/* ROK-40 的机载尾炮：与舰载 tail20 分开，射速降到 1/4（同机炮 rpm÷4 的规矩，见 cel3 等） */
Registry.turretGun({ id: 'tail20a', order: 40, name: T('turretGuns.tail20a.name'), cal: 20, rpm: 150, speed: 900, dmg: 5, range: 1200, spread: 0.006, drag: 2.4e-4 });
