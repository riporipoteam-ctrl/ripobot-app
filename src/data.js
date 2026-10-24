export const AVATAR_PRESETS = [
  { id: 'ripo', label: 'Ripo', tone: 'cyan', glyph: '◈' },
  { id: 'nova', label: 'Nova', tone: 'violet', glyph: '✦' },
  { id: 'ember', label: 'Ember', tone: 'amber', glyph: '◆' },
  { id: 'mint', label: 'Mint', tone: 'mint', glyph: '●' },
  { id: 'wave', label: 'Wave', tone: 'blue', glyph: '≈' },
  { id: 'pixel', label: 'Pixel', tone: 'rose', glyph: '▦' },
  { id: 'orbit', label: 'Orbit', tone: 'indigo', glyph: '◎' },
  { id: 'mono', label: 'Mono', tone: 'slate', glyph: '◇' }
];

export const STARTER_AGENTS = [
  {
    id: 'ripo',
    name: 'Ripo Bot',
    role: 'Main agent',
    description: 'Your lead agent. Plans work, delegates to the team, searches when needed, and keeps everything moving.',
    instructions: 'Act as the user’s main AI agent. Be practical, proactive, clear, and concise. Delegate to specialist agents when useful. Never claim a tool ran unless the app supplied a tool result.',
    avatar: 'ripo',
    state: 'ready',
    canRenameSelf: true,
    isPrimary: true
  },
  {
    id: 'scout',
    name: 'Scout',
    role: 'Research agent',
    description: 'Searches, compares sources, and turns messy information into a clean brief.',
    instructions: 'Act as a careful research agent. Separate facts from uncertainty, prefer current information, and cite tool results when they are provided.',
    avatar: 'nova',
    state: 'ready',
    canRenameSelf: true
  },
  {
    id: 'forge',
    name: 'Forge',
    role: 'Build agent',
    description: 'Handles coding plans, technical breakdowns, files, and computer work.',
    instructions: 'Act as a technical builder. Produce robust implementation plans, inspect files carefully, and explain what changed. Never invent successful execution.',
    avatar: 'mint',
    state: 'ready',
    canRenameSelf: true
  }
];

export const DEFAULT_CONVERSATIONS = {
  ripo: [
    {
      id: 'welcome-ripo',
      role: 'assistant',
      content: 'I’m Ripo Bot. Give me a goal and I can handle it myself or pull in the right agents.',
      createdAt: new Date().toISOString()
    }
  ]
};

export const QUICK_STARTS = [
  { title: 'Research something', prompt: 'Search the web and build me a short brief about ' },
  { title: 'Build a plan', prompt: 'Turn this idea into a practical step-by-step plan: ' },
  { title: 'Use the team', prompt: 'Create a small agent team for this task and split the work: ' },
  { title: 'Work with files', prompt: 'Review the files I attach and tell me the important findings.' }
];
