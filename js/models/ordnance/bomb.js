Registry.model({
  id: 'bomb', order: 390,
  build: function (L) {
    var V = L.V, C = L.C, MB = L.MB, done = L.done;
    var b = new MB();
    b.tube(V(0, 0, -1.0), V(0, 0, 1.0), 0.24, 0.20, 6, C.green2, C.darker);
    b.wing(V(0.2, 0, -0.7), V(0.7, 0, -0.9), V(0.7, 0, -1.3), V(0.2, 0, -1.1), C.grey);
    b.wingM(V(0.2, 0, -0.7), V(0.7, 0, -0.9), V(0.7, 0, -1.3), V(0.2, 0, -1.1), C.grey);
    return done(b, { span: 1.4, len: 2.2 });
  }
});
