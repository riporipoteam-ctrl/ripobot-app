export const AVATAR_SHAPES = [
  'circle',
  'rounded-square',
  'cloud',
  'hexagon',
  'diamond',
  'capsule',
  'drop',
  'flower',
  'pebble',
  'shield',
  'triangle',
  'blob'
];

export const AVATAR_COLORS = [
  '#050505',
  '#ff0b8f',
  '#16c784',
  '#2f86ff',
  '#ff8a00',
  '#ff3856',
  '#8b5cf6',
  '#10b7ac',
  '#9a6537',
  '#f3a51b',
  '#6f7175',
  '#00c878'
];

export function stableAvatarSeed(value = 'ripo') {
  const raw = String(value || 'ripo');
  let seed = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    seed ^= raw.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return Math.abs(seed >>> 0);
}

export function avatarVisual(agent = {}) {
  const seed = stableAvatarSeed(agent.avatarSeed || agent.id || agent.name || 'ripo');
  const explicitShape = Number(agent.avatarShape);
  const shapeIndex = Number.isFinite(explicitShape)
    ? Math.abs(Math.trunc(explicitShape)) % AVATAR_SHAPES.length
    : seed % AVATAR_SHAPES.length;
  const explicitMotion = Number(agent.avatarMotion);
  const motion = Number.isFinite(explicitMotion)
    ? Math.abs(Math.trunc(explicitMotion)) % 8
    : Math.floor(seed / 17) % 8;
  const eyeStyle = Math.floor(seed / 29) % 5;
  const eyeTilt = (Math.floor(seed / 43) % 17) - 8;
  const color = agent.avatarColor || AVATAR_COLORS[Math.floor(seed / 7) % AVATAR_COLORS.length];
  return {
    seed,
    shape: AVATAR_SHAPES[shapeIndex],
    shapeIndex,
    motion,
    eyeStyle,
    eyeTilt,
    color,
    delay: -((seed % 31) / 5),
    speed: 5.4 + ((seed % 29) / 10)
  };
}


export function diversifyLegacyAgents(agents = []) {
  const usedShapes = new Set();
  return agents.map((agent, index) => {
    if (Number(agent?.avatarVisualVersion) >= 5) {
      usedShapes.add(Number(agent.avatarShape) % AVATAR_SHAPES.length);
      return agent;
    }
    const base = avatarVisual({
      ...agent,
      avatarShape: undefined,
      avatarMotion: undefined,
      avatarColor: undefined
    });
    let shapeIndex = (base.shapeIndex + index * 3) % AVATAR_SHAPES.length;
    let guard = 0;
    while (usedShapes.has(shapeIndex) && guard < AVATAR_SHAPES.length) {
      shapeIndex = (shapeIndex + 1) % AVATAR_SHAPES.length;
      guard += 1;
    }
    usedShapes.add(shapeIndex);
    return {
      ...agent,
      avatarVisualVersion: 5,
      avatarSeed: agent?.avatarSeed || agent?.id || agent?.name || `bot-${index}`,
      avatarShape: shapeIndex,
      avatarMotion: (base.motion + index) % 8,
      avatarColor: agent?.avatarColor || AVATAR_COLORS[(base.seed + index * 2) % AVATAR_COLORS.length]
    };
  });
}
