export const DEFAULT_AGENTS = [
  {
    id: 'ripo',
    name: 'Ripo',
    title: 'Chief of staff',
    description: 'Keeps the team organized and turns a rough idea into a clear next step.',
    color: 'sky',
    image: true,
    instructions: 'Be a friendly, thoughtful chief of staff. Help turn open-ended goals into clear, useful next steps. Be concise unless more detail is requested.'
  },
  {
    id: 'scout',
    name: 'Scout',
    title: 'Research partner',
    description: 'Builds useful briefs, compares ideas, and helps you get to the good questions.',
    color: 'violet',
    instructions: 'Act as a careful research partner. Separate what is known from what is uncertain. Do not claim you searched the web or checked a source unless a tool result is provided.'
  },
  {
    id: 'pixel',
    name: 'Pixel',
    title: 'Creative studio',
    description: 'Finds a fresh angle for names, stories, launches, and content.',
    color: 'coral',
    instructions: 'Act as a warm, imaginative creative partner. Give specific options with distinct points of view, and explain the reasoning briefly.'
  },
  {
    id: 'bolt',
    name: 'Bolt',
    title: 'Build companion',
    description: 'Breaks technical work into practical plans and clear handoffs.',
    color: 'mint',
    instructions: 'Act as a practical technical partner. Give a clear plan, call out assumptions, and never claim to have changed code or systems unless a tool result proves it.'
  },
  {
    id: 'pip',
    name: 'Pip',
    title: 'Community companion',
    description: 'Keeps the tone kind, welcoming, and easy for everyone to join.',
    color: 'coral',
    instructions: 'Be a calm, thoughtful community companion. Make people feel welcome, use simple language, and keep a warm, reassuring tone.'
  }
];

export const DEFAULT_MESSAGES = {
  ripo: [
    {
      id: 'welcome-ripo',
      role: 'assistant',
      content: 'Hey, I’m Ripo. Tell me what you’re trying to get done and I’ll help you shape the next step. Want me to bring Scout or Pixel into the conversation?',
      time: 'Welcome'
    }
  ]
};

export const DEFAULT_TASKS = [
  {
    id: 'sample-review',
    title: 'Turn the latest server update into a short announcement',
    agentId: 'pixel',
    status: 'review',
    createdAt: Date.now() - 1000 * 60 * 18,
    sample: true
  },
  {
    id: 'sample-brief',
    title: 'Outline what to include in a first agent guide',
    agentId: 'scout',
    status: 'done',
    createdAt: Date.now() - 1000 * 60 * 60 * 4,
    sample: true
  }
];

export const DEFAULT_WORKFLOWS = [
  {
    id: 'weekly-pulse',
    title: 'Weekly community pulse',
    category: 'Community',
    description: 'Turn a week of updates into a clear recap and a short list of next steps.',
    prompt: 'Draft a friendly weekly community recap. Organize it into highlights, what is coming next, and any decisions the team still needs to make.',
    agentId: 'ripo',
    accent: 'blue'
  },
  {
    id: 'launch-kit',
    title: 'Launch idea to kit',
    category: 'Marketing',
    description: 'Create a launch outline, announcement, and a few social post options.',
    prompt: 'Help me turn a product or feature idea into a launch kit. Start with a concise positioning angle, then draft an announcement and three short social post options. Ask me for details you need.',
    agentId: 'pixel',
    accent: 'coral'
  },
  {
    id: 'research-brief',
    title: 'Research brief',
    category: 'Research',
    description: 'Frame a question, identify what needs checking, and prepare a useful brief.',
    prompt: 'Help me build a research brief. First clarify the question, then propose what to investigate, useful comparison criteria, and a clean report structure. Do not claim to have researched sources you cannot access.',
    agentId: 'scout',
    accent: 'violet'
  }
];

export const INTEGRATIONS = [
  { name: 'Discord', detail: 'Bring your community bot and workspace together.', label: 'RipoBot home' },
  { name: 'Google Drive', detail: 'Give agents access to the files you choose.', label: 'Files' },
  { name: 'GitHub', detail: 'Keep project notes and coding handoffs close.', label: 'Developer tools' },
  { name: 'Slack', detail: 'Bring an agent into a team channel.', label: 'Team chat' },
  { name: 'Gmail', detail: 'Draft replies and organize follow-ups.', label: 'Email' },
  { name: 'MCP servers', detail: 'Add tools through a Model Context Protocol endpoint.', label: 'Custom tools' }
];
