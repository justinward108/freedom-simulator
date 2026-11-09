// Freedom Simulator — seeded random numbers.
// The same seed and round always give the same dice, so results can be replayed and
// a server can resolve turns without anyone rerolling by refreshing.
(function (root) {
  const FS = (root.FS = root.FS || {});

  // Turn any string or number into a 32-bit seed.
  function hashSeed(...parts) {
    let h = 2166136261 >>> 0;
    const text = parts.join('|');
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // mulberry32: small, fast, good enough for dice.
  function makeRng(seed) {
    let a = seed >>> 0;
    function next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      next,
      d6: () => 1 + Math.floor(next() * 6),
      int: (n) => Math.floor(next() * n),
      pick: (list) => list[Math.floor(next() * list.length)],
    };
  }

  FS.rng = { hashSeed, makeRng };
})(globalThis);
