import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Mail, MailOpen } from 'lucide-react';
import type { MailboxMessage, MailboxResponse, SessionResponse } from '../shared/types';
import { api, date } from './api';

type Run = <T>(
  action: () => Promise<T>,
  message?: string,
  after?: (result: T) => void,
) => Promise<T | undefined>;

export default function Mailbox({
  session,
  revision,
  busy,
  run,
}: {
  session: SessionResponse;
  revision: number;
  busy: boolean;
  run: Run;
}) {
  const [inbox, setInbox] = useState<MailboxResponse>();
  const [selectedId, setSelectedId] = useState<string>();
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selectedId) {
      detailRef.current?.focus({ preventScroll: true });
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedId]);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const result = await api<MailboxResponse>('/mailbox');
        if (alive) {
          setInbox(result);
          setError('');
        }
      } catch (reason) {
        if (alive)
          setError(reason instanceof Error ? reason.message : 'Postkasti laadimine ebaõnnestus.');
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
  }, [revision, session.user?.id]);
  const read = async (message: MailboxMessage) => {
    if (message.readAt) return;
    await run(
      () => api<{ message: MailboxMessage }>('/mailbox/' + message.id + '/read', {}),
      undefined,
      (result) => {
        setInbox((current) =>
          current
            ? {
                ...current,
                unreadCount: Math.max(0, current.unreadCount - 1),
                messages: current.messages.map((item) =>
                  item.id === result.message.id ? result.message : item,
                ),
              }
            : current,
        );
      },
    );
  };
  const selected = inbox?.messages.find((item) => item.id === selectedId);
  const mayRespond =
    selected &&
    (session.user?.isAdmin ||
      session.memberships.some(
        (item) =>
          item.organizationId === selected.organizationId &&
          item.status === 'approved' &&
          item.role === 'representative',
      ));
  const invitation = selected?.invitation;
  const respond = (status: 'ACCEPTED' | 'DECLINED') => {
    if (!invitation) return;
    void run(
      () => api('/invitations/' + invitation.id + '/respond', { status }),
      status === 'ACCEPTED'
        ? 'Kutse on vastu võetud. Liitumine ja testmakse tehakse hankevaates eraldi.'
        : 'Kutse on tagasi lükatud.',
    );
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">KUTSED JA HANKE TEAVITUSED</span>
          <h1>Postkast</h1>
          <p>Rakendusesisesed kirjad sinu organisatsioonidele. E-kirju ei saadeta.</p>
        </div>
        <span className="mailbox-count" role="status">
          {inbox?.unreadCount ?? 0} lugemata
        </span>
      </div>
      {error && (
        <div className="inline-error" role="alert">
          {error} <button onClick={() => window.location.reload()}>Laadi uuesti</button>
        </div>
      )}
      {!inbox && !error && (
        <div className="loading" role="status">
          Laadin postkasti…
        </div>
      )}
      {inbox && !inbox.messages.length && (
        <section className="card empty-state">
          <Mail size={30} />
          <h3>Postkast on tühi</h3>
          <p>
            Siia jõuavad naabrite kutsed ja hanke edenemise teavitused. Organisatsiooni kirjade
            nägemiseks peab liikmesus olema kinnitatud.
          </p>
          <a href="#procurements" className="button button-secondary">
            Vaata hankeid <ArrowRight size={16} />
          </a>
        </section>
      )}
      {inbox && inbox.messages.length > 0 && (
        <div className={'mailbox-layout ' + (selected ? 'has-detail' : '')}>
          <section className="mailbox-list" aria-label="Kirjad">
            {inbox.messages.map((message) => (
              <article
                data-testid="mailbox-message"
                key={message.id}
                className={
                  'card mailbox-message ' +
                  (!message.readAt ? 'unread ' : '') +
                  (selectedId === message.id ? 'selected' : '')
                }
              >
                <div className="mailbox-message-meta">
                  <span>{message.organizationName}</span>
                  <time dateTime={message.createdAt}>{date(message.createdAt, true)}</time>
                </div>
                <h2>
                  {!message.readAt ? <Mail size={19} /> : <MailOpen size={19} />} {message.subject}
                </h2>
                <p>{message.body}</p>
                <div className="mailbox-message-actions">
                  <button
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => {
                      setSelectedId(message.id);
                      void read(message);
                    }}
                  >
                    Ava kiri <ArrowRight size={15} />
                  </button>
                  {!message.readAt ? (
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() => {
                        void read(message);
                      }}
                    >
                      Märgi loetuks
                    </button>
                  ) : (
                    <span className="mailbox-read">
                      <Check size={14} />
                      Loetud
                    </span>
                  )}
                </div>
              </article>
            ))}
          </section>
          {selected && (
            <section
              ref={detailRef}
              tabIndex={-1}
              className="card mailbox-detail"
              data-testid="mailbox-detail"
              aria-label="Avatud kiri"
            >
              <button className="text-link" onClick={() => setSelectedId(undefined)}>
                Sulge kiri
              </button>
              <span className="eyebrow">RAKENDUSESISENE KIRI</span>
              <h2>{selected.subject}</h2>
              <dl className="mailbox-envelope">
                <div>
                  <dt>Saaja</dt>
                  <dd>{selected.organizationName}</dd>
                </div>
                <div>
                  <dt>Saabunud</dt>
                  <dd>{date(selected.createdAt, true)}</dd>
                </div>
                <div>
                  <dt>Hange</dt>
                  <dd>{selected.procurementTitle}</dd>
                </div>
              </dl>
              <p className="preserve-lines">{selected.body}</p>
              {invitation && (
                <div className="mailbox-invitation">
                  <strong>
                    Kutse:{' '}
                    {invitation.status === 'PENDING'
                      ? 'vastus ootel'
                      : invitation.status === 'ACCEPTED'
                        ? 'vastu võetud'
                        : 'tagasi lükatud'}
                  </strong>
                  {invitation.distanceM !== null && (
                    <p>Kaugus algatajast: {Math.round(invitation.distanceM)} m.</p>
                  )}
                  {invitation.status === 'PENDING' && mayRespond && (
                    <div className="mailbox-message-actions">
                      <button
                        disabled={busy}
                        className="button button-primary"
                        onClick={() => respond('ACCEPTED')}
                      >
                        Võta kutse vastu
                      </button>
                      <button
                        disabled={busy}
                        className="button button-secondary"
                        onClick={() => respond('DECLINED')}
                      >
                        Lükka tagasi
                      </button>
                    </div>
                  )}
                  {!mayRespond && (
                    <p>
                      Vaatleja saab kirja lugeda. Kutsele vastamiseks on vajalik kinnitatud
                      esindusõigus.
                    </p>
                  )}
                  <p>
                    Kutse vastuvõtmine ei liida ühistut hankega. Kinnita tingimused ja tee TEST
                    tagatisraha makse hankevaates.
                  </p>
                </div>
              )}
              <div className="mailbox-detail-links">
                <a
                  href={'#procurement/' + selected.procurementId}
                  className="button button-primary"
                >
                  Vaata hanget <ArrowRight size={16} />
                </a>
                {selected.kind === 'PROCUREMENT_FINALIZED' && (
                  <a href="#contracts" className="button button-secondary">
                    Vaata lepinguid
                  </a>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </>
  );
}
