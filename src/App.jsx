import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUp,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Cloud,
  Command,
  Computer,
  Copy,
  Download,
  File,
  FileText,
  Folder,
  Globe2,
  HardDrive,
  Home,
  Image,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  SquareTerminal,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
  Zap,
  Palette,
  WalletCards,
  Plug,
  Mic,
  Phone,
  PhoneOff,
  Volume2,
  Camera,
  Coins,
  Gauge,
  ChevronRight,
  Crown,
  Shield,
  RefreshCw,
  BriefcaseBusiness,
  Images,
  Video,
  Mail,
  CalendarDays,
  Github,
  ExternalLink,
  UserPlus,
  Ban,
  TriangleAlert
} from 'lucide-react';
import { AVATAR_PRESETS, DEFAULT_CONVERSATIONS, QUICK_STARTS, STARTER_AGENTS } from './data.js';
import { avatarVisual, AVATAR_COLORS, AVATAR_SHAPES, diversifyLegacyAgents } from './avatar-visual.js';
import { preferredRecorderMime, stopVoiceSession, voiceRateForAgent } from './voice-utils.js';

const API_BASE = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_BASE_URL || 'https://ripobot-api.ripo-ripoteam.workers.dev');

const LOCAL_KEYS = {
  session: 'ripobot.session.v2',
  profile: 'ripobot.profile.v2',
  agents: 'ripobot.agents.v2',
  conversations: 'ripobot.conversations.v2',
  teams: 'ripobot.teams.v2',
  files: 'ripobot.files.v2',
  onboarded: 'ripobot.onboarded.v2',
  theme: 'ripobot.theme.v3',
  accent: 'ripobot.accent.v4',
  archivedChats: 'ripobot.archived.v4',
  activeWorkspace: 'ripobot.workspace.v4'
};

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The app stays usable if browser storage is blocked.
  }
}

function storedToken() {
  try {
    const session = JSON.parse(localStorage.getItem(LOCAL_KEYS.session) || 'null');
    return session?.token || '';
  } catch { return ''; }
}

async function api(path, options = {}) {
  const token = storedToken();
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json().catch(() => ({})) : await response.text();
  if (!response.ok) {
    const error = new Error(data?.error || data || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function uid(prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cls(...parts) {
  return parts.filter(Boolean).join(' ');
}

function mergeAgentMailboxIntoConversations(current, exchanges, mirrorThreadKey = '', currentSourceAgentId = '') {
  const next = {};
  for (const [key, value] of Object.entries(current || {})) next[key] = Array.isArray(value) ? [...value] : [];
  const seen = new Set(Object.values(next).flat().map((message) => message?.id).filter(Boolean));

  const pushUnique = (threadKey, message) => {
    if (!threadKey || !message?.id || seen.has(message.id)) return;
    if (!next[threadKey]) next[threadKey] = [];
    next[threadKey].push(message);
    seen.add(message.id);
  };

  for (const exchange of Array.isArray(exchanges) ? exchanges : []) {
    if (!exchange?.id || !exchange?.targetAgentId || !exchange?.sourceAgentId) continue;
    const createdAt = exchange.createdAt ? new Date(Number(exchange.createdAt)).toISOString() : new Date().toISOString();
    pushUnique(exchange.targetAgentId, {
      id: `mailbox:${exchange.id}:request`,
      role: 'assistant',
      content: `Task from ${exchange.sourceAgentName}: ${exchange.task}`,
      createdAt,
      agentId: exchange.sourceAgentId,
      botMessage: true,
      mailboxId: exchange.id
    });
    if (exchange.reply) {
      const targetReply = {
        id: `mailbox:${exchange.id}:reply`,
        role: 'assistant',
        content: exchange.reply,
        createdAt,
        agentId: exchange.targetAgentId,
        botMessage: true,
        mailboxId: exchange.id
      };
      pushUnique(exchange.targetAgentId, targetReply);
      pushUnique(exchange.sourceAgentId, {
        ...targetReply,
        id: `mailbox:${exchange.id}:source-reply`
      });
      if (mirrorThreadKey && currentSourceAgentId === exchange.sourceAgentId && mirrorThreadKey !== exchange.sourceAgentId) {
        pushUnique(mirrorThreadKey, {
          ...targetReply,
          id: `mailbox:${exchange.id}:mirror-reply`
        });
      }
    }
  }

  for (const key of Object.keys(next)) {
    next[key].sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  }
  return next;
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

function avatarSeed(agent, preset) {
  const raw = String(agent?.avatarSeed || agent?.id || preset?.id || 'ripo');
  return raw.split('').reduce((sum, char, index) => (sum + char.charCodeAt(0) * (index + 3)) % 100003, 17);
}

function AvatarShapeSvg({ visual }) {
  const shape = (() => {
    switch (visual.shape) {
      case 'circle':
        return <circle cx="50" cy="50" r="42" />;
      case 'rounded-square':
        return <rect x="10" y="10" width="80" height="80" rx="23" />;
      case 'cloud':
        return <path d="M23 69C10 67 8 51 18 44C15 28 31 18 44 25C53 11 75 17 77 34C92 35 98 51 89 61C83 72 68 75 56 71C47 80 31 79 23 69Z" />;
      case 'hexagon':
        return <path d="M50 7L86 27L91 66L61 90L22 84L7 48L23 17Z" />;
      case 'diamond':
        return <path d="M50 6L91 43L75 88L27 91L7 50L27 14Z" />;
      case 'capsule':
        return <rect x="7" y="24" width="86" height="52" rx="26" />;
      case 'drop':
        return <path d="M52 5C68 26 87 39 87 60C87 79 72 92 52 92C31 92 15 79 15 59C15 39 34 25 52 5Z" />;
      case 'flower':
        return <path d="M50 8C61 8 67 17 68 27C79 19 91 26 92 38C94 48 87 55 78 59C88 65 87 78 79 85C70 93 60 88 53 80C48 91 34 94 25 86C17 79 19 68 28 60C15 58 9 47 14 36C19 25 31 23 40 29C40 18 41 8 50 8Z" />;
      case 'pebble':
        return <path d="M17 31C28 12 63 6 81 22C96 36 91 68 74 82C56 96 24 91 13 72C5 58 8 45 17 31Z" />;
      case 'shield':
        return <path d="M50 6L88 20V48C88 69 74 84 50 94C26 84 12 69 12 48V20L50 6Z" />;
      case 'triangle':
        return <path d="M49 8C53 8 57 11 60 17L91 73C96 82 90 91 79 91H21C10 91 4 82 9 73L40 17C43 11 46 8 49 8Z" />;
      default:
        return <path d="M17 30C27 13 49 9 65 16C82 12 94 27 91 45C97 61 86 79 70 82C58 95 35 93 26 80C9 76 3 57 12 43C9 38 11 34 17 30Z" />;
    }
  })();
  const eyeWidths = [8, 7, 10, 6, 9];
  const eyeHeights = [25, 20, 19, 28, 22];
  const width = eyeWidths[visual.eyeStyle] || 8;
  const height = eyeHeights[visual.eyeStyle] || 24;
  const top = 50 - height / 2;
  return (
    <svg className="avatar-svg" viewBox="0 0 100 100" aria-hidden="true">
      <g className={cls('avatar-shape-svg', `shape-${visual.shape}`)} fill="var(--avatar-color)">{shape}</g>
      <g className={cls('avatar-face-svg', `eye-style-${visual.eyeStyle}`)} fill="#fff">
        <rect x={38 - width / 2} y={top} width={width} height={height} rx={Math.min(width, height) / 2} transform={`rotate(${visual.eyeTilt} 38 50)`} />
        <rect x={62 - width / 2} y={top} width={width} height={height} rx={Math.min(width, height) / 2} transform={`rotate(${-visual.eyeTilt} 62 50)`} />
      </g>
    </svg>
  );
}

function Avatar({ agent, size = 'md', active = false, interactive = false, onClick }) {
  const preset = AVATAR_PRESETS.find((item) => item.id === agent?.avatar) || AVATAR_PRESETS[0];
  const state = agent?.state || 'ready';
  const visual = avatarVisual({ ...agent, avatarSeed: agent?.avatarSeed || agent?.id || preset?.id });
  const Tag = interactive ? 'button' : 'span';
  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={interactive ? onClick : undefined}
      className={cls('agent-avatar', `avatar-${size}`, `avatar-geometry-${visual.shape}`, `motion-${visual.motion}`, `state-${state}`, active && 'is-active', interactive && 'is-clickable')}
      style={{ '--avatar-color': visual.color, '--avatar-delay': `${visual.delay.toFixed(2)}s`, '--avatar-speed': `${visual.speed.toFixed(1)}s` }}
      aria-label={interactive ? `Open ${agent?.name || 'bot'} details` : undefined}
      aria-hidden={interactive ? undefined : 'true'}
    >
      <span className="avatar-halo" />
      <span className="avatar-core"><AvatarShapeSvg visual={visual} /></span>
      <span className="avatar-status-dot" />
    </Tag>
  );
}

function StateLabel({ state = 'ready' }) {
  const labels = {
    ready: 'Ready',
    thinking: 'Thinking',
    searching: 'Searching',
    working: 'Working',
    waiting: 'Waiting',
    done: 'Done',
    error: 'Needs attention'
  };
  return <span className={cls('state-label', `state-${state}`)}><i />{labels[state] || 'Ready'}</span>;
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <section className={cls('modal-card', wide && 'modal-wide')} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <div>
            <span className="eyebrow">Ripo Bot</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const payload = mode === 'register' ? { name: form.name.trim(), email: form.email.trim(), password: form.password } : { email: form.email.trim(), password: form.password };
      const data = await api(`/api/auth/${mode === 'register' ? 'register' : 'login'}`, { method:'POST', body:JSON.stringify(payload) });
      onAuthenticated({ profile:data.user, cloud:true, token:data.token, expiresAt:data.expiresAt, account:data });
    } catch (err) { setError(err.message || 'Could not sign in.'); }
    finally { setBusy(false); }
  }

  if (!showForm) {
    const floaters = [
      {id:'welcome-a',avatar:'ripo',avatarSeed:'welcome-a',avatarShape:2,avatarMotion:5,avatarColor:'#11c58c'},
      {id:'welcome-b',avatar:'nova',avatarSeed:'welcome-b',avatarShape:0,avatarMotion:1,avatarColor:'#f42f8f'},
      {id:'welcome-c',avatar:'mint',avatarSeed:'welcome-c',avatarShape:5,avatarMotion:6,avatarColor:'#7b5cf2'},
      {id:'welcome-d',avatar:'wave',avatarSeed:'welcome-d',avatarShape:1,avatarMotion:3,avatarColor:'#168cf7'},
      {id:'welcome-e',avatar:'ember',avatarSeed:'welcome-e',avatarShape:3,avatarMotion:7,avatarColor:'#ff7a18'},
      {id:'welcome-f',avatar:'mono',avatarSeed:'welcome-f',avatarShape:8,avatarMotion:2,avatarColor:'#9b6b3f'},
      {id:'welcome-g',avatar:'pixel',avatarSeed:'welcome-g',avatarShape:10,avatarMotion:4,avatarColor:'#ef3f49'},
      {id:'welcome-h',avatar:'orbit',avatarSeed:'welcome-h',avatarShape:6,avatarMotion:0,avatarColor:'#11b9b0'}
    ];
    return <main className="welcome-v4">
      <div className="welcome-floaters">{floaters.map((agent,index)=><span key={agent.id} className={`welcome-floater floater-${index}`}><Avatar agent={agent} size={index%3===0?'lg':'md'}/></span>)}</div>
      <div className="welcome-center"><div className="welcome-logo"><Avatar agent={{...STARTER_AGENTS[0],avatarSeed:'welcome-main'}} size="lg"/></div><h1>Ripo Bot</h1><p>Your team of always-on bots that finish the work.</p></div>
      <div className="welcome-bottom"><button className="welcome-login" onClick={()=>setShowForm(true)}>Log In or Sign Up</button><small>By using Ripo Bot, you agree to the workspace rules and privacy terms.</small></div>
    </main>;
  }

  return <main className="auth-form-v4">
    <button className="auth-back-v4" onClick={()=>{setShowForm(false);setError('');}}><ArrowLeft size={19}/></button>
    <section className="auth-card-v4">
      <Avatar agent={{...STARTER_AGENTS[0],avatarSeed:'auth-form-main'}} size="lg"/>
      <h1>{mode==='login'?'Welcome back':'Create your Ripo Bot account'}</h1>
      <p>{mode==='login'?'Sign in to continue with your bots and workspaces.':'Your bots, chats, files, usage, and coins stay with this account.'}</p>
      <div className="auth-tabs-v4"><button className={cls(mode==='login'&&'active')} onClick={()=>{setMode('login');setError('');}}>Log in</button><button className={cls(mode==='register'&&'active')} onClick={()=>{setMode('register');setError('');}}>Sign up</button></div>
      <form onSubmit={submit} className="auth-form clean-auth-form">
        {mode==='register'&&<label><span>Name</span><input value={form.name} onChange={(event)=>setForm({...form,name:event.target.value})} placeholder="Your name" autoComplete="name" required/></label>}
        <label><span>Email</span><input type="email" value={form.email} onChange={(event)=>setForm({...form,email:event.target.value})} placeholder="you@example.com" autoComplete="email" required/></label>
        <label><span>Password</span><input type="password" minLength={8} value={form.password} onChange={(event)=>setForm({...form,password:event.target.value})} placeholder="At least 8 characters" autoComplete={mode==='login'?'current-password':'new-password'} required/></label>
        {error&&<div className="auth-error">{error}</div>}
        <button className="welcome-login" disabled={busy}>{busy?<LoaderCircle className="spin" size={18}/>:null}{mode==='login'?'Log in':'Create account'}</button>
      </form>
      <div className="auth-security"><ShieldCheck size={15}/><span>Credentials and model keys stay server-side.</span></div>
    </section>
  </main>;
}

function Onboarding({ profile, onDone }) {
  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState(profile?.name || '');
  const [role, setRole] = useState('Chief of Staff');
  const [starter, setStarter] = useState(['scout','forge']);
  const [avatarConfig, setAvatarConfig] = useState({ avatarSeed:uid('avatar'), avatarColor:'#111111', avatarShape:0, avatarMotion:0 });

  function randomize() {
    const colors=['#111111','#7b5cf2','#168cf7','#11c58c','#ff7a18','#f42f8f','#ef3f49','#11b9b0'];
    setAvatarConfig({avatarSeed:uid('avatar'),avatarColor:colors[Math.floor(Math.random()*colors.length)],avatarShape:Math.floor(Math.random()*AVATAR_SHAPES.length),avatarMotion:Math.floor(Math.random()*8)});
  }
  function finish() { onDone({displayName:displayName.trim()||'Ripo Bot user',goal:'everything',starter,mainRole:role.trim()||'Chief of Staff',mainAvatar:avatarConfig}); }

  return <main className="onboarding-v4">
    <header className="onboarding-v4-head"><button onClick={()=>step>0&&setStep(step-1)} className={cls('onboarding-back',step===0&&'hidden')}><ArrowLeft size={18}/></button><span>{step+1} of 3</span><button className="onboarding-skip" onClick={finish}>Skip</button></header>
    <div className="onboarding-carousel">
      {step===0&&<section className="onboarding-slide"><div className="onboarding-art"><Avatar agent={{...STARTER_AGENTS[0],...avatarConfig,state:'thinking'}} size="xl"/></div><span className="slide-kicker">Meet your main bot</span><h1>Ripo Bot starts with you.</h1><p>It can work alone, create specialists, search, use the computer, generate images, and coordinate a team.</p><label className="onboarding-field"><span>What should Ripo Bot call you?</span><input value={displayName} onChange={(event)=>setDisplayName(event.target.value)} placeholder="Your name" autoFocus/></label><button className="welcome-login" onClick={()=>setStep(1)}>Continue</button></section>}
      {step===1&&<section className="onboarding-slide"><div className="onboarding-art bot-role-art"><Avatar agent={{...STARTER_AGENTS[0],...avatarConfig}} size="xl"/><button onClick={randomize}><RefreshCw size={15}/>Randomize avatar</button></div><span className="slide-kicker">Give your bot a role</span><h1>What job should it own?</h1><p>This becomes the main bot’s starting role. You can rename it, change the role, or let it evolve later.</p><label className="onboarding-field"><span>Role</span><input value={role} onChange={(event)=>setRole(event.target.value)} placeholder="Chief of Staff"/></label><div className="role-suggestions">{['Chief of Staff','Personal Assistant','Project Lead','Research Lead'].map((item)=><button key={item} onClick={()=>setRole(item)}>{item}</button>)}</div><button className="welcome-login" onClick={()=>setStep(2)}>Continue</button></section>}
      {step===2&&<section className="onboarding-slide wide-slide"><div className="onboarding-team-art"><Avatar agent={{...STARTER_AGENTS[0],...avatarConfig}} size="lg"/>{STARTER_AGENTS.slice(1).map((agent)=><Avatar key={agent.id} agent={{...agent,avatarSeed:`onboard-${agent.id}`}} size="lg"/>)}</div><span className="slide-kicker">Use many bots at once</span><h1>Choose your starter team.</h1><p>Ripo Bot is always included. Add specialists now or create completely different bots later.</p><div className="starter-list-v4">{STARTER_AGENTS.slice(1).map((agent)=>{const selected=starter.includes(agent.id);return <button key={agent.id} className={cls(selected&&'selected')} onClick={()=>setStarter(selected?starter.filter((id)=>id!==agent.id):[...starter,agent.id])}><Avatar agent={{...agent,avatarSeed:`starter-${agent.id}`}} size="md"/><span><strong>{agent.name}</strong><small>{agent.role}</small></span><i>{selected?<Check size={13}/>:null}</i></button>;})}</div><button className="welcome-login" onClick={finish}>Enter Ripo Bot</button></section>}
    </div>
  </main>;
}

function AgentEditor({ initialAgent, onSave, onClose }) {
  const editing = Boolean(initialAgent);
  const [form, setForm] = useState(initialAgent || {
    name: '',
    role: '',
    description: '',
    instructions: '',
    avatar: 'nova',
    avatarSeed: uid('avatar'),
    avatarShape: Math.floor(Math.random() * AVATAR_SHAPES.length),
    avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    avatarMotion: Math.floor(Math.random() * 8),
    canRenameSelf: true
  });

  function randomizeAvatar() {
    setForm((current) => ({
      ...current,
      avatarSeed: uid('avatar'),
      avatarShape: Math.floor(Math.random() * AVATAR_SHAPES.length),
      avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      avatarMotion: Math.floor(Math.random() * 8)
    }));
  }

  return (
    <Modal title={editing ? 'Edit Bot' : 'Create New Bot'} onClose={onClose}>
      <div className="agent-editor-v5">
        <div className="agent-editor-preview-v5">
          <Avatar agent={{ ...form, id: form.avatarSeed || 'preview' }} size="xl" />
          <button type="button" onClick={randomizeAvatar}><RefreshCw size={14}/>Randomize</button>
        </div>

        <label className="agent-name-v5">
          <span>Bot name</span>
          <input value={form.name} onChange={(event)=>setForm({...form,name:event.target.value})} placeholder="Personal Shopper"/>
        </label>
        <label className="agent-name-v5">
          <span>Role</span>
          <input value={form.role} onChange={(event)=>setForm({...form,role:event.target.value})} placeholder="Chief of Staff"/>
        </label>

        <div className="agent-shape-section-v5">
          <span>Shape</span>
          <div className="agent-shape-grid-v5">
            {AVATAR_SHAPES.map((shape,index)=><button
              key={shape}
              type="button"
              className={cls(Number(form.avatarShape)===index&&'selected')}
              onClick={()=>setForm({...form,avatarShape:index,avatarSeed:form.avatarSeed||uid('avatar')})}
              aria-label={shape}
            ><Avatar agent={{...form,avatarShape:index,avatarColor:form.avatarColor||'#ff7a18',avatarMotion:index%8,avatarSeed:`shape-preview-${index}`}} size="sm"/></button>)}
          </div>
        </div>

        <div className="agent-color-section-v5">
          <span>Color</span>
          <div className="agent-color-grid-v5">
            {AVATAR_COLORS.map((color)=><button
              key={color}
              type="button"
              className={cls(form.avatarColor===color&&'selected')}
              onClick={()=>setForm({...form,avatarColor:color})}
              aria-label={color}
            ><i style={{background:color}}/></button>)}
          </div>
        </div>

        <details className="agent-advanced-v5">
          <summary>Advanced bot instructions</summary>
          <label><span>Short description</span><input value={form.description} onChange={(event)=>setForm({...form,description:event.target.value})} placeholder="What this bot is best at"/></label>
          <label><span>Instructions</span><textarea rows={5} value={form.instructions} onChange={(event)=>setForm({...form,instructions:event.target.value})} placeholder="How should this bot work?"/></label>
          <label className="toggle-row"><div><strong>Let this bot rename itself</strong><span>Useful when its role changes substantially.</span></div><button type="button" className={cls('switch',form.canRenameSelf&&'on')} onClick={()=>setForm({...form,canRenameSelf:!form.canRenameSelf})}><i/></button></label>
        </details>

        <button
          className="agent-create-v5"
          disabled={!form.name.trim()}
          onClick={()=>onSave({...form,avatarVisualVersion:5,name:form.name.trim(),role:form.role.trim()||'AI agent',description:form.description.trim()})}
        >{editing?'Save Changes':'Create'}</button>
      </div>
    </Modal>
  );
}

function TeamEditor({ agents, onSave, onClose }) {
  const [name, setName] = useState('New team');
  const [members, setMembers] = useState(agents.slice(0, Math.min(3, agents.length)).map((agent) => agent.id));
  return (
    <Modal title="Create agent team" onClose={onClose}>
      <div className="agent-editor">
        <label><span>Team name</span><input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <div className="team-picker-list">
          {agents.map((agent) => {
            const selected = members.includes(agent.id);
            return <button key={agent.id} className={cls('team-member-choice', selected && 'selected')} onClick={() => setMembers(selected ? members.filter((id) => id !== agent.id) : [...members, agent.id])}>
              <Avatar agent={agent} size="sm" /><div><strong>{agent.name}</strong><span>{agent.role}</span></div><span className="choice-check">{selected ? <Check size={13} /> : null}</span>
            </button>;
          })}
        </div>
        <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!name.trim() || members.length < 2} onClick={() => onSave({ id: uid('team'), name: name.trim(), members, createdAt: Date.now() })}>Create team</button></div>
      </div>
    </Modal>
  );
}

function FilesView({ files, onUpload, cloudMode }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  async function downloadCloudFile(file) {
    try {
      const token = storedToken();
      const response = await fetch(`${API_BASE}/api/files/${encodeURIComponent(file.id)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) throw new Error('File download failed.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = file.name || 'download';
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (error) {
      alert(error.message || 'Could not download this file.');
    }
  }
  async function choose(event) {
    const selected = [...(event.target.files || [])];
    if (!selected.length) return;
    setBusy(true);
    await onUpload(selected);
    setBusy(false);
    event.target.value = '';
  }
  return (
    <section className="content-page">
      <header className="page-heading"><div><span className="eyebrow">Workspace storage</span><h1>Files</h1><p>Upload files once and attach them to any Ripo Bot conversation.</p></div><button className="primary-button" onClick={() => inputRef.current?.click()}>{busy ? <LoaderCircle className="spin" size={16} /> : <Upload size={16} />} Upload</button></header>
      <input ref={inputRef} type="file" multiple hidden onChange={choose} />
      {!cloudMode && <div className="notice-card"><Cloud size={18} /><div><strong>Device storage mode</strong><span>File metadata is saved on this device when cloud storage is unavailable. Signed-in accounts use Cloudflare's free KV storage when available.</span></div></div>}
      <div className="file-grid">
        {files.length === 0 ? <div className="empty-state wide-empty"><Folder size={34} /><h3>No files yet</h3><p>Drop in PDFs, text files, images, code, or documents you want the agents to work with.</p><button className="secondary-button" onClick={() => inputRef.current?.click()}>Choose files</button></div> : files.map((file) => (
          <article className="file-card" key={file.id}>
            <span className="file-icon">{file.type?.startsWith('image/') ? <Image size={21} /> : <FileText size={21} />}</span>
            <div className="file-info"><strong title={file.name}>{file.name}</strong><span>{Math.max(1, Math.round((file.size || 0) / 1024))} KB · {file.source === 'cloud' ? 'Cloud' : 'This device'}</span></div>
            {file.source === 'cloud' ? <button className="icon-button" onClick={() => downloadCloudFile(file)} aria-label="Download file"><Download size={16} /></button> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function LiveComputerPreview({ compact = false, onOpen }) {
  const [live, setLive] = useState(null);

  useEffect(() => {
    let alive = true;
    let timer;
    const load = async () => {
      try {
        const data = await api('/api/computer/live/status');
        if (alive) setLive(data);
      } catch {
        if (alive) setLive({ active: false });
      }
    };
    load();
    timer = setInterval(load, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  if (!live?.active || !live?.liveViewUrl) {
    return (
      <button className={cls('computer-live-mini-empty', compact && 'compact')} onClick={onOpen}>
        <Computer size={compact ? 22 : 30}/>
        <strong>Computer idle</strong>
        <span>When a bot opens a website, its real browser appears here live.</span>
      </button>
    );
  }

  return (
    <div className={cls('computer-live-mini', compact && 'compact')} onClick={compact ? onOpen : undefined}>
      <div className="computer-live-mini-bar">
        <span className="computer-live-dot"/><strong>LIVE</strong>
        <span>{live.title || live.url || 'Browser Run'}</span>
      </div>
      <iframe
        className="computer-live-frame"
        src={live.liveViewUrl}
        title="Ripo Computer live browser"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}

function ComputerView() {
  const [status, setStatus] = useState({ loading: true, configured: false, provider: 'Ripo Computer' });
  const [live, setLive] = useState({ active: false });
  const [address, setAddress] = useState('https://www.google.com');
  const [mode, setMode] = useState('live');
  const [command, setCommand] = useState('pwd');
  const [lines, setLines] = useState([{ type: 'system', text: 'Ripo Computer · persistent workspace and real Browser Run session · type help' }]);
  const [busy, setBusy] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);

  async function refreshLive() {
    try {
      const data = await api('/api/computer/live/status');
      setLive(data);
      if (data?.url?.startsWith('http')) setAddress(data.url);
      return data;
    } catch {
      setLive({ active: false });
      return null;
    }
  }

  useEffect(() => {
    api('/api/computer/status').then((data) => setStatus({ loading: false, ...data })).catch(() => setStatus({ loading: false, configured: false, provider: 'Ripo Computer' }));
    refreshLive();
    const timer = setInterval(refreshLive, 60000);
    return () => clearInterval(timer);
  }, []);

  async function startOrNavigate() {
    if (liveBusy) return;
    setLiveBusy(true);
    try {
      const path = live?.active ? '/api/computer/live/action' : '/api/computer/live/start';
      const body = live?.active ? { kind: 'navigate', url: address } : { url: address };
      const data = await api(path, { method: 'POST', body: JSON.stringify(body) });
      setLive(data);
      if (data?.url) setAddress(data.url);
    } catch (error) {
      alert(error.message || 'Could not start the live computer.');
    } finally {
      setLiveBusy(false);
    }
  }

  async function closeLive() {
    if (liveBusy) return;
    setLiveBusy(true);
    try {
      await api('/api/computer/live/close', { method: 'POST', body: '{}' });
      setLive({ active: false });
    } catch (error) {
      alert(error.message || 'Could not close the browser.');
    } finally {
      setLiveBusy(false);
    }
  }

  async function run() {
    const value = command.trim();
    if (!value || busy) return;
    setLines((current) => [...current, { type: 'input', text: `$ ${value}` }]);
    setCommand('');
    setBusy(true);
    try {
      const data = await api('/api/computer/exec', { method: 'POST', body: JSON.stringify({ command: value }) });
      if (data.stdout === '__CLEAR__') setLines([{ type: 'system', text: 'Ripo Computer · terminal cleared' }]);
      else if (data.stdout) setLines((current) => [...current, { type: 'output', text: data.stdout }]);
      if (data.stderr) setLines((current) => [...current, { type: 'error', text: data.stderr }]);
      if (/^(open|browser)\s+/i.test(value)) {
        setMode('live');
        setTimeout(refreshLive, 450);
      }
    } catch (err) {
      setLines((current) => [...current, { type: 'error', text: err.message || 'Computer command failed.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="content-page computer-page computer-page-v6">
      <header className="page-heading computer-heading-v6">
        <div>
          <div className="computer-brand-line"><span className="computer-live-dot"/><span>Ripo Computer</span></div>
          <h1>See the bot work.</h1>
          <p>This is the actual Cloudflare Browser Run session. When a bot navigates, clicks, types, or scrolls, this Live View updates in real time.</p>
        </div>
        <StateLabel state={live?.active ? 'working' : status.configured ? 'ready' : 'waiting'} />
      </header>

      <div className="computer-mode-tabs-v6">
        <button className={cls(mode === 'live' && 'active')} onClick={() => setMode('live')}><Globe2 size={16}/>Live browser</button>
        <button className={cls(mode === 'terminal' && 'active')} onClick={() => setMode('terminal')}><SquareTerminal size={16}/>Terminal</button>
      </div>

      {mode === 'live' ? (
        <div className="computer-live-card-v6">
          <div className="computer-address-v6">
            <span className={cls('live-status-pill-v6', live?.active && 'active')}><i/>{live?.active ? 'LIVE' : 'OFFLINE'}</span>
            <input value={address} onChange={(event)=>setAddress(event.target.value)} onKeyDown={(event)=>event.key==='Enter'&&startOrNavigate()} placeholder="https://example.com"/>
            <button onClick={startOrNavigate} disabled={liveBusy}>{liveBusy?<LoaderCircle className="spin" size={16}/>:live?.active?<ArrowUp size={16}/>:<Globe2 size={16}/>}<span>{live?.active?'Go':'Start'}</span></button>
            <button className="computer-refresh-v6" onClick={refreshLive} aria-label="Refresh live view"><RefreshCw size={16}/></button>
            {live?.active ? <button className="computer-stop-v6" onClick={closeLive} aria-label="Close browser"><X size={16}/></button> : null}
          </div>

          <div className="computer-live-stage-v6">
            {live?.active && live?.liveViewUrl ? (
              <iframe
                key={live.liveViewUrl}
                className="computer-live-frame"
                src={live.liveViewUrl}
                title="Ripo Computer Live View"
                allow="clipboard-read; clipboard-write"
              />
            ) : (
              <div className="computer-live-empty-v6">
                <Avatar agent={{id:'computer-brand',avatarSeed:'computer-v6',avatarShape:3,avatarColor:'#111111',avatarMotion:3}} size="lg"/>
                <h2>Real browser, not a mockup.</h2>
                <p>Start the computer or ask a bot to open a website. The same Browser Run session the bot controls will appear here.</p>
                <button onClick={startOrNavigate} disabled={liveBusy}><Globe2 size={17}/>Start live browser</button>
              </div>
            )}
          </div>

          <div className="computer-live-foot-v6">
            <span>{live?.title || 'Cloudflare Browser Run'}</span>
            <span>{live?.url || 'No active page'}</span>
            {live?.active && live?.liveViewUrl ? <a href={live.liveViewUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Open full Live View</a> : null}
          </div>
        </div>
      ) : (
        <div className="computer-terminal-v6">
          <div className="computer-window-bar"><span className="traffic-lights"><i/><i/><i/></span><span>Ripo Terminal</span><span className="computer-provider">{status.provider || 'Ripo Computer'}</span></div>
          <div className="terminal-screen">
            {lines.map((line,index)=><pre key={`${line.type}-${index}`} className={`terminal-${line.type}`}>{line.text}</pre>)}
            <div className="terminal-input-row"><span>$</span><input value={command} disabled={!status.configured||busy} onChange={(event)=>setCommand(event.target.value)} onKeyDown={(event)=>event.key==='Enter'&&run()} placeholder={status.configured?'Run a command':'Computer unavailable'}/><button onClick={run} disabled={!status.configured||busy}><ArrowUp size={15}/></button></div>
          </div>
        </div>
      )}
    </section>
  );
}

function usePrivateAsset(path, version = '') {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (!path) { setSrc(''); return undefined; }
    let alive = true;
    let objectUrl = '';
    fetch(`${API_BASE}${path}`, { headers: storedToken() ? { Authorization: `Bearer ${storedToken()}` } : {} })
      .then((response) => { if (!response.ok) throw new Error('asset'); return response.blob(); })
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {});
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path, version]);
  return src;
}

function ProfilePicture({ account, size = 'lg', version = '', onClick }) {
  const src = usePrivateAsset(account?.user?.avatarUrl, version);
  const initials = (account?.user?.name || account?.user?.email || 'R').slice(0, 1).toUpperCase();
  return (
    <button type="button" className={cls('account-photo', `account-photo-${size}`)} onClick={onClick} disabled={!onClick}>
      {src ? <img src={src} alt="" /> : <span>{initials}</span>}
    </button>
  );
}

function UsageMeter({ label, data, subtitle }) {
  if (!data) return (
    <div className="usage-meter unlimited-meter">
      <div className="usage-meter-head"><strong>{label}</strong><span>Unlimited window</span></div>
      <div className="usage-track"><i style={{ width: '100%' }} /></div>
      <small>{subtitle}</small>
    </div>
  );
  return (
    <div className="usage-meter">
      <div className="usage-meter-head"><strong>{label}</strong><span>{data.remainingPercent}% left</span></div>
      <div className="usage-track"><i style={{ width: `${data.remainingPercent}%` }} /></div>
      <small>{subtitle || `${Math.max(0, data.limit - data.used).toLocaleString()} tokens remaining`}</small>
    </div>
  );
}

function SecureMedia({ file }) {
  const src = usePrivateAsset(`/api/files/${encodeURIComponent(file.id)}`, file.id);
  if (!src) return <div className="media-thumb media-loading"><LoaderCircle className="spin" size={18} /></div>;
  if (String(file.type || '').startsWith('video/')) return <video className="media-thumb" src={src} muted controls playsInline />;
  return <img className="media-thumb" src={src} alt={file.name || 'Workspace media'} />;
}

function SettingsView({
  profile,
  cloudMode,
  theme,
  accent,
  onThemeChange,
  onAccentChange,
  onLogout,
  onSwitchAccount,
  account,
  onRefreshAccount,
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onRefreshWorkspaces,
  files,
  onDeleteFile
}) {
  const [page, setPage] = useState('main');
  const [busy, setBusy] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [adminUsers, setAdminUsers] = useState([]);
  const avatarInput = useRef(null);
  const isAdmin = account?.role === 'admin';

  useEffect(() => {
    if (page === 'admin' && isAdmin) {
      api('/api/admin/users').then((data) => setAdminUsers(data.users || [])).catch(() => setAdminUsers([]));
    }
  }, [page, isAdmin]);

  async function uploadAvatar(event) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    setBusy(true);
    try {
      const body = new FormData(); body.append('file', chosen);
      await api('/api/account/avatar', { method: 'POST', body });
      setAvatarVersion((value) => value + 1);
      await onRefreshAccount?.();
    } finally { setBusy(false); event.target.value = ''; }
  }

  async function renameAccount() {
    const next = window.prompt('Profile name', account?.user?.name || profile?.name || '');
    if (!next?.trim()) return;
    setBusy(true);
    try { await api('/api/account', { method: 'PUT', body: JSON.stringify({ name: next.trim() }) }); await onRefreshAccount?.(); }
    finally { setBusy(false); }
  }

  async function claimDaily() {
    setBusy(true);
    try { await api('/api/coins/daily', { method: 'POST', body: '{}' }); await onRefreshAccount?.(); }
    catch (error) { alert(error.message || 'Could not claim coins.'); }
    finally { setBusy(false); }
  }

  async function upgrade() {
    setBusy(true);
    try { await api('/api/plans/upgrade', { method: 'POST', body: '{}' }); await onRefreshAccount?.(); }
    catch (error) { alert(error.message || 'Could not upgrade.'); }
    finally { setBusy(false); }
  }

  async function createWorkspace() {
    const name = window.prompt('Workspace name', 'New Workspace');
    if (!name?.trim()) return;
    setBusy(true);
    try { await api('/api/workspaces', { method: 'POST', body: JSON.stringify({ name: name.trim() }) }); await onRefreshWorkspaces?.(); }
    catch (error) { alert(error.message || 'Could not create workspace.'); }
    finally { setBusy(false); }
  }

  async function renameWorkspace(workspace) {
    const name = window.prompt('Rename workspace', workspace.name);
    if (!name?.trim()) return;
    setBusy(true);
    try { await api(`/api/workspaces/${encodeURIComponent(workspace.id)}/rename`, { method: 'PUT', body: JSON.stringify({ name: name.trim() }) }); await onRefreshWorkspaces?.(); }
    finally { setBusy(false); }
  }

  async function adminAction(user, action, payload = {}) {
    setBusy(true);
    try {
      await api(`/api/admin/users/${encodeURIComponent(user.id)}/action`, { method: 'POST', body: JSON.stringify({ action, ...payload }) });
      const data = await api('/api/admin/users'); setAdminUsers(data.users || []);
    } catch (error) { alert(error.message || 'Admin action failed.'); }
    finally { setBusy(false); }
  }

  const activeWorkspace = workspaces.find((item) => item.id === activeWorkspaceId) || workspaces[0];
  const media = files.filter((file) => /^image\//.test(file.type || '') || /^video\//.test(file.type || ''));

  const Back = ({ title }) => (
    <header className="settings-subheader">
      <button className="settings-back" onClick={() => setPage('main')}><ArrowLeft size={18} /></button>
      <h1>{title}</h1>
      <span />
    </header>
  );

  if (page === 'appearance') return (
    <section className="settings-v4 subpage">
      <Back title="Appearance" />
      <div className="settings-page-body narrow-settings">
        <div className="settings-section-card">
          <h2>Mode</h2><p>Light is the default. Dark keeps the same layout and spacing.</p>
          <div className="theme-preview-grid">
            {['light','dark','system'].map((value) => <button key={value} className={cls('theme-preview', theme === value && 'selected')} onClick={() => onThemeChange(value)}><span className={`theme-mini theme-mini-${value}`}><i /><i /><i /></span><strong>{value[0].toUpperCase()+value.slice(1)}</strong></button>)}
          </div>
        </div>
        <div className="settings-section-card">
          <h2>Theme color</h2><p>Pick the accent Ripo Bot uses for active states, usage, and highlights.</p>
          <div className="accent-grid">{['#111111','#7b5cf2','#168cf7','#11c58c','#ff7a18','#f42f8f','#e53f49','#00a8a8'].map((color) => <button key={color} className={cls('accent-choice', accent === color && 'selected')} style={{ '--choice': color }} onClick={() => onAccentChange(color)} aria-label={color}><i /></button>)}</div>
        </div>
      </div>
    </section>
  );

  if (page === 'workspaces') return (
    <section className="settings-v4 subpage">
      <Back title="Workspaces" />
      <div className="settings-page-body">
        <div className="workspace-page-head"><div><h2>Your workspaces</h2><p>Each workspace keeps its own bots, conversations, teams, and media.</p></div><button className="primary-button" onClick={createWorkspace} disabled={busy}><Plus size={16}/>New workspace</button></div>
        <div className="workspace-grid-v4">
          {workspaces.map((workspace) => <article key={workspace.id} className={cls('workspace-tile', workspace.id === activeWorkspaceId && 'active')}>
            <button className="workspace-open" onClick={() => onSelectWorkspace(workspace.id)}>
              <span className="workspace-icon"><BriefcaseBusiness size={20}/></span>
              <div><strong>{workspace.name}</strong><span>{workspace.botCount || 0} bots · {Math.round((workspace.storage?.used || 0)/1024/1024)} MB used</span></div>
              <ChevronRight size={17}/>
            </button>
            <div className="workspace-tile-actions"><button onClick={() => renameWorkspace(workspace)}><Pencil size={14}/> Rename</button></div>
          </article>)}
        </div>
        {activeWorkspace && <div className="workspace-stats-card">
          <div className="workspace-stat"><strong>{activeWorkspace.botCount || 0}</strong><span>Bots</span></div>
          <div className="workspace-stat"><strong>{(activeWorkspace.weeklyTokens || 0).toLocaleString()}</strong><span>AI tokens this week</span></div>
          <div className="workspace-stat"><strong>{Math.round((activeWorkspace.storage?.used || 0)/1024/1024)} MB</strong><span>Cloud storage</span></div>
          <div className="workspace-stat"><strong>{media.length}</strong><span>Media items</span></div>
        </div>}
        <div className="media-gallery-section">
          <div className="workspace-page-head"><div><h2>Media gallery</h2><p>Images and videos uploaded to or created inside this workspace.</p></div></div>
          {media.length ? <div className="media-gallery">{media.map((file) => <article key={file.id} className="media-item"><SecureMedia file={file}/><div><span title={file.name}>{file.name}</span><button onClick={() => onDeleteFile(file)}><Trash2 size={14}/></button></div></article>)}</div> : <div className="settings-empty"><Images size={28}/><strong>No media yet</strong><span>Images and videos you send to bots will appear here.</span></div>}
        </div>
      </div>
    </section>
  );

  if (page === 'plans') return (
    <section className="settings-v4 subpage">
      <Back title="Plans" />
      <div className="settings-page-body narrow-settings">
        <div className="plan-hero"><Crown size={28}/><h2>Ripo Bot {account?.plan === 'plus' ? 'Plus' : 'Free'}</h2><p>Upgrade with Ripo Coins — no card or real-money checkout in this version.</p><div className="coin-balance"><Coins size={18}/>{account?.coins || 0} Ripo Coins</div></div>
        <div className="plan-grid">
          <article className={cls('plan-card', account?.plan === 'free' && 'current')}><span className="plan-pill">Free</span><h3>Ripo Bot Free</h3><p>For everyday bot work.</p><ul><li>3-hour + weekly usage windows</li><li>1 workspace</li><li>250 MB zero-cost cloud storage</li><li>Web, computer, files, voice, image tools</li></ul>{account?.plan === 'free' && <span className="current-plan-label">Current plan</span>}</article>
          <article className={cls('plan-card plus-plan', account?.plan === 'plus' && 'current')}><span className="plan-pill"><Crown size={13}/>Plus</span><h3>Ripo Bot Plus</h3><p>More room for heavier work.</p><ul><li>No 3-hour app usage window</li><li>Higher weekly usage</li><li>2 workspaces</li><li>750 MB cloud storage on the zero-cost backend</li><li>Early feature access</li></ul>{account?.plan === 'plus' ? <span className="current-plan-label">Current plan</span> : <button className="primary-button" onClick={upgrade} disabled={busy}><Coins size={15}/>1200 coins · 30 days</button>}</article>
        </div>
        <div className="plan-note"><ShieldCheck size={17}/><span>The larger 500 GB target you asked for cannot honestly be hosted on the current free-only KV backend. This page shows the storage the live infrastructure can actually enforce without charging you.</span></div>
        {isAdmin && <button className="settings-nav-row admin-row" onClick={() => setPage('admin')}><span className="settings-row-icon"><Shield size={18}/></span><span><strong>Admin console</strong><small>Users, plans, coins, storage, bans, warnings, admins</small></span><ChevronRight size={17}/></button>}
      </div>
    </section>
  );

  if (page === 'plugins') {
    const plugins = [
      ['web','Web Search','Fresh public information and sources.',<Globe2 size={22}/>,'Built in'],
      ['browser','Browser Run','Render and read JavaScript websites when a bot needs them.',<Computer size={22}/>,'Built in'],
      ['files','Workspace Files','Read uploaded files and save generated work.',<Folder size={22}/>,'Built in'],
      ['images','Image Studio','Generate images with FLUX.2 [klein] on Workers AI.',<Images size={22}/>,'Built in'],
      ['voice','Voice Calls','Talk to bots using your device speech recognition and system voices.',<Mic size={22}/>,'Device'],
    ];
    const external = [
      ['gmail','Gmail','Requires Google OAuth before a website can safely access your mailbox.',<Mail size={22}/>],
      ['calendar','Google Calendar','Requires Google OAuth for real calendar actions.',<CalendarDays size={22}/>],
      ['github','GitHub','Requires OAuth or an authenticated app connection for private account actions.',<Github size={22}/>],
    ];
    return <section className="settings-v4 subpage"><Back title="Plugins"/><div className="settings-page-body">
      <div className="workspace-page-head"><div><h2>Connected tools</h2><p>These work immediately without you creating API keys.</p></div></div>
      <div className="plugin-grid">{plugins.map(([id,name,desc,icon,status]) => <article className="plugin-card" key={id}><span className={`plugin-logo plugin-${id}`}>{icon}</span><div><strong>{name}</strong><p>{desc}</p></div><span className="plugin-status connected"><Check size={13}/>{status}</span></article>)}</div>
      <div className="workspace-page-head plugin-external-head"><div><h2>External accounts</h2><p>I’m not faking “connected” buttons: these services require the provider’s OAuth authorization before Ripo Bot can safely access them.</p></div></div>
      <div className="plugin-grid">{external.map(([id,name,desc,icon]) => <article className="plugin-card muted-plugin" key={id}><span className={`plugin-logo plugin-${id}`}>{icon}</span><div><strong>{name}</strong><p>{desc}</p></div><span className="plugin-status">OAuth required</span></article>)}</div>
    </div></section>;
  }

  if (page === 'admin' && isAdmin) return (
    <section className="settings-v4 subpage">
      <Back title="Admin" />
      <div className="settings-page-body admin-console">
        <div className="admin-banner"><Shield size={24}/><div><strong>Ripo Bot Admin</strong><span>Server-side access is restricted to admins. The owner email is always protected.</span></div></div>
        <div className="admin-user-list">{adminUsers.map((user) => <article className="admin-user" key={user.id}>
          <div className="admin-user-main"><span className="admin-avatar">{(user.name || user.email).slice(0,1).toUpperCase()}</span><div><strong>{user.name}</strong><span>{user.email}</span><small>{user.plan} · {user.coins} coins · {user.warnings} warnings</small></div><span className={cls('role-chip', user.role === 'admin' && 'admin')}>{user.role}</span></div>
          <div className="admin-actions">
            <button onClick={() => { const amount=Number(window.prompt('Coins to add','100')); if(amount) adminAction(user,'addCoins',{amount}); }}><Coins size={14}/>Coins</button>
            <button onClick={() => adminAction(user,'setPlan',{plan:user.plan === 'plus' ? 'free':'plus',days:30})}><Crown size={14}/>{user.plan === 'plus' ? 'Make Free':'Give Plus'}</button>
            <button onClick={() => { const mb=Number(window.prompt('Extra storage MB','100')); if(mb>=0) adminAction(user,'setStorageBonus',{bytes:mb*1024*1024}); }}><HardDrive size={14}/>Storage</button>
            <button onClick={() => adminAction(user,'warn')}><TriangleAlert size={14}/>Warn</button>
            <button onClick={() => adminAction(user,user.bannedUntil ? 'unban':'ban',{hours:24})}><Ban size={14}/>{user.bannedUntil ? 'Unban':'Ban'}</button>
            <button onClick={() => adminAction(user,'setAdmin',{enabled:user.role !== 'admin'})}><Shield size={14}/>{user.role === 'admin' ? 'Remove admin':'Make admin'}</button>
          </div>
        </article>)}</div>
      </div>
    </section>
  );

  return (
    <section className="settings-v4">
      <header className="settings-main-header"><h1>Settings</h1></header>
      <div className="settings-page-body narrow-settings">
        <article className="account-hero-card">
          <input ref={avatarInput} type="file" accept="image/*" hidden onChange={uploadAvatar}/>
          <ProfilePicture account={account || { user: profile }} size="xl" version={avatarVersion} onClick={() => avatarInput.current?.click()}/>
          <div className="account-copy"><strong>{account?.user?.name || profile?.name || 'Ripo Bot user'}</strong><span>{account?.user?.email || profile?.email || ''}</span><button onClick={renameAccount}><Pencil size={13}/>Edit profile</button></div>
          <span className={cls('plan-badge', account?.plan === 'plus' && 'plus')}><Crown size={13}/>{account?.plan === 'plus' ? 'Plus':'Free'}</span>
        </article>

        <article className="usage-card-v4">
          <div className="settings-card-title"><Gauge size={18}/><div><strong>Usage</strong><span>Remaining allowance resets automatically.</span></div></div>
          <UsageMeter label="3-hour usage" data={account?.usage?.threeHour || null} subtitle={account?.plan === 'plus' ? 'Plus has no 3-hour Ripo Bot limit.' : undefined}/>
          <UsageMeter label="Weekly usage" data={account?.usage?.weekly}/>
        </article>

        <article className="coins-card">
          <div className="coin-orb"><Coins size={21}/></div><div><strong>{account?.coins || 0} Ripo Coins</strong><span>Earn 2 coins for successful bot turns, up to 50/day.</span></div><button className="secondary-button" onClick={claimDaily} disabled={busy}>Daily +25</button>
        </article>

        <div className="settings-nav-group">
          <button className="settings-nav-row" onClick={() => setPage('appearance')}><span className="settings-row-icon"><Palette size={18}/></span><span><strong>Appearance</strong><small>Light, dark, system, and accent theme</small></span><ChevronRight size={17}/></button>
          <button className="settings-nav-row" onClick={() => setPage('workspaces')}><span className="settings-row-icon"><BriefcaseBusiness size={18}/></span><span><strong>Workspaces</strong><small>{workspaces.length} workspace{workspaces.length === 1 ? '' : 's'} · bots, storage, media</small></span><ChevronRight size={17}/></button>
          <button className="settings-nav-row" onClick={() => setPage('plans')}><span className="settings-row-icon"><WalletCards size={18}/></span><span><strong>Plans</strong><small>Free, Plus, Ripo Coins, limits</small></span><ChevronRight size={17}/></button>
          <button className="settings-nav-row" onClick={() => setPage('plugins')}><span className="settings-row-icon"><Plug size={18}/></span><span><strong>Plugins</strong><small>Built-in tools and external connections</small></span><ChevronRight size={17}/></button>
          {isAdmin && <button className="settings-nav-row admin-row" onClick={() => setPage('admin')}><span className="settings-row-icon"><Shield size={18}/></span><span><strong>Admin</strong><small>Manage users, plans, coins and access</small></span><ChevronRight size={17}/></button>}
        </div>

        <div className="settings-nav-group account-actions">
          <button className="settings-nav-row" onClick={onSwitchAccount}><span className="settings-row-icon"><UserPlus size={18}/></span><span><strong>Switch account</strong><small>Sign in with another Ripo Bot account</small></span><ChevronRight size={17}/></button>
          <button className="settings-nav-row danger-row" onClick={onLogout}><span className="settings-row-icon"><LogOut size={18}/></span><span><strong>Log out</strong></span></button>
        </div>
        <div className="settings-version"><strong>Ripo Bot</strong><span>Version 4.0 · Web</span></div>
      </div>
    </section>
  );
}

function BotDetails({ agent, files, onClose, onEdit, onOpenComputer }) {
  const [tab, setTab] = useState('computer');
  const media = files.filter((file) => /^image\//.test(file.type || '') || /^video\//.test(file.type || ''));
  const busy = ['thinking','searching','working'].includes(agent?.state);
  return (
    <div className="bot-details-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="bot-details-sheet">
        <header className="bot-details-head"><button className="icon-button" onClick={onClose}><X size={18}/></button><span>Bot details</span><button className="icon-button" onClick={onEdit}><Pencil size={17}/></button></header>
        <div className="bot-details-profile">
          <Avatar agent={agent} size="xl" />
          <h2>{agent?.name}</h2><p>{agent?.role}</p>
          <StateLabel state={agent?.state || 'ready'} />
        </div>
        <div className="bot-details-tabs">
          <button className={cls(tab === 'computer' && 'active')} onClick={() => setTab('computer')}>Computer</button>
          <button className={cls(tab === 'media' && 'active')} onClick={() => setTab('media')}>Media</button>
          <button className={cls(tab === 'routines' && 'active')} onClick={() => setTab('routines')}>Routines</button>
        </div>
        <div className="bot-details-body">
          {tab === 'computer' && <div className="bot-computer-panel">
            <div className={cls('bot-screen-preview', busy && 'in-use')}>
              <div className="bot-screen-top"><span/><span/><span/><strong>Ripo Computer · Live</strong></div>
              <LiveComputerPreview onOpen={onOpenComputer}/>
            </div>
            <button className="secondary-button full-button" onClick={onOpenComputer}><Computer size={16}/>Open Ripo Computer</button>
          </div>}
          {tab === 'media' && (media.length ? <div className="bot-media-grid">{media.slice(0,24).map((file) => <SecureMedia key={file.id} file={file}/>)}</div> : <div className="settings-empty"><Images size={28}/><strong>No media yet</strong><span>Images and videos from this workspace will appear here.</span></div>)}
          {tab === 'routines' && <div className="routine-detail-list"><div className="routine-detail"><span>↻</span><div><strong>Morning briefing</strong><small>Paused until you ask {agent?.name} to schedule it.</small></div></div><div className="settings-empty compact"><RefreshCw size={24}/><strong>Teach a routine in chat</strong><span>Ask the bot to remember a repeatable workflow. Scheduled execution can be added once a durable scheduler is connected.</span></div></div>}
        </div>
      </section>
    </div>
  );
}

function VoiceCall({ agents, initialAgent, onClose, onTurn }) {
  const [participantIds, setParticipantIds] = useState([initialAgent?.id].filter(Boolean));
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [callLog, setCallLog] = useState([]);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const controllerRef = useRef(null);
  const audioRef = useRef(null);
  const mountedRef = useRef(true);

  function releaseVoiceHardware() {
    stopVoiceSession({
      recorder: recorderRef.current,
      stream: streamRef.current,
      controller: controllerRef.current,
      audio: audioRef.current
    });
    recorderRef.current = null;
    streamRef.current = null;
    controllerRef.current = null;
    audioRef.current = null;
    chunksRef.current = [];
    if (mountedRef.current) setListening(false);
  }

  useEffect(() => {
    mountedRef.current = true;
    const stopForPageExit = () => releaseVoiceHardware();
    const stopWhenHidden = () => { if (document.visibilityState === 'hidden') releaseVoiceHardware(); };
    window.addEventListener('pagehide', stopForPageExit);
    document.addEventListener('visibilitychange', stopWhenHidden);
    return () => {
      mountedRef.current = false;
      window.removeEventListener('pagehide', stopForPageExit);
      document.removeEventListener('visibilitychange', stopWhenHidden);
      releaseVoiceHardware();
    };
  }, []);

  async function speak(text, agent) {
    const clean = String(text || '').trim();
    if (!clean) return;
    controllerRef.current?.abort?.();
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const token = storedToken();
      const response = await fetch(`${API_BASE}/api/voice/speak`, {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ text: clean, lang: (navigator.language || 'en').split('-')[0] || 'en' })
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => ({}));
        throw new Error(problem.error || 'Voice audio failed.');
      }
      const blob = await response.blob();
      if (!blob.size || controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.playbackRate = voiceRateForAgent(agent);
      try { audio.preservesPitch = false; } catch {}
      await new Promise((resolve, reject) => {
        audio.onended = resolve;
        audio.onerror = reject;
        audio.play().catch(reject);
      }).catch(() => {});
      URL.revokeObjectURL(url);
      if (audioRef.current === audio) audioRef.current = null;
    } catch (error) {
      if (error?.name !== 'AbortError') {
        setCallLog((current) => [...current, { role: 'system', text: 'Neural voice is temporarily unavailable. The text reply is still shown.' }]);
      }
    }
  }

  async function runTurn(text) {
    const clean = String(text || '').trim();
    if (!clean || busy) return;
    setBusy(true);
    setCallLog((current) => [...current, { role: 'user', text: clean }]);
    setTranscript('');
    try {
      const replies = await onTurn(clean, participantIds);
      for (const reply of replies || []) {
        setCallLog((current) => [...current, { role: 'bot', text: reply.content, agent: reply.agent }]);
        await speak(reply.content, reply.agent);
      }
    } catch (error) {
      setCallLog((current) => [...current, { role: 'system', text: error.message || 'Voice turn failed.' }]);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  async function transcribeRecording(blob) {
    if (!blob?.size) return;
    setTranscribing(true);
    try {
      const form = new FormData();
      const extension = blob.type.includes('mp4') ? 'm4a' : 'webm';
      form.append('audio', new File([blob], `ripo-call.${extension}`, { type: blob.type || 'audio/webm' }));
      const result = await api('/api/voice/transcribe', { method: 'POST', body: form });
      if (result?.text) {
        setTranscript(result.text);
        await runTurn(result.text);
      }
    } catch (error) {
      setCallLog((current) => [...current, { role: 'system', text: error.message || 'I could not transcribe that recording.' }]);
    } finally {
      if (mountedRef.current) setTranscribing(false);
    }
  }

  async function startListening() {
    if (busy || transcribing) return;
    if (listening) {
      try { recorderRef.current?.stop?.(); } catch {}
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      alert('Microphone recording is not available in this browser. You can still type during the call.');
      return;
    }
    releaseVoiceHardware();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      streamRef.current = stream;
      chunksRef.current = [];
      const mimeType = preferredRecorderMime(window.MediaRecorder);
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data?.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => releaseVoiceHardware();
      recorder.onstop = async () => {
        const chunks = chunksRef.current;
        const type = recorder.mimeType || chunks[0]?.type || 'audio/webm';
        stream.getTracks().forEach((track) => { track.enabled = false; track.stop(); });
        if (streamRef.current === stream) streamRef.current = null;
        if (recorderRef.current === recorder) recorderRef.current = null;
        if (mountedRef.current) setListening(false);
        chunksRef.current = [];
        if (chunks.length) await transcribeRecording(new Blob(chunks, { type }));
      };
      recorder.start();
      setListening(true);
    } catch (error) {
      releaseVoiceHardware();
      setCallLog((current) => [...current, { role: 'system', text: error?.name === 'NotAllowedError' ? 'Microphone permission was not granted.' : 'The microphone could not start.' }]);
    }
  }

  function endCall() {
    releaseVoiceHardware();
    onClose();
  }

  function toggleParticipant(id) {
    setParticipantIds((current) => current.includes(id) ? (current.length > 1 ? current.filter((item) => item !== id) : current) : [...current, id]);
  }

  return (
    <div className="voice-call-screen">
      <header className="voice-call-head">
        <button className="call-end" onClick={endCall}><PhoneOff size={18}/></button>
        <div><strong>Ripo Bot Call</strong><span>{participantIds.length} bot{participantIds.length===1?'':'s'} in meeting</span></div><span />
      </header>
      <div className="call-stage">
        <div className="call-participants">{participantIds.map((id) => { const agent=agents.find((item)=>item.id===id); return agent ? <div className="call-person" key={id}><Avatar agent={{...agent,state:busy?'thinking':agent.state}} size="xl"/><strong>{agent.name}</strong><span>{listening?'Listening…':transcribing?'Understanding…':busy?'Working…':agent.role}</span></div> : null; })}</div>
        <div className="call-transcript">{callLog.slice(-6).map((item,index)=><div key={index} className={cls('call-line',item.role)}>{item.agent && <Avatar agent={item.agent} size="xs"/>}<span>{item.text}</span></div>)}</div>
      </div>
      <div className="call-invite-strip"><span>Invite bots</span><div>{agents.map((agent)=><button key={agent.id} className={cls(participantIds.includes(agent.id)&&'active')} onClick={()=>toggleParticipant(agent.id)}><Avatar agent={agent} size="xs"/><span>{agent.name}</span></button>)}</div></div>
      <div className="call-controls">
        <button className={cls('mic-orb',listening&&'listening')} onClick={startListening} disabled={busy||transcribing}>
          {transcribing||busy?<LoaderCircle className="spin" size={23}/>:listening?<Square size={18} fill="currentColor"/>:<Mic size={23}/>}
        </button>
        <div className="call-type"><input value={transcript} onChange={(event)=>setTranscript(event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter')runTurn(transcript);}} placeholder={listening?'Tap the stop button when you are done':transcribing?'Transcribing…':'Speak or type to the meeting'}/><button onClick={()=>runTurn(transcript)} disabled={!transcript.trim()||busy||transcribing}><ArrowUp size={17}/></button></div>
      </div>
      <p className="call-note"><Volume2 size={13}/>Whisper transcribes your recording and MeloTTS generates the bot voice. Leaving the call explicitly stops every microphone track.</p>
    </div>
  );
}

function ChatView({
  agent,
  team,
  agents,
  messages,
  sending,
  onSend,
  onRename,
  onEdit,
  onOpenDetails,
  onStartCall,
  onShowBots,
  onUploadFiles,
  files
}) {
  const [draft, setDraft] = useState('');
  const [attached, setAttached] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(agent?.name || team?.name || '');
  const bottomRef = useRef(null);
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);
  useEffect(() => { setRenameValue(agent?.name || team?.name || ''); setRenaming(false); }, [agent?.id, team?.id]);

  const participants = team ? team.members.map((id) => agents.find((item) => item.id === id)).filter(Boolean) : [agent].filter(Boolean);
  const primary = participants[0] || agent;
  const title = team?.name || agent?.name || 'Ripo Bot';
  const firstDatedMessage = messages.find((message) => message.createdAt);

  function submit() {
    const value = draft.trim();
    if (!value || sending) return;
    onSend(value, { attachments: attached });
    setDraft('');
    setAttached([]);
  }

  function saveRename() {
    if (!agent || !renameValue.trim()) return;
    onRename(renameValue.trim());
    setRenaming(false);
  }

  async function pickAndUpload(event) {
    const selected = [...(event.target.files || [])];
    event.target.value = '';
    if (!selected.length || uploadBusy) return;
    setUploadBusy(true);
    try {
      const uploaded = await onUploadFiles(selected);
      if (Array.isArray(uploaded) && uploaded.length) {
        setAttached((current) => {
          const existing = new Set(current.map((file) => file.id));
          return [...current, ...uploaded.filter((file) => !existing.has(file.id))];
        });
      }
      setMenuOpen(false);
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <section className="chat-v5">
      <header className="chat-head-v5">
        <button className="chat-back-v5" onClick={onShowBots} aria-label="Back to bots"><ArrowLeft size={20}/></button>
        <button className="chat-bot-pill-v5" onClick={onOpenDetails}>
          <span className="chat-pill-avatars">
            {participants.slice(0,3).map((item,index)=><span key={item.id} style={{zIndex:participants.length-index}}><Avatar agent={item} size="xs"/></span>)}
          </span>
          {renaming&&agent
            ? <span className="inline-rename"><input value={renameValue} onChange={(event)=>setRenameValue(event.target.value)} onKeyDown={(event)=>{if(event.key==='Enter')saveRename();}} autoFocus/><button onClick={(event)=>{event.stopPropagation();saveRename();}}><Check size={13}/></button></span>
            : <strong>{title}</strong>}
        </button>
        <div className="chat-head-tools-v5">
          <button className="chat-tool-v5" onClick={onOpenDetails} aria-label="Open bot computer"><Computer size={18}/></button>
          {agent&&<div className="relative chat-more-wrap"><button className="chat-more-v5" onClick={()=>setMenuOpen(menuOpen==='more'?false:'more')} aria-label="More"><MoreHorizontal size={18}/></button>{menuOpen==='more'&&<div className="popover-menu head-menu v5-head-menu"><button onClick={()=>{setRenaming(true);setMenuOpen(false);}}><Pencil size={15}/>Rename</button><button onClick={()=>{onEdit();setMenuOpen(false);}}><Settings size={15}/>Edit bot</button><button onClick={()=>{onStartCall();setMenuOpen(false);}}><Phone size={15}/>Start call</button></div>}</div>}
        </div>
      </header>

      <div className="chat-scroll-v5">
        {firstDatedMessage && <div className="chat-date-v5">{new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(firstDatedMessage.createdAt))}</div>}
        {messages.length <= 1 && !team && <div className="chat-empty-v5"><Avatar agent={agent} size="xl"/><h1>{agent?.name}</h1><p>{agent?.description}</p></div>}
        {team && messages.length===0 && <div className="chat-empty-v5"><div className="team-orbit">{participants.map((member)=><Avatar key={member.id} agent={member} size="lg"/>)}</div><h1>{team.name}</h1><p>Message the team once and the bots coordinate inside this thread.</p></div>}
        <div className="message-list-v5">
          {messages.map((message)=>{
            const user=message.role==='user';
            const author=!user && message.agentId ? agents.find((item)=>item.id===message.agentId) : null;
            return <article className={cls('bubble-row-v5',user&&'user')} key={message.id}>
              {!user&&author?<div className="bubble-author-avatar-v6"><Avatar agent={author} size="xs"/></div>:null}
              <div className="bubble-stack-v6">
                {!user&&author?<div className="bubble-author-v6"><strong>{author.name}</strong><span>{author.role}</span></div>:null}
                <div className={cls('bubble-v5',user&&'user-bubble-v5')}>
                <div className="bubble-text">{message.content}</div>
                {message.sources?.length?<button className="bubble-tool-note"><Globe2 size={13}/>{message.sources.length} sources</button>:null}
                {message.attachments?.length?<div className="bubble-files-v5">{message.attachments.map((file)=><span key={file.id}><FileText size={14}/><span>{file.name}</span></span>)}</div>:null}
                {message.generatedFiles?.length?<div className="generated-media-v5">{message.generatedFiles.map((file)=><SecureMedia key={file.id} file={file}/>)}</div>:null}
              </div>
              </div>
            </article>;
          })}
          {sending&&<article className="bubble-row-v5"><div className="bubble-v5 typing-bubble-v5"><span/><span/><span/></div></article>}
          <div ref={bottomRef}/>
        </div>
      </div>

      <div className="composer-v5-wrap">
        <input ref={photoInputRef} className="composer-photo-input" type="file" accept="image/*" multiple hidden onChange={pickAndUpload}/>
        <input ref={fileInputRef} className="composer-file-input" type="file" multiple hidden onChange={pickAndUpload}/>
        {attached.length>0&&<div className="composer-files-v5">{attached.map((file)=><span key={file.id}><File size={13}/><span>{file.name}</span><button onClick={()=>setAttached(attached.filter((item)=>item.id!==file.id))}><X size={12}/></button></span>)}</div>}
        {menuOpen==='attach'&&<div className="attachment-menu-v5">
          <button onClick={()=>photoInputRef.current?.click()}><span className="attach-icon-v5"><Image size={18}/></span><span><strong>Photo Library</strong><small>Choose images from your phone</small></span></button>
          <button onClick={()=>fileInputRef.current?.click()}><span className="attach-icon-v5"><Folder size={18}/></span><span><strong>Files</strong><small>Choose documents or other files</small></span></button>
        </div>}
        <div className="composer-row-v5">
          <button className="composer-plus-v5" onClick={()=>setMenuOpen(menuOpen==='attach'?false:'attach')} aria-label="Attach">
            {uploadBusy?<LoaderCircle className="spin" size={19}/>:<Plus size={21}/>}
          </button>
          <div className="composer-pill-v5">
            <textarea
              value={draft}
              onChange={(event)=>setDraft(event.target.value)}
              onKeyDown={(event)=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submit();}}}
              rows={1}
              placeholder={`Ask ${title}`}
            />
            {draft.trim()
              ? <button className="composer-send-v5" onClick={submit} disabled={sending}><ArrowUp size={17}/></button>
              : <button className="composer-mic-v5" onClick={onStartCall} aria-label="Start voice call"><Mic size={17}/></button>}
          </div>
        </div>
      </div>

      <aside className="desktop-bot-rail">
        <section className="rail-profile" onClick={onOpenDetails}>
          <Avatar agent={primary} size="lg" />
          <div><strong>{title}</strong><span>{team ? `${participants.length} bots coordinating` : agent?.role}</span></div>
          <ChevronRight size={17} />
        </section>
        <section className="rail-block">
          <div className="rail-block-head"><span>Computer</span><StateLabel state={sending ? 'working' : (agent?.state || 'ready')} /></div>
          <div className={cls('rail-screen', sending && 'working')}>
            <LiveComputerPreview compact onOpen={onOpenDetails}/>
          </div>
          <button className="rail-link" onClick={onOpenDetails}>View computer <ChevronRight size={14}/></button>
        </section>
        <section className="rail-block">
          <div className="rail-block-head"><span>Workspace</span><span>{files.length} files</span></div>
          <div className="rail-mini-media">{files.filter((file)=>/^image\//.test(file.type||'')).slice(0,4).map((file)=><SecureMedia key={file.id} file={file}/>)}</div>
          {!files.some((file)=>/^image\//.test(file.type||'')) && <p className="rail-empty-copy">Images generated or uploaded here appear here automatically.</p>}
        </section>
      </aside>
    </section>
  );
}

function MobileTabBar({ view, homeOpen, onHome, onChat, onComputer, onFiles, onSettings }) {
  return (
    <nav className="mobile-tab-bar-v6" aria-label="Ripo Bot navigation">
      <button className={cls(homeOpen && 'active')} onClick={onHome}><Home size={21}/><span>Home</span></button>
      <button className={cls(!homeOpen && view==='chat' && 'active')} onClick={onChat}><MessageSquare size={21}/><span>Chat</span></button>
      <button className={cls(!homeOpen && view==='computer' && 'active')} onClick={onComputer}><Computer size={21}/><span>Computer</span></button>
      <button className={cls(!homeOpen && view==='files' && 'active')} onClick={onFiles}><Images size={21}/><span>Files</span></button>
      <button className={cls(!homeOpen && view==='settings' && 'active')} onClick={onSettings}><Settings size={21}/><span>Settings</span></button>
    </nav>
  );
}

export default function App() {
  const [auth, setAuth] = useState(() => readLocal(LOCAL_KEYS.session, null));
  const [profile, setProfile] = useState(() => readLocal(LOCAL_KEYS.profile, null));
  const [cloudMode, setCloudMode] = useState(false);
  const [onboarded, setOnboarded] = useState(() => readLocal(LOCAL_KEYS.onboarded, false));
  const [agents, setAgents] = useState(() => readLocal(LOCAL_KEYS.agents, STARTER_AGENTS));
  const [conversations, setConversations] = useState(() => readLocal(LOCAL_KEYS.conversations, DEFAULT_CONVERSATIONS));
  const [teams, setTeams] = useState(() => readLocal(LOCAL_KEYS.teams, []));
  const [files, setFiles] = useState(() => readLocal(LOCAL_KEYS.files, []));
  const [view, setView] = useState('chat');
  const [activeAgentId, setActiveAgentId] = useState('ripo');
  const [activeTeamId, setActiveTeamId] = useState(null);
  const [mobileNav, setMobileNav] = useState(true);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [theme, setTheme] = useState(() => readLocal(LOCAL_KEYS.theme, 'light'));
  const [accent, setAccent] = useState(() => readLocal(LOCAL_KEYS.accent, '#111111'));
  const [account, setAccount] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(() => readLocal(LOCAL_KEYS.activeWorkspace, null));
  const [archivedChats, setArchivedChats] = useState(() => readLocal(LOCAL_KEYS.archivedChats, []));
  const [modal, setModal] = useState(null);
  const [sending, setSending] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [toast, setToast] = useState('');
  const [syncState, setSyncState] = useState('saved');

  const activeAgent = agents.find((item) => item.id === activeAgentId) || agents[0];
  const activeTeam = teams.find((item) => item.id === activeTeamId) || null;
  const threadKey = activeTeam ? `team:${activeTeam.id}` : activeAgent?.id;
  const messages = conversations[threadKey] || [];

  async function refreshAccount() {
    if (!cloudMode && !storedToken()) return null;
    try {
      const data = await api('/api/account');
      setAccount(data);
      if (data?.user) { setProfile(data.user); writeLocal(LOCAL_KEYS.profile, data.user); }
      return data;
    } catch { return null; }
  }

  async function refreshWorkspaces(preferredId = activeWorkspaceId) {
    if (!storedToken()) return [];
    try {
      const data = await api('/api/workspaces');
      const list = data.workspaces || [];
      setWorkspaces(list);
      const chosen = list.find((item) => item.id === preferredId)?.id || list[0]?.id || null;
      if (chosen && chosen !== activeWorkspaceId) {
        setActiveWorkspaceId(chosen);
        writeLocal(LOCAL_KEYS.activeWorkspace, chosen);
      }
      return list;
    } catch { return []; }
  }

  async function loadWorkspace(workspaceId) {
    if (!workspaceId || !storedToken()) return;
    try {
      const state = await api(`/api/state?workspaceId=${encodeURIComponent(workspaceId)}`);
      const nextAgents = diversifyLegacyAgents(state?.agents?.length ? state.agents : [STARTER_AGENTS[0]]);
      setAgents(nextAgents);
      const baseConversations = state?.conversations && Object.keys(state.conversations).length ? state.conversations : { ripo: DEFAULT_CONVERSATIONS.ripo };
      const mailbox = await api(`/api/agent-mailbox?workspaceId=${encodeURIComponent(workspaceId)}`).catch(() => ({ messages: [] }));
      setConversations(mergeAgentMailboxIntoConversations(baseConversations, mailbox?.messages || []));
      setTeams(Array.isArray(state?.teams) ? state.teams : []);
      setArchivedChats(Array.isArray(state?.archivedChats) ? state.archivedChats : []);
      if (typeof state?.onboarded === 'boolean') setOnboarded(state.onboarded);
      const dataFiles = await api(`/api/files?workspaceId=${encodeURIComponent(workspaceId)}`).catch(() => ({ files: [] }));
      setFiles(Array.isArray(dataFiles?.files) ? dataFiles.files : []);
      setActiveAgentId(nextAgents[0]?.id || 'ripo');
      setActiveTeamId(null);
    } catch {}
  }

  useEffect(() => {
    api('/api/auth/session').then(async (data) => {
      if (!data?.user) return;
      const previous = readLocal(LOCAL_KEYS.session, null);
      const next = { profile: data.user, cloud: true, token: previous?.token || '', expiresAt: previous?.expiresAt || null };
      setAuth(next); setProfile(data.user); setCloudMode(true); setAccount(data);
      writeLocal(LOCAL_KEYS.session, next); writeLocal(LOCAL_KEYS.profile, data.user);
      const workspaceData = await api('/api/workspaces').catch(() => ({ workspaces: [] }));
      const list = workspaceData.workspaces || [];
      setWorkspaces(list);
      const remembered = readLocal(LOCAL_KEYS.activeWorkspace, null);
      const workspaceId = list.find((item) => item.id === remembered)?.id || data.defaultWorkspaceId || list[0]?.id;
      if (workspaceId) {
        setActiveWorkspaceId(workspaceId); writeLocal(LOCAL_KEYS.activeWorkspace, workspaceId);
        await loadWorkspace(workspaceId);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => { writeLocal(LOCAL_KEYS.agents, agents); }, [agents]);
  useEffect(() => { writeLocal(LOCAL_KEYS.conversations, conversations); }, [conversations]);
  useEffect(() => { writeLocal(LOCAL_KEYS.teams, teams); }, [teams]);
  useEffect(() => { writeLocal(LOCAL_KEYS.files, files); }, [files]);
  useEffect(() => { writeLocal(LOCAL_KEYS.onboarded, onboarded); }, [onboarded]);
  useEffect(() => { writeLocal(LOCAL_KEYS.archivedChats, archivedChats); }, [archivedChats]);
  useEffect(() => { if (activeWorkspaceId) writeLocal(LOCAL_KEYS.activeWorkspace, activeWorkspaceId); }, [activeWorkspaceId]);
  useEffect(() => {
    if (!cloudMode || !auth || !activeWorkspaceId) return undefined;
    let alive = true;
    const pullMailbox = async () => {
      const mailbox = await api(`/api/agent-mailbox?workspaceId=${encodeURIComponent(activeWorkspaceId)}`).catch(() => null);
      if (alive && mailbox?.messages?.length) {
        setConversations((current) => mergeAgentMailboxIntoConversations(current, mailbox.messages));
      }
    };
    pullMailbox();
    const timer = setInterval(pullMailbox, 12000);
    return () => { alive = false; clearInterval(timer); };
  }, [cloudMode, auth, activeWorkspaceId]);
  useEffect(() => {
    writeLocal(LOCAL_KEYS.accent, accent);
    document.documentElement.style.setProperty('--user-accent', accent);
  }, [accent]);
  useEffect(() => {
    writeLocal(LOCAL_KEYS.theme, theme);
    const root = document.documentElement;
    root.dataset.theme = theme;
    if (theme === 'system') {
      const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      root.dataset.resolvedTheme = dark ? 'dark' : 'light';
      root.style.colorScheme = dark ? 'dark' : 'light';
    } else {
      root.dataset.resolvedTheme = theme;
      root.style.colorScheme = theme;
    }
  }, [theme]);

  useEffect(() => {
    if (!cloudMode || !auth || !onboarded) return undefined;
    setSyncState('saving');
    const timer = setTimeout(() => {
      api('/api/state', {
        method: 'PUT',
        body: JSON.stringify({ workspaceId: activeWorkspaceId, agents, conversations, teams, archivedChats, onboarded })
      }).then(() => setSyncState('saved')).catch(() => setSyncState('local'));
    }, 700);
    return () => clearTimeout(timer);
  }, [agents, conversations, teams, archivedChats, onboarded, cloudMode, auth, activeWorkspaceId]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  async function authenticated({ profile: nextProfile, cloud, token = '', expiresAt = null, account: nextAccount = null }) {
    const next = { profile: nextProfile, cloud, token, expiresAt };
    setAuth(next); setProfile(nextProfile); setCloudMode(cloud);
    writeLocal(LOCAL_KEYS.session, next); writeLocal(LOCAL_KEYS.profile, nextProfile);
    if (cloud) {
      const accountData = nextAccount || await api('/api/account').catch(() => null);
      if (accountData) setAccount(accountData);
      const list = await refreshWorkspaces(accountData?.defaultWorkspaceId || null);
      const workspaceId = list[0]?.id || accountData?.defaultWorkspaceId;
      if (workspaceId) { setActiveWorkspaceId(workspaceId); await loadWorkspace(workspaceId); }
    }
  }

  function finishOnboarding(data) {
    const selectedIds = new Set(['ripo', ...(data.starter || [])]);
    const starterAgents = STARTER_AGENTS.filter((agent) => selectedIds.has(agent.id)).map((agent) => agent.id === 'ripo' ? {
      ...agent,
      role: data.mainRole || agent.role,
      description: data.mainRole ? `Your main ${data.mainRole}. Plans work, delegates, searches, uses tools, and keeps the team moving.` : agent.description,
      ...(data.mainAvatar || {}),
      avatarSeed: data.mainAvatar?.avatarSeed || agent.avatarSeed || uid('avatar'),
      avatarVisualVersion: 5
    } : { ...agent, avatarSeed: agent.avatarSeed || uid('avatar'), avatarVisualVersion: 5 });
    setAgents(starterAgents);
    const nextProfile = { ...(profile || {}), name: data.displayName, goal: data.goal };
    setProfile(nextProfile); writeLocal(LOCAL_KEYS.profile, nextProfile);
    setOnboarded(true);
  }

  async function selectWorkspace(workspaceId) {
    if (!workspaceId || workspaceId === activeWorkspaceId) { setView('chat'); return; }
    if (cloudMode && activeWorkspaceId) {
      await api('/api/state', { method: 'PUT', body: JSON.stringify({ workspaceId: activeWorkspaceId, agents, conversations, teams, archivedChats, onboarded }) }).catch(() => {});
    }
    setActiveWorkspaceId(workspaceId);
    writeLocal(LOCAL_KEYS.activeWorkspace, workspaceId);
    await loadWorkspace(workspaceId);
    setView('chat'); setMobileNav(false); setToast('Workspace switched');
  }

  function archiveCurrentChat() {
    if (!threadKey || !messages.length) return;
    const firstUser = messages.find((message) => message.role === 'user')?.content || (activeTeam?.name || activeAgent?.name || 'Conversation');
    const archive = {
      id: uid('archive'), threadKey, agentId: activeAgent?.id || null, teamId: activeTeam?.id || null,
      title: firstUser.slice(0, 72), createdAt: Date.now(), messages
    };
    setArchivedChats((current) => [archive, ...current].slice(0, 200));
  }

  function newTask() {
    archiveCurrentChat();
    if (!threadKey) return;
    setConversations((current) => ({ ...current, [threadKey]: [] }));
    setView('chat'); setMobileNav(false);
  }

  function openArchive(archive) {
    if (!archive) return;
    if (archive.teamId) { setActiveTeamId(archive.teamId); }
    else { setActiveAgentId(archive.agentId || 'ripo'); setActiveTeamId(null); }
    setConversations((current) => ({ ...current, [archive.threadKey]: archive.messages || [] }));
    setView('chat'); setMobileNav(false);
  }

  function navigate(next) {
    setView(next); setMobileNav(false);
    if (next !== 'chat') { setActiveTeamId(null); }
  }

  function openAgent(agentId) {
    setActiveAgentId(agentId); setActiveTeamId(null); setView('chat'); setMobileNav(false);
  }

  function openTeam(teamId) {
    setActiveTeamId(teamId); setView('chat'); setMobileNav(false);
  }

  function createAgent(form) {
    const next = { ...form, id: uid('agent'), avatarSeed: form.avatarSeed || uid('avatar'), avatarVisualVersion: 5, state: 'ready', isPrimary: false };
    setAgents((current) => [...current, next]);
    setConversations((current) => ({ ...current, [next.id]: [{ id: uid('welcome'), role: 'assistant', content: `I’m ${next.name}. ${next.description || 'Tell me what you want me to handle.'}`, createdAt: new Date().toISOString(), agentId: next.id }] }));
    setModal(null); openAgent(next.id); setToast(`${next.name} joined your team`);
  }

  function saveAgent(form) {
    setAgents((current) => current.map((item) => item.id === activeAgent.id ? { ...item, ...form } : item));
    setModal(null); setToast('Agent updated');
  }

  function renameAgent(name) {
    setAgents((current) => current.map((item) => item.id === activeAgent.id ? { ...item, name } : item));
    setToast(`Renamed to ${name}`);
  }

  function createTeam(team) {
    setTeams((current) => [...current, team]);
    setConversations((current) => ({ ...current, [`team:${team.id}`]: [] }));
    setModal(null); openTeam(team.id); setToast(`${team.name} created`);
  }

  async function uploadFiles(selected) {
    const uploaded = [];
    for (const file of selected) {
      if (cloudMode) {
        try {
          const body = new FormData();
          body.append('file', file);
          if (activeWorkspaceId) body.append('workspaceId', activeWorkspaceId);
          const result = await api('/api/files', { method: 'POST', body });
          if (result?.file) { uploaded.push(result.file); continue; }
        } catch {
          // Fall back to device metadata below.
        }
      }
      uploaded.push({ id: uid('file'), name: file.name, size: file.size, type: file.type, source: 'device', createdAt: Date.now() });
    }
    setFiles((current) => [...uploaded, ...current]);
    setToast(`${uploaded.length} file${uploaded.length === 1 ? '' : 's'} added`);
    refreshWorkspaces(activeWorkspaceId).catch(() => {});
    return uploaded;
  }

  async function deleteFile(file) {
    if (!file?.id) return;
    try {
      await api(`/api/files/${encodeURIComponent(file.id)}`, { method: 'DELETE' });
      setFiles((current) => current.filter((item) => item.id !== file.id));
      setToast('File deleted');
      refreshWorkspaces(activeWorkspaceId).catch(() => {});
    } catch (error) { alert(error.message || 'Could not delete file.'); }
  }

  async function sendSingleAgent(agent, text, options = {}, history, targetKey) {
    setAgents((current) => current.map((item) => item.id === agent.id ? { ...item, state: 'working' } : item));
    const payloadMessages = history.slice(-18).map((message) => ({ role: message.role, content: message.content }));
    const result = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        agentId: agent.id,
        agentName: agent.name,
        agentRole: agent.role,
        agentInstructions: agent.instructions || '',
        messages: payloadMessages,
        workspaceId: activeWorkspaceId,
        attachments: (options.attachments || []).map((file) => ({ id: file.id, name: file.name, type: file.type })),
        availableAgents: agents.map((item) => ({
          id: item.id,
          name: item.name,
          role: item.role,
          description: item.description || '',
          instructions: item.instructions || '',
          isPrimary: Boolean(item.isPrimary)
        })),
        allowAgentAdmin: Boolean(agent.isPrimary),
        allowRename: Boolean(agent.canRenameSelf)
      })
    });
    if (Array.isArray(result.actions)) {
      for (const action of result.actions) {
        if (action.type === 'rename_agent' && action.name) {
          const nextName = String(action.name).trim().slice(0, 80);
          const targetName = String(action.targetName || '').trim().toLowerCase();
          if (nextName && agent.isPrimary && targetName) {
            setAgents((current) => current.map((item) => item.name.toLowerCase() === targetName ? { ...item, name: nextName } : item));
          } else if (nextName && agent.canRenameSelf) {
            setAgents((current) => current.map((item) => item.id === agent.id ? { ...item, name: nextName } : item));
          }
        }
        if (action.type === 'create_agent' && agent.isPrimary && action.name) {
          const newAgent = {
            id: uid('agent'),
            name: String(action.name).trim().slice(0, 80),
            role: String(action.role || 'Specialist agent').trim().slice(0, 120),
            description: String(action.description || 'Created by Ripo Bot for this workspace.').trim().slice(0, 220),
            instructions: String(action.instructions || 'Help with the assigned specialty.').trim().slice(0, 1800),
            avatar: AVATAR_PRESETS.some((preset) => preset.id === action.avatar) ? action.avatar : 'nova',
            avatarSeed: uid('avatar'),
            avatarVisualVersion: 5,
            state: 'ready',
            canRenameSelf: true,
            isPrimary: false
          };
          setAgents((current) => current.some((item) => item.name.toLowerCase() === newAgent.name.toLowerCase()) ? current : [...current, newAgent]);
          setConversations((current) => current[newAgent.id] ? current : { ...current, [newAgent.id]: [] });
          setToast(`${newAgent.name} joined your team`);
        }
        if (action.type === 'create_team' && agent.isPrimary && action.name && Array.isArray(action.memberNames)) {
          const wanted = action.memberNames.map((name) => String(name).toLowerCase());
          const memberIds = agents.filter((item) => wanted.includes(item.name.toLowerCase())).map((item) => item.id);
          if (memberIds.length >= 2) {
            const newTeam = { id: uid('team'), name: String(action.name).trim().slice(0, 80), members: memberIds, createdAt: Date.now() };
            setTeams((current) => [...current, newTeam]);
            setConversations((current) => ({ ...current, [`team:${newTeam.id}`]: current[`team:${newTeam.id}`] || [] }));
            setToast(`${newTeam.name} created`);
          }
        }
      }
    }
    const interAgentMessages = Array.isArray(result.interAgentMessages) ? result.interAgentMessages : [];
    const delegatedMessages = !interAgentMessages.length && Array.isArray(result.delegatedReplies)
      ? result.delegatedReplies.map((item) => ({
          id: uid('delegated'),
          role: 'assistant',
          content: item.content,
          createdAt: new Date().toISOString(),
          agentId: item.agentId,
          delegated: true
        }))
      : [];
    const reply = {
      id: uid('assistant'), role: 'assistant', content: result.reply,
      createdAt: new Date().toISOString(), agentId: agent.id,
      sources: result.sources || [],
      generatedFiles: result.generatedFiles || []
    };
    if (Array.isArray(result.generatedFiles) && result.generatedFiles.length) {
      setFiles((current) => [...result.generatedFiles, ...current.filter((file) => !result.generatedFiles.some((generated) => generated.id === file.id))]);
    }
    if (Array.isArray(result.updatedFiles) && result.updatedFiles.length) {
      setFiles((current) => {
        const updates = new Map(result.updatedFiles.map((file)=>[file.id,file]));
        return current.map((file)=>updates.has(file.id)?{...file,...updates.get(file.id)}:file);
      });
      setToast(`${result.updatedFiles.length} file${result.updatedFiles.length===1?'':'s'} edited`);
    }
    if (interAgentMessages.length || delegatedMessages.length) {
      const names = [...new Set([
        ...interAgentMessages.map((item) => item.targetAgentName),
        ...(result.delegatedReplies || []).map((item) => item.agentName)
      ].filter(Boolean))];
      if (names.length) setToast(`${names.join(', ')} replied to ${agent.name}`);
    }
    if (result.usage || typeof result.coins === 'number') {
      setAccount((current) => current ? { ...current, usage: result.usage || current.usage, coins: typeof result.coins === 'number' ? result.coins : current.coins } : current);
    }
    setConversations((current) => {
      const merged = mergeAgentMailboxIntoConversations(current, interAgentMessages, targetKey, agent.id);
      return { ...merged, [targetKey]: [...(merged[targetKey] || []), ...delegatedMessages, reply] };
    });
    setAgents((current) => current.map((item) => item.id === agent.id ? { ...item, state: 'done' } : item));
    setTimeout(() => setAgents((current) => current.map((item) => item.id === agent.id ? { ...item, state: 'ready' } : item)), 1200);
    return reply;
  }

  async function sendMessage(text, options) {
    if (!threadKey || sending) return;
    const userMessage = { id: uid('user'), role: 'user', content: text, createdAt: new Date().toISOString(), attachments: options.attachments || [] };
    const initialHistory = [...messages, userMessage];
    setConversations((current) => ({ ...current, [threadKey]: [...(current[threadKey] || []), userMessage] }));
    setSending(true);
    try {
      if (activeTeam) {
        let rolling = initialHistory;
        const memberAgents = activeTeam.members.map((id) => agents.find((item) => item.id === id)).filter(Boolean);
        for (const member of memberAgents) {
          const teamPrompt = member.id === memberAgents[0]?.id
            ? text
            : `Continue the team task. Read the previous agents' contributions, add what your specialty can improve, and do not repeat them unnecessarily. Original task: ${text}`;
          const teamHistory = [...rolling.slice(-12), { id: uid('handoff'), role: 'user', content: teamPrompt, createdAt: new Date().toISOString() }];
          const reply = await sendSingleAgent(member, teamPrompt, options, teamHistory, threadKey);
          rolling = [...rolling, reply];
        }
      } else {
        await sendSingleAgent(activeAgent, text, options, initialHistory, threadKey);
      }
    } catch (err) {
      const errorMessage = { id: uid('error'), role: 'assistant', content: err.message || 'Ripo Bot could not reach the model.', createdAt: new Date().toISOString(), agentId: activeAgent?.id };
      setConversations((current) => ({ ...current, [threadKey]: [...(current[threadKey] || []), errorMessage] }));
      if (activeAgent) setAgents((current) => current.map((item) => item.id === activeAgent.id ? { ...item, state: 'error' } : item));
    } finally {
      setSending(false);
    }
  }

  async function sendVoiceTurn(text, participantIds) {
    if (!threadKey || sending) return [];
    const selected = (participantIds || []).map((id) => agents.find((agent) => agent.id === id)).filter(Boolean);
    const participants = selected.length ? selected : [activeAgent].filter(Boolean);
    const userMessage = { id: uid('voice-user'), role: 'user', content: text, createdAt: new Date().toISOString(), voice: true };
    const base = [...(conversations[threadKey] || []), userMessage];
    setConversations((current) => ({ ...current, [threadKey]: [...(current[threadKey] || []), userMessage] }));
    setSending(true);
    const replies = [];
    try {
      let rolling = base;
      for (const participant of participants) {
        const prompt = participants.length > 1 ? `Voice meeting message from the user: ${text}\nRespond as ${participant.name}. You may coordinate with the other bots, but keep the spoken response concise.` : text;
        const reply = await sendSingleAgent(participant, prompt, {}, rolling, threadKey);
        replies.push({ ...reply, agent: participant });
        rolling = [...rolling, reply];
      }
      return replies;
    } finally { setSending(false); }
  }

  async function logout() {
    if (cloudMode) api('/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => {});
    setAuth(null); setCloudMode(false); setProfile(null); setAccount(null); setOnboarded(false); setWorkspaces([]);
    const keepTheme = theme, keepAccent = accent;
    Object.values(LOCAL_KEYS).forEach((key) => { try { localStorage.removeItem(key); } catch {} });
    writeLocal(LOCAL_KEYS.theme, keepTheme); writeLocal(LOCAL_KEYS.accent, keepAccent);
  }

  async function switchAccount() { await logout(); }

  const visibleAgents = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return agents;
    return agents.filter((agent) => `${agent.name} ${agent.role}`.toLowerCase().includes(query));
  }, [agents, searchText]);

  if (!auth) return <AuthScreen onAuthenticated={authenticated} />;
  if (!onboarded) return <Onboarding profile={profile || auth.profile} onDone={finishOnboarding} />;

  return (
    <div className="app-shell" data-theme={theme}>
      <aside className={cls('sidebar', mobileNav && 'mobile-open')}>
        <section className="mobile-bot-home">
          <header className="mobile-home-head">
            <ProfilePicture account={account || { user: profile }} size="lg" onClick={() => navigate('settings')} />
            <div className="mobile-brand-v6">
              <Avatar agent={{id:'ripo-brand-v6',avatarSeed:'ripo-brand-v6',avatarShape:7,avatarColor:'#111111',avatarMotion:6}} size="xs"/>
              <strong>Ripo Bot</strong>
            </div>
            <div className="mobile-home-actions">
              <button onClick={() => setMobileSearchOpen((value) => !value)} aria-label="Search bots"><Search size={20}/></button>
              <button onClick={() => setModal('new-agent')} aria-label="Create bot"><Plus size={22}/></button>
            </div>
          </header>
          {mobileSearchOpen && <div className="mobile-home-search"><Search size={16}/><input value={searchText} onChange={(event)=>setSearchText(event.target.value)} placeholder="Search bots" autoFocus /></div>}
          <div className="mobile-featured-bots">
            {visibleAgents.slice(0,3).map((agent) => <button key={agent.id} onClick={() => openAgent(agent.id)}>
              <Avatar agent={agent} size="lg" />
              <span>{agent.role || agent.name}</span>
            </button>)}
          </div>
          <div className="mobile-bot-feed">
            {visibleAgents.map((agent) => {
              const thread = conversations[agent.id] || [];
              const last = [...thread].reverse().find((message) => message.role !== 'system');
              return <button key={agent.id} className="mobile-bot-row" onClick={() => openAgent(agent.id)}>
                <Avatar agent={agent} size="sm" />
                <span className="mobile-bot-copy"><strong>{agent.name}</strong><small>{last?.content || agent.description || agent.role}</small></span>
                <time>{last?.createdAt ? formatTime(last.createdAt) : ''}</time>
              </button>;
            })}
            {teams.map((team) => <button key={team.id} className="mobile-bot-row" onClick={() => openTeam(team.id)}>
              <span className="mobile-team-orb"><Users size={18}/></span>
              <span className="mobile-bot-copy"><strong>{team.name}</strong><small>{team.members.length} bots working together</small></span>
              <time />
            </button>)}
          </div>
        </section>
        <div className="sidebar-top">
          <button className="sidebar-profile-orb" onClick={() => navigate('settings')} aria-label="Open settings">{(profile?.name || 'R').slice(0, 1).toUpperCase()}</button>
          <div className="brand-lockup sidebar-brand mobile-brand-v6"><Avatar agent={{id:'ripo-brand-desktop',avatarSeed:'ripo-brand-v6',avatarShape:7,avatarColor:'#111111',avatarMotion:6}} size="xs"/><span>Ripo Bot</span></div>
          <div className="sidebar-top-actions">
            <button className="icon-button" onClick={() => setModal('new-agent')} aria-label="Create bot"><Plus size={18} /></button>
            <button className="icon-button sidebar-close" onClick={() => setMobileNav(false)}><X size={18} /></button>
          </div>
        </div>
        <button className="new-task-button" onClick={newTask}><Plus size={17} /><span>New task</span><kbd>⌘ N</kbd></button>
        <div className="sidebar-search"><Search size={15} /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search bots" /><kbd>⌘ K</kbd></div>

        <nav className="sidebar-nav primary-nav">
          <button className={cls(view === 'chat' && !activeTeamId && activeAgentId === 'ripo' && 'active')} onClick={() => openAgent('ripo')}><MessageSquare size={17} /><span>Ripo Bot</span></button>
          <button className={cls(view === 'files' && 'active')} onClick={() => navigate('files')}><Folder size={17} /><span>Files</span><em>{files.length || ''}</em></button>
          <button className={cls(view === 'computer' && 'active')} onClick={() => navigate('computer')}><Computer size={17} /><span>Computer</span></button>
        </nav>

        <div className="sidebar-section">
          <div className="section-label"><span>Bots</span><button onClick={() => setModal('new-agent')} aria-label="Create agent"><Plus size={14} /></button></div>
          <div className="agent-list">
            {visibleAgents.map((agent) => <button key={agent.id} className={cls('agent-list-item', view === 'chat' && !activeTeamId && activeAgentId === agent.id && 'active')} onClick={() => openAgent(agent.id)}><Avatar agent={agent} size="xs" /><span><strong>{agent.name}</strong><small>{agent.state === 'ready' ? agent.role : agent.state}</small></span>{agent.state !== 'ready' ? <i className={`tiny-state state-${agent.state}`} /> : null}</button>)}
          </div>
        </div>

        <div className="sidebar-section teams-section">
          <div className="section-label"><span>Teams</span><button onClick={() => setModal('new-team')} aria-label="Create team"><Plus size={14} /></button></div>
          <div className="team-list">
            {teams.length === 0 ? <button className="create-team-hint" onClick={() => setModal('new-team')}><Users size={15} /> Create a team</button> : teams.map((team) => <button key={team.id} className={cls(view === 'chat' && activeTeamId === team.id && 'active')} onClick={() => openTeam(team.id)}><Users size={15} /><span>{team.name}</span><small>{team.members.length}</small></button>)}
          </div>
        </div>

        {archivedChats.length > 0 && <div className="sidebar-section recent-section">
          <div className="section-label"><span>Recent</span><small>{archivedChats.length}</small></div>
          <div className="recent-chat-list">
            {archivedChats.slice(0, 8).map((chat) => <button key={chat.id} onClick={() => openArchive(chat)}><MessageSquare size={14}/><span><strong>{chat.title || 'Saved chat'}</strong><small>{new Date(chat.createdAt).toLocaleDateString()}</small></span></button>)}
          </div>
        </div>}

        <div className="sidebar-footer">
          <button className={cls('sync-indicator', syncState === 'local' && 'local')}><Cloud size={14} /><span>{cloudMode ? (syncState === 'saving' ? 'Saving…' : syncState === 'local' ? 'Saved locally' : 'Synced') : 'Device mode'}</span></button>
          <button className={cls('profile-button', view === 'settings' && 'active')} onClick={() => navigate('settings')}><span className="profile-avatar">{(profile?.name || 'R').slice(0, 1).toUpperCase()}</span><span><strong>{profile?.name || 'Ripo user'}</strong><small>{account?.plan === 'plus' ? 'Plus · cloud workspace' : cloudMode ? 'Free · cloud workspace' : 'This device'}</small></span><Settings size={15} /></button>
        </div>
      </aside>
      {mobileNav && <div className="mobile-scrim" onClick={() => setMobileNav(false)} />}

      <main className="main-shell">
        <button className="mobile-menu-button" onClick={() => setMobileNav(true)} aria-label="Back to bots"><ArrowLeft size={20} /></button>
        {view === 'chat' && <ChatView agent={activeAgent} team={activeTeam} agents={agents} messages={messages} sending={sending} onSend={sendMessage} onRename={renameAgent} onEdit={() => setModal('edit-agent')} onOpenDetails={() => setModal('bot-details')} onStartCall={() => setModal('voice-call')} onShowBots={() => setMobileNav(true)} onUploadFiles={uploadFiles} files={files} />}
        {view === 'files' && <FilesView files={files} onUpload={uploadFiles} cloudMode={cloudMode} />}
        {view === 'computer' && <ComputerView />}
        {view === 'settings' && <SettingsView profile={profile} cloudMode={cloudMode} theme={theme} accent={accent} onThemeChange={setTheme} onAccentChange={setAccent} onLogout={logout} onSwitchAccount={switchAccount} account={account} onRefreshAccount={refreshAccount} workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} onSelectWorkspace={selectWorkspace} onRefreshWorkspaces={() => refreshWorkspaces(activeWorkspaceId)} files={files} onDeleteFile={deleteFile} />}
      </main>

      <MobileTabBar
        view={view}
        homeOpen={mobileNav}
        onHome={()=>setMobileNav(true)}
        onChat={()=>{setView('chat');setMobileNav(false);}}
        onComputer={()=>navigate('computer')}
        onFiles={()=>navigate('files')}
        onSettings={()=>navigate('settings')}
      />

      {modal === 'new-agent' && <AgentEditor onClose={() => setModal(null)} onSave={createAgent} />}
      {modal === 'edit-agent' && activeAgent && <AgentEditor initialAgent={activeAgent} onClose={() => setModal(null)} onSave={saveAgent} />}
      {modal === 'new-team' && <TeamEditor agents={agents} onClose={() => setModal(null)} onSave={createTeam} />}
      {modal === 'bot-details' && activeAgent && <BotDetails agent={activeAgent} files={files} onClose={() => setModal(null)} onEdit={() => setModal('edit-agent')} onOpenComputer={() => { setModal(null); navigate('computer'); }} />}
      {modal === 'voice-call' && activeAgent && <VoiceCall agents={agents} initialAgent={activeAgent} onClose={() => setModal(null)} onTurn={sendVoiceTurn} />}
      {toast && <div className="toast"><CheckCircle2 size={16} />{toast}</div>}
    </div>
  );
}
