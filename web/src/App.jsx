import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  ExternalLink,
  FileText,
  FolderKanban,
  Globe2,
  House,
  Inbox,
  ListTodo,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Puzzle,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
  X,
  Zap
} from 'lucide-react';
import { DEFAULT_AGENTS, DEFAULT_MESSAGES, DEFAULT_TASKS, DEFAULT_WORKFLOWS, INTEGRATIONS } from './data.js';

const API_BASE = import.meta.env.DEV
  ? ''
  : (import.meta.env.VITE_API_BASE_URL || 'https://ripobot-api.ripo-ripoteam.workers.dev');

const NAV_ITEMS = [
  { id: 'home', label: 'Overview', icon: House },
  { id: 'agents', label: 'AI team', icon: UsersRound },
  { id: 'tasks', label: 'Tasks', icon: ListTodo },
  { id: 'workflows', label: 'Workflows', icon: Workflow },
  { id: 'integrations', label: 'Integrations', icon: Puzzle }
];

function useStoredState(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const saved = window.localStorage.getItem(key);
      return saved ? JSON.parse(saved) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The app keeps working when browser storage is unavailable.
    }
  }, [key, value]);

  return [value, setValue];
}

function Avatar({ agent, size = 'regular' }) {
  if (agent?.image) {
    return (
      <span className={'avatar avatar-image avatar-' + (agent.color || 'sky') + ' avatar-' + size}>
        <img src="/assets/ripobot-mascot.png" alt="" />
      </span>
    );
  }
  return (
    <span className={'avatar avatar-' + (agent?.color || 'sky') + ' avatar-' + size} aria-hidden="true">
      {agent?.name?.slice(0, 1) || 'R'}
    </span>
  );
}

function StatusPill({ status }) {
  const meta = {
    working: { label: 'Working', className: 'status-working' },
    review: { label: 'Ready to review', className: 'status-review' },
    done: { label: 'Completed', className: 'status-done' },
    attention: { label: 'Needs attention', className: 'status-attention' },
    scheduled: { label: 'Scheduled', className: 'status-scheduled' }
  }[status] || { label: 'Ready', className: 'status-ready' };
  return <span className={'status-pill ' + meta.className}><i />{meta.label}</span>;
}

function App() {
  const [page, setPage] = useState('home');
  const [agents, setAgents] = useStoredState('ripobot.agents', DEFAULT_AGENTS);
  const [tasks, setTasks] = useStoredState('ripobot.tasks', DEFAULT_TASKS);
  const [workflows, setWorkflows] = useStoredState('ripobot.workflows', DEFAULT_WORKFLOWS);
  const [messages, setMessages] = useStoredState('ripobot.messages', DEFAULT_MESSAGES);
  const [activeAgentId, setActiveAgentId] = useState('ripo');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [modelConfig, setModelConfig] = useState({
    primaryModel: 'meta-llama/Llama-3.1-8B-Instruct',
    primaryConfigured: false,
    accessCodeRequired: false,
    accessCodeSetupRequired: false,
    huggingFaceReady: false,
    backupReady: true
  });
  const [accessCode, setAccessCode] = useState(() => {
    try {
      return window.sessionStorage.getItem('ripobot.accessCode') || '';
    } catch {
      return '';
    }
  });
  const [busyAgents, setBusyAgents] = useState({});
  const [globalSearch, setGlobalSearch] = useState('');
  const [appearance, setAppearance] = useStoredState('ripobot.appearance', 'light');

  const activeAgent = agents.find((agent) => agent.id === activeAgentId) || agents[0] || DEFAULT_AGENTS[0];
  const messagesForAgent = messages[activeAgent?.id] || [];

  function refreshModelConfig(code = accessCode) {
    const headers = code ? { 'X-RipoBot-Access-Code': code } : {};
    return fetch(`${API_BASE}/api/config`, { headers })
      .then((response) => response.ok ? response.json() : null)
      .then((config) => {
        if (config) setModelConfig(config);
        return config;
      })
      .catch(() => null);
  }

  function updateAccessCode(value) {
    setAccessCode(value);
    try {
      if (value) window.sessionStorage.setItem('ripobot.accessCode', value);
      else window.sessionStorage.removeItem('ripobot.accessCode');
    } catch {
      // The code can be entered again if this browser blocks session storage.
    }
  }

  useEffect(() => {
    refreshModelConfig();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setModal(null);
        setMobileNavOpen(false);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector('.global-search input')?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function navigate(nextPage) {
    setPage(nextPage);
    setMobileNavOpen(false);
  }

  function openChat(agentId) {
    setActiveAgentId(agentId);
    setPage('chat');
    setMobileNavOpen(false);
  }

  async function sendMessage(agentId, text, taskId) {
    const content = String(text || '').trim();
    if (!content || busyAgents[agentId]) return;
    const agent = agents.find((item) => item.id === agentId) || DEFAULT_AGENTS[0];
    const userMessage = { id: 'u-' + Date.now(), role: 'user', content, time: new Date().toISOString() };
    const existing = messages[agentId] || [];
    const nextMessages = [...existing, userMessage];
    setMessages((current) => ({ ...current, [agentId]: [...(current[agentId] || []), userMessage] }));
    setBusyAgents((current) => ({ ...current, [agentId]: true }));

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessCode ? { 'X-RipoBot-Access-Code': accessCode } : {})
        },
        body: JSON.stringify({
          agentName: agent.name,
          agentRole: agent.title,
          agentInstructions: agent.instructions || '',
          messages: nextMessages.map((message) => ({ role: message.role, content: message.content }))
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The AI model could not be reached.');
      const assistantMessage = {
        id: 'a-' + Date.now(),
        role: 'assistant',
        content: data.reply,
        provider: data.provider,
        model: data.model,
        time: new Date().toISOString()
      };
      setMessages((current) => ({ ...current, [agentId]: [...(current[agentId] || []), assistantMessage] }));
      if (taskId) {
        setTasks((current) => current.map((task) => task.id === taskId ? {
          ...task,
          status: 'review',
          result: data.reply,
          provider: data.provider,
          updatedAt: Date.now()
        } : task));
      }
    } catch (error) {
      const assistantMessage = {
        id: 'err-' + Date.now(),
        role: 'assistant',
        content: error.message || 'I could not reach the AI model. Please try again.',
        error: true,
        time: new Date().toISOString()
      };
      setMessages((current) => ({ ...current, [agentId]: [...(current[agentId] || []), assistantMessage] }));
      if (taskId) {
        setTasks((current) => current.map((task) => task.id === taskId ? {
          ...task,
          status: 'attention',
          result: error.message,
          updatedAt: Date.now()
        } : task));
      }
    } finally {
      setBusyAgents((current) => ({ ...current, [agentId]: false }));
    }
  }

  function startTask(prompt, agentId = 'ripo') {
    const content = String(prompt || '').trim();
    if (!content) return;
    const taskId = 'task-' + Date.now();
    const task = {
      id: taskId,
      title: content.length > 88 ? content.slice(0, 85) + '…' : content,
      agentId,
      status: 'working',
      createdAt: Date.now(),
      sample: false
    };
    setTasks((current) => [task, ...current.filter((item) => !item.sample)]);
    setModal(null);
    setActiveAgentId(agentId);
    setPage('chat');
    sendMessage(agentId, content, taskId);
  }

  function createAgent(details) {
    const agent = {
      ...details,
      id: 'agent-' + Date.now(),
      createdAt: Date.now()
    };
    setAgents((current) => [...current, agent]);
    setMessages((current) => ({
      ...current,
      [agent.id]: [{
        id: 'welcome-' + agent.id,
        role: 'assistant',
        content: 'I’m ' + agent.name + '. I’m ready to help with ' + agent.title.toLowerCase() + ' work. What should we start with?',
        time: 'Welcome'
      }]
    }));
    setModal(null);
    setToast(agent.name + ' joined your AI team');
    openChat(agent.id);
  }

  function createWorkflow(workflow) {
    setWorkflows((current) => [workflow, ...current]);
    setModal(null);
    setToast('Workflow saved to your library');
  }

  function updateTask(taskId, patch) {
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, ...patch } : task));
  }

  function searchSubmit(event) {
    event.preventDefault();
    navigate('agents');
    setAgentSearch(globalSearch);
  }

  const titleByPage = {
    home: 'Overview',
    agents: 'AI team',
    tasks: 'Tasks',
    workflows: 'Workflows',
    integrations: 'Integrations',
    settings: 'Settings',
    chat: activeAgent?.name || 'Chat'
  };

  return (
    <div className={'app-root theme-' + appearance}>
      <aside className={'sidebar ' + (mobileNavOpen ? 'sidebar-open' : '')}>
        <div className="brand-row">
          <img src="/assets/ripobot-icon.png" alt="" className="brand-mark" />
          <span className="brand-word">Ripo<span>Bot</span></span>
          <button className="icon-button sidebar-collapse" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}><X size={17} /></button>
        </div>

        <button className="workspace-switcher" onClick={() => setToast('You are in the Ripo Team workspace')}>
          <span className="workspace-monogram">R</span>
          <span className="workspace-label"><strong>Ripo Team</strong><small>Personal workspace</small></span>
          <ChevronDown size={15} className="muted-icon" />
        </button>

        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Workspace navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const selected = page === item.id || (page === 'chat' && item.id === 'agents');
            return (
              <button key={item.id} className={'nav-item ' + (selected ? 'nav-item-active' : '')} onClick={() => navigate(item.id)}>
                <Icon size={18} strokeWidth={selected ? 2.25 : 1.8} />
                <span>{item.label}</span>
                {item.id === 'tasks' && tasks.some((task) => task.status === 'review' && !task.sample) && <i className="nav-count">{tasks.filter((task) => task.status === 'review' && !task.sample).length}</i>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-section-label team-label">
          YOUR TEAM
          <button className="bare-icon" aria-label="Create an agent" onClick={() => setModal({ type: 'agent' })}><Plus size={15} /></button>
        </div>
        <div className="sidebar-agents">
          {agents.slice(0, 5).map((agent) => (
            <button key={agent.id} className={'sidebar-agent ' + (page === 'chat' && activeAgentId === agent.id ? 'sidebar-agent-active' : '')} onClick={() => openChat(agent.id)}>
              <Avatar agent={agent} size="small" />
              <span>{agent.name}</span>
              <i className="agent-live-dot" />
            </button>
          ))}
          {agents.length > 5 && <button className="sidebar-agent-more" onClick={() => navigate('agents')}>+ {agents.length - 5} more</button>}
        </div>

        <div className="sidebar-spacer" />
        <div className="sidebar-tip">
          <span className="tip-icon"><Sparkles size={17} /></span>
          <div><strong>Build your next agent</strong><small>Give every idea a specialist.</small></div>
          <button aria-label="Create an agent" onClick={() => setModal({ type: 'agent' })}><ArrowRight size={15} /></button>
        </div>
        <button className="nav-item sidebar-settings" onClick={() => navigate('settings')}><Settings size={18} /><span>Settings</span></button>
        <div className="sidebar-profile">
          <span className="profile-avatar">R</span>
          <span className="profile-label"><strong>Ripo Team</strong><small>Workspace owner</small></span>
          <button className="bare-icon" aria-label="Open profile menu" onClick={() => setToast('Profile settings are ready to customize')}><MoreHorizontal size={18} /></button>
        </div>
      </aside>

      {mobileNavOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)} />}

      <div className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNavOpen(true)}><Menu size={20} /></button>
            <div className="breadcrumb"><span>Ripo Team</span><ChevronRight size={14} /><strong>{titleByPage[page]}</strong></div>
          </div>
          <div className="topbar-actions">
            <form className="global-search" onSubmit={searchSubmit}>
              <Search size={16} />
              <input aria-label="Search agents" value={globalSearch} onChange={(event) => setGlobalSearch(event.target.value)} onFocus={() => { if (globalSearch) navigate('agents'); }} placeholder="Search your team" />
              <kbd><Command size={11} /> K</kbd>
            </form>
            <span className={'model-status ' + (modelConfig.huggingFaceReady ? 'model-live' : 'model-backup')} title={modelConfig.huggingFaceReady ? 'Hugging Face primary is configured' : 'Hugging Face token is not configured; backup route is available'}>
              <i />{modelConfig.huggingFaceReady ? 'Llama 3.1' : 'AI ready'}
            </span>
            <button className="icon-button notification-button" aria-label="Activity notifications" onClick={() => navigate('tasks')}><Bell size={18} /><i /></button>
            <button className="topbar-avatar" aria-label="Open settings" onClick={() => navigate('settings')}>R</button>
          </div>
        </header>

        <main className="page-content">
          {page === 'home' && (
            <HomePage
              agents={agents}
              tasks={tasks}
              workflows={workflows}
              onOpenChat={openChat}
              onCreateAgent={() => setModal({ type: 'agent' })}
              onStartTask={startTask}
              onOpenTasks={() => navigate('tasks')}
              onOpenWorkflows={() => navigate('workflows')}
              onOpenSettings={() => navigate('settings')}
              modelConfig={modelConfig}
            />
          )}
          {page === 'agents' && (
            <AgentsPage
              agents={agents}
              search={agentSearch}
              onSearch={setAgentSearch}
              onCreate={() => setModal({ type: 'agent' })}
              onOpenChat={openChat}
            />
          )}
          {page === 'chat' && activeAgent && (
            <ChatPage
              agent={activeAgent}
              messages={messagesForAgent}
              busy={Boolean(busyAgents[activeAgent.id])}
              modelConfig={modelConfig}
              tasks={tasks.filter((task) => task.agentId === activeAgent.id)}
              onSend={(text) => sendMessage(activeAgent.id, text)}
              onOpenWorkflows={() => navigate('workflows')}
              onOpenAgent={() => navigate('agents')}
              onOpenSettings={() => navigate('settings')}
            />
          )}
          {page === 'tasks' && (
            <TasksPage
              tasks={tasks}
              agents={agents}
              onCreate={() => setModal({ type: 'task' })}
              onOpenChat={openChat}
              onUpdateTask={updateTask}
            />
          )}
          {page === 'workflows' && (
            <WorkflowsPage
              workflows={workflows}
              agents={agents}
              onCreate={() => setModal({ type: 'workflow' })}
              onRun={(workflow) => startTask(workflow.prompt, workflow.agentId)}
            />
          )}
          {page === 'integrations' && (
            <IntegrationsPage onConnect={(integration) => setModal({ type: 'integration', integration })} />
          )}
          {page === 'settings' && (
            <SettingsPage
              modelConfig={modelConfig}
              accessCode={accessCode}
              onAccessCodeChange={updateAccessCode}
              appearance={appearance}
              onAppearance={setAppearance}
              onReset={() => setModal({ type: 'reset' })}
              onRefresh={() => refreshModelConfig()}
            />
          )}
        </main>
      </div>

      <MobileNav page={page} onNavigate={navigate} />

      {modal?.type === 'agent' && <AgentModal onClose={() => setModal(null)} onSave={createAgent} />}
      {modal?.type === 'task' && <TaskModal agents={agents} onClose={() => setModal(null)} onSave={startTask} />}
      {modal?.type === 'workflow' && <WorkflowModal agents={agents} onClose={() => setModal(null)} onSave={createWorkflow} />}
      {modal?.type === 'integration' && <IntegrationModal integration={modal.integration} onClose={() => setModal(null)} />}
      {modal?.type === 'reset' && <ResetModal onClose={() => setModal(null)} onReset={() => {
        window.localStorage.clear();
        window.location.reload();
      }} />}
      {toast && <div className="toast" role="status"><CheckCircle2 size={17} />{toast}</div>}
    </div>
  );
}

function MobileNav({ page, onNavigate }) {
  const items = [NAV_ITEMS[0], NAV_ITEMS[1], NAV_ITEMS[2], NAV_ITEMS[4]];
  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {items.map((item) => {
        const Icon = item.icon;
        const selected = page === item.id || (page === 'chat' && item.id === 'agents');
        return <button key={item.id} className={selected ? 'mobile-nav-active' : ''} onClick={() => onNavigate(item.id)}><Icon size={19} /><span>{item.label === 'Overview' ? 'Home' : item.label === 'Integrations' ? 'Apps' : item.label}</span></button>;
      })}
    </nav>
  );
}

function PageTitle({ eyebrow, title, description, action }) {
  return (
    <div className="page-title-row">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-title-action">{action}</div>}
    </div>
  );
}

function HomePage({ agents, tasks, workflows, onOpenChat, onCreateAgent, onStartTask, onOpenTasks, onOpenWorkflows, onOpenSettings, modelConfig }) {
  const [prompt, setPrompt] = useState('');
  const [selectedAgent, setSelectedAgent] = useState('ripo');
  const activeTasks = tasks.filter((task) => task.status === 'working' && !task.sample).length;
  const reviewTasks = tasks.filter((task) => task.status === 'review' && !task.sample).length;
  const today = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());

  function submitPrompt(event) {
    event.preventDefault();
    if (!prompt.trim()) return;
    onStartTask(prompt, selectedAgent);
    setPrompt('');
  }

  return (
    <div className="home-layout page-enter">
      <section className="home-primary">
        <div className="home-greeting">
          <div>
            <div className="eyebrow">{today.toUpperCase()} <span className="eyebrow-dot" /> RIPO TEAM WORKSPACE</div>
            <h1>Good to see you, <span>Ripo Team</span></h1>
            <p>Give your AI team a goal. They’ll help you move it forward.</p>
          </div>
          <button className="button button-primary" onClick={() => onStartTask('Help me decide what to focus on next. Ask a couple of quick questions, then suggest a clear first step.', 'ripo')}><Sparkles size={16} />Talk to Ripo</button>
        </div>

        <section className="handoff-card">
          <div className="handoff-main">
            <span className="handoff-kicker"><span className="kicker-star"><Sparkles size={13} /></span>YOUR TEAM IS READY</span>
            <h2>Make room for<br /><em>the work that matters.</em></h2>
            <p>Share the outcome you want. Pick a teammate, or let Ripo help you find the right one.</p>
            <form className="handoff-composer" onSubmit={submitPrompt}>
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="What would you like your team to take on?" aria-label="Describe work for your AI team" rows={2} />
              <div className="composer-controls">
                <label className="agent-select-wrap"><Avatar agent={agents.find((agent) => agent.id === selectedAgent)} size="tiny" /><select aria-label="Choose an agent" value={selectedAgent} onChange={(event) => setSelectedAgent(event.target.value)}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select><ChevronDown size={13} /></label>
                <span className="composer-hint"><ShieldCheck size={13} /> You review every answer</span>
                <button className="send-task-button" aria-label="Start task" disabled={!prompt.trim()}><ArrowRight size={18} /></button>
              </div>
            </form>
            <div className="prompt-suggestions">
              <span>Try</span>
              <button onClick={() => setPrompt('Help me plan a launch for a new feature. Start with the key questions you need answered.')}>Plan a launch</button>
              <button onClick={() => setPrompt('Give me a friendly weekly update format for our Discord community.')}>Write a community update</button>
            </div>
          </div>
          <div className="handoff-art">
            <div className="art-glow" />
            <img src="/assets/ripobot-mascot.png" alt="RipoBot mascot" />
            <div className="floating-task-card">
              <span className="floating-task-icon"><Activity size={14} /></span>
              <span><strong>{activeTasks > 0 ? activeTasks + ' task' + (activeTasks > 1 ? 's' : '') + ' in motion' : 'Ready when you are'}</strong><small>{reviewTasks > 0 ? reviewTasks + ' answer waiting for review' : 'Your team is standing by'}</small></span>
              <i className="live-ring" />
            </div>
          </div>
        </section>

        <section className="section-block team-block">
          <div className="section-heading">
            <div><span className="section-label">THE PEOPLE BEHIND THE PROMPTS</span><h2>Your AI team</h2></div>
            <button className="text-button" onClick={() => onCreateAgent()}><Plus size={16} />New agent</button>
          </div>
          <div className="agent-roster">
            {agents.slice(0, 4).map((agent, index) => <AgentTile key={agent.id} agent={agent} index={index} onClick={() => onOpenChat(agent.id)} />)}
            {agents.length < 4 && <button className="agent-add-tile" onClick={onCreateAgent}><span><Plus size={19} /></span><strong>Build a specialist</strong><small>Give an agent its own focus</small></button>}
          </div>
        </section>

        <section className="section-block recent-block">
          <div className="section-heading">
            <div><span className="section-label">KEEPING THINGS MOVING</span><h2>Recent work</h2></div>
            <button className="text-button" onClick={onOpenTasks}>All tasks <ArrowRight size={15} /></button>
          </div>
          <TaskListCompact tasks={tasks.slice(0, 3)} agents={agents} onOpenChat={onOpenChat} />
        </section>
      </section>

      <aside className="home-rail">
        <div className="rail-card activity-card">
          <div className="rail-heading"><div><span className="section-label">A LITTLE MOMENTUM</span><h3>Activity</h3></div><span className="activity-count">{tasks.length}</span></div>
          {tasks.some((task) => task.sample) && <span className="sample-activity-note">Example activity</span>}
          <div className="activity-timeline">
            {tasks.slice(0, 3).map((task) => {
              const agent = agents.find((item) => item.id === task.agentId) || agents[0];
              return (
                <button className="activity-row" key={task.id} onClick={() => onOpenChat(task.agentId)}>
                  <span className={'timeline-mark timeline-' + (task.status || 'done')}><span /></span>
                  <span className="activity-row-copy"><span className="activity-row-top"><strong>{agent?.name || 'Ripo'}</strong><small>{formatAge(task.updatedAt || task.createdAt)}</small></span><span className="activity-row-title">{task.title}</span><small className="activity-row-status">{statusLabel(task.status)}{task.sample ? ' · example' : ''}</small></span>
                </button>
              );
            })}
            {tasks.length === 0 && <div className="rail-empty"><Inbox size={18} /><span>New work will show up here.</span></div>}
          </div>
          <button className="rail-link" onClick={onOpenTasks}>Open activity <ArrowRight size={14} /></button>
        </div>

        <div className="rail-card workflow-card">
          <div className="rail-heading"><div><span className="section-label">GOOD WORK, ON REPEAT</span><h3>Workflow library</h3></div><span className="workflow-symbol"><Workflow size={16} /></span></div>
          <p>Keep your best prompts close and use them whenever you need them.</p>
          <div className="workflow-preview-list">
            {workflows.slice(0, 2).map((workflow) => <button key={workflow.id} className="workflow-preview" onClick={onOpenWorkflows}><span className={'workflow-dot workflow-dot-' + workflow.accent} /><span>{workflow.title}</span><ChevronRight size={14} /></button>)}
          </div>
          <button className="rail-link" onClick={onOpenWorkflows}>Browse workflows <ArrowRight size={14} /></button>
        </div>

        <div className="rail-note">
          <span className="note-shield"><ShieldCheck size={17} /></span>
          <p><strong>You stay in control.</strong> RipoBot drafts answers for you. External apps and actions still need a real connection and your approval.</p>
        </div>

        <div className="rail-model"><span className="model-orb"><Zap size={13} /></span><span><strong>{modelConfig.huggingFaceReady ? 'Hugging Face connected' : 'Backup route enabled'}</strong><small>{modelConfig.primaryModel.split('/').pop()}</small></span><button className="bare-icon" aria-label="Model details" onClick={onOpenSettings}><ArrowUpRight size={15} /></button></div>
      </aside>
    </div>
  );
}

function AgentTile({ agent, index, onClick }) {
  const captions = ['READY TO HELP', 'GATHERING CLARITY', 'IDEAS IN MOTION', 'BUILDING THE PLAN'];
  return (
    <button className={'agent-tile agent-tile-' + agent.color} style={{ '--tile-index': index }} onClick={onClick}>
      <div className="agent-tile-top"><Avatar agent={agent} size="medium" /><span className="agent-online"><i />Ready</span><MoreHorizontal size={17} className="agent-more" /></div>
      <div className="agent-tile-name">{agent.name}<span className="agent-tile-role">{agent.title}</span></div>
      <p>{agent.description}</p>
      <div className="agent-tile-bottom"><span>{captions[index % captions.length]}</span><span className="tile-open"><ArrowUpRight size={14} /></span></div>
    </button>
  );
}

function TaskListCompact({ tasks, agents, onOpenChat }) {
  if (!tasks.length) return <div className="empty-row"><span className="empty-icon"><ListTodo size={18} /></span><span><strong>No tasks yet</strong><small>Hand off a first task to your team.</small></span></div>;
  return (
    <div className="compact-task-list">
      {tasks.map((task) => {
        const agent = agents.find((item) => item.id === task.agentId) || agents[0];
        return (
          <button key={task.id} className="compact-task-row" onClick={() => onOpenChat(task.agentId)}>
            <Avatar agent={agent} size="tiny" />
            <span className="compact-task-copy"><strong>{task.title}</strong><small>{agent?.name || 'Ripo'} <span>·</span> {formatAge(task.updatedAt || task.createdAt)}</small></span>
            <StatusPill status={task.status} />
            <ChevronRight size={16} className="task-row-chevron" />
          </button>
        );
      })}
    </div>
  );
}

function AgentsPage({ agents, search, onSearch, onCreate, onOpenChat }) {
  const filtered = agents.filter((agent) => (agent.name + ' ' + agent.title + ' ' + agent.description).toLowerCase().includes(String(search || '').toLowerCase()));
  return (
    <div className="content-page page-enter">
      <PageTitle
        eyebrow="YOUR SPECIALISTS, ALL TOGETHER"
        title="Meet your AI team"
        description="Give each agent a clear role, a useful point of view, and a place in the work."
        action={<button className="button button-primary" onClick={onCreate}><Plus size={16} />Create an agent</button>}
      />
      <div className="agent-page-toolbar">
        <div className="agent-page-tabs"><button className="filter-tab filter-tab-active">All agents <span>{agents.length}</span></button><button className="filter-tab" onClick={() => onSearch('')}>Your team</button></div>
        <label className="inline-search"><Search size={16} /><input aria-label="Filter agents" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Find an agent" /></label>
      </div>
      {filtered.length ? (
        <div className="agent-directory">
          {filtered.map((agent, index) => <AgentTile key={agent.id} agent={agent} index={index} onClick={() => onOpenChat(agent.id)} />)}
          <button className="agent-create-tile" onClick={onCreate}><span className="create-tile-icon"><Plus size={20} /></span><strong>Make an agent for the work ahead</strong><small>Describe the role, the way it thinks, and what a good answer looks like.</small><span className="create-tile-link">Build your next specialist <ArrowRight size={15} /></span></button>
        </div>
      ) : <div className="empty-state"><span className="empty-state-icon"><Search size={22} /></span><h3>No agents found</h3><p>Try a different name or area of focus.</p><button className="button button-secondary" onClick={() => onSearch('')}>Clear search</button></div>}
      <div className="helper-strip"><span><Sparkles size={17} /></span><p><strong>Keep their jobs clear.</strong> A good agent owns a kind of work, not every kind of work.</p><button className="text-button" onClick={onCreate}>Create a specialist <ArrowRight size={14} /></button></div>
    </div>
  );
}

function ChatPage({ agent, messages, busy, modelConfig, tasks, onSend, onOpenWorkflows, onOpenAgent, onOpenSettings }) {
  const [draft, setDraft] = useState('');
  const conversationRef = useRef(null);
  useEffect(() => {
    const pane = conversationRef.current;
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, [messages, busy, agent.id]);

  function submit(event) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    onSend(draft);
    setDraft('');
  }

  function handleKey(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <div className="chat-layout page-enter">
      <section className="conversation-panel">
        <div className="conversation-header">
          <div className="conversation-agent"><Avatar agent={agent} size="medium" /><span><strong>{agent.name}</strong><small>{agent.title} <i /> Here to help</small></span></div>
          <div className="conversation-actions"><span className="secure-label"><ShieldCheck size={14} />Your workspace</span><button className="icon-button" aria-label="Agent options" onClick={onOpenAgent}><MoreHorizontal size={19} /></button></div>
        </div>

        <div className="conversation-messages" ref={conversationRef} aria-live="polite">
          <div className="conversation-date"><span />TODAY<span /></div>
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} agent={agent} />
          ))}
          {busy && <div className="message-row"><Avatar agent={agent} size="small" /><div className="thinking-bubble"><span className="thinking-dots"><i /><i /><i /></span><span>{agent.name} is thinking</span></div></div>}
        </div>

        <form className="chat-composer" onSubmit={submit}>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKey} placeholder={'Message ' + agent.name + '…'} aria-label={'Message ' + agent.name} rows={1} />
          <div className="chat-composer-tools">
            <span className="composer-info"><Sparkles size={13} />Ask, plan, draft, or think it through</span>
            <div><span className="enter-hint">Enter to send</span><button className="send-message-button" type="submit" aria-label="Send message" disabled={!draft.trim() || busy}><Send size={16} /></button></div>
          </div>
        </form>
        <div className="chat-disclaimer">Messages go to RipoBot’s configured model provider. Check important details before using them.</div>
      </section>

      <aside className="agent-inspector">
        <div className="inspector-header"><span>ABOUT THIS AGENT</span><button className="bare-icon" aria-label="Close details" onClick={onOpenAgent}><ArrowUpRight size={15} /></button></div>
        <div className="inspector-profile"><Avatar agent={agent} size="large" /><h2>{agent.name}</h2><span className="inspector-role">{agent.title}</span><p>{agent.description}</p></div>
        <div className="inspector-divider" />
        <div className="inspector-section"><div className="inspector-section-title"><span>Model</span><button onClick={onOpenSettings}>Details <ArrowUpRight size={12} /></button></div><div className="model-info-card"><span className="model-info-icon"><Zap size={15} /></span><span><strong>{modelConfig.primaryModel.split('/').pop()}</strong><small>{modelConfig.huggingFaceReady ? 'Hugging Face router' : 'Backup route enabled'}</small></span></div></div>
        <div className="inspector-section"><div className="inspector-section-title"><span>Recent tasks</span><span>{tasks.length}</span></div>{tasks.slice(0, 3).map((task) => <div className="inspector-task" key={task.id}><span className="inspector-task-dot" /><span>{task.title}</span></div>)}{tasks.length === 0 && <div className="inspector-muted">New work with {agent.name} will show up here.</div>}</div>
        <div className="inspector-bottom-card"><span><ShieldCheck size={16} /></span><p><strong>You stay in control</strong><small>This version drafts and plans in chat. It won’t take external actions.</small></p></div>
        <button className="inspector-workflow-link" onClick={onOpenWorkflows}><Workflow size={15} />Browse reusable workflows<ArrowRight size={14} /></button>
      </aside>
    </div>
  );
}

function MessageBubble({ message, agent }) {
  const isUser = message.role === 'user';
  return (
    <div className={'message-row ' + (isUser ? 'message-user-row' : '')}>
      {!isUser && <Avatar agent={agent} size="small" />}
      <div className={'message-content ' + (isUser ? 'message-user' : 'message-assistant') + (message.error ? ' message-error' : '')}>
        {!isUser && <div className="message-author"><strong>{agent.name}</strong><span>{message.time && message.time !== 'Welcome' ? formatClock(message.time) : 'Just now'}</span></div>}
        <div className="message-text">{message.content}</div>
        {message.provider && <div className="message-model"><span className={message.provider === 'huggingface' ? 'hf-model-mark' : 'backup-model-mark'} />{message.provider === 'huggingface' ? 'Hugging Face · Llama 3.1' : 'Pollinations backup'}</div>}
        {isUser && <span className="user-message-time">{formatClock(message.time)}</span>}
      </div>
      {isUser && <span className="user-avatar-small">R</span>}
    </div>
  );
}

function TasksPage({ tasks, agents, onCreate, onOpenChat, onUpdateTask }) {
  const [filter, setFilter] = useState('all');
  const visible = tasks.filter((task) => filter === 'all' || task.status === filter);
  const filters = [
    { id: 'all', label: 'All work' },
    { id: 'working', label: 'In progress' },
    { id: 'review', label: 'Needs review' },
    { id: 'done', label: 'Completed' }
  ];
  return (
    <div className="content-page page-enter">
      <PageTitle
        eyebrow="YOUR WORK, IN ONE PLACE"
        title="Task activity"
        description="See what your team is working on and review answers when they are ready."
        action={<button className="button button-primary" onClick={onCreate}><Plus size={16} />New task</button>}
      />
      <div className="task-metrics">
        <Metric label="In progress" value={tasks.filter((task) => task.status === 'working').length} icon={Activity} color="blue" />
        <Metric label="Needs review" value={tasks.filter((task) => task.status === 'review').length} icon={Inbox} color="coral" />
        <Metric label="Completed" value={tasks.filter((task) => task.status === 'done').length} icon={CheckCircle2} color="mint" />
      </div>
      <div className="task-board-head"><div className="task-filter-tabs">{filters.map((item) => <button key={item.id} className={'filter-tab ' + (filter === item.id ? 'filter-tab-active' : '')} onClick={() => setFilter(item.id)}>{item.label}<span>{item.id === 'all' ? tasks.length : tasks.filter((task) => task.status === item.id).length}</span></button>)}</div><button className="quiet-action" onClick={() => setFilter('all')}><span><Clock3 size={14} /></span>Recently updated</button></div>
      <div className="task-board">
        <div className="task-board-columns"><span>WORK ITEM</span><span>AGENT</span><span>STATUS</span><span>UPDATED</span><span /></div>
        {visible.map((task) => {
          const agent = agents.find((item) => item.id === task.agentId) || agents[0];
          return (
            <div className="task-board-row" key={task.id}>
              <button className="task-board-title" onClick={() => onOpenChat(task.agentId)}><span className={'task-file-icon task-file-' + task.status}><FileText size={16} /></span><span><strong>{task.title}</strong>{task.sample && <small className="sample-label">Example activity</small>}</span></button>
              <button className="task-board-agent" onClick={() => onOpenChat(task.agentId)}><Avatar agent={agent} size="tiny" /><span>{agent?.name || 'Ripo'}</span></button>
              <StatusPill status={task.status} />
              <span className="task-board-time">{formatAge(task.updatedAt || task.createdAt)}</span>
              <div className="task-row-actions">{task.status === 'review' && <button className="review-action" onClick={() => onOpenChat(task.agentId)}>Review</button>}{task.status !== 'done' && <button className="bare-icon" aria-label="Mark task completed" onClick={() => onUpdateTask(task.id, { status: 'done', updatedAt: Date.now() })}><Check size={16} /></button>}<button className="bare-icon" aria-label="Open task conversation" onClick={() => onOpenChat(task.agentId)}><ArrowUpRight size={15} /></button></div>
            </div>
          );
        })}
        {visible.length === 0 && <div className="task-empty"><span className="empty-state-icon"><ListTodo size={22} /></span><h3>No work in this view</h3><p>Start a task and your team's progress will appear here.</p><button className="button button-secondary" onClick={onCreate}><Plus size={15} />Start a task</button></div>}
      </div>
      <p className="local-note"><ShieldCheck size={14} />Task history is saved in this browser.</p>
    </div>
  );
}

function Metric({ label, value, icon: Icon, color }) {
  return <div className="metric-card"><span className={'metric-icon metric-' + color}><Icon size={17} /></span><span className="metric-value">{value}</span><span className="metric-label">{label}</span></div>;
}

function WorkflowsPage({ workflows, agents, onCreate, onRun }) {
  return (
    <div className="content-page page-enter">
      <PageTitle
        eyebrow="YOUR BEST WORK, MADE REUSABLE"
        title="Workflow library"
        description="Save a good prompt once, then give it to the right teammate whenever you need it."
        action={<button className="button button-primary" onClick={onCreate}><Plus size={16} />Create workflow</button>}
      />
      <div className="workflow-intro"><span className="workflow-intro-icon"><Workflow size={19} /></span><div><strong>Start with a repeatable prompt</strong><p>Routines here create a task and open a conversation. Automatic background schedules will need a connected scheduler.</p></div><span className="workflow-intro-tag">PROMPT LIBRARY</span></div>
      <div className="workflow-grid">
        {workflows.map((workflow, index) => {
          const agent = agents.find((item) => item.id === workflow.agentId) || agents[0];
          return (
            <article className={'workflow-card workflow-card-' + (workflow.accent || 'blue')} key={workflow.id} style={{ '--tile-index': index }}>
              <div className="workflow-card-head"><span className="workflow-card-icon"><Workflow size={18} /></span><span className="workflow-category">{workflow.category || 'My workflow'}</span><button className="bare-icon" aria-label="Workflow options" onClick={() => onRun(workflow)}><MoreHorizontal size={18} /></button></div>
              <h3>{workflow.title}</h3><p>{workflow.description}</p>
              <div className="workflow-card-prompt">“{workflow.prompt}”</div>
              <div className="workflow-card-footer"><span className="workflow-agent"><Avatar agent={agent} size="tiny" />{agent?.name || 'Ripo'}</span><button className="run-workflow" onClick={() => onRun(workflow)}><Play size={13} fill="currentColor" />Use workflow</button></div>
            </article>
          );
        })}
        <button className="workflow-create-card" onClick={onCreate}><span className="workflow-create-icon"><Plus size={21} /></span><strong>Save a workflow your way</strong><small>Write a prompt your team can use again.</small><span className="create-tile-link">Create a workflow <ArrowRight size={15} /></span></button>
      </div>
    </div>
  );
}

function IntegrationsPage({ onConnect }) {
  return (
    <div className="content-page page-enter">
      <PageTitle
        eyebrow="BRING YOUR FAVORITE TOOLS CLOSER"
        title="Integrations"
        description="Connect the places your team works so agents can use real context and tools."
      />
      <div className="integration-callout"><span><Puzzle size={18} /></span><div><strong>Connections are not enabled yet</strong><p>Each service needs an authorized sign-in and permission choice before agents can use it.</p></div><span className="callout-status">IN PREPARATION</span></div>
      <div className="integration-grid">
        {INTEGRATIONS.map((integration, index) => (
          <article className="integration-card" key={integration.name} style={{ '--tile-index': index }}>
            <div className={'integration-logo integration-logo-' + index}>{integration.name === 'Discord' ? 'D' : integration.name === 'Google Drive' ? 'G' : integration.name === 'GitHub' ? 'GH' : integration.name === 'Slack' ? 'S' : integration.name === 'Gmail' ? 'M' : <Puzzle size={19} />}</div>
            <span className="integration-label">{integration.label}</span>
            <h3>{integration.name}</h3><p>{integration.detail}</p>
            <button className="integration-connect" onClick={() => onConnect(integration)}><span>Connection setup</span><ArrowUpRight size={14} /></button>
          </article>
        ))}
      </div>
      <div className="integration-security"><ShieldCheck size={16} /><span>Every connection should be explicit, scoped, and revocable from your workspace.</span><button className="text-button" onClick={() => onConnect({ name: 'Permissions', detail: 'RipoBot will request only the access needed for each provider.' })}>How permissions work <ArrowRight size={14} /></button></div>
    </div>
  );
}

function SettingsPage({ modelConfig, accessCode, onAccessCodeChange, appearance, onAppearance, onReset, onRefresh }) {
  return (
    <div className="content-page page-enter">
      <PageTitle eyebrow="MAKE THE WORKSPACE FEEL LIKE YOURS" title="Settings" description="Manage your RipoBot workspace, appearance, and model connection." />
      <div className="settings-layout">
        <div className="settings-nav"><button className="settings-nav-active"><Settings size={16} />Preferences</button><button onClick={() => document.getElementById('model-settings')?.scrollIntoView({ behavior: 'smooth' })}><Zap size={16} />AI model</button><button onClick={() => document.getElementById('data-settings')?.scrollIntoView({ behavior: 'smooth' })}><ShieldCheck size={16} />Data & privacy</button></div>
        <div className="settings-content">
          <section className="settings-card"><div className="settings-card-heading"><div><span className="section-label">APPEARANCE</span><h2>Your workspace, your way</h2><p>Choose a calm light workspace or a deeper dark theme.</p></div></div><div className="theme-choice-row"><button className={'theme-choice theme-choice-light ' + (appearance === 'light' ? 'theme-choice-selected' : '')} onClick={() => onAppearance('light')}><span className="theme-preview"><i /><i /><i /></span><span><strong>Light</strong><small>Bright and airy</small></span>{appearance === 'light' && <CheckCircle2 size={17} />}</button><button className={'theme-choice theme-choice-dark ' + (appearance === 'dark' ? 'theme-choice-selected' : '')} onClick={() => onAppearance('dark')}><span className="theme-preview"><i /><i /><i /></span><span><strong>Dark</strong><small>Easy on the eyes</small></span>{appearance === 'dark' && <CheckCircle2 size={17} />}</button></div></section>
          <section className="settings-card" id="model-settings">
            <div className="settings-card-heading">
              <div><span className="section-label">AI MODEL</span><h2>Your RipoBot model</h2><p>RipoBot uses the same primary model route as the Discord bot.</p></div>
              <button className="quiet-action" onClick={onRefresh}><Activity size={14} />Refresh status</button>
            </div>
            <div className="model-settings-row">
              <span className="model-settings-orb"><Zap size={18} /></span>
              <div className="model-settings-copy"><strong>{modelConfig.primaryModel}</strong><small>Hugging Face Router · {modelConfig.huggingFaceReady ? 'Connected' : modelConfig.accessCodeRequired ? 'Enter the workspace access code' : modelConfig.accessCodeSetupRequired ? 'Access code setup required' : 'Token not configured'}</small></div>
              <span className={'connection-badge ' + (modelConfig.huggingFaceReady ? 'connection-on' : 'connection-backup')}><i />{modelConfig.huggingFaceReady ? 'Primary ready' : modelConfig.accessCodeRequired ? 'Primary locked' : 'Backup route'}</span>
            </div>
            {modelConfig.accessCodeRequired && <div className="access-code-row"><label>Workspace access code<input type="password" autoComplete="current-password" value={accessCode} onChange={(event) => onAccessCodeChange(event.target.value)} placeholder="Enter the code set by the workspace owner" /></label><button className="button button-secondary" onClick={onRefresh}>Check access</button><small>This code stays in this browser session. It is not the Hugging Face token.</small></div>}
            {modelConfig.accessCodeSetupRequired && <div className="model-setup-note"><ShieldCheck size={15} /><span>Add a private <code>RIPO_ACCESS_CODE</code> on the server to protect the shared Hugging Face token.</span></div>}
            <div className="model-footnote"><ShieldCheck size={15} /><span>Your Hugging Face token stays on the server. The app never sends it to your browser.</span></div>
          </section>
          <section className="settings-card" id="data-settings"><div className="settings-card-heading"><div><span className="section-label">DATA & PRIVACY</span><h2>Your conversations stay here</h2><p>Agents, messages, task history, and workflow prompts are saved in this browser.</p></div></div><div className="privacy-feature"><span className="privacy-feature-icon"><ShieldCheck size={17} /></span><div><strong>Local workspace data</strong><small>Nothing is synced to an account in this version.</small></div><span className="privacy-local-label">ON THIS DEVICE</span></div><button className="danger-link" onClick={onReset}>Clear this browser's RipoBot data <ArrowRight size={14} /></button></section>
        </div>
      </div>
    </div>
  );
}

function AgentModal({ onClose, onSave }) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [color, setColor] = useState('violet');
  const colors = ['sky', 'violet', 'coral', 'mint'];
  function submit(event) {
    event.preventDefault();
    if (!name.trim() || !title.trim()) return;
    onSave({ name: name.trim(), title: title.trim(), description: description.trim() || 'A specialist for work you want to move forward.', instructions: instructions.trim() || 'Be helpful, clear, and honest about what you can do.', color, image: false });
  }
  return (
    <Modal title="Create an AI teammate" description="Give this agent a clear focus and the kind of answers you want." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label>Agent name<input required maxLength={32} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Community guide" autoFocus /></label>
        <label>Specialty<input required maxLength={50} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Community manager" /></label>
        <label>What should it help with?<textarea rows={2} maxLength={180} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="A short description your team will recognize." /></label>
        <label>How should it think?<textarea rows={3} maxLength={700} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Describe its point of view, style, and what a good answer looks like." /></label>
        <div className="modal-color-field"><span>Agent color</span><div>{colors.map((item) => <button key={item} type="button" aria-label={'Choose ' + item + ' color'} className={'color-swatch swatch-' + item + (color === item ? ' color-swatch-selected' : '')} onClick={() => setColor(item)}>{color === item && <Check size={13} />}</button>)}</div></div>
        <div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={!name.trim() || !title.trim()}><Sparkles size={15} />Create agent</button></div>
      </form>
    </Modal>
  );
}

function TaskModal({ agents, onClose, onSave }) {
  const [prompt, setPrompt] = useState('');
  const [agentId, setAgentId] = useState('ripo');
  function submit(event) {
    event.preventDefault();
    onSave(prompt, agentId);
  }
  return (
    <Modal title="Start a task" description="Choose an agent and tell them what result you need." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label>What should get done?<textarea required rows={4} maxLength={4000} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the result you need…" autoFocus /></label>
        <label>Teammate<select value={agentId} onChange={(event) => setAgentId(event.target.value)}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.title}</option>)}</select></label>
        <div className="modal-note"><ShieldCheck size={15} />Your agent will draft an answer in chat for you to review.</div>
        <div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={!prompt.trim()}><ArrowRight size={15} />Start task</button></div>
      </form>
    </Modal>
  );
}

function WorkflowModal({ agents, onClose, onSave }) {
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [agentId, setAgentId] = useState('ripo');
  function submit(event) {
    event.preventDefault();
    if (!title.trim() || !prompt.trim()) return;
    onSave({ id: 'workflow-' + Date.now(), title: title.trim(), description: 'A reusable prompt you can hand to your team.', category: 'My workflow', prompt: prompt.trim(), agentId, accent: 'blue' });
  }
  return (
    <Modal title="Create a workflow" description="Save a strong prompt so your team can use it again." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label>Workflow name<input required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Friday recap" autoFocus /></label>
        <label>Instructions<textarea required rows={4} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="What should the agent do each time?" /></label>
        <label>Default teammate<select value={agentId} onChange={(event) => setAgentId(event.target.value)}>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} · {agent.title}</option>)}</select></label>
        <div className="modal-note"><Workflow size={15} />Workflows create a chat task when you choose to run them.</div>
        <div className="modal-footer"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={!title.trim() || !prompt.trim()}><Check size={15} />Save workflow</button></div>
      </form>
    </Modal>
  );
}

function IntegrationModal({ integration, onClose }) {
  return (
    <Modal title={'Connect ' + (integration?.name || 'a service')} description="Keep access clear and under your control." onClose={onClose}>
      <div className="integration-modal-copy"><span className="integration-modal-icon"><Puzzle size={20} /></span><p><strong>{integration?.name || 'This service'} connection setup is not available yet.</strong><br />{integration?.detail || 'Provider sign-in and permission controls need to be configured before RipoBot can connect.'}</p></div>
      <div className="permission-preview"><ShieldCheck size={16} /><span>RipoBot should ask before an agent can read or change anything in a connected account.</span></div>
      <div className="modal-footer"><button className="button button-secondary" onClick={onClose}>Close</button></div>
    </Modal>
  );
}

function ResetModal({ onClose, onReset }) {
  return (
    <Modal title="Clear local RipoBot data?" description="This removes agents, conversations, tasks, and workflows saved in this browser." onClose={onClose}>
      <div className="reset-warning"><span><CircleHelp size={19} /></span><p>This cannot be undone. It will not affect your Discord server or any other browser.</p></div>
      <div className="modal-footer"><button className="button button-secondary" onClick={onClose}>Keep my data</button><button className="button button-danger" onClick={onReset}>Clear local data</button></div>
    </Modal>
  );
}

function Modal({ title, description, onClose, children }) {
  useEffect(() => {
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, []);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading"><div><h2 id="modal-title">{title}</h2><p>{description}</p></div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></div>
        {children}
      </section>
    </div>
  );
}

function statusLabel(status) {
  return {
    working: 'is working on a task',
    review: 'has an answer to review',
    done: 'completed a task',
    attention: 'needs a hand',
    scheduled: 'has a saved reminder'
  }[status] || 'is ready';
}

function formatAge(value) {
  const time = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(time)) return 'Recently';
  const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.floor(hours / 24) + 'd ago';
}

function formatClock(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Just now';
  return new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(date);
}

export default App;
