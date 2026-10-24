/* ---------- 导弹 / 炸弹小模型 ---------- */
Registry.model({
  id: 'missile', order: 380,
  build: function (L) {
    var V = L.V, C = L.C, MB = L.MB, done = L.done;
    var b = new MB();
    b.tube(V(0, 0, -1.4), V(0, 0, 1.4), 0.14, 0.14, 6, C.white, C.metal);
    b.quad(b.pt(-0.05, 0, 1.4), b.pt(0.05, 0, 1.4), b.pt(0, 0, 2.0), b.pt(0, 0, 2.0), C.metal);
    b.wing(V(0.105, 0, -0.6), V(0.62, 0, -1.0), V(0.62, 0, -1.5), V(0.105, 0, -1.1), C.grey);
    b.wingM(V(0.105, 0, -0.6), V(0.62, 0, -1.0), V(0.62, 0, -1.5), V(0.105, 0, -1.1), C.grey);
    b.wing(V(0, 0.105, -0.6), V(0, 0.55, -1.0), V(0, 0.55, -1.5), V(0, 0.105, -1.1), C.grey);
    b.wing(V(0, -0.105, -0.6), V(0, -0.55, -1.0), V(0, -0.55, -1.5), V(0, -0.105, -1.1), C.grey);
    return done(b, { span: 1.3, len: 3.4 });
  }
});
