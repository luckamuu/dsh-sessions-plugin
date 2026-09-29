/**
 * Browser half of the "archived sessions" plugin.
 *
 * Adds a sidebar panel that lists the archived sessions the Host reports and
 * offers one action per row: delete that session from disk for good. The panel
 * reaches the Host half through the Typert Remote gateway, mounting its own
 * Remote descriptor contribution because this plugin ships no generated
 * reflection.
 */
window.__ModuleLoader__.load({
  id: '@local/archived-sessions',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace and the panel id shared by the sidebar entry and the page. */
    const NS = 'archived-sessions';
    const PANEL_ID = 'archived-sessions';

    const zh = {
      panel: '已归档会话',
      title: '已归档会话',
      subtitle: '这些会话已归档。删除会同时移除硬盘上的会话记录，无法恢复。',
      home: '读取目录：{home}',
      refresh: '刷新',
      loading: '正在读取…',
      empty: '没有已归档的会话。',
      unknownTitle: '未命名会话',
      delete: '彻底删除',
      confirm: '确认删除',
      cancel: '取消',
      confirmHint: '会从硬盘删除会话文件，且无法恢复。',
      deleted: '已删除 {id}',
      failed: '操作失败：{message}',
      sessionsCount: '共 {count} 个会话',
      missing: '文件已不在',
    };

    const en = {
      panel: 'Archived sessions',
      title: 'Archived sessions',
      subtitle: 'These sessions are archived. Deleting one also removes its record from disk; this cannot be undone.',
      home: 'Reading {home}',
      refresh: 'Refresh',
      loading: 'Loading…',
      empty: 'No archived sessions.',
      unknownTitle: 'Untitled session',
      delete: 'Delete permanently',
      confirm: 'Delete',
      cancel: 'Cancel',
      confirmHint: 'Deletes the session files from disk. This cannot be undone.',
      deleted: 'Deleted {id}',
      failed: 'Failed: {message}',
      sessionsCount: '{count} session(s)',
      missing: 'Files missing',
    };

    /**
     * Remote descriptors for the Host service. The gateway's source-mode
     * discovery resolves the Host side from this service's own markers, while
     * these descriptors give the browser the namespace and wire arguments.
     * No strict reflection is generated for a plain-JavaScript plugin, so the
     * input codec only has to be declared strict; arguments travel as JSON.
     */
    const TYPERT_REMOTE = {
      package: '@local/archived-sessions',
      descriptors: [
        {
          id: '@local/archived-sessions#archivedSessions/list',
          service: 'archivedSessions',
          namespace: 'archivedSessions',
          method: 'list',
          invocation: { kind: 'direct' },
          parameters: [],
          result: { mode: 'src-json' },
        },
        {
          id: '@local/archived-sessions#archivedSessions/deleteSession',
          service: 'archivedSessions',
          namespace: 'archivedSessions',
          method: 'deleteSession',
          invocation: { kind: 'direct' },
          parameters: [
            {
              name: 'sessionId',
              wire: 'sessionId',
              source: 'json',
              codec: {
                mode: 'strict',
                typeSymbol: '@local/archived-sessions#SessionId',
                create: () => ({ parse: (value) => value }),
              },
            },
          ],
          result: { mode: 'src-json' },
        },
      ],
    };

    /** Byte count in the units a management list usually shows. */
    function formatBytes(bytes) {
      if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      let value = bytes;
      let unit = 0;
      while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
      }
      return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, '')} ${units[unit]}`;
    }

    /** Local timestamp, or an em dash when the Host has none. */
    function formatTime(value) {
      if (!Number.isFinite(value) || value <= 0) return '—';
      try {
        return new Date(value).toLocaleString();
      } catch {
        return '—';
      }
    }

    /** Unwrap a Remote result, turning the failure branch into a thrown Error. */
    function unwrap(result) {
      if (result !== null && typeof result === 'object' && 'ok' in result) {
        if (result.ok) return result.value;
        const failure = result.error ?? {};
        const error = new Error(failure.message ?? String(failure.code ?? 'Remote call failed'));
        error.code = failure.code;
        throw error;
      }
      return result;
    }

    const styles = {
      page: {
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        boxSizing: 'border-box',
        padding: '24px 24px 0',
        gap: '16px',
        color: 'var(--dsw-alias-label-primary)',
        background: 'var(--dsw-alias-bg-base)',
      },
      header: { display: 'flex', alignItems: 'flex-start', gap: '12px' },
      heading: { flex: '1 1 auto', minWidth: 0 },
      title: { margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' },
      subtitle: { margin: '6px 0 0', fontSize: '13px', lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary)' },
      homeCaption: {
        margin: '6px 0 0',
        fontSize: '12px',
        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
        color: 'var(--dsw-alias-label-tertiary)',
        overflowWrap: 'anywhere',
      },
      button: {
        appearance: 'none',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: '6px',
        padding: '5px 12px',
        fontSize: '13px',
        fontFamily: 'inherit',
        cursor: 'pointer',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
      },
      dangerButton: {
        appearance: 'none',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: '6px',
        padding: '5px 12px',
        fontSize: '13px',
        fontFamily: 'inherit',
        cursor: 'pointer',
        background: 'transparent',
        color: 'var(--dsw-alias-state-error-primary)',
      },
      confirmButton: {
        appearance: 'none',
        border: '1px solid transparent',
        borderRadius: '6px',
        padding: '5px 12px',
        fontSize: '13px',
        fontFamily: 'inherit',
        cursor: 'pointer',
        background: 'var(--dsw-alias-state-error-primary)',
        color: 'var(--dsw-alias-label-primary-inverted)',
      },
      list: {
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: '8px',
        background: 'var(--dsw-alias-bg-layer-1)',
        marginBottom: '24px',
      },
      row: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      rowMain: { flex: '1 1 auto', minWidth: 0 },
      rowTitle: {
        fontSize: '14px',
        color: 'var(--dsw-alias-label-primary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      rowMeta: {
        marginTop: '4px',
        fontSize: '12px',
        color: 'var(--dsw-alias-label-tertiary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      notice: {
        padding: '10px 12px',
        borderRadius: '6px',
        fontSize: '13px',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-secondary)',
      },
      errorNotice: {
        padding: '10px 12px',
        borderRadius: '6px',
        fontSize: '13px',
        background: 'var(--dsw-alias-interactive-bg-hover-danger)',
        color: 'var(--dsw-alias-state-error-primary)',
      },
      confirmBar: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flex: '0 0 auto',
      },
      confirmText: { fontSize: '12px', color: 'var(--dsw-alias-state-error-primary)' },
    };

    /**
     * Build the archived-session management page for one plugin activation,
     * closing over that activation's Remote accessor and locale so the
     * component needs no injected payload of its own.
     * @param api - accessor resolving the mounted Remote namespace service.
     * @param translate - locale-bound translator used when the slot supplies none.
     * @returns the page component registered into the `main` slot.
     */
    function createArchivedSessionsPage(api, translate) {
      return function ArchivedSessionsPage(props) {
      const t = (props && props.t) || translate;
      const [state, setState] = React.useState({ status: 'loading', sessions: [], error: null });
      const [busyId, setBusyId] = React.useState(null);
      const [confirmId, setConfirmId] = React.useState(null);
      const [notice, setNotice] = React.useState(null);
      const [home, setHome] = React.useState(null);

      const load = React.useCallback(() => {
        let alive = true;
        setState((current) => ({ ...current, status: 'loading', error: null }));
        api()
          .then((service) => service.list())
          .then((value) => unwrap(value))
          .then((value) => {
            if (!alive) return;
            setState({ status: 'ready', sessions: value?.sessions ?? [], error: null });
            setHome(typeof value?.home === 'string' ? value.home : null);
          })
          .catch((error) => {
            if (!alive) return;
            setState({ status: 'ready', sessions: [], error: error?.message ?? String(error) });
          });
        return () => {
          alive = false;
        };
      }, [api]);

      React.useEffect(load, [load]);

      const remove = (sessionId) => {
        setBusyId(sessionId);
        setNotice(null);
        api()
          .then((service) => service.deleteSession(sessionId))
          .then((value) => unwrap(value))
          .then(() => {
            setNotice({ kind: 'ok', text: t('deleted', { id: sessionId }) });
            setConfirmId(null);
            load();
          })
          .catch((error) => {
            setNotice({ kind: 'error', text: t('failed', { message: error?.message ?? String(error) }) });
          })
          .finally(() => {
            setBusyId(null);
          });
      };

      const rows = state.sessions.map((session) => {
        const title = session.title ?? t('unknownTitle');
        const meta = [
          formatTime(session.lastPromptAt ?? session.modifiedAt ?? session.createdAt),
          session.cwd ?? null,
          session.onDisk ? formatBytes(session.bytes) : t('missing'),
        ].filter((part) => part !== null && part !== undefined && part !== '');

        const confirming = confirmId === session.sessionId;
        const busy = busyId === session.sessionId;
        return h(
          'div',
          { key: session.sessionId, style: styles.row },
          h(
            'div',
            { style: styles.rowMain },
            h('div', { style: styles.rowTitle, title }, title),
            h('div', { style: styles.rowMeta, title: meta.join(' · ') }, meta.join(' · ')),
          ),
          confirming
            ? h(
                'div',
                { style: styles.confirmBar },
                h('span', { style: styles.confirmText }, t('confirmHint')),
                h(
                  'button',
                  {
                    type: 'button',
                    style: styles.confirmButton,
                    disabled: busy,
                    onClick: () => remove(session.sessionId),
                  },
                  busy ? t('loading') : t('confirm'),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    style: styles.button,
                    disabled: busy,
                    onClick: () => setConfirmId(null),
                  },
                  t('cancel'),
                ),
              )
            : h(
                'button',
                {
                  type: 'button',
                  style: styles.dangerButton,
                  disabled: busy,
                  onClick: () => {
                    setNotice(null);
                    setConfirmId(session.sessionId);
                  },
                },
                t('delete'),
              ),
        );
      });

      return h(
        'div',
        { style: styles.page },
        h(
          'div',
          { style: styles.header },
          h(
            'div',
            { style: styles.heading },
            h('h2', { style: styles.title }, t('title')),
            h('p', { style: styles.subtitle }, t('subtitle')),
            home === null ? null : h('p', { style: styles.homeCaption }, t('home', { home })),
          ),
          h(
            'button',
            { type: 'button', style: styles.button, onClick: () => load(), disabled: state.status === 'loading' },
            t('refresh'),
          ),
        ),
        notice === null
          ? null
          : h('div', { style: notice.kind === 'ok' ? styles.notice : styles.errorNotice }, notice.text),
        state.error === null
          ? null
          : h('div', { style: styles.errorNotice }, t('failed', { message: state.error })),
        state.status === 'loading' && state.sessions.length === 0
          ? h('div', { style: styles.notice }, t('loading'))
          : state.sessions.length === 0
            ? h('div', { style: styles.notice }, t('empty'))
            : h(
                'div',
                { style: styles.list },
                h(
                  'div',
                  { style: { ...styles.row, borderBottom: '1px solid var(--dsw-alias-border-l2)' } },
                  h('div', { style: { ...styles.rowMeta, marginTop: 0 } }, t('sessionsCount', { count: state.sessions.length })),
                ),
                rows,
              ),
      );
      };
    }

    /** Sidebar entry glyph for the archived-session panel. */
    function ArchivedSessionsIcon(props) {
      const size = (props && props.size) || 20;
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('rect', { x: 3, y: 4, width: 18, height: 4, rx: 1.2 }),
        h('path', { d: 'M5 8h14v10.5A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5Z' }),
        h('path', { d: 'M10 12h4' }),
      );
    }

    const inject = ['slots', 'locale', 'remote'];

    /**
     * Register the panel, its sidebar entry, and the Remote contribution.
     * @param ctx - browser plugin context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'archived-sessions: dictionaries');
      const t = ctx.locale.bind(NS);

      /*
       * Mount the Remote contribution exactly once per activation and keep the
       * unmount with this activation's effect. The gateway refuses a second
       * mount of the same endpoint ("already mounted"), so the page awaits this
       * one promise instead of mounting its own.
       */
      let mounting = null;
      const mount = () => (mounting ??= ctx.remote.$mount(TYPERT_REMOTE));
      const api = () => ctx.remote.$mount(TYPERT_REMOTE).then(() => ctx.get('remote.archivedSessions'));

      ctx.effect(() => {
        let unmount;
        let cancelled = false;
        mount().then(
          (dispose) => {
            if (cancelled) dispose();
            else unmount = dispose;
          },
          (error) => {
            ctx.logger?.error?.('archived-sessions: mounting the Remote contribution failed', error);
          },
        );
        return () => {
          cancelled = true;
          unmount?.();
          mounting = null;
        };
      }, 'archived-sessions: remote namespace');

      ctx.slots.inject('main', () =>
        ctx.slots.register(
          {
            name: 'main',
            key: PANEL_ID,
            locale: NS,
          },
          createArchivedSessionsPage(api, t),
        ));

      ctx.slots.inject('sidebar.panellist', () =>
        ctx.slots.register(
          {
            name: 'sidebar.panellist',
            id: PANEL_ID,
            order: 20,
            locale: NS,
            label: () => t('panel'),
          },
          ArchivedSessionsIcon,
        ));
    }

    return { apply, inject, NS, PANEL_ID, TYPERT_REMOTE };
  },
});