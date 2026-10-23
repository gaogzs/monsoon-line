Registry.target({
  order: 10,
  id: 'cell', model: 'cell',
  tags: ['regulator', 'cullFar'],
  gunResist: 0.75,   // 调节单元：打一个孔只是给它放气，低气压下也不会内爆
});
