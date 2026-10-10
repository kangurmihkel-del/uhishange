import {
  cloneElement,
  isValidElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useId,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  ArrowRight,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock3,
  Download,
  Euro,
  FileCheck2,
  FileText,
  Home,
  Mail,
  LogOut,
  MapPin,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Snowflake,
  Star,
  Users,
  X,
} from 'lucide-react';
import type {
  AdminResponse,
  Commitment,
  Contract,
  ImportPreview,
  Invitation,
  MailboxResponse,
  NearbyOrganization,
  Offer,
  Organization,
  Procurement,
  ProcurementDetail,
  SessionResponse,
  ServiceAnswers,
  ServiceFormId,
  ProcurementSpec,
} from '../shared/types';
import {
  api,
  date,
  euro,
  localDateTime,
  utcDateTime,
  number as etNumber,
  coordinate,
  parseDecimal,
  parseEuroCents,
  parseDateTimeInput,
} from './api';
import {
  RegionalNumberInput,
  RegionalDateInput,
  normalizeServiceInputAnswers,
} from './RegionalInputs';
import {
  SERVICE_FORMS,
  defaultServiceAnswers,
  findServiceForm,
  sanitizeServiceAnswers,
  validateServiceAnswers,
  serviceLabel,
  isSnowService,
} from '../shared/serviceForms';
import ServiceFields, { type ServiceFieldIssue } from './ServiceFields';
import ServiceScope from './ServiceScope';
import AgreementHistory from './AgreementHistory';
import Mailbox from './Mailbox';
import ProcurementFlow, { type FlowTarget } from './ProcurementFlow';
import Brand, { BrandMark, CommunityHouses } from './Brand';
import ParticipantProgress from './ParticipantProgress';
import { CURRENT_FEE_POLICY, feePolicyForSnapshot } from '../shared/pricing';
import FeeTerms, { SupplierFeePreview, feeAmounts, feePolicyText } from './FeeTerms';

const serviceId = (spec: ProcurementSpec) => ('formId' in spec ? spec.formId : 'snow');
const communitySteps = [
  ['Avalda hange', 'Kirjelda oma ühistule vajalik teenus ja vali liitumise tähtaeg.'],
  [
    'Kutsu naabrid ja vali pakkumine',
    'Leia kaardilt lähinaabrid. Võrdle pakkumisi ja vali üks teenusepakkuja enne liitumisi.',
  ],
  [
    'Liitu ja tee testmakse',
    'Kinnita ühine tööde ulatus ja maksa TEST tagatis. Osalejaks loeb kinnitatud makse.',
  ],
  [
    'Oota liitumise tähtaega',
    'Vajaliku arvu täitumisel hange õnnestub. Tähtajani saavad naabrid liituda ja hind langeda.',
  ],
  [
    'Leping ja teenuse lõpetamine',
    'Tähtajal tekib jätkava ühistu leping. Pärast teenust anna hinnang; ülejäänud tasu arveldatakse otse pakkujaga.',
  ],
];

type Notice = { kind: 'success' | 'error'; text: string } | null;
type Operations = {
  busy: boolean;
  run: <T>(
    action: () => Promise<T>,
    message?: string,
    after?: (result: T) => void,
  ) => Promise<T | undefined>;
};
const OperationsContext = createContext<Operations>({ busy: false, run: async () => undefined });
const useOperations = () => useContext(OperationsContext);
const statusLabels: Record<string, string> = {
  DRAFT: 'Mustand',
  OPEN: 'Liitumine avatud',
  SUCCEEDED: 'Hange õnnestunud',
  FINALIZED: 'Lepingud loodud',
  COMPLETED: 'Lõpetatud',
  FAILED: 'Hange ei täitunud',
  CANCELLED: 'Tühistatud',
  PENDING: 'Ootel',
  ACTIVE: 'Liitunud',
  WITHDRAWN: 'Loobunud',
  CONTRACTED: 'Leping sõlmitud',
  EXPIRED: 'Aegunud',
  ACCEPTED: 'Vastu võetud',
  DECLINED: 'Tagasi lükatud',
  RUNNING: 'Töös',
  DONE: 'Valmis',
  pending: 'Kinnitus ootel',
  approved: 'Kinnitatud',
  rejected: 'Tagasi lükatud',
};

function useLoad<T>(loader: () => Promise<T>, dependencies: unknown[]) {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loader()
      .then((result) => {
        if (alive) {
          setData(result);
          setError('');
        }
      })
      .catch((reason: unknown) => {
        if (alive)
          setError(reason instanceof Error ? reason.message : 'Andmete laadimine ebaõnnestus.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // Callers provide every changing input in the dependency list.
  }, dependencies);
  return { data, loading, error };
}

function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  const { busy } = useOperations();
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`button button-${variant} ${className}`}
    >
      {children}
    </button>
  );
}

function Status({ status }: { status: string }) {
  return (
    <span className={`status status-${status.toLowerCase()}`}>
      <span className="status-dot" />
      {statusLabels[status] || status}
    </span>
  );
}

function Empty({
  title,
  children,
  icon = <ClipboardList size={30} />,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}

function LoadState({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: string;
  children: ReactNode;
}) {
  if (error)
    return (
      <div role="alert" className="inline-error">
        <CircleHelp size={19} />
        {error} <button onClick={() => window.location.reload()}>Laadi uuesti</button>
      </div>
    );
  if (loading)
    return (
      <div className="loading" role="status">
        <span className="spinner" />
        Laadin andmeid…
      </div>
    );
  return <>{children}</>;
}

function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const inputId = useId();
  const hintId = inputId + '-hint';
  return (
    <div className={`field ${className}`}>
      <label htmlFor={inputId}>{label}</label>
      {isValidElement<React.HTMLAttributes<HTMLElement>>(children)
        ? cloneElement(children, { id: inputId, 'aria-describedby': hint ? hintId : undefined })
        : children}
      {hint && <small id={hintId}>{hint}</small>}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function TestNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`test-notice ${compact ? 'compact' : ''}`}>
      <ShieldCheck size={19} />
      <div>
        <strong>TESTMAKSE · Tegelikku raha ei liigu</strong>
        {!compact && (
          <p>
            Tagatisraha maksed, tagastused ja väljamaksed on simuleeritud. Teenuse ülejäänud tasu
            arveldatakse otse teenusepakkujaga.
          </p>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<SessionResponse>();
  const [sessionError, setSessionError] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [route, setRoute] = useState(() => window.location.hash.slice(1) || 'overview');
  const [organizationId, setOrganizationId] = useState(
    () => localStorage.getItem('uhishange-organization') || '',
  );
  const [mobileMenu, setMobileMenu] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    let alive = true;
    if (!session?.user) {
      setUnreadCount(0);
      return;
    }
    const load = () =>
      api<MailboxResponse>('/mailbox')
        .then((value) => {
          if (alive) setUnreadCount(value.unreadCount);
        })
        .catch(() => {
          /* The mailbox page displays load errors. */
        });
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [session?.user?.id, revision]);
  const refreshSession = useCallback(async () => {
    const value = await api<SessionResponse>('/session');
    setSession(value);
    setSessionError('');
  }, []);
  useEffect(() => {
    refreshSession().catch((reason: Error) => setSessionError(reason.message));
  }, [refreshSession, revision]);
  useEffect(() => {
    const handler = () => {
      setRoute(window.location.hash.slice(1) || 'overview');
      setMobileMenu(false);
      setNotice(null);
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  useEffect(() => {
    const approved =
      session?.memberships.filter((membership) => membership.status === 'approved') || [];
    if (!approved.some((membership) => membership.organizationId === organizationId))
      setOrganizationId(approved[0]?.organizationId || '');
  }, [session, organizationId]);
  const run = async <T,>(
    action: () => Promise<T>,
    message?: string,
    after?: (result: T) => void,
  ) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await action();
      if (message) setNotice({ kind: 'success', text: message });
      after?.(result);
      setRevision((value) => value + 1);
      return result;
    } catch (reason) {
      setNotice({
        kind: 'error',
        text: reason instanceof Error ? reason.message : 'Toiming ebaõnnestus.',
      });
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  const organization = session?.memberships.find(
    (membership) =>
      membership.organizationId === organizationId && membership.status === 'approved',
  )?.organization;
  const membership = session?.memberships.find(
    (item) => item.organizationId === organizationId && item.status === 'approved',
  );
  const representative = membership?.role === 'representative';
  const orgChoice = (id: string) => {
    setOrganizationId(id);
    localStorage.setItem('uhishange-organization', id);
    setNotice(null);
  };
  const detailId = route.startsWith('procurement/') ? route.split('/')[1] : null;
  const nav = [
    { id: 'overview', label: 'Ülevaade', icon: Home },
    { id: 'procurements', label: 'Hanked', icon: ClipboardList },
    { id: 'mailbox', label: 'Postkast', icon: Mail },
    { id: 'invitations', label: 'Kutsed', icon: Bell },
    { id: 'contracts', label: 'Lepingud', icon: FileCheck2 },
    { id: 'organization', label: 'Minu organisatsioon', icon: Building2 },
    ...(session?.user?.isAdmin ? [{ id: 'admin', label: 'Haldus', icon: ShieldCheck }] : []),
  ];
  const routeLabel = detailId
    ? 'Hanke ülevaade'
    : route === 'new'
      ? 'Uus hange'
      : nav.find((item) => item.id === route)?.label || 'Ülevaade';
  const notification = notice && (
    <div
      role={notice.kind === 'error' ? 'alert' : 'status'}
      className={`notification notification-${notice.kind}`}
    >
      <CheckCircle2 size={20} />
      <span>{notice.text}</span>
      <button aria-label="Sulge teavitus" onClick={() => setNotice(null)}>
        <X size={18} />
      </button>
    </div>
  );
  return (
    <OperationsContext.Provider value={{ busy, run }}>
      {!session ? (
        <div className="initial-loading">
          <span className="brand-mark">
            <BrandMark />
          </span>
          <LoadState loading={!sessionError} error={sessionError}>
            {null}
          </LoadState>
        </div>
      ) : !session.user ? (
        <>
          <Auth onLogin={refreshSession} />
          {notification && <div className="auth-notification">{notification}</div>}
        </>
      ) : (
        <div className="app-shell">
          {mobileMenu && (
            <button
              className="sidebar-overlay"
              aria-label="Sulge menüü"
              onClick={() => setMobileMenu(false)}
            />
          )}
          <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
            <Brand tagline />
            <div className="sidebar-divider" />
            <span className="sidebar-caption">TÖÖLAUD</span>
            <nav aria-label="Põhinavigatsioon">
              {nav.map(({ id, label, icon: Icon }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  aria-current={
                    route === id || (id === 'procurements' && (detailId || route === 'new'))
                      ? 'page'
                      : undefined
                  }
                  className={`nav-item ${route === id || (id === 'procurements' && (detailId || route === 'new')) ? 'active' : ''}`}
                >
                  <Icon size={20} />
                  <span>{label}</span>
                  {id === 'mailbox' && unreadCount > 0 && (
                    <span
                      className="nav-unread"
                      aria-hidden="true"
                      title={etNumber(unreadCount) + ' lugemata kirja'}
                    >
                      {etNumber(unreadCount)}
                    </span>
                  )}
                </a>
              ))}
            </nav>
            <div className="sidebar-guide">
              <div className="guide-icon">
                <Building2 size={24} />
              </div>
              <strong>Koos tellides tuleb parem hind.</strong>
              <p>Ühine oma naabritega ja telli ühistule vajalik teenus soodsama hinnaga.</p>
              <a href="#procurements">
                Vaata hankeid <ArrowRight size={15} />
              </a>
            </div>
            <div className="sidebar-bottom">
              <span className="demo-label">
                <span />
                KOHALIK PILOOT
              </span>
              <small>
                Mustamäe · Tallinn
                <br />
                Kõik maksed on testmaksed.
              </small>
            </div>
          </aside>
          <div className="main-shell">
            <header className="topbar">
              <div className="breadcrumb">
                <button
                  className="mobile-menu icon-button"
                  aria-label="Ava menüü"
                  onClick={() => setMobileMenu(true)}
                >
                  <Menu size={22} />
                </button>
                <span className="breadcrumb-home">Töölaud</span>
                <ChevronRight size={15} />
                <strong>{routeLabel}</strong>
              </div>
              <div className="topbar-actions">
                <span className="location-tag">
                  <MapPin size={15} /> Mustamäe, Tallinn
                </span>
                <a
                  href="#mailbox"
                  className="icon-button"
                  aria-label={
                    'Vaata postkasti' + (unreadCount ? ', ' + unreadCount + ' lugemata kirja' : '')
                  }
                >
                  <Mail size={19} />
                  {unreadCount > 0 && <span className="topbar-mail-dot" />}
                </a>
                <span className="topbar-divider" />
                <div className="user-avatar" aria-hidden="true">
                  {session.user.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="user-info">
                  <strong>{session.user.name}</strong>
                  <small>
                    {session.user.isAdmin
                      ? 'Administraator'
                      : organization?.orgType === 'SUPPLIER'
                        ? 'Teenusepakkuja'
                        : 'Ühistu esindaja'}
                  </small>
                </div>
                <button
                  className="icon-button"
                  aria-label="Logi välja"
                  title="Logi välja"
                  onClick={() =>
                    run(
                      () => api('/logout', {}),
                      undefined,
                      () => {
                        setSession({ user: null, memberships: [] });
                        window.location.hash = 'overview';
                      },
                    )
                  }
                >
                  <LogOut size={18} />
                </button>
              </div>
            </header>
            <main id="main-content" className="main-content">
              {session.memberships.filter((item) => item.status === 'approved').length > 1 && (
                <div className="organization-switch">
                  <Building2 size={16} />
                  <label htmlFor="active-organization">Esindan</label>
                  <select
                    id="active-organization"
                    value={organizationId}
                    onChange={(event) => orgChoice(event.target.value)}
                  >
                    {session.memberships
                      .filter((item) => item.status === 'approved')
                      .map((item) => (
                        <option key={item.id} value={item.organizationId}>
                          {item.organization.name}
                          {item.role === 'viewer' ? ' · vaatleja' : ''}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              {notification}
              {!organization && !session.user.isAdmin && route !== 'organization' && (
                <div className="membership-banner">
                  <ShieldCheck size={21} />
                  <div>
                    <strong>Organisatsiooni esindusõigus on vajalik</strong>
                    <p>
                      Lisa oma organisatsioon või taotle liikmesust. Administraator kinnitab
                      õigused.
                    </p>
                  </div>
                  <a className="button button-secondary" href="#organization">
                    Lisa organisatsioon <ArrowRight size={16} />
                  </a>
                </div>
              )}
              {(route === 'overview' ||
                (!nav.some((item) => item.id === route) && !detailId && route !== 'new')) && (
                <Overview
                  organization={organization}
                  representative={representative}
                  revision={revision}
                  name={session.user.name}
                />
              )}
              {route === 'procurements' && (
                <Procurements
                  organization={organization}
                  representative={representative}
                  revision={revision}
                />
              )}
              {route === 'new' && (
                <NewProcurement organization={organization} representative={representative} />
              )}
              {detailId && (
                <ProcurementPage
                  key={detailId}
                  id={detailId}
                  organization={organization}
                  representative={representative}
                  revision={revision}
                />
              )}
              {route === 'mailbox' && (
                <Mailbox revision={revision} session={session} busy={busy} run={run} />
              )}
              {route === 'invitations' && <Invitations revision={revision} session={session} />}
              {route === 'contracts' && (
                <Contracts
                  revision={revision}
                  organization={organization}
                  representative={representative}
                />
              )}
              {route === 'organization' && <Organizations session={session} revision={revision} />}
              {route === 'admin' &&
                (session.user.isAdmin ? (
                  <Administration revision={revision} />
                ) : (
                  <Empty title="Haldus on administraatorile" />
                ))}
              <footer className="footer">
                <span>© {new Date().getFullYear()} Ühishange</span>
                <span>
                  Mustamäe ühishangete piloot <span className="footer-dot">·</span> Eesti aeg
                </span>
                <span>
                  <ShieldCheck size={13} /> Turvaline testkeskkond
                </span>
              </footer>
            </main>
          </div>
        </div>
      )}
    </OperationsContext.Provider>
  );
}

function Auth({ onLogin }: { onLogin: () => Promise<void> }) {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const { run } = useOperations();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    run(async () => {
      await api(
        register ? '/register' : '/login',
        register ? { name, email, password } : { email, password },
      );
      await onLogin();
    });
  };
  const demo = (address: string) =>
    run(async () => {
      await api('/login', { email: address, password: 'Demo2026!' });
      await onLogin();
    });
  const showInfo = (event: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    event.preventDefault();
    const section = document.getElementById(sectionId);
    section?.focus({ preventScroll: true });
    section?.scrollIntoView({ behavior: 'instant', block: 'start' });
  };
  const startProcurement = () => {
    setRegister(true);
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(
        '#account-form input[autocomplete="name"]',
      );
      input?.focus({ preventScroll: true });
      input?.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
  };
  return (
    <div className="auth-page">
      <header className="public-header">
        <Brand />
        <nav className="public-nav" aria-label="Avalik navigatsioon">
          <a href="#services" onClick={(event) => showInfo(event, 'services')}>
            Teenused
          </a>
          <a href="#how-it-works" onClick={(event) => showInfo(event, 'how-it-works')}>
            Kuidas toimib
          </a>
          <a href="#for-suppliers" onClick={(event) => showInfo(event, 'for-suppliers')}>
            Teenusepakkujale
          </a>
        </nav>
        <Button
          type="button"
          className="public-start"
          data-testid="public-start"
          onClick={startProcurement}
        >
          Alusta ühishanget <ArrowRight size={17} />
        </Button>
      </header>
      <main>
        <div className="auth-body">
          <div className="auth-story">
            <div className="auth-story-main">
              <span className="auth-eyebrow">
                <span /> MUSTAMÄE · KOOS NAABRITEGA
              </span>
              <h1>Koos tellides tuleb parem hind.</h1>
              <p>
                Ühenda oma ühistu vajadus läheduses olevate naabritega ja küsi teenusepakkujatelt
                ühine pakkumine.
              </p>
              <Button type="button" className="auth-start" onClick={startProcurement}>
                Alusta ühishanget <ArrowRight size={18} />
              </Button>
              <div className="auth-benefits">
                <div>
                  <Users size={21} />
                  <span>Naabrid ühes hankes</span>
                </div>
                <div>
                  <Euro size={21} />
                  <span>Rohkem liitujaid, soodsam hind</span>
                </div>
                <div>
                  <ShieldCheck size={21} />
                  <span>Kinnitatud esindusõigus</span>
                </div>
              </div>
            </div>
            <div className="auth-community">
              <CommunityHouses />
              <p>Üks vajadus. Mitu tellijat. Parem pakkumine.</p>
            </div>
            <small className="auth-caption">
              Kohalik piloot · Fiktiivsed demokontod ja TEST maksed.
            </small>
          </div>
          <div className="auth-form-side">
            <div className="auth-card" id="account-form">
              <span className="eyebrow">TERE TULEMAST</span>
              <h2>{register ? 'Loo oma konto' : 'Hea koostöö algab siit.'}</h2>
              <p className="muted">
                {register
                  ? 'Pärast registreerimist saad taotleda oma organisatsiooni esindusõigust.'
                  : 'Logi sisse ja vaata, mida saad koos naabritega võita.'}
              </p>
              <form onSubmit={submit}>
                {register && (
                  <Field label="Nimi">
                    <input
                      autoComplete="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      minLength={2}
                      required
                    />
                  </Field>
                )}
                <Field label="E-post">
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="nimi@uhistu.ee"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </Field>
                <Field label="Parool" hint={register ? 'Vähemalt 10 märki.' : undefined}>
                  <input
                    type="password"
                    autoComplete={register ? 'new-password' : 'current-password'}
                    minLength={register ? 10 : undefined}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                </Field>
                <Button className="full-width">
                  {register ? 'Loo konto' : 'Logi sisse'}
                  <ArrowRight size={18} />
                </Button>
              </form>
              <p className="auth-toggle">
                {register ? 'Konto on juba olemas?' : 'Esimest korda siin?'}{' '}
                <button onClick={() => setRegister(!register)}>
                  {register ? 'Logi sisse' : 'Loo konto'}
                </button>
              </p>
              <div className="demo-login">
                <span>PROOVI DEMOKONTOT</span>
                <div>
                  <Button variant="secondary" onClick={() => demo('buyer1@demo.test')}>
                    <Building2 size={16} />
                    Ostja
                  </Button>
                  <Button variant="secondary" onClick={() => demo('buyer2@demo.test')}>
                    <Building2 size={16} />
                    Naaberühistu
                  </Button>
                  <Button variant="secondary" onClick={() => demo('supplier@demo.test')}>
                    <Building2 size={16} />
                    Pakkuja
                  </Button>
                  <Button variant="secondary" onClick={() => demo('admin@demo.test')}>
                    <ShieldCheck size={16} />
                    Administraator
                  </Button>
                </div>
                <small>
                  Demoparool: <code>Demo2026!</code> · Naaberühistu: buyer2@demo.test. Alusta
                  ostjana, saada kutse ja ava see naaberühistu postkastis.
                </small>
              </div>
              <div className="auth-test">
                <ShieldCheck size={17} />
                <span>TESTKESKKOND · Päris raha ei liigu</span>
              </div>
            </div>
          </div>
        </div>
        <div className="public-info-grid">
          <section className="public-info-card" id="services" tabIndex={-1}>
            <span className="eyebrow">ÜKS VAJADUS. MITU TELLIJAT.</span>
            <h2>Koos tellitavad teenused</h2>
            <p>Vali ühistule vajalik töö. Sama teenuse ühine tellimus aitab naabrid kokku tuua.</p>
            <ul className="public-services">
              {SERVICE_FORMS.map((form) => (
                <li key={form.id}>
                  <Check size={17} aria-hidden="true" />
                  <span>{form.label}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="public-info-card" id="how-it-works" tabIndex={-1}>
            <span className="eyebrow">TEEME KOOS.</span>
            <h2>Viis sammu ühise tellimuseni</h2>
            <ol className="public-steps">
              {communitySteps.map(([title, description]) => (
                <li key={title}>
                  <strong>{title}</strong>
                  <p>{description}</p>
                </li>
              ))}
            </ol>
            <p>
              Kui vajalik arv tähtajaks ei täitu, tagastatakse makstud TEST tagatised täies
              ulatuses.
            </p>
          </section>
          <section className="public-info-card" id="for-suppliers" tabIndex={-1}>
            <span className="eyebrow">TEENUSEPAKKUJALE</span>
            <h2>Parem pakkumine mitmele ühistule</h2>
            <p>
              Paku läheduses olevatele ühistutele kogu kirjeldatud teenuse brutohind. Määra
              osalejate hinnatasemed: rohkem tellijaid saab tähendada soodsamat hinda.
            </p>
            <p>
              Algataja valib ühe pakkumise enne liitumisi. Esimene hinnatase määrab vajaliku
              osalejate arvu ja TEST tagatis ei tohi ületada soodsaimat hinda.
            </p>
            <p>
              Ülejäänud teenusetasu arveldatakse otse pakkujaga. Demokeskkonnas tegelikku raha ei
              liigu.
            </p>
            <Button type="button" variant="secondary" onClick={() => demo('supplier@demo.test')}>
              Proovi pakkuja demot <ArrowRight size={17} />
            </Button>
          </section>
        </div>
      </main>
    </div>
  );
}

function Overview({
  organization,
  representative,
  revision,
  name,
}: {
  organization?: Organization;
  representative: boolean;
  revision: number;
  name: string;
}) {
  const { data, loading, error } = useLoad(
    () => api<{ procurements: Procurement[] }>('/procurements'),
    [revision],
  );
  const rows = data?.procurements || [];
  const open = rows.filter((item) => item.status === 'OPEN' || item.status === 'SUCCEEDED');
  const successful = rows.filter((item) => item.succeededAt);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ÜHINE NAABRITEGA. VÕIDA KOOS.</span>
          <h1>
            Tere, {name.split(' ')[0]}
            <span className="greeting-dot">.</span>
          </h1>
          <p>
            {organization
              ? `${organization.name} · Sinu organisatsiooni hanked ühes kohas.`
              : 'Sinu ühishangete töölaud. Vähem korraldamist, rohkem koostööd.'}
          </p>
        </div>
        {organization?.orgType === 'BUYER' && representative && (
          <a className="button button-primary" href="#new">
            <Plus size={18} />
            Uus hange
          </a>
        )}
      </div>
      <div className="dashboard-hero">
        <div className="hero-copy">
          <span className="hero-badge">
            <MapPin size={14} />
            ÜHISHANKED · MUSTAMÄE
          </span>
          <h2>Koos tellides tuleb parem hind.</h2>
          <p>
            Leia naabrid, kellel on sama vajadus. Tehke üks tellimus koos ja valige sobiv pakkumine.
          </p>
          <a href="#procurements" className="button hero-button">
            Leia sobiv ühishange
            <ArrowRight size={18} />
          </a>
          <div className="hero-caption">
            <ShieldCheck size={15} /> Läbipaistvad hinnad. Ühine teenusepakkuja.
          </div>
        </div>
        <div className="hero-community">
          <CommunityHouses />
          <div className="community-summary">
            <div>
              <strong>{loading ? '…' : error ? '—' : etNumber(open.length)}</strong>
              <span>avatud ühishanget</span>
            </div>
            <div>
              <strong>
                {loading
                  ? '…'
                  : error
                    ? '—'
                    : etNumber(rows.reduce((sum, item) => sum + item.activeCount, 0))}
              </strong>
              <span>makstud liitumist</span>
            </div>
          </div>
          <p className="community-note">Naabrid kokku. Ühine tellimus.</p>
        </div>
      </div>
      <div className="kpi-grid">
        <Metric
          icon={<ClipboardList size={22} />}
          value={loading ? '…' : etNumber(open.length)}
          label="Avatud ühishanget"
          note="Leia oma ühistule sobiv"
          color="teal"
        />
        <Metric
          icon={<Users size={22} />}
          value={loading ? '…' : etNumber(rows.reduce((sum, item) => sum + item.activeCount, 0))}
          label="Makstud liitumist"
          note="Kinnitatud testmaksed"
          color="blue"
        />
        <Metric
          icon={<CheckCircle2 size={22} />}
          value={loading ? '…' : etNumber(successful.length)}
          label="Õnnestunud hanget"
          note="Ühine eesmärk saavutatud"
          color="green"
        />
        <Metric
          icon={<MapPin size={22} />}
          value="500 m"
          label="Vaikimisi kutseraadius"
          note="Sinu lähinaabrid"
          color="amber"
        />
      </div>
      <div className="dashboard-columns">
        <section className="card procurement-section">
          <SectionHeading eyebrow="LEIA OMA ÜHISTULE SOBIV" title="Avatud ühishanked">
            <a href="#procurements" className="text-link">
              Kõik hanked
              <ArrowRight size={16} />
            </a>
          </SectionHeading>
          <LoadState loading={loading} error={error}>
            {open.length ? (
              <div className="procurement-cards">
                {open.slice(0, 3).map((procurement) => (
                  <ProcurementCard key={procurement.id} procurement={procurement} />
                ))}
              </div>
            ) : (
              <Empty title="Avatud hankeid veel pole">
                Alusta oma ühistu hankest või vaata juba lõppenud hankeid.
              </Empty>
            )}
          </LoadState>
        </section>
        <aside className="dashboard-aside">
          <section className="card steps-card">
            <div className="small-icon">
              <Users size={20} />
            </div>
            <h3>Teeme koos.</h3>
            <p>Viis sammu ühise tellimuseni.</p>
            <ol>
              {communitySteps.map(([title, description], index) => (
                <li key={title}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </div>
                </li>
              ))}
            </ol>
            <a href="#organization" className="text-link">
              Vaata oma organisatsiooni
              <ArrowRight size={16} />
            </a>
          </section>
          <section className="tip-card">
            <ShieldCheck size={23} />
            <div>
              <strong>Kindlus enne liitumist</strong>
              <p>Näed alati teenuse ulatust, hinnatasemeid ja tagatisraha tingimusi.</p>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function Metric({
  icon,
  value,
  label,
  note,
  color,
}: {
  icon: ReactNode;
  value: string;
  label: string;
  note: string;
  color: string;
}) {
  return (
    <div className="metric card">
      <div className={`metric-icon metric-${color}`}>{icon}</div>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
        <small>{note}</small>
      </div>
    </div>
  );
}

function ProcurementCard({ procurement }: { procurement: Procurement }) {
  const remaining = Math.max(
    0,
    Math.ceil((new Date(procurement.joinDeadlineAt).getTime() - Date.now()) / 86_400_000),
  );
  return (
    <a href={`#procurement/${procurement.id}`} className="procurement-card">
      <div className="procurement-card-top">
        <span className="snow-icon">
          {isSnowService(procurement.spec) ? <Snowflake size={21} /> : <ClipboardList size={21} />}
        </span>
        <Status status={procurement.status} />
      </div>
      <span className="service-badge">{serviceLabel(procurement.spec)}</span>
      <h3>{procurement.title}</h3>
      <p className="procurement-address">
        <MapPin size={14} />
        {procurement.organizationName}
      </p>
      <div className="procurement-card-stats">
        <ParticipantProgress
          paidCount={procurement.activeCount}
          succeeded={!!procurement.succeededAt}
          compact
        />
        <div>
          <strong>{euro(procurement.bestPriceCents)}</strong>
          <span>
            {isSnowService(procurement.spec) ? 'Hooaja hind / ühistu' : 'Teenuse hind / ühistu'}
          </span>
        </div>
      </div>
      <div className="procurement-card-bottom">
        <span>
          <Clock3 size={14} />
          {remaining > 0 ? `${etNumber(remaining)} päeva liitumiseks` : 'Liitumise tähtaeg möödas'}
        </span>
        <span className="card-arrow">
          <ArrowRight size={18} />
        </span>
      </div>
    </a>
  );
}

function Procurements({
  organization,
  representative,
  revision,
}: {
  organization?: Organization;
  representative: boolean;
  revision: number;
}) {
  const { data, loading, error } = useLoad(
    () => api<{ procurements: Procurement[] }>('/procurements'),
    [revision],
  );
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [category, setCategory] = useState('all');
  const rows = (data?.procurements || []).filter(
    (item) =>
      `${item.title} ${item.organizationName} ${serviceLabel(item.spec)}`
        .toLocaleLowerCase('et')
        .includes(search.toLocaleLowerCase('et')) &&
      (category === 'all' || serviceId(item.spec) === category) &&
      (filter === 'all' ||
        (filter === 'open' && ['OPEN', 'SUCCEEDED'].includes(item.status)) ||
        (filter === 'own' && item.organizationId === organization?.id) ||
        (filter === 'ended' && ['FINALIZED', 'FAILED', 'CANCELLED'].includes(item.status))),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">KOOSTÖÖ ALGAB SIIT</span>
          <h1>Ühishanked</h1>
          <p>Leia oma ühistule sobiva teenuse hange või kutsu naabrid enda omasse.</p>
        </div>
        {organization?.orgType === 'BUYER' && representative && (
          <a href="#new" className="button button-primary">
            <Plus size={18} />
            Uus hange
          </a>
        )}
      </div>
      <section className="card">
        <div className="filter-bar">
          <div className="filter-tabs" role="group" aria-label="Hanke filter">
            {[
              ['all', 'Kõik hanked'],
              ['open', 'Avatud'],
              ['own', 'Minu algatatud'],
              ['ended', 'Lõppenud'],
            ].map(([value, label]) => (
              <button
                key={value}
                className={filter === value ? 'selected' : ''}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="search-input">
            <Search size={18} />
            <input
              aria-label="Otsi hankeid"
              placeholder="Otsi hankeid…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
        <div className="category-filter">
          <label htmlFor="procurement-category">Hanketüüp</label>
          <select
            id="procurement-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">Kõik hanketüübid</option>
            {SERVICE_FORMS.map((form) => (
              <option key={form.id} value={form.id}>
                {form.label}
              </option>
            ))}
          </select>
        </div>
        <LoadState loading={loading} error={error}>
          {rows.length ? (
            <div className="procurement-cards all-cards">
              {rows.map((procurement) => (
                <ProcurementCard key={procurement.id} procurement={procurement} />
              ))}
            </div>
          ) : (
            <Empty title="Sobivaid hankeid ei leitud">
              Proovi teist otsingut või loo uus hange.
            </Empty>
          )}
        </LoadState>
      </section>
    </>
  );
}

function NewProcurement({
  organization,
  representative,
}: {
  organization?: Organization;
  representative: boolean;
}) {
  const { run } = useOperations();
  const [formId, setFormId] = useState<ServiceFormId>('snow');
  const formDefinition = findServiceForm(formId)!;
  const [answers, setAnswers] = useState<ServiceAnswers>(() =>
    defaultServiceAnswers('snow', organization?.address),
  );
  const [issues, setIssues] = useState<ServiceFieldIssue[]>([]);
  useEffect(() => {
    setAnswers(defaultServiceAnswers(formId, organization?.address));
    setIssues([]);
  }, [organization?.id, formId]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organization) return;
    const normalized = normalizeServiceInputAnswers(formDefinition, answers);
    const submittedAnswers = sanitizeServiceAnswers(formDefinition, normalized.answers);
    const normalizationErrors = new Set(normalized.issues.map((issue) => issue.fieldId));
    const validation = [
      ...normalized.issues,
      ...validateServiceAnswers(formDefinition, submittedAnswers).filter(
        (issue) => !normalizationErrors.has(issue.fieldId),
      ),
    ];
    setIssues(validation);
    if (validation.length) {
      requestAnimationFrame(() => {
        const first = document.getElementById('service-' + validation[0].fieldId);
        const control = first instanceof HTMLFieldSetElement ? first.querySelector('input') : first;
        control?.focus();
        control?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
      return;
    }
    if (!event.currentTarget.reportValidity()) return;
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) || '');
    run(
      () =>
        api<{ procurement: Procurement }>('/procurements', {
          organizationId: organization.id,
          title: text('title'),
          description: text('description'),
          radiusM: parseDecimal(String(form.get('radiusM') || '')),
          joinDeadlineAt: utcDateTime(parseDateTimeInput(text('deadline'))),
          spec: { formId, version: formDefinition.version, answers: submittedAnswers },
        }),
      'Hanke mustand on salvestatud. Avalda see, kui tingimused on valmis.',
      ({ procurement }) => {
        window.location.hash = 'procurement/' + procurement.id;
      },
    );
  };
  if (!organization || organization.orgType !== 'BUYER' || !representative)
    return (
      <Empty title="Hanke loomiseks vajad ühistu esindusõigust">
        <a href="#organization">Vaata organisatsiooni ja taotle esindusõigust.</a>
      </Empty>
    );
  return (
    <>
      <a href="#procurements" className="back-link">
        <ChevronLeft size={17} />
        Tagasi hangete juurde
      </a>
      <div className="page-heading">
        <div>
          <span className="eyebrow">KUTSU NAABRID KAASA</span>
          <h1>{formId === 'snow' ? 'Uus lumekoristuse hange' : 'Uus ühishange'}</h1>
          <p>
            Vali teenus ja määra ühine tööde ulatus. Iga liituja kinnitab, et see sobib tema
            ühistule.
          </p>
        </div>
        <span className="pill">{organization.name}</span>
      </div>
      <form onSubmit={submit} className="form-layout" noValidate>
        <div>
          <section className="card form-card">
            <SectionHeading title="Hanke põhiandmed" />
            <Field label="Hanketüüp">
              <select
                value={formId}
                onChange={(event) => setFormId(event.target.value as ServiceFormId)}
              >
                {SERVICE_FORMS.map((form) => (
                  <option value={form.id} key={form.id}>
                    {form.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hanke pealkiri">
              <input
                name="title"
                placeholder="Näiteks: Naaberühistute ühine teenus Mustamäel"
                minLength={3}
                maxLength={160}
                required
              />
            </Field>
            <Field label="Kirjeldus">
              <textarea
                name="description"
                rows={4}
                placeholder="Kirjelda naabritele ühise hanke eesmärki ja piirkonda."
                required
              />
            </Field>
            <div className="field-grid">
              <Field
                label="Liitumise tähtaeg"
                className="regional-datetime-field"
                hint="Tallinna aeg. Liitumine jääb avatuks ka pärast õnnestumist."
              >
                <RegionalDateInput
                  mode="datetime"
                  calendarLabel="Liitumise tähtaeg"
                  name="deadline"
                  defaultValue={localDateTime(new Date(Date.now() + 7 * 86_400_000))}
                  min={localDateTime(new Date(Date.now() + 60_000))}
                  required
                />
              </Field>
              <Field label="Kutsete raadius (m)" hint="Kaugus sinu organisatsiooni aadressist.">
                <RegionalNumberInput
                  name="radiusM"
                  defaultValue={500}
                  min={50}
                  max={10000}
                  step={1}
                  decimalPlaces={0}
                  required
                />
              </Field>
            </div>
          </section>
          <section className="card form-card">
            <SectionHeading title="Ühine teenuse ulatus">
              <span className="service-badge">{formDefinition.label}</span>
            </SectionHeading>
            {issues.length > 0 && (
              <p className="inline-error" role="alert">
                Kontrolli märgitud teenuse välju.
              </p>
            )}
            <ServiceFields
              form={formDefinition}
              answers={answers}
              issues={issues}
              onChange={(fieldId, value) => {
                setAnswers(
                  sanitizeServiceAnswers(formDefinition, { ...answers, [fieldId]: value }),
                );
                setIssues([]);
              }}
            />
          </section>
          <div className="form-actions">
            <a href="#procurements" className="button button-secondary">
              Loobu
            </a>
            <Button>
              <Plus size={17} />
              Salvesta hange
            </Button>
          </div>
        </div>
        <aside className="card form-aside">
          <div className="small-icon">
            {formId === 'snow' ? <Snowflake size={25} /> : <ClipboardList size={25} />}
          </div>
          <h3>Hea hange on selge.</h3>
          <p>
            Need tingimused kehtivad igale osalevale ühistule. Pakkuja esitab kogu kirjeldatud
            teenuse brutohinna ühe ühistu kohta ka ühikuhinna soovi korral.
          </p>
          <div className="aside-note">
            <MapPin size={18} />
            <div>
              <strong>Hanke keskpunkt</strong>
              <span>{organization.address}</span>
              <small>
                {coordinate(organization.latitude)}; {coordinate(organization.longitude)}
              </small>
            </div>
          </div>
          <p>
            Hange salvestatakse mustandina. Pärast avaldamist saad saata piirkonna ühistutele
            rakenduses kutseid.
          </p>
          <p>
            Vali üks teenusepakkuja enne liitumiste algust. Tingimused lukustuvad esimese
            liitumisega.
          </p>
        </aside>
      </form>
    </>
  );
}

function ProcurementPage({
  id,
  organization,
  representative,
  revision,
}: {
  id: string;
  organization?: Organization;
  representative: boolean;
  revision: number;
}) {
  const [detail, setDetail] = useState<ProcurementDetail>();
  const [error, setError] = useState('');
  const [tab, setTab] = useState('overview');
  const [offerOpenRequest, setOfferOpenRequest] = useState(0);
  const { run, busy } = useOperations();
  const navigate = (target: FlowTarget) => {
    if (target === 'contracts') {
      window.location.hash = 'contracts';
      return;
    }
    if (target !== 'join') setTab(target === 'offer-form' ? 'offers' : target);
    if (target === 'offer-form') setOfferOpenRequest((value) => value + 1);
    window.setTimeout(() => {
      const region = document.getElementById(
        target === 'join'
          ? 'procurement-join'
          : target === 'offer-form'
            ? 'procurement-offer-form'
            : 'procurement-work',
      );
      region?.focus({ preventScroll: true });
      region?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const result = await api<ProcurementDetail>(`/procurements/${id}`);
        if (alive) {
          setDetail(result);
          setError('');
        }
      } catch (reason) {
        if (alive)
          setError(reason instanceof Error ? reason.message : 'Hanke laadimine ebaõnnestus.');
      }
    };
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 5000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [id, revision]);
  if (!detail)
    return (
      <LoadState loading={!error} error={error}>
        {null}
      </LoadState>
    );
  const { procurement: procurement, offers, commitments, contracts, nearby, invitations } = detail;
  const selected = offers.find((offer) => offer.id === procurement.selectedOfferId);
  const own = organization?.id === procurement.organizationId && representative;
  const open =
    ['OPEN', 'SUCCEEDED'].includes(procurement.status) &&
    new Date(procurement.joinDeadlineAt).getTime() > Date.now();
  const commitment = commitments.find(
    (item) =>
      item.organizationId === organization?.id &&
      ['PENDING', 'ACTIVE', 'CONTRACTED'].includes(item.status),
  );
  const threshold = selected?.tiers[0].minParticipants || 0;
  const participationHint =
    procurement.status === 'CANCELLED'
      ? 'Hange tühistati. Varasem osalemine säilib ajaloos ja makstud TEST tagatised tagastatakse.'
      : procurement.status === 'FAILED'
        ? 'Tähtaeg möödus ja vajalik osalejate arv ei täitunud. Makstud TEST tagatised tagastatakse täies ulatuses.'
        : procurement.status === 'FINALIZED'
          ? 'Liitumine on lõppenud. Jätkavatele ühistutele on loodud lepingud saavutatud lõpphinnaga.'
          : procurement.status === 'COMPLETED'
            ? 'Teenus on lõpetatud. Lepingud, lõpphind ja õnnestumise ajalugu säilivad.'
            : procurement.succeededAt
              ? procurement.activeCount < threshold
                ? open
                  ? 'Hange õnnestus varem. Saavutatud hind säilib ka pärast loobumisi. Liituda saab tähtajani.'
                  : 'Hange õnnestus varem. Liitumise tähtaeg on möödunud; saavutatud hind säilib ka pärast loobumisi.'
                : open
                  ? 'Eesmärk saavutatud. Liitumine kestab tähtajani; uued liitujad võivad tuua soodsama hinnataseme.'
                  : 'Hange õnnestus. Liitumise tähtaeg on möödunud; saavutatud hind säilib.'
              : open
                ? `Õnnestumiseks on vaja veel ${etNumber(Math.max(0, threshold - procurement.activeCount))} makstud liitumist.`
                : 'Liitumise tähtaeg on möödunud. Hanke tulemus ja TEST tagatiste arvestus selguvad tähtaja töötlemisel.';
  return (
    <>
      <a href="#procurements" className="back-link">
        <ChevronLeft size={17} />
        Tagasi hangete juurde
      </a>
      <div className="page-heading detail-heading">
        <div>
          <div className="heading-meta">
            <span className="eyebrow">
              {serviceLabel(procurement.spec).toLocaleUpperCase('et')} · ÜHISHANGE
            </span>
            <Status status={procurement.status} />
          </div>
          <h1>{procurement.title}</h1>
          <p>
            <MapPin size={15} />
            {procurement.organizationName}
            <span className="separator-dot">·</span>
            <Clock3 size={15} />
            <time dateTime={procurement.joinDeadlineAt}>
              Liitumine {date(procurement.joinDeadlineAt, true)}-ni
            </time>
          </p>
        </div>
      </div>
      {error && (
        <div role="alert" className="inline-error">
          Viimane värskendus ebaõnnestus: {error}
        </div>
      )}
      {procurement.status === 'DRAFT' && (
        <div className="info-banner">
          <FileText size={20} />
          <span>See hange on mustand. Avalda hange, et koguda pakkumisi ja kutsuda naabreid.</span>
        </div>
      )}
      {procurement.succeededAt && (
        <div className="success-banner">
          <CheckCircle2 size={22} />
          <div>
            <strong>Ühine eesmärk on saavutatud!</strong>
            <p>
              Hange õnnestus {date(procurement.succeededAt, true)}. Saavutatud parim hind ei tõuse,
              kui keegi hiljem loobub.
            </p>
          </div>
        </div>
      )}
      {['FAILED', 'CANCELLED'].includes(procurement.status) && (
        <div className="info-banner">
          <CircleHelp size={22} />
          <span>
            {procurement.status === 'FAILED'
              ? 'Hanke osalejate eesmärk jäi tähtajaks täitumata. Makstud testtagatised tagastatakse täies ulatuses.'
              : 'Hange on tühistatud. Kõik makstud testtagatised tagastatakse; varasemad testväljamaksed ja teenustasud pööratakse tagasi.'}
          </span>
        </div>
      )}
      <ProcurementFlow
        detail={detail}
        organization={organization}
        representative={representative}
        busy={busy}
        onNavigate={navigate}
        onPublish={() => {
          void run(
            () => api('/procurements/' + id + '/publish', {}),
            'Hange on avaldatud. Kutsu nüüd naabrid kaasa.',
          );
        }}
      />
      <div className="detail-tabs" role="group" aria-label="Hanke vaade">
        {[
          ['overview', 'Ülevaade'],
          ['offers', `Pakkumised (${etNumber(offers.length)})`],
          ['neighbors', `Naabrid ja kutsed (${etNumber(nearby.length)})`],
          ['participants', `Minu liitumised (${etNumber(commitments.length)})`],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={tab === value}
            className={tab === value ? 'active' : ''}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="detail-layout">
        <div className="detail-main" id="procurement-work" tabIndex={-1}>
          {tab === 'overview' && (
            <>
              <section className="card detail-description">
                <SectionHeading title="Ühise hanke eesmärk" />
                <p className="preserve-lines">{procurement.description}</p>
                <ServiceScope spec={procurement.spec} />
                <p className="scope-note">
                  <ShieldCheck size={16} />
                  Ühine teenuse ulatus kehtib igale liituvale ühistule.
                </p>
              </section>
              {selected ? (
                <OfferCard
                  offer={selected}
                  selected
                  procurement={procurement}
                  canSelect={false}
                  showSupplierAmounts={organization?.id === selected.organizationId}
                />
              ) : (
                <section className="card">
                  <Empty
                    title="Ühine teenusepakkuja on veel valimata"
                    icon={<Snowflake size={30} />}
                  >
                    Algataja võrdleb pakkumisi ja valib ühe, enne kui ühistud saavad liituda.
                  </Empty>
                  <Button
                    variant="secondary"
                    className="center-button"
                    onClick={() => setTab('offers')}
                  >
                    Vaata pakkumisi
                    <ArrowRight size={16} />
                  </Button>
                </section>
              )}
              {contracts.length > 0 && (
                <section className="card">
                  <SectionHeading title="Loodud lepingud" />
                  <div className="simple-list">
                    {contracts.map((contract) => (
                      <div className="simple-row" key={contract.id}>
                        <FileCheck2 size={19} />
                        <div>
                          <strong>{contract.organizationName}</strong>
                          <small>
                            {isSnowService(procurement.spec)
                              ? 'Hooaja lõpphind'
                              : 'Teenuse lõpphind'}{' '}
                            {euro(contract.priceCents)} · Tagatisraha arvestatud{' '}
                            {euro(contract.depositCreditCents)}
                          </small>
                        </div>
                        <a href="#contracts" className="text-link">
                          Vaata
                          <ArrowRight size={15} />
                        </a>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          {tab === 'offers' && (
            <>
              <SectionHeading title="Teenusepakkujate pakkumised" />
              <p className="muted">
                Kõik hinnad on ühe ühistu{' '}
                {isSnowService(procurement.spec) ? 'kogu hooaja' : 'kogu teenuse'} brutohinnad.
                Esimene hinnatase määrab hanke õnnestumiseks vajaliku osalejate arvu.
              </p>
              {offers.length ? (
                offers.map((offer) => (
                  <OfferCard
                    key={offer.id}
                    offer={offer}
                    selected={offer.id === selected?.id}
                    procurement={procurement}
                    canSelect={own && open && !procurement.frozenAt}
                    showSupplierAmounts={organization?.id === offer.organizationId}
                  />
                ))
              ) : (
                <section className="card">
                  <Empty title="Pakkumisi veel pole">
                    Avaldatud hankele saavad kinnitatud teenusepakkujad pakkumise esitada.
                  </Empty>
                </section>
              )}
              {organization?.orgType === 'SUPPLIER' &&
                representative &&
                open &&
                !procurement.frozenAt && (
                  <OfferForm
                    procurement={procurement}
                    organization={organization}
                    openRequest={offerOpenRequest}
                  />
                )}
            </>
          )}
          {tab === 'neighbors' && (
            <section className="card">
              <SectionHeading eyebrow="KOOSTÖÖ SINU LÄHEDAL" title="Naabrid ja kutsed">
                {own && open && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      run(
                        () => api(`/procurements/${id}/invitations`, {}),
                        'Piirkonna ühistutele on saadetud rakenduses kutsed.',
                      )
                    }
                  >
                    <Bell size={16} />
                    Saada kutsed
                  </Button>
                )}
              </SectionHeading>
              <p className="muted">
                Kaugused on arvutatud hanke keskpunktist. Kutse ei anna organisatsiooni
                esindusõigust.
              </p>
              <CoordinateMap procurement={procurement} nearby={nearby} />
              <div className="simple-list neighbors-list">
                {nearby.length ? (
                  nearby.map((neighbor) => {
                    const invite = invitations.find((item) => item.organizationId === neighbor.id);
                    return (
                      <div className="simple-row" key={neighbor.id}>
                        <span className="list-icon">
                          <Building2 size={19} />
                        </span>
                        <div>
                          <strong>{neighbor.name}</strong>
                          <small>{neighbor.address}</small>
                        </div>
                        <span className="distance">
                          {etNumber(Math.round(neighbor.distanceM))} m
                        </span>
                        {invite ? (
                          <Status status={invite.status} />
                        ) : (
                          <span className="muted small">Kutse saatmata</span>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <Empty title="Raadiuses pole teisi ühistuid">
                    Organisatsioonide koordinaadid ja hanke raadius määravad sobivad naabrid.
                  </Empty>
                )}
              </div>
            </section>
          )}
          {tab === 'participants' && (
            <section className="card">
              <SectionHeading title="Minu liitumised ja ajalugu" />
              <p className="muted">
                Ainult kinnitatud maksega liitumised loetakse eesmärgi täitmisel. Algataja liitumine
                arvestatakse samuti alles pärast testmakset.
              </p>
              <div className="simple-list">
                {commitments.length ? (
                  commitments.map((item) => (
                    <div className="simple-row" key={item.id}>
                      <span className="list-icon">
                        <Building2 size={19} />
                      </span>
                      <div>
                        <strong>{item.organizationName}</strong>
                        <small>
                          {date(item.createdAt, true)} ·{' '}
                          {item.capturedAt
                            ? `Testtagatis ${euro(item.depositCents)}${item.refundedAt ? ' tagastatud' : ' makstud'}`
                            : 'Testmakse ootel'}
                        </small>
                      </div>
                      <Status status={item.status} />
                    </div>
                  ))
                ) : (
                  <Empty title="Selle konto liitumisi veel pole">
                    Valitud pakkumisele saab liituda kinnitatud ühistu esindaja.
                  </Empty>
                )}
              </div>
            </section>
          )}
        </div>
        <aside className="detail-aside">
          <section className="card price-summary">
            <span className="eyebrow">
              {isSnowService(procurement.spec)
                ? 'ÜHE ÜHISTU HOOAJA BRUTOHIND'
                : 'ÜHE ÜHISTU TEENUSE BRUTOHIND'}
            </span>
            <div className="summary-price" data-testid="current-price">
              {euro(procurement.bestPriceCents ?? selected?.basePriceCents)}
              <small>{isSnowService(procurement.spec) ? '/ hooaeg' : '/ kogu teenus'}</small>
            </div>
            {selected ? (
              <>
                <p>
                  Teenusepakkuja: <strong>{selected.supplierName}</strong>
                </p>
                <ParticipantProgress
                  paidCount={procurement.activeCount}
                  threshold={threshold}
                  succeeded={!!procurement.succeededAt}
                />
                <small className="progress-hint">{participationHint}</small>
                <div className="summary-line">
                  <span>Testtagatisraha</span>
                  <strong>{euro(selected.depositCents)}</strong>
                </div>
                <div className="summary-line">
                  <span>Liitumise tähtaeg</span>
                  <strong>{date(procurement.joinDeadlineAt)}</strong>
                </div>
                {procurement.frozenAt && (
                  <div className="locked-note">
                    <ShieldCheck size={15} />
                    Pakkumise tingimused on lukustatud.
                  </div>
                )}
              </>
            ) : (
              <p>Lõplik hind selgub pärast teenusepakkuja valikut ja liitumisi.</p>
            )}
          </section>
          {selected && organization?.orgType === 'BUYER' && representative && (
            <div id="procurement-join" tabIndex={-1}>
              <JoinPanel
                procurement={procurement}
                organization={organization}
                selected={selected}
                commitment={commitment}
                allCommitments={commitments}
                open={open}
                eligible={
                  organization.id === procurement.organizationId ||
                  nearby.some((item) => item.id === organization.id)
                }
              />
            </div>
          )}
          <TestNotice />
          <section className="card refund-guide">
            <h3>
              <CircleHelp size={18} />
              Tagatisraha tingimused
            </h3>
            <p>
              <strong>Enne õnnestumist:</strong> loobumisel tagastatakse tagatisraha kohe täies
              ulatuses.
            </p>
            <p>
              <strong>Pärast õnnestumist:</strong> loobumisel tagatisraha ei tagastata; teiste
              ühistute hind ei tõuse.
            </p>
            <p>
              <strong>Tähtajal:</strong> õnnestunud hankele luuakse lepingud. Teenusepakkuja
              teenustasu arvestatakse tagatisest ja ülejäänud tagatis kantakse talle.
            </p>
            <FeeTerms policy={procurement.feePolicy} />
            <p>
              <strong>Loobumine enne lepingu loomist:</strong> pärast õnnestumist allesjäetud
              tagatisest on teenustasu {etNumber(procurement.feePolicy.basisPoints / 100)}%,
              miinimumtasuta.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}

function Scope({ label, value }: { label: string; value: string }) {
  return (
    <div className="scope-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OfferCard({
  offer,
  selected,
  procurement,
  canSelect,
  showSupplierAmounts,
}: {
  offer: Offer;
  selected: boolean;
  procurement: Procurement;
  canSelect: boolean;
  showSupplierAmounts: boolean;
}) {
  const { run } = useOperations();
  const policy = selected ? procurement.feePolicy : CURRENT_FEE_POLICY;
  return (
    <section className={`card offer-card ${selected ? 'selected-offer' : ''}`}>
      <div className="offer-header">
        <div className="offer-supplier">
          <span className="list-icon">
            <Snowflake size={22} />
          </span>
          <div>
            <h3>{offer.supplierName}</h3>
            <small>Kehtib kuni {date(offer.validUntil, true)}</small>
          </div>
        </div>
        {selected ? (
          <span className="selected-label">
            <CheckCircle2 size={16} />
            Valitud pakkumine
          </span>
        ) : (
          canSelect && (
            <Button
              variant="secondary"
              onClick={() =>
                run(
                  () => api(`/procurements/${procurement.id}/select-offer`, { offerId: offer.id }),
                  'Ühine teenusepakkuja on valitud.',
                )
              }
            >
              Vali pakkumine
              <Check size={16} />
            </Button>
          )
        )}
      </div>
      <div className="tier-grid">
        <div className="tier base-tier">
          <span>Tavahind</span>
          <strong>{euro(offer.basePriceCents)}</strong>
          <small>
            {isSnowService(procurement.spec) ? 'ühe ühistu hooaeg' : 'ühe ühistu kogu teenus'}
          </small>
        </div>
        {offer.tiers.map((tier, index) => (
          <div
            className={`tier ${procurement.bestPriceCents !== null && procurement.bestPriceCents <= tier.priceCents && selected ? 'achieved-tier' : ''}`}
            key={tier.minParticipants}
          >
            <span>
              {etNumber(tier.minParticipants)}+ ühistut
              {index === 0 && <span className="tier-goal">EESMÄRK</span>}
            </span>
            <strong>{euro(tier.priceCents)}</strong>
            <small>{index === 0 ? 'Hange õnnestub' : 'Järgmine ühine hinnatase'}</small>
          </div>
        ))}
      </div>
      <div className="offer-bottom">
        <span>
          Testtagatisraha <strong>{euro(offer.depositCents)}</strong>
        </span>
        <span>Teenusepakkuja teenustasu: {feePolicyText(policy)}</span>
      </div>
      <FeeTerms policy={policy} />
      {showSupplierAmounts && (
        <SupplierFeePreview tiers={offer.tiers} depositCents={offer.depositCents} policy={policy} />
      )}
      <details className="offer-terms">
        <summary>
          Pakkumise tingimused <ChevronDown size={16} />
        </summary>
        <p className="preserve-lines">{offer.terms}</p>
      </details>
    </section>
  );
}

function OfferForm({
  procurement,
  organization,
  openRequest = 0,
}: {
  procurement: Procurement;
  organization: Organization;
  openRequest?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (openRequest) setExpanded(true);
  }, [openRequest]);
  const [tiers, setTiers] = useState<Array<{ participants: string; price: string }>>([
    { participants: '3', price: '' },
    { participants: '5', price: '' },
  ]);
  const [deposit, setDeposit] = useState('');
  const previewCents = (raw: string) => {
    try {
      const cents = parseEuroCents(raw);
      return cents > 0 ? cents : undefined;
    } catch {
      return undefined;
    }
  };
  const previewTiers = tiers.flatMap((tier) => {
    const priceCents = previewCents(tier.price);
    if (priceCents === undefined) return [];
    let minParticipants;
    try {
      const parsed = parseDecimal(tier.participants);
      if (Number.isInteger(parsed) && parsed > 0) minParticipants = parsed;
    } catch {
      // Price estimates remain available while the participant threshold is being edited.
    }
    return [{ priceCents, minParticipants }];
  });
  const cheapestPrice = previewTiers.length
    ? Math.min(...previewTiers.map((tier) => tier.priceCents))
    : undefined;
  const { run } = useOperations();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () =>
        api(`/procurements/${procurement.id}/offers`, {
          organizationId: organization.id,
          basePriceCents: parseEuroCents(String(form.get('basePrice') || '')),
          depositCents: parseEuroCents(String(form.get('deposit') || '')),
          terms: String(form.get('terms')),
          validUntil: utcDateTime(parseDateTimeInput(String(form.get('validUntil') || ''))),
          tiers: tiers.map((tier) => ({
            minParticipants: parseDecimal(tier.participants),
            priceCents: parseEuroCents(tier.price),
          })),
        }),
      'Pakkumine on esitatud.',
      () => setExpanded(false),
    );
  };
  return (
    <section className="card form-card" id="procurement-offer-form" tabIndex={-1}>
      <SectionHeading title="Sinu pakkumine">
        {!expanded && (
          <Button onClick={() => setExpanded(true)}>
            <Plus size={17} />
            Esita pakkumine
          </Button>
        )}
      </SectionHeading>
      {expanded ? (
        <form onSubmit={submit}>
          <div className="info-banner">
            <Euro size={20} />
            <span>
              Hinnad on ühe ühistu {isSnowService(procurement.spec) ? 'hooaja' : 'kogu teenuse'}{' '}
              brutohinnad. Osalejate arv peab kasvama ja hinnad saavad ainult langeda. Tagatis ei
              või ületada odavaimat hinnataset. Teenustasu arvestatakse tagatisest.
            </span>
          </div>
          <div className="field-grid">
            <Field
              label={
                isSnowService(procurement.spec) ? 'Hooaja tavahind (€)' : 'Teenuse tavahind (€)'
              }
            >
              <RegionalNumberInput
                name="basePrice"
                step="0.01"
                decimalPlaces={2}
                min="0.01"
                required
              />
            </Field>
            <Field
              label="Tagatisraha (€)"
              hint={`${etNumber(CURRENT_FEE_POLICY.basisPoints / 100)}% tagatisest on portaali teenustasu.`}
            >
              <RegionalNumberInput
                name="deposit"
                step="0.01"
                decimalPlaces={2}
                min="0.01"
                value={deposit}
                onValueChange={setDeposit}
                required
              />
            </Field>
            <Field
              label="Pakkumise kehtivus"
              className="regional-datetime-field"
              hint="Tallinna aeg."
            >
              <RegionalDateInput
                name="validUntil"
                calendarLabel="Pakkumise kehtivus"
                mode="datetime"
                defaultValue={localDateTime(new Date(procurement.joinDeadlineAt))}
                required
              />
            </Field>
          </div>
          <FeeTerms policy={CURRENT_FEE_POLICY} />
          <p className="deposit-coverage-note" data-testid="deposit-coverage-note">
            Teenustasu ei sõltu teenuse lõpphinnast ega hinnatasemest.
            {cheapestPrice !== undefined && ` Tagatis võib olla kuni ${euro(cheapestPrice)}.`}
          </p>
          <SupplierFeePreview
            tiers={previewTiers}
            depositCents={previewCents(deposit)}
            policy={CURRENT_FEE_POLICY}
            live
          />
          <div className="tier-editor">
            <h4>Hinnatasemed</h4>
            {tiers.map((tier, index) => (
              <div key={index} className="tier-editor-row">
                <Field
                  label={`Osalejate arv${index ? ` ${index + 1}` : ''}`}
                  hint={index === 0 ? 'Hanke õnnestumise lävend.' : undefined}
                >
                  <RegionalNumberInput
                    min={1}
                    max={1000}
                    step={1}
                    decimalPlaces={0}
                    required
                    value={tier.participants}
                    onValueChange={(raw) =>
                      setTiers(
                        tiers.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, participants: raw } : item,
                        ),
                      )
                    }
                  />
                </Field>
                <Field
                  label={`${isSnowService(procurement.spec) ? 'Hooaja' : 'Teenuse'} hind (€)${index ? ` ${index + 1}` : ''}`}
                >
                  <RegionalNumberInput
                    min="0.01"
                    step="0.01"
                    decimalPlaces={2}
                    required
                    value={tier.price}
                    onValueChange={(raw) =>
                      setTiers(
                        tiers.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, price: raw } : item,
                        ),
                      )
                    }
                  />
                </Field>
                {index > 0 && (
                  <button
                    type="button"
                    className="icon-button remove-tier"
                    aria-label={`Eemalda hinnatase ${index + 1}`}
                    onClick={() => setTiers(tiers.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              onClick={() => setTiers([...tiers, { participants: '', price: '' }])}
            >
              <Plus size={16} />
              Lisa hinnatase
            </Button>
          </div>
          <Field label="Pakkumise tingimused">
            <textarea
              name="terms"
              rows={4}
              minLength={3}
              required
              placeholder="Teenuse korraldus, kaasatud tööd ja kokkulepped."
            />
          </Field>
          <div className="form-actions">
            <Button type="button" variant="secondary" onClick={() => setExpanded(false)}>
              Loobu
            </Button>
            <Button>
              Saada pakkumine
              <ArrowRight size={17} />
            </Button>
          </div>
        </form>
      ) : (
        <p className="muted">
          Esita ühistutele ühine teenuse pakkumine koos osalejate arvust sõltuvate hindadega.
        </p>
      )}
    </section>
  );
}

function JoinPanel({
  procurement,
  organization,
  selected,
  commitment,
  allCommitments,
  open,
  eligible,
}: {
  procurement: Procurement;
  organization: Organization;
  selected: Offer;
  commitment?: Commitment;
  allCommitments: Commitment[];
  open: boolean;
  eligible: boolean;
}) {
  const [authority, setAuthority] = useState(false);
  const [scope, setScope] = useState(false);
  const [confirmWithdrawal, setConfirmWithdrawal] = useState(false);
  const { run } = useOperations();
  const last = allCommitments.filter((item) => item.organizationId === organization.id).at(-1);
  if (commitment)
    return (
      <section className="card join-card">
        <div className="join-card-title">
          <CheckCircle2 size={21} />
          <h3>Sinu ühistu liitumine</h3>
        </div>
        <strong className="join-organization">{organization.name}</strong>
        <Status status={commitment.status} />
        {commitment.status === 'PENDING' ? (
          <>
            <p>
              Liitumine on salvestatud. Eesmärgi hulka loetakse ühistu pärast tagatisraha testmakse
              kinnitamist.
            </p>
            <TestNotice compact />
            <div className="summary-line">
              <span>Testmakse summa</span>
              <strong>{euro(commitment.depositCents)}</strong>
            </div>
            <Button
              className="full-width"
              onClick={() =>
                run(
                  () =>
                    api(`/test-payments/${commitment.id}`, {
                      outcome: 'captured',
                      eventId: crypto.randomUUID(),
                    }),
                  'Testmakse on töödeldud. Vaata oma liitumise olekut.',
                )
              }
            >
              <CheckCircle2 size={17} />
              Kinnita testmakse
            </Button>
            <Button
              className="full-width"
              variant="ghost"
              onClick={() =>
                run(
                  () =>
                    api(`/test-payments/${commitment.id}`, {
                      outcome: 'failed',
                      eventId: crypto.randomUUID(),
                    }),
                  'Ebaõnnestunud testmakse on salvestatud. Makset saad uuesti proovida.',
                )
              }
            >
              Simuleeri makse ebaõnnestumist
            </Button>
          </>
        ) : (
          <>
            <p>
              {commitment.status === 'CONTRACTED'
                ? 'Hanke lõpphind ja sinu ühistu leping on valmis.'
                : `Testtagatis ${euro(commitment.depositCents)} on makstud. Sinu ühistu on osalejate hulka arvestatud.`}
            </p>
            {commitment.status === 'CONTRACTED' && (
              <a href="#contracts" className="button button-primary full-width">
                Vaata lepingut
                <ArrowRight size={17} />
              </a>
            )}
          </>
        )}
        {['PENDING', 'ACTIVE'].includes(commitment.status) &&
          !['CANCELLED', 'FAILED', 'FINALIZED'].includes(procurement.status) && (
            <div className="withdrawal-section">
              {confirmWithdrawal ? (
                <>
                  <p className="withdrawal-warning">
                    {procurement.succeededAt
                      ? `Hange on õnnestunud. Loobumisel jääb ${euro(commitment.depositCents)} tagatis alles ega kuulu tagastamisele.`
                      : 'Enne õnnestumist tagastatakse kogu makstud testtagatis.'}{' '}
                    Kas kinnitad loobumise?
                  </p>
                  <div className="button-row">
                    <Button variant="secondary" onClick={() => setConfirmWithdrawal(false)}>
                      Jätka osalemist
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() =>
                        run(
                          () => api(`/commitments/${commitment.id}/withdraw`, {}),
                          'Loobumine on salvestatud.',
                          () => setConfirmWithdrawal(false),
                        )
                      }
                    >
                      Kinnita loobumine
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  variant="ghost"
                  className="full-width"
                  onClick={() => setConfirmWithdrawal(true)}
                >
                  Loobu hankest
                </Button>
              )}
            </div>
          )}
        <details className="snapshot">
          <summary>Liitumisel kinnitatud tingimused</summary>
          <AgreementHistory snapshot={commitment.acceptanceSnapshot} />
        </details>
      </section>
    );
  return (
    <section className="card join-card">
      <h3>{open ? 'Liitu naabritega' : 'Liitumine on lõppenud'}</h3>
      {last && (
        <div className="previous-commitment">
          <Status status={last.status} />
          <small>
            {last.refundedAt
              ? 'Varasem testtagatis on tagastatud.'
              : last.capturedAt
                ? 'Varasema tagatise ajalugu säilib.'
                : 'Varasema liitumise ajalugu säilib.'}
          </small>
          <details className="snapshot">
            <summary>Liitumisel kinnitatud tingimused</summary>
            <AgreementHistory snapshot={last.acceptanceSnapshot} />
          </details>
        </div>
      )}
      {open && eligible ? (
        <>
          <p>
            Liitud organisatsiooni <strong>{organization.name}</strong> nimel. Tagatisraha
            arvestatakse täies ulatuses {isSnowService(procurement.spec) ? 'hooaja' : 'teenuse'}{' '}
            tasu sisse.
          </p>
          <FeeTerms policy={procurement.feePolicy} />
          <label className="checkbox block-checkbox">
            <input
              type="checkbox"
              checked={authority}
              onChange={(event) => setAuthority(event.target.checked)}
            />
            <span>Kinnitan, et mul on õigus ühistu nimel kohustusi võtta.</span>
          </label>
          <label className="checkbox block-checkbox">
            <input
              type="checkbox"
              checked={scope}
              onChange={(event) => setScope(event.target.checked)}
            />
            <span>Kinnitan ühise teenuse ulatuse, pakkumise ja tagatisraha tingimused.</span>
          </label>
          <Button
            className="full-width"
            disabled={!authority || !scope}
            onClick={() =>
              run(
                () =>
                  api(`/procurements/${procurement.id}/commitments`, {
                    organizationId: organization.id,
                    authorityConfirmed: authority,
                    scopeConfirmed: scope,
                  }),
                'Liitumine on loodud. Kinnita järgmisena tagatisraha testmakse.',
              )
            }
          >
            <Users size={18} />
            Liitu hankega
          </Button>
          <small className="join-deposit">
            TESTTAGATIS {euro(selected.depositCents)} · Päris raha ei liigu.
          </small>
        </>
      ) : (
        <p>
          {open
            ? `Sinu ühistu asub väljaspool selle hanke ${etNumber(procurement.radiusM)} meetri kutseraadiust.`
            : 'Selle hanke liitumise tähtaeg on möödas või hange ei ole avatud.'}
        </p>
      )}
    </section>
  );
}

function CoordinateMap({
  procurement,
  nearby,
}: {
  procurement: Procurement;
  nearby: NearbyOrganization[];
}) {
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const radius = procurement.radiusM / zoom;
  const placed: Array<{ x: number; y: number }> = [];
  const point = (organization: NearbyOrganization) => {
    const base = {
      x:
        260 +
        (((organization.longitude - procurement.locationLongitude) *
          111320 *
          Math.cos((procurement.locationLatitude * Math.PI) / 180)) /
          radius) *
          170,
      y: 190 - (((organization.latitude - procurement.locationLatitude) * 111320) / radius) * 170,
    };
    let candidate = base;
    for (let attempt = 1; attempt <= 80; attempt++) {
      const overlaps =
        Math.hypot(candidate.x - 260, candidate.y - 190) < 40 ||
        placed.some((p) => Math.hypot(candidate.x - p.x, candidate.y - p.y) < 28);
      if (!overlaps) break;
      const angle = attempt * 2.399963;
      const offset = 18 * Math.sqrt(attempt);
      candidate = { x: base.x + Math.cos(angle) * offset, y: base.y + Math.sin(angle) * offset };
    }
    placed.push(candidate);
    return candidate;
  };
  const neighbor = nearby.find((item) => item.id === selected);
  return (
    <div className="coordinate-map">
      <div className="map-label">
        <MapPin size={14} />
        Naabrid hanke ümber
      </div>
      <div className="map-controls">
        <button onClick={() => setZoom(Math.min(3, zoom + 0.5))} aria-label="Suurenda kaarti">
          +
        </button>
        <button onClick={() => setZoom(Math.max(0.5, zoom - 0.5))} aria-label="Vähenda kaarti">
          −
        </button>
      </div>
      <svg
        viewBox="0 0 520 380"
        role="img"
        aria-label={`Hanke keskpunkt ja läheduses olevad ühistud, kutseraadius ${etNumber(procurement.radiusM)} meetrit`}
      >
        <defs>
          <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="var(--stone)" strokeWidth="1" />
          </pattern>
          <clipPath id="map-clip">
            <rect width="520" height="380" rx="10" />
          </clipPath>
        </defs>
        <rect width="520" height="380" fill="var(--paper)" />
        <rect width="520" height="380" fill="url(#map-grid)" />
        <g clipPath="url(#map-clip)">
          <circle
            cx="260"
            cy="190"
            r={170 * zoom}
            fill="var(--sage-surface)"
            fillOpacity="0.75"
            stroke="var(--sage)"
            strokeWidth="1.5"
            strokeDasharray="5 5"
          />
          <line x1="260" y1="15" x2="260" y2="365" stroke="var(--stone)" strokeDasharray="3 5" />
          <line x1="25" y1="190" x2="495" y2="190" stroke="var(--stone)" strokeDasharray="3 5" />
          {nearby.map((item) => {
            const p = point(item);
            return (
              <g
                key={item.id}
                role="button"
                tabIndex={0}
                aria-label={`${item.name}, ${etNumber(Math.round(item.distanceM))} meetrit`}
                aria-pressed={selected === item.id}
                className="map-point"
                onClick={() => setSelected(item.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(item.id);
                  }
                }}
              >
                <title>
                  {item.name} · {etNumber(Math.round(item.distanceM))} m
                </title>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={selected === item.id ? 14 : 11}
                  fill={selected === item.id ? 'var(--clay-dark)' : 'var(--clay)'}
                  stroke={selected === item.id ? 'var(--forest)' : 'var(--paper)'}
                  strokeWidth="3"
                />
                <path
                  d={`M${p.x - 3} ${p.y + 3}v-6h6v6m-4-4h2`}
                  fill="none"
                  stroke="white"
                  strokeWidth="1.2"
                />
              </g>
            );
          })}
          <circle
            pointerEvents="none"
            cx="260"
            cy="190"
            r="21"
            fill="var(--forest)"
            stroke="white"
            strokeWidth="4"
          />
          <path
            pointerEvents="none"
            d="M250 198v-17l10-6 10 6v17m-15-12h10m-10 5h10m-8 7v-4h6v4"
            stroke="white"
            fill="none"
            strokeWidth="2"
          />
        </g>
        <text x="22" y="352" fill="var(--muted)" fontSize="10">
          {etNumber(Math.round(radius))} m skaalaraadius
        </text>
        <text x="480" y="30" fill="var(--forest)" fontSize="12" fontWeight="700">
          N ↑
        </text>
      </svg>
      <div className="map-bottom">
        {neighbor ? (
          <span>
            <strong>{neighbor.name}</strong> · {etNumber(Math.round(neighbor.distanceM))} m
          </span>
        ) : (
          <span>Vali kaardil ühistu, et vaadata kaugust.</span>
        )}
        <small>
          Suur roheline tähis: hanke algataja. Kutseraadius {etNumber(procurement.radiusM)} m.
          Lähestikku tähised on nihutatud.
        </small>
      </div>
    </div>
  );
}

function Invitations({ revision, session }: { revision: number; session: SessionResponse }) {
  const canRespond = (organizationId: string) =>
    Boolean(
      session.user?.isAdmin ||
      session.memberships.some(
        (membership) =>
          membership.organizationId === organizationId &&
          membership.status === 'approved' &&
          membership.role === 'representative',
      ),
    );
  const { data, loading, error } = useLoad(
    () => api<{ invitations: Invitation[] }>('/invitations'),
    [revision],
  );
  const { run } = useOperations();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">NAABRID OOTAVAD SIND</span>
          <h1>Sinu kutsed</h1>
          <p>
            Rakenduses saabunud kutsed ühistele hangetele. Kutse vastuvõtmine ei loo liitumist ega
            maksekohustust.
          </p>
        </div>
      </div>
      <section className="card">
        <SectionHeading title="Organisatsioonide kutsed" />
        <LoadState loading={loading} error={error}>
          {data?.invitations.length ? (
            <div className="invitation-list">
              {data.invitations.map((invitation) => (
                <div className="invitation" data-testid="invitation-card" key={invitation.id}>
                  <div className="invitation-icon">
                    <Bell size={22} />
                  </div>
                  <div className="invitation-content">
                    {!canRespond(invitation.organizationId) && (
                      <p className="invitation-readonly">
                        Sul on vaatamisõigus. Kutsele saab vastata kinnitatud esindaja.
                      </p>
                    )}
                    <div className="invitation-meta">
                      <span>{invitation.organizationName}</span>
                      <Status status={invitation.status} />
                    </div>
                    <h3>
                      <a href={`#procurement/${invitation.procurementId}`}>
                        {invitation.procurementTitle}
                      </a>
                    </h3>
                    <p>
                      <MapPin size={14} />
                      {invitation.distanceM === null
                        ? 'Kutsel kaugus määramata'
                        : `${etNumber(Math.round(invitation.distanceM))} m hanke algatajast`}
                      <span>·</span>
                      {date(invitation.createdAt)}
                    </p>
                    <div className="button-row">
                      <a
                        href={`#procurement/${invitation.procurementId}`}
                        className="button button-secondary"
                      >
                        Vaata hanget
                        <ArrowRight size={16} />
                      </a>
                      {invitation.status === 'PENDING' && canRespond(invitation.organizationId) && (
                        <>
                          <Button
                            onClick={() =>
                              run(
                                () =>
                                  api(`/invitations/${invitation.id}/respond`, {
                                    status: 'ACCEPTED',
                                  }),
                                'Kutse on vastu võetud. Hankega liitumiseks kinnita tingimused ja tee testmakse.',
                              )
                            }
                          >
                            <Check size={16} />
                            Võta kutse vastu
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() =>
                              run(
                                () =>
                                  api(`/invitations/${invitation.id}/respond`, {
                                    status: 'DECLINED',
                                  }),
                                'Kutse on tagasi lükatud.',
                              )
                            }
                          >
                            Lükka tagasi
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="Sulle pole veel kutseid" icon={<Bell size={30} />}>
              Kui sinu ühistu jääb mõne hanke kutseraadiusesse, saab algataja saata rakenduses
              kutse. Avatud hankeid saad vaadata juba praegu.
            </Empty>
          )}
        </LoadState>
      </section>
      <div className="info-banner">
        <ShieldCheck size={20} />
        <span>
          Kutse ei anna esindusõigust. Hankega liitumiseks peab administraator kinnitama sinu
          organisatsiooni liikmesuse.
        </span>
      </div>
    </>
  );
}

function Contracts({
  revision,
  organization,
  representative,
}: {
  revision: number;
  organization?: Organization;
  representative: boolean;
}) {
  const { data, loading, error } = useLoad(
    () => api<{ contracts: Contract[] }>('/contracts'),
    [revision],
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">KOKKULEPPED, MILLELE SAAB TOETUDA</span>
          <h1>Sinu lepingud</h1>
          <p>
            Hanke tähtajal loodud individuaalsed lepingud. Liitumisel kinnitatud tingimused ja
            lõpphind säilivad eraldi.
          </p>
        </div>
      </div>
      <TestNotice />
      <LoadState loading={loading} error={error}>
        {data?.contracts.length ? (
          <div className="contract-list">
            {data.contracts.map((contract) => (
              <ContractCard
                key={contract.id}
                contract={contract}
                canComplete={representative && organization?.id === contract.organizationId}
              />
            ))}
          </div>
        ) : (
          <section className="card">
            <Empty title="Lepinguid veel pole" icon={<FileCheck2 size={32} />}>
              Õnnestunud hankele luuakse lepingud liitumise tähtajal. Iga jätkav ühistu saab oma
              lõpphinna ja tagatisraha arvestuse.
            </Empty>
          </section>
        )}
      </LoadState>
    </>
  );
}

function ContractCard({ contract, canComplete }: { contract: Contract; canComplete: boolean }) {
  const [completing, setCompleting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [rating, setRating] = useState(5);
  const { run } = useOperations();
  const estimatedAmounts = feeAmounts(
    contract.priceCents,
    contract.depositCreditCents,
    feePolicyForSnapshot(contract.finalSnapshot),
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () =>
        api(`/contracts/${contract.id}/complete`, {
          rating,
          comment: String(form.get('comment') || ''),
        }),
      'Teenus on lõpetatuks märgitud ja hinnang salvestatud.',
      () => setCompleting(false),
    );
  };
  return (
    <section className="card contract-card" data-testid="contract-card">
      <div className="contract-heading">
        <div className="contract-icon">
          <FileCheck2 size={25} />
        </div>
        <div>
          <span className="eyebrow">{contract.organizationName}</span>
          <h3>{contract.procurementTitle}</h3>
          <p>Teenusepakkuja: {contract.supplierName}</p>
        </div>
        <span
          className={`status ${contract.status === 'CANCELLED' ? 'status-cancelled' : contract.completedAt ? 'status-succeeded' : 'status-open'}`}
        >
          <span className="status-dot" />
          {contract.status === 'CANCELLED'
            ? 'Tühistatud'
            : contract.completedAt
              ? 'Teenus lõpetatud'
              : 'Leping aktiivne'}
        </span>
      </div>
      <div className="contract-money">
        <Scope
          label={
            isSnowService(contract.finalSnapshot.spec) ? 'Hooaja lõpphind' : 'Teenuse lõpphind'
          }
          value={euro(contract.priceCents)}
        />
        <Scope label="Testtagatis arvestatud" value={euro(contract.depositCreditCents)} />
        <Scope
          label={
            contract.status === 'CANCELLED'
              ? 'Varasem teenuse jääk'
              : 'Otse teenusepakkujale tasuda'
          }
          value={euro(contract.balanceCents)}
        />
      </div>
      <p className="contract-fee-summary">
        TESTARVESTUS · Teenusepakkuja teenustasu{' '}
        <strong>{euro(contract.finalSnapshot.serviceFeeCents ?? estimatedAmounts.fee)}</strong> ·
        Teenusepakkujale tagatisest{' '}
        <strong>
          {euro(contract.finalSnapshot.supplierPayoutCents ?? estimatedAmounts.payout)}
        </strong>
        . Ühistule lisatasu ei lisandu.
      </p>
      <p className="contract-invoice">
        <Euro size={16} />
        {contract.status === 'CANCELLED'
          ? 'Leping on tühistatud. Varasem hinnaarvestus säilib ajaloona.'
          : 'Ülejäänud teenuse tasu arveldatakse väljaspool seda pilooti otse teenusepakkujaga.'}
      </p>
      <div className="contract-actions">
        <a href={`#procurement/${contract.procurementId}`} className="text-link">
          Vaata hanget
          <ArrowRight size={16} />
        </a>
        {canComplete && !contract.completedAt && contract.status !== 'CANCELLED' && !completing && (
          <Button variant="secondary" onClick={() => setCompleting(true)}>
            <CheckCircle2 size={17} />
            Lõpeta teenus ja hinda
          </Button>
        )}
        {canComplete &&
          contract.status === 'ACTIVE' &&
          (withdrawing ? (
            <div className="withdrawal-section">
              <p className="withdrawal-warning">
                Loobumisel jääb testtagatis alles. Sinu leping tühistatakse ja teiste ühistute hind
                säilib.
              </p>
              <div className="button-row">
                <Button variant="secondary" onClick={() => setWithdrawing(false)}>
                  Jätka osalemist
                </Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    run(
                      () => api('/commitments/' + contract.commitmentId + '/withdraw', {}),
                      'Loobumine on salvestatud. Lepingu ajalugu säilib.',
                      () => setWithdrawing(false),
                    )
                  }
                >
                  Kinnita loobumine
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setWithdrawing(true)}>
              Loobu hankest
            </Button>
          ))}
        {contract.rating !== null && (
          <div className="rating-display" aria-label={`Hinnang ${contract.rating} viiest`}>
            {Array.from({ length: 5 }, (_, index) => (
              <Star
                key={index}
                size={17}
                fill={index < (contract.rating || 0) ? 'currentColor' : 'none'}
              />
            ))}
            <span>{date(contract.completedAt)}</span>
          </div>
        )}
      </div>
      {contract.comment && <p className="rating-comment">{contract.comment}</p>}
      {completing && (
        <form className="completion-form" onSubmit={submit}>
          <Field label="Hinnang teenusele">
            <select value={rating} onChange={(event) => setRating(Number(event.target.value))}>
              {[5, 4, 3, 2, 1].map((value) => (
                <option key={value} value={value}>
                  {value} / 5{value === 5 ? ' — Väga hea' : value === 1 ? ' — Nõrk' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kommentaar">
            <textarea name="comment" rows={3} maxLength={2000} placeholder="Kuidas teenus sujus?" />
          </Field>
          <div className="button-row">
            <Button type="button" variant="secondary" onClick={() => setCompleting(false)}>
              Loobu
            </Button>
            <Button>
              Salvesta hinnang
              <Check size={16} />
            </Button>
          </div>
        </form>
      )}
      <details className="snapshot">
        <summary>Lepingu lõplik tingimuste koopia</summary>
        <AgreementHistory snapshot={contract.finalSnapshot} />
      </details>
    </section>
  );
}

function Organizations({ session, revision }: { session: SessionResponse; revision: number }) {
  const { data, loading, error } = useLoad(
    () => api<{ organizations: Organization[] }>('/organizations'),
    [revision],
  );
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [search, setSearch] = useState('');
  const { run } = useOperations();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () =>
        api('/organizations', {
          registryCode: String(form.get('registryCode')),
          name: String(form.get('name')),
          orgType: String(form.get('orgType')),
          address: String(form.get('address')),
          latitude: parseDecimal(String(form.get('latitude') || '')),
          longitude: parseDecimal(String(form.get('longitude') || '')),
          email: String(form.get('email') || ''),
        }),
      'Organisatsioon on lisatud. Esindusõigus ootab administraatori kinnitust.',
      () => setMode('existing'),
    );
  };
  const matches = (data?.organizations || []).filter((item) =>
    `${item.name} ${item.registryCode} ${item.address}`
      .toLocaleLowerCase('et')
      .includes(search.toLocaleLowerCase('et')),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ÕIGUSED JA ORGANISATSIOONID</span>
          <h1>Minu organisatsioon</h1>
          <p>
            Esinda oma ühistut või teenusepakkujat. Kõik esindusõigused kinnitab administraator.
          </p>
        </div>
      </div>
      <section className="card">
        <SectionHeading title="Sinu liikmesused" />
        {session.memberships.length ? (
          <div className="organization-cards">
            {session.memberships.map((membership) => (
              <div key={membership.id} className="organization-card">
                <div className="organization-card-head">
                  <span className="list-icon">
                    <Building2 size={21} />
                  </span>
                  <Status status={membership.status} />
                </div>
                <h3>{membership.organization.name}</h3>
                <p>{membership.organization.address}</p>
                <dl>
                  <div>
                    <dt>Registrikood</dt>
                    <dd>{membership.organization.registryCode}</dd>
                  </div>
                  <div>
                    <dt>Tüüp</dt>
                    <dd>
                      {membership.organization.orgType === 'BUYER'
                        ? 'Korteriühistu'
                        : 'Teenusepakkuja'}
                    </dd>
                  </div>
                  <div>
                    <dt>Roll</dt>
                    <dd>{membership.role === 'representative' ? 'Esindaja' : 'Vaatleja'}</dd>
                  </div>
                  <div>
                    <dt>Koordinaadid</dt>
                    <dd>
                      {coordinate(membership.organization.latitude)};{' '}
                      {coordinate(membership.organization.longitude)}
                    </dd>
                  </div>
                  {membership.organization.email && (
                    <div>
                      <dt>Kontakt</dt>
                      <dd>{membership.organization.email}</dd>
                    </div>
                  )}
                </dl>
                {membership.status === 'approved' && membership.role === 'representative' && (
                  <OrganizationEditor organization={membership.organization} />
                )}
                {membership.organization.isDemo && (
                  <span className="demo-pill">DEMOORGANISATSIOON</span>
                )}
                {membership.status === 'pending' && (
                  <p className="pending-note">
                    Taotlus on läbivaatamisel. Kinnituseni saad hankeid vaadata.
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Sul pole veel organisatsiooni">
            Leia olemasolev organisatsioon või lisa enda oma.
          </Empty>
        )}
      </section>
      <section className="card form-card">
        <SectionHeading title="Taotle esindusõigust" />
        <div
          className="filter-tabs form-tabs"
          role="group"
          aria-label="Organisatsiooni lisamise viis"
        >
          <button
            aria-pressed={mode === 'existing'}
            className={mode === 'existing' ? 'selected' : ''}
            onClick={() => setMode('existing')}
          >
            Olemasolev organisatsioon
          </button>
          <button
            aria-pressed={mode === 'new'}
            className={mode === 'new' ? 'selected' : ''}
            onClick={() => setMode('new')}
          >
            Lisa uus organisatsioon
          </button>
        </div>
        {mode === 'existing' ? (
          <>
            <label className="search-input organization-search">
              <Search size={18} />
              <input
                placeholder="Otsi nime, aadressi või registrikoodi järgi"
                aria-label="Otsi organisatsiooni"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <LoadState loading={loading} error={error}>
              <div className="simple-list">
                {matches.length ? (
                  matches.map((organization) => {
                    const own = session.memberships.find(
                      (item) => item.organizationId === organization.id,
                    );
                    return (
                      <div key={organization.id} className="simple-row">
                        <span className="list-icon">
                          <Building2 size={18} />
                        </span>
                        <div>
                          <strong>{organization.name}</strong>
                          <small>
                            {organization.address} · {organization.registryCode}
                          </small>
                        </div>
                        {own ? (
                          <Status status={own.status} />
                        ) : (
                          <Button
                            variant="secondary"
                            onClick={() =>
                              run(
                                () => api(`/organizations/${organization.id}/membership`, {}),
                                'Esindusõiguse taotlus on saadetud administraatorile.',
                              )
                            }
                          >
                            Taotle esindusõigust
                          </Button>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <Empty title="Organisatsiooni ei leitud">
                    Lisa uus organisatsioon, kui sinu oma nimekirjas puudub.
                  </Empty>
                )}
              </div>
            </LoadState>
          </>
        ) : (
          <form onSubmit={submit}>
            <div className="field-grid">
              <Field label="Organisatsiooni nimi">
                <input name="name" minLength={3} maxLength={200} required />
              </Field>
              <Field label="Registrikood">
                <input
                  name="registryCode"
                  inputMode="numeric"
                  pattern="[0-9]{8}"
                  maxLength={8}
                  placeholder="8 numbrit"
                  required
                />
              </Field>
              <Field label="Organisatsiooni tüüp">
                <select name="orgType">
                  <option value="BUYER">Korteriühistu</option>
                  <option value="SUPPLIER">Teenusepakkuja</option>
                </select>
              </Field>
              <Field
                label="Kontakti e-post"
                hint="Nähtav sinu organisatsiooni liikmetele ja administraatorile."
              >
                <input name="email" type="email" />
              </Field>
              <Field label="Aadress" className="field-span">
                <input name="address" minLength={3} required />
              </Field>
              <Field label="Laiuskraad (WGS84)">
                <RegionalNumberInput
                  name="latitude"
                  step="0.000001"
                  decimalPlaces={6}
                  min={-90}
                  max={90}
                  defaultValue={59.405}
                  required
                />
              </Field>
              <Field label="Pikkuskraad (WGS84)">
                <RegionalNumberInput
                  name="longitude"
                  step="0.000001"
                  decimalPlaces={6}
                  min={-180}
                  max={180}
                  defaultValue={24.69}
                  required
                />
              </Field>
            </div>
            <div className="info-banner">
              <MapPin size={18} />
              <span>
                Koordinaadid määravad naabruskonna hangete sobivuse. Need tuleb sisestada täpselt
                sinu organisatsiooni aadressi kohta.
              </span>
            </div>
            <div className="form-actions">
              <Button>
                <Plus size={17} />
                Lisa organisatsioon
              </Button>
            </div>
          </form>
        )}
      </section>
    </>
  );
}

function OrganizationEditor({ organization }: { organization: Organization }) {
  const [editing, setEditing] = useState(false);
  const { run } = useOperations();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(
      () =>
        api(
          '/organizations/' + organization.id,
          {
            name: String(form.get('name')),
            address: String(form.get('address')),
            latitude: parseDecimal(String(form.get('latitude') || '')),
            longitude: parseDecimal(String(form.get('longitude') || '')),
            email: String(form.get('email') || ''),
          },
          'PUT',
        ),
      'Organisatsiooni profiil on uuendatud.',
      () => setEditing(false),
    );
  };
  if (!editing)
    return (
      <Button variant="secondary" onClick={() => setEditing(true)}>
        Muuda profiili
      </Button>
    );
  return (
    <form className="profile-editor" onSubmit={submit}>
      <div className="field-grid">
        <Field label="Organisatsiooni nimi">
          <input name="name" defaultValue={organization.name} maxLength={500} required />
        </Field>
        <Field label="Kontakti e-post">
          <input name="email" type="email" defaultValue={organization.email || ''} />
        </Field>
        <Field label="Aadress" className="field-span">
          <input name="address" defaultValue={organization.address} maxLength={500} required />
        </Field>
        <Field label="Laiuskraad (WGS84)">
          <RegionalNumberInput
            name="latitude"
            step="0.000001"
            decimalPlaces={6}
            min={-90}
            max={90}
            defaultValue={organization.latitude}
            required
          />
        </Field>
        <Field label="Pikkuskraad (WGS84)">
          <RegionalNumberInput
            name="longitude"
            step="0.000001"
            decimalPlaces={6}
            min={-180}
            max={180}
            defaultValue={organization.longitude}
            required
          />
        </Field>
      </div>
      <p className="muted">
        Uus aadress ja koordinaadid mõjutavad tulevasi hankeid. Varasemad kokkulepped säilivad.
      </p>
      <div className="form-actions">
        <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
          Loobu
        </Button>
        <Button>Salvesta profiil</Button>
      </div>
    </form>
  );
}

function Administration({ revision }: { revision: number }) {
  const { data, loading, error } = useLoad(() => api<AdminResponse>('/admin'), [revision]);
  const [tab, setTab] = useState('memberships');
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportPreview>();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const { run } = useOperations();
  const pending = data?.memberships.filter((item) => item.status === 'pending') || [];
  const cancel = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cancelling) return;
    const form = new FormData(event.currentTarget);
    run(
      () => api(`/admin/procurements/${cancelling}/cancel`, { reason: String(form.get('reason')) }),
      'Hange on tühistatud. Testtagatised tagastatakse ja väljamaksed pööratakse tagasi.',
      () => setCancelling(null),
    );
  };
  const updateCsv = (value: string) => {
    setCsv(value);
    setPreview(undefined);
  };
  const readFile = async (file?: File) => {
    if (file) updateCsv(await file.text());
  };
  const exportTemplate = () => {
    const template =
      'registryCode,name,orgType,address,latitude,longitude,email\n90000991,Demo ühistu,BUYER,Mustamäe tee 1 Tallinn,59.405,24.690,kontakt@example.test\n';
    const link = document.createElement('a');
    const url = URL.createObjectURL(new Blob([template], { type: 'text/csv;charset=utf-8' }));
    link.href = url;
    link.download = 'organisatsioonid-naidis.csv';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ADMINISTRAATORI TÖÖLAUD</span>
          <h1>Haldus</h1>
          <p>Kinnita esindusõigused, halda organisatsioone ja jälgi püsivat sündmuste ajalugu.</p>
        </div>
        <span className="pill">
          <ShieldCheck size={16} />
          Administraator
        </span>
      </div>
      <div className="detail-tabs admin-tabs" role="group" aria-label="Halduse vaade">
        {[
          ['memberships', `Esindusõigused (${etNumber(pending.length)})`],
          ['import', 'CSV import'],
          ['ledger', 'TEST pearaamat'],
          ['audit', 'Auditilogi'],
          ['jobs', 'Taustatööd'],
          ['procurements', 'Hangete haldus'],
        ].map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? 'active' : ''}
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <LoadState loading={loading} error={error}>
        {data && (
          <>
            {tab === 'memberships' && (
              <section className="card">
                <SectionHeading title="Esindusõiguse taotlused" />
                <div className="simple-list">
                  {data.memberships.length ? (
                    [
                      ...pending,
                      ...data.memberships.filter((item) => item.status !== 'pending'),
                    ].map((membership) => (
                      <div
                        className="simple-row membership-row"
                        data-testid="membership-row"
                        key={membership.id}
                      >
                        <span className="list-icon">
                          <Users size={20} />
                        </span>
                        <div>
                          <strong>{membership.userName || membership.userId}</strong>
                          <small>
                            {membership.userEmail} · {membership.organization.name}
                          </small>
                          <small>
                            {membership.role === 'representative' ? 'Esindaja' : 'Vaatleja'}
                          </small>
                        </div>
                        <Status status={membership.status} />
                        {membership.status === 'pending' && (
                          <div className="button-row">
                            <Button
                              variant="secondary"
                              onClick={() =>
                                run(
                                  () =>
                                    api(`/admin/memberships/${membership.id}`, {
                                      status: 'approved',
                                    }),
                                  'Esindusõigus on kinnitatud.',
                                )
                              }
                            >
                              <Check size={15} />
                              Kinnita
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() =>
                                run(
                                  () =>
                                    api(`/admin/memberships/${membership.id}`, {
                                      status: 'rejected',
                                    }),
                                  'Taotlus on tagasi lükatud.',
                                )
                              }
                            >
                              Lükka tagasi
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <Empty title="Esindusõiguse taotlusi pole" />
                  )}
                </div>
              </section>
            )}
            {tab === 'import' && (
              <section className="card form-card">
                <SectionHeading title="Organisatsioonide CSV import">
                  <Button variant="secondary" onClick={exportTemplate}>
                    <Download size={16} />
                    Laadi näidis alla
                  </Button>
                </SectionHeading>
                <p className="muted">
                  Registrikood tuvastab organisatsiooni. Kogu fail valideeritakse enne kinnitamist
                  ja rakendatakse ühe tehinguna. Kontaktid on piiratud nähtavusega.
                </p>
                <div className="csv-schema">
                  <code>registryCode,name,orgType,address,latitude,longitude,email</code>
                  <span>
                    orgType: BUYER või SUPPLIER · WGS84 koordinaadid · email on valikuline.
                  </span>
                </div>
                <Field label="Vali CSV fail">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => {
                      void readFile(event.target.files?.[0]).catch((reason: Error) =>
                        run(() => Promise.reject(reason)),
                      );
                    }}
                  />
                </Field>
                <Field label="CSV sisu">
                  <textarea
                    rows={8}
                    className="code-input"
                    value={csv}
                    onChange={(event) => updateCsv(event.target.value)}
                    placeholder="Kleebi CSV sisu või vali fail…"
                  />
                </Field>
                <div className="button-row">
                  <Button
                    variant="secondary"
                    disabled={!csv.trim()}
                    onClick={() =>
                      run(
                        () => api<ImportPreview>('/admin/import/preview', { csv }),
                        undefined,
                        setPreview,
                      )
                    }
                  >
                    <Search size={16} />
                    Kontrolli ja eelvaata
                  </Button>
                  <Button
                    disabled={!preview || preview.errors.length > 0 || preview.rows.length === 0}
                    onClick={() =>
                      run(
                        () => api('/admin/import', { csv }),
                        'Organisatsioonid on edukalt imporditud.',
                        () => {
                          setCsv('');
                          setPreview(undefined);
                        },
                      )
                    }
                  >
                    <Check size={17} />
                    Kinnita import
                  </Button>
                </div>
                {preview && (
                  <div className="import-preview">
                    <h3>Eelvaade: {etNumber(preview.rows.length)} organisatsiooni</h3>
                    {preview.errors.length > 0 ? (
                      <div role="alert" className="validation-errors">
                        <strong>Import on peatatud. Paranda kõik vead:</strong>
                        <ul>
                          {preview.errors.map((item, index) => (
                            <li key={index}>
                              Rida {item.row}: {item.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="success-banner">
                        <CheckCircle2 size={19} />
                        <span>
                          Kogu fail on valideeritud. Kinnita import muudatuste salvestamiseks.
                        </span>
                      </div>
                    )}
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Registrikood</th>
                            <th>Organisatsioon</th>
                            <th>Tüüp</th>
                            <th>Aadress</th>
                            <th>Koordinaadid</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.rows.map((row) => (
                            <tr key={row.registryCode}>
                              <td>{row.registryCode}</td>
                              <td>{row.name}</td>
                              <td>{row.orgType === 'BUYER' ? 'Ühistu' : 'Pakkuja'}</td>
                              <td>{row.address}</td>
                              <td>
                                {coordinate(row.latitude)}; {coordinate(row.longitude)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            )}
            {tab === 'ledger' && (
              <section className="card">
                <SectionHeading title="TEST pearaamat" />
                <TestNotice />
                <p className="muted">
                  Kirjed on lisatavad ja säilivad muutmata. Vastupidised kanded kajastavad tagastusi
                  ning väljamaksete ja tasude tühistamist.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Aeg</th>
                        <th>Toiming</th>
                        <th>Summa</th>
                        <th>Hange</th>
                        <th>Sündmuse võti</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ledger.map((entry) => (
                        <tr key={entry.id}>
                          <td>{date(entry.createdAt, true)}</td>
                          <td>
                            <span className="test-chip">TEST</span>
                            {entry.kind}
                          </td>
                          <td className="money-cell">{euro(entry.amountCents)}</td>
                          <td>
                            <a href={`#procurement/${entry.procurementId}`}>
                              {data.procurements.find((item) => item.id === entry.procurementId)
                                ?.title || entry.procurementId.slice(0, 8)}
                            </a>
                          </td>
                          <td>
                            <code className="event-key">{entry.eventKey}</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.ledger.length === 0 && <Empty title="Testtehinguid veel pole" />}
                </div>
              </section>
            )}
            {tab === 'audit' && (
              <section className="card">
                <SectionHeading title="Muutmatu auditilogi" />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Aeg</th>
                        <th>Toiming</th>
                        <th>Kasutaja</th>
                        <th>Andmed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.audit.map((entry) => (
                        <tr key={entry.id}>
                          <td>{date(entry.createdAt, true)}</td>
                          <td>
                            <strong>{entry.action}</strong>
                          </td>
                          <td>
                            <code>{entry.actorUserId?.slice(0, 8) || 'Süsteem'}</code>
                          </td>
                          <td>
                            <details>
                              <summary>Vaata andmeid</summary>
                              <pre className="audit-json">
                                {JSON.stringify(entry.details, null, 2)}
                              </pre>
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.audit.length === 0 && <Empty title="Auditikirjeid veel pole" />}
                </div>
              </section>
            )}
            {tab === 'jobs' && (
              <section className="card">
                <SectionHeading title="Püsivad taustatööd" />
                <p className="muted">
                  Tähtaegade töötlemine jätkub ka rakenduse taaskäivitamisel. Ebaõnnestunud töid
                  saab pärast vea lahendamist uuesti käivitada.
                </p>
                <div className="simple-list">
                  {data.jobs.length ? (
                    data.jobs.map((job) => (
                      <div className="simple-row job-row" data-testid="job-row" key={job.id}>
                        <span className="list-icon">
                          <Clock3 size={20} />
                        </span>
                        <div>
                          <strong>
                            {data.procurements.find((item) => item.id === job.procurementId)
                              ?.title || job.kind}
                          </strong>
                          <small>
                            {date(job.dueAt, true)} · {etNumber(job.attempts)} katset
                          </small>
                          {job.lastError && <small className="job-error">{job.lastError}</small>}
                        </div>
                        <Status status={job.status} />
                        {job.status === 'FAILED' && (
                          <Button
                            variant="secondary"
                            onClick={() =>
                              run(
                                () => api(`/admin/jobs/${job.id}/retry`, {}),
                                'Taustatöö on uuesti järjekorda pandud.',
                              )
                            }
                          >
                            Proovi uuesti
                          </Button>
                        )}
                      </div>
                    ))
                  ) : (
                    <Empty title="Taustatöid veel pole" />
                  )}
                </div>
              </section>
            )}
            {tab === 'procurements' && (
              <section className="card">
                <SectionHeading title="Hangete haldus ja tühistamine" />
                <p className="muted">
                  Teenusepakkuja tühistamist vahendab administraator. Tühistamine tagastab kõik
                  testtagatised ja pöörab tagasi varasemad testväljamaksed ning teenustasud.
                </p>
                <div className="simple-list">
                  {data.procurements.map((procurement) => (
                    <div
                      className="admin-procurement"
                      data-testid="admin-procurement"
                      key={procurement.id}
                    >
                      <div className="simple-row">
                        <span className="list-icon">
                          <Snowflake size={20} />
                        </span>
                        <div>
                          <strong>
                            <a href={`#procurement/${procurement.id}`}>{procurement.title}</a>
                          </strong>
                          <small>
                            {procurement.organizationName} ·{' '}
                            {date(procurement.joinDeadlineAt, true)}
                          </small>
                        </div>
                        <Status status={procurement.status} />
                        {!['CANCELLED', 'FAILED'].includes(procurement.status) && (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setCancelling(cancelling === procurement.id ? null : procurement.id)
                            }
                          >
                            Tühista hange
                          </Button>
                        )}
                      </div>
                      {cancelling === procurement.id && (
                        <form className="cancel-form" onSubmit={cancel}>
                          <Field label="Tühistamise põhjus">
                            <textarea name="reason" minLength={3} rows={3} required />
                          </Field>
                          <p className="withdrawal-warning">
                            Kõik selle hanke testtagatised tagastatakse. Varasemad sündmused ja
                            õnnestumise ajalugu säilivad.
                          </p>
                          <div className="button-row">
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => setCancelling(null)}
                            >
                              Loobu
                            </Button>
                            <Button variant="danger">Kinnita tühistamine</Button>
                          </div>
                        </form>
                      )}
                    </div>
                  ))}
                  {data.procurements.length === 0 && <Empty title="Hankeid veel pole" />}
                </div>
              </section>
            )}
          </>
        )}
      </LoadState>
    </>
  );
}
