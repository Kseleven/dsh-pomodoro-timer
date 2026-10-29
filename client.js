window.__ModuleLoader__.load({
  id: 'dsh-pomodoro-card',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useState, useEffect, useRef } = React;

    /* ------------------------------------------------------------------ */
    /* Constants                                                           */
    /* ------------------------------------------------------------------ */

    const NS = 'pomodoro-timer';
    const STORAGE_KEY = 'dsh:pomodoro:timer:v1';
    const PHASES = ['focus', 'short', 'long'];
    const TICK_MS = 250;

    const DEFAULT_SETTINGS = Object.freeze({
      focus: 25,
      short: 5,
      long: 15,
      longEvery: 4,
      autoStart: true,
      sound: true,
      notify: false,
    });

    const LIMITS = {
      focus: [1, 120],
      short: [1, 60],
      long: [1, 120],
      longEvery: [1, 8],
    };

    const ACCENT = {
      focus: '#e4572e',
      short: '#2f9e6e',
      long: '#3b82f6',
    };

    /* ------------------------------------------------------------------ */
    /* Dictionaries (runtime copy; display metadata lives in locale/*.json) */
    /* ------------------------------------------------------------------ */

    const zh = {
      'phase.focus': '专注',
      'phase.short': '短休息',
      'phase.long': '长休息',
      'action.start': '开始',
      'action.pause': '暂停',
      'action.resume': '继续',
      'action.reset': '重置本阶段',
      'action.skip': '跳过本阶段',
      'action.dismiss': '关闭提醒',
      'action.testNotification': '发一条测试通知',
      'action.settings': '设置',
      'action.closeSettings': '收起设置',
      'action.status': '当前进度',
      'settings.title': '番茄时钟设置',
      'settings.focus': '专注时长',
      'settings.short': '短休息',
      'settings.long': '长休息',
      'settings.longEvery': '长休息间隔',
      'settings.autoStart': '自动开始下一阶段',
      'settings.sound': '完成提示音',
      'settings.notify': '系统通知',
      'settings.notifyDenied': '通知权限已被拒绝，请在浏览器地址栏的站点设置中允许通知。',
      'settings.notifyUnsupported': '当前环境不支持系统通知。',
      'settings.notifyState.unsupported': '当前环境不支持系统通知',
      'settings.notifyState.granted': '系统通知已就绪',
      'settings.notifyState.default': '系统通知尚未授权',
      'settings.notifyState.denied': '系统通知已被拒绝',
      'settings.testSent': '已发送测试通知。若只在通知中心看到，请到「系统设置 → 通知 → DeepSeek Harness」把提醒样式改为「横幅」或「提醒」。',
      'settings.resetDefaults': '恢复默认',
      'settings.today': '今日完成',
      'unit.min': '分',
      'unit.pomodoro': '个',
      'status.current': '当前进度：{phase}，剩余 {time}',
      'alert.focusDone': '专注结束',
      'alert.breakDone': '休息结束',
      'alert.next': '下一步：{phase} {minutes} 分',
      'alert.autoStarted': '已自动开始',
      'alert.waiting': '已暂停，点开始继续',
      'notify.focusTitle': '专注完成',
      'notify.shortBody': '休息一下，喝口水吧。',
      'notify.longBody': '完成一组番茄，去好好休息一会儿。',
      'notify.breakTitle': '休息结束',
      'notify.breakBody': '准备好开始下一个专注了吗？',
      'notify.testTitle': '番茄时钟测试通知',
      'notify.testBody': '看到这条通知，说明系统通知可以正常推送。',
    };

    const en = {
      'phase.focus': 'Focus',
      'phase.short': 'Short break',
      'phase.long': 'Long break',
      'action.start': 'Start',
      'action.pause': 'Pause',
      'action.resume': 'Resume',
      'action.reset': 'Reset phase',
      'action.skip': 'Skip phase',
      'action.dismiss': 'Dismiss reminder',
      'action.testNotification': 'Send a test notification',
      'action.settings': 'Settings',
      'action.closeSettings': 'Hide settings',
      'action.status': 'Current progress',
      'settings.title': 'Pomodoro settings',
      'settings.focus': 'Focus length',
      'settings.short': 'Short break',
      'settings.long': 'Long break',
      'settings.longEvery': 'Long break every',
      'settings.autoStart': 'Auto-start next phase',
      'settings.sound': 'Completion chime',
      'settings.notify': 'System notifications',
      'settings.notifyDenied': 'Notifications are blocked. Allow them in your browser site settings.',
      'settings.notifyUnsupported': 'System notifications are not supported here.',
      'settings.notifyState.unsupported': 'System notifications unsupported',
      'settings.notifyState.granted': 'System notifications ready',
      'settings.notifyState.default': 'Notifications not authorized yet',
      'settings.notifyState.denied': 'Notifications blocked',
      'settings.testSent': 'Test notification sent. If it only shows up in Notification Center, set DeepSeek Harness to Banners or Alerts in System Settings → Notifications.',
      'settings.resetDefaults': 'Reset defaults',
      'settings.today': 'Completed today',
      'unit.min': 'min',
      'unit.pomodoro': 'pom',
      'status.current': 'Current progress: {phase}, {time} remaining',
      'alert.focusDone': 'Focus complete',
      'alert.breakDone': 'Break over',
      'alert.next': 'Next: {phase}, {minutes} min',
      'alert.autoStarted': 'started automatically',
      'alert.waiting': 'paused — press start to go on',
      'notify.focusTitle': 'Focus complete',
      'notify.shortBody': 'Take a short break — stretch and hydrate.',
      'notify.longBody': 'You finished a set — enjoy a longer break.',
      'notify.breakTitle': 'Break over',
      'notify.breakBody': 'Ready to start the next focus session?',
      'notify.testTitle': 'Pomodoro test notification',
      'notify.testBody': 'If you can see this, system notifications reach you.',
    };

    /* ------------------------------------------------------------------ */
    /* Timer store (module singleton, survives remounts and syncs copies)  */
    /* ------------------------------------------------------------------ */

    let translate = (key) => key;
    let state = createInitialState();
    let now = Date.now();
    let ticker = null;
    let lastSecond = null;
    let audioCtx = null;
    let audioUnlockArmed = false;
    const listeners = new Set();

    function clampInt(value, min, max, fallback) {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(max, Math.max(min, Math.round(n)));
    }

    function todayKey() {
      const d = new Date();
      return (
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0')
      );
    }

    function settingsOf(raw) {
      const out = { ...DEFAULT_SETTINGS };
      if (!raw || typeof raw !== 'object') return out;
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (LIMITS[key]) {
          out[key] = clampInt(raw[key], LIMITS[key][0], LIMITS[key][1], DEFAULT_SETTINGS[key]);
        } else if (typeof raw[key] === 'boolean') {
          out[key] = raw[key];
        }
      }
      return out;
    }

    function durationOf(phase, settings) {
      return settings[phase] * 60 * 1000;
    }

    function createInitialState() {
      const settings = { ...DEFAULT_SETTINGS };
      return {
        phase: 'focus',
        running: false,
        endsAt: null,
        remainingMs: durationOf('focus', settings),
        completedFocus: 0,
        today: { date: todayKey(), count: 0 },
        settings,
      };
    }

    function loadState() {
      const fallback = createInitialState();
      let raw = null;
      try {
        raw = window.localStorage.getItem(STORAGE_KEY);
      } catch (err) {
        return fallback;
      }
      if (!raw) return fallback;

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        return fallback;
      }
      if (!parsed || typeof parsed !== 'object') return fallback;

      const settings = settingsOf(parsed.settings);
      const phase = PHASES.indexOf(parsed.phase) === -1 ? 'focus' : parsed.phase;
      const running = parsed.running === true && Number.isFinite(Number(parsed.endsAt));
      const duration = durationOf(phase, settings);
      const savedRemaining = Number(parsed.remainingMs);
      return {
        phase,
        running,
        endsAt: running ? Number(parsed.endsAt) : null,
        remainingMs:
          Number.isFinite(savedRemaining) && savedRemaining > 0
            ? Math.min(savedRemaining, duration)
            : duration,
        completedFocus: clampInt(parsed.completedFocus, 0, 100000, 0),
        today: {
          date: todayKey(),
          count:
            parsed.today && parsed.today.date === todayKey()
              ? clampInt(parsed.today.count, 0, 100000, 0)
              : 0,
        },
        settings,
      };
    }

    function persist() {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            phase: state.phase,
            running: state.running,
            endsAt: state.endsAt,
            remainingMs: state.remainingMs,
            completedFocus: state.completedFocus,
            today: state.today,
            settings: state.settings,
          }),
        );
      } catch (err) {
        /* Storage can be unavailable (private mode/quota); timers still work. */
      }
    }

    function snapshot() {
      return { ...state, now };
    }

    function emit() {
      now = Date.now();
      for (const listener of listeners) {
        try {
          listener();
        } catch (err) {
          console.error('[pomodoro-timer] subscriber failed', err);
        }
      }
    }

    function subscribe(listener) {
      listeners.add(listener);
      if (state.running) ensureTicker();
      return () => {
        listeners.delete(listener);
      };
    }

    function ensureTicker() {
      if (ticker !== null) return;
      ticker = window.setInterval(tick, TICK_MS);
    }

    function stopTicker() {
      if (ticker === null) return;
      window.clearInterval(ticker);
      ticker = null;
      lastSecond = null;
    }

    function tick() {
      if (!state.running || state.endsAt == null) {
        stopTicker();
        return;
      }
      const left = state.endsAt - Date.now();
      if (left <= 0) {
        completePhase();
        return;
      }
      const second = Math.ceil(left / 1000);
      if (second === lastSecond) return;
      lastSecond = second;
      emit();
    }

    function completePhase(options) {
      const silent = Boolean(options && options.silent);
      const s = state;
      const wasFocus = s.phase === 'focus';
      const today =
        s.today.date === todayKey() ? { ...s.today } : { date: todayKey(), count: 0 };
      let completedFocus = s.completedFocus;
      if (wasFocus) {
        completedFocus += 1;
        today.count += 1;
        today.date = todayKey();
      }
      const nextPhase = wasFocus
        ? completedFocus % s.settings.longEvery === 0
          ? 'long'
          : 'short'
        : 'focus';
      const duration = durationOf(nextPhase, s.settings);
      const autoStart = s.settings.autoStart;
      const completion = silent
        ? s.completion
        : {
            seq: (s.completion ? s.completion.seq : 0) + 1,
            wasFocus,
            nextPhase,
            autoStart,
            at: Date.now(),
          };

      state = {
        ...s,
        phase: nextPhase,
        completedFocus,
        today,
        remainingMs: duration,
        endsAt: autoStart ? Date.now() + duration : null,
        running: autoStart,
        completion,
      };
      stopTicker();
      lastSecond = null;
      if (autoStart) ensureTicker();
      persist();
      emit();

      if (silent) return;
      if (s.settings.sound) playChime(wasFocus ? 'focusDone' : 'breakDone');
      if (s.settings.notify) showNotification(wasFocus, nextPhase);    }

    function start() {
      if (state.running) {
        pause();
        return;
      }
      const duration = durationOf(state.phase, state.settings);
      const remaining =
        state.remainingMs > 0 && state.remainingMs <= duration ? state.remainingMs : duration;
      if (state.settings.sound) {
        primeAudio();
        armAudioUnlock();
      }
      state = {
        ...state,
        running: true,
        endsAt: Date.now() + remaining,
        remainingMs: remaining,
      };
      persist();
      ensureTicker();
      emit();
    }

    function pause() {
      if (!state.running) return;
      const remaining =
        state.endsAt == null ? state.remainingMs : Math.max(0, state.endsAt - Date.now());
      state = { ...state, running: false, endsAt: null, remainingMs: remaining };
      stopTicker();
      persist();
      emit();
    }

    function reset() {
      const duration = durationOf(state.phase, state.settings);
      state = { ...state, running: false, endsAt: null, remainingMs: duration };
      stopTicker();
      persist();
      emit();
    }

    function skip() {
      const s = state;
      const nextPhase = s.phase === 'focus' ? 'short' : 'focus';
      const duration = durationOf(nextPhase, s.settings);
      state = { ...s, phase: nextPhase, running: false, endsAt: null, remainingMs: duration };
      stopTicker();
      persist();
      emit();
    }

    function updateSettings(key, value) {
      if (!(key in DEFAULT_SETTINGS)) return;
      const next = LIMITS[key]
        ? clampInt(value, LIMITS[key][0], LIMITS[key][1], DEFAULT_SETTINGS[key])
        : Boolean(value);
      const settings = { ...state.settings, [key]: next };
      if (key === 'sound' && next) {
        primeAudio();
        armAudioUnlock();
      }
      const remainingMs = state.running
        ? state.remainingMs
        : durationOf(state.phase, settings);
      state = { ...state, settings, remainingMs };
      persist();
      emit();
    }

    function resetSettings() {
      const settings = { ...DEFAULT_SETTINGS };
      const remainingMs = state.running
        ? state.remainingMs
        : durationOf(state.phase, settings);
      state = { ...state, settings, remainingMs };
      persist();
      emit();
    }

    function setTranslator(fn) {
      translate = typeof fn === 'function' ? fn : (key) => key;
    }

    /* ------------------------------- audio ---------------------------- */

    function primeAudio() {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtx) audioCtx = new Ctx();
        if (audioCtx.state === 'suspended') {
          const resumed = audioCtx.resume();
          if (resumed && typeof resumed.then === 'function') {
            resumed.then(() => {}, () => {});
          }
        }
      } catch (err) {
        /* No Web Audio (or blocked); stay silent. */
      }
    }

    /*
     * Browsers only unlock audio inside a user gesture. If the page was
     * reloaded while a phase was running, the next completion would be
     * silent, so keep a one-shot page-wide gesture listener armed and
     * prime the shared AudioContext on the first click/key press.
     */
    function disarmAudioUnlock() {
      if (!audioUnlockArmed) return;
      audioUnlockArmed = false;
      if (typeof document === 'undefined') return;
      document.removeEventListener('pointerdown', unlockAudio, true);
      document.removeEventListener('keydown', unlockAudio, true);
    }

    function unlockAudio() {
      primeAudio();
      window.setTimeout(() => {
        if (audioCtx && audioCtx.state === 'running') disarmAudioUnlock();
      }, 150);
    }

    function armAudioUnlock() {
      if (audioUnlockArmed) return;
      if (typeof document === 'undefined' || typeof window === 'undefined') return;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (audioCtx && audioCtx.state === 'running') return;
      audioUnlockArmed = true;
      document.addEventListener('pointerdown', unlockAudio, true);
      document.addEventListener('keydown', unlockAudio, true);
    }

    function playChime(kind) {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtx) audioCtx = new Ctx();
        if (audioCtx.state === 'suspended') void audioCtx.resume();
        if (audioCtx.state !== 'running') armAudioUnlock();
        const startAt = audioCtx.currentTime + 0.02;
        const notes =
          kind === 'focusDone' ? [659.25, 783.99, 1046.5] : [783.99, 659.25, 523.25];
        notes.forEach((freq, index) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          const at = startAt + index * 0.16;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, at);
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.exponentialRampToValueAtTime(0.16, at + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(at);
          osc.stop(at + 0.36);
        });
      } catch (err) {
        /* Autoplay policy may block the chime until the next gesture. */
      }
    }

    /* --------------------------- notifications ------------------------ */

    function showNotification(wasFocus, nextPhase) {
      try {
        const NotificationCtor = window.Notification;
        if (!NotificationCtor || NotificationCtor.permission !== 'granted') return;
        const title = translate(wasFocus ? 'notify.focusTitle' : 'notify.breakTitle');
        const body = translate(
          wasFocus
            ? nextPhase === 'long'
              ? 'notify.longBody'
              : 'notify.shortBody'
            : 'notify.breakBody',
        );
        const notice = new NotificationCtor(title, {
          body,
          tag: 'dsh-pomodoro-timer',
          silent: true,
        });
        window.setTimeout(() => {
          try {
            notice.close();
          } catch (err) {
            /* ignore */
          }
        }, 12000);
      } catch (err) {
        console.warn('[pomodoro-timer] notification failed', err);
      }
    }

    /* --------------------------- restore on load ---------------------- */

    state = loadState();
    if (state.running && state.endsAt != null && state.endsAt <= Date.now()) {
      completePhase({ silent: true });
    } else if (state.running) {
      ensureTicker();
      if (state.settings.sound) armAudioUnlock();
    }

    /* ------------------------------------------------------------------ */
    /* UI                                                                  */
    /* ------------------------------------------------------------------ */

    const CSS = `
.dsh-pomodoro{--pp-accent:#e4572e;position:relative;display:flex;flex-direction:column;align-items:stretch;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:1.2}
.dsh-pomodoro[data-phase="short"]{--pp-accent:#2f9e6e}
.dsh-pomodoro[data-phase="long"]{--pp-accent:#3b82f6}
.dsh-pomodoro__main{display:flex;align-items:center;gap:8px;padding:2px 4px 2px 2px;border-radius:12px;transition:background .15s ease}
.dsh-pomodoro__main:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-pomodoro__alert{display:flex;align-items:flex-start;gap:7px;margin:3px 2px 1px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1);border-left:2px solid var(--pp-accent);border-radius:9px;background:var(--dsw-alias-bg-layer-2);animation:dsh-pomodoro-alert-in .16s ease}
.dsh-pomodoro__alert-text{flex:1;min-width:0;font-size:10.5px;line-height:1.35;color:var(--dsw-alias-label-secondary)}
.dsh-pomodoro__alert-text strong{margin-right:4px;font-weight:600;color:var(--pp-accent)}
.dsh-pomodoro__alert-close{flex:none;display:grid;place-items:center;width:18px;height:18px;padding:0;border:0;border-radius:6px;background:none;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1;cursor:pointer}
.dsh-pomodoro__alert-close:hover{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}
.dsh-pomodoro__alert-close:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:0}
@keyframes dsh-pomodoro-alert-in{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
.dsh-pomodoro__ring{position:relative;flex:none;display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:50%;background:none;color:var(--pp-accent);cursor:pointer;transition:background .15s ease}
.dsh-pomodoro__ring:hover{background:var(--dsw-alias-bg-layer-2)}
.dsh-pomodoro__ring:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-pomodoro__ring svg{display:block}
.dsh-pomodoro__glyph{position:absolute;inset:0;display:grid;place-items:center;color:var(--pp-accent);pointer-events:none}
.dsh-pomodoro__info{display:flex;flex-direction:column;gap:2px;min-width:56px}
.dsh-pomodoro__time{font-size:13.5px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:.01em;color:var(--dsw-alias-label-primary)}
.dsh-pomodoro__sub{display:flex;align-items:center;gap:6px;font-size:10px;line-height:1;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-pomodoro__phase{font-weight:500;letter-spacing:.02em}
.dsh-pomodoro__dots{display:inline-flex;align-items:center;gap:3px}
.dsh-pomodoro__dot{width:3.5px;height:3.5px;border-radius:50%;background:currentColor;opacity:.28}
.dsh-pomodoro__dot[data-on="true"]{background:var(--pp-accent);opacity:1}
.dsh-pomodoro__actions{display:flex;align-items:center;gap:1px;margin-left:2px}
.dsh-pomodoro__iconbtn{display:grid;place-items:center;width:24px;height:24px;padding:0;border:0;border-radius:8px;background:none;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .15s ease,color .15s ease}
.dsh-pomodoro__iconbtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.dsh-pomodoro__iconbtn[data-active="true"]{color:var(--pp-accent)}
.dsh-pomodoro__iconbtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:0}
.dsh-pomodoro__settings{position:absolute;right:0;bottom:calc(100% + 8px);z-index:40;box-sizing:border-box;width:258px;max-width:calc(100vw - 24px);margin:0;padding:10px 11px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 12px 32px rgba(0,0,0,.22);animation:dsh-pomodoro-pop .14s ease}
@keyframes dsh-pomodoro-pop{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.dsh-pomodoro__grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 10px}
.dsh-pomodoro__field{display:flex;flex-direction:column;gap:3px;min-width:0}
.dsh-pomodoro__field-label{font-size:10px;color:var(--dsw-alias-label-secondary);letter-spacing:.01em}
.dsh-pomodoro__input-wrap{position:relative;display:block}
.dsh-pomodoro__input{width:100%;height:26px;box-sizing:border-box;padding:0 26px 0 7px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-variant-numeric:tabular-nums;-webkit-appearance:none;appearance:textfield}
.dsh-pomodoro__input::-webkit-outer-spin-button,.dsh-pomodoro__input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.dsh-pomodoro__input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px;border-color:transparent}
.dsh-pomodoro__unit{position:absolute;right:7px;top:50%;transform:translateY(-50%);font-size:9.5px;color:var(--dsw-alias-label-secondary);pointer-events:none}
.dsh-pomodoro__checks{display:flex;flex-wrap:wrap;gap:6px 12px;margin-top:10px}
.dsh-pomodoro__check{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}
.dsh-pomodoro__check input{width:13px;height:13px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.dsh-pomodoro__note{margin:7px 0 0;font-size:10.5px;line-height:1.35;color:var(--dsw-alias-state-warn-primary)}
.dsh-pomodoro__note[data-tone="success"]{color:var(--dsw-alias-state-success-primary)}
.dsh-pomodoro__footer{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:9px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1);font-size:10px;color:var(--dsw-alias-label-secondary)}
.dsh-pomodoro__link{border:0;background:none;padding:0;font:inherit;font-size:10px;color:var(--dsw-alias-label-secondary);cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.dsh-pomodoro__link:hover{color:var(--dsw-alias-label-primary)}
.dsh-pomodoro__link:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:3px}
.dsh-pomodoro__notify-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 8px;margin-top:9px;padding-top:7px;border-top:1px dashed var(--dsw-alias-border-l1)}
.dsh-pomodoro__notify-state{font-size:10px;color:var(--dsw-alias-label-secondary)}
.dsh-pomodoro__notify-state[data-state="granted"]{color:var(--dsw-alias-state-success-primary)}
.dsh-pomodoro__notify-state[data-state="denied"]{color:var(--dsw-alias-state-error-primary)}
.dsh-pomodoro__sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@media (prefers-reduced-motion:reduce){.dsh-pomodoro *,.dsh-pomodoro *::before,.dsh-pomodoro *::after{transition:none!important;animation:none!important}}
`;

    /* ----------------------------- icons ------------------------------ */

    const GEAR_PATH =
      'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z';

    function Icon(props) {
      const size = props.size || 14;
      const common = {
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.9,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block' },
      };
      if (props.name === 'play') {
        return h('svg', common, h('polygon', { points: '6 3.5 19.5 12 6 20.5', fill: 'currentColor', stroke: 'none' }));
      }
      if (props.name === 'pause') {
        return h(
          'svg',
          common,
          h('rect', { x: 6.5, y: 4.5, width: 3.6, height: 15, rx: 1.3, fill: 'currentColor', stroke: 'none' }),
          h('rect', { x: 13.9, y: 4.5, width: 3.6, height: 15, rx: 1.3, fill: 'currentColor', stroke: 'none' }),
        );
      }
      if (props.name === 'reset') {
        return h(
          'svg',
          common,
          h('polyline', { points: '2.5 4.5 2.5 10.5 8.5 10.5' }),
          h('path', { d: 'M5.1 15.1a8.2 8.2 0 1 0 1.8-8.5L2.5 10.5' }),
        );
      }
      if (props.name === 'skip') {
        return h(
          'svg',
          common,
          h('polygon', { points: '5 4.5 14.5 12 5 19.5', fill: 'currentColor', stroke: 'none' }),
          h('line', { x1: 19, y1: 4.5, x2: 19, y2: 19.5 }),
        );
      }
      if (props.name === 'settings') {
        return h(
          'svg',
          common,
          h('circle', { cx: 12, cy: 12, r: 3.2 }),
          h('path', { d: GEAR_PATH }),
        );
      }
      return null;
    }

    /* --------------------------- subcomponents ------------------------ */

    function IconButton(props) {
      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-pomodoro__iconbtn',
          title: props.label,
          'aria-label': props.label,
          'data-active': props.active ? 'true' : 'false',
          'aria-expanded': props.expanded === undefined ? undefined : props.expanded,
          'aria-controls': props.controls,
          onClick: props.onClick,
        },
        h(Icon, { name: props.icon }),
      );
    }

    function NumberField(props) {
      const [text, setText] = useState(String(props.value));
      useEffect(() => {
        setText(String(props.value));
      }, [props.value]);

      const commit = () => {
        const parsed = parseInt(text, 10);
        if (!Number.isFinite(parsed)) {
          setText(String(props.value));
          return;
        }
        const clamped = Math.min(props.max, Math.max(props.min, parsed));
        setText(String(clamped));
        if (clamped !== props.value) props.onCommit(clamped);
      };

      return h(
        'label',
        { className: 'dsh-pomodoro__field', htmlFor: props.id },
        h('span', { className: 'dsh-pomodoro__field-label' }, props.label),
        h(
          'span',
          { className: 'dsh-pomodoro__input-wrap' },
          h('input', {
            id: props.id,
            className: 'dsh-pomodoro__input',
            type: 'number',
            inputMode: 'numeric',
            min: props.min,
            max: props.max,
            value: text,
            onChange: (event) => setText(event.target.value),
            onBlur: commit,
            onKeyDown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            },
          }),
          h('span', { className: 'dsh-pomodoro__unit' }, props.unit),
        ),
      );
    }

    function Checkbox(props) {
      return h(
        'label',
        { className: 'dsh-pomodoro__check' },
        h('input', {
          type: 'checkbox',
          checked: props.checked,
          onChange: (event) => props.onChange(event.target.checked),
        }),
        h('span', {}, props.label),
      );
    }

    function formatClock(ms) {
      const total = Math.max(0, Math.ceil(ms / 1000));
      const minutes = Math.floor(total / 60);
      const seconds = total % 60;
      return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }

    function usePomodoro() {
      const [snap, setSnap] = useState(snapshot);
      useEffect(() => {
        const unsubscribe = subscribe(() => setSnap(snapshot()));
        setSnap(snapshot());
        return unsubscribe;
      }, []);
      return snap;
    }

    function PomodoroTimer(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const timer = usePomodoro();
      const [settingsOpen, setSettingsOpen] = useState(false);
      const [notice, setNotice] = useState('');
      const [noticeTone, setNoticeTone] = useState('warn');
      const warn = (text) => {
        setNotice(text);
        setNoticeTone('warn');
      };
      const [seenAlert, setSeenAlert] = useState(() => {
        const current = snapshot().completion;
        return current ? current.seq : 0;
      });
      const uidRef = useRef(null);
      const rootRef = useRef(null);
      if (uidRef.current === null) {
        uidRef.current = 'dsh-pomodoro-' + Math.random().toString(36).slice(2, 8);
      }
      const uid = uidRef.current;

      useEffect(() => {
        if (!settingsOpen) return undefined;
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setSettingsOpen(false);
          }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
      }, [settingsOpen]);

      useEffect(() => {
        if (!settingsOpen) return undefined;
        const onPointerDown = (event) => {
          const root = rootRef.current;
          if (!root) return;
          const target = event && event.target;
          if (target && typeof root.contains === 'function' && root.contains(target)) return;
          setSettingsOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        return () => document.removeEventListener('pointerdown', onPointerDown, true);
      }, [settingsOpen]);

      const completion = timer.completion;
      useEffect(() => {
        if (!completion || completion.seq === seenAlert) return undefined;
        const handle = window.setTimeout(() => setSeenAlert(completion.seq), 10000);
        return () => window.clearTimeout(handle);
      }, [completion, seenAlert]);

      const settings = timer.settings;
      const NotificationCtor = typeof window !== 'undefined' ? window.Notification : undefined;
      const notificationState = !NotificationCtor
        ? 'unsupported'
        : NotificationCtor.permission === 'granted'
          ? 'granted'
          : NotificationCtor.permission === 'denied'
            ? 'denied'
            : 'default';
      const duration = durationOf(timer.phase, settings);
      const remaining = timer.running
        ? Math.max(0, (timer.endsAt == null ? timer.now : timer.endsAt) - timer.now)
        : Math.min(timer.remainingMs, duration);
      const fraction = duration > 0 ? Math.max(0, Math.min(1, remaining / duration)) : 0;
      const clock = formatClock(remaining);
      const phaseLabel = t('phase.' + timer.phase);
      const todayCount = timer.today.date === todayKey() ? timer.today.count : 0;
      const longEvery = settings.longEvery;
      const cyclePos =
        timer.completedFocus % longEvery || (timer.phase === 'long' ? longEvery : 0);
      const dots = [];
      for (let index = 0; index < longEvery; index += 1) {
        dots.push(
          h('span', {
            key: index,
            className: 'dsh-pomodoro__dot',
            'data-on': index < cyclePos ? 'true' : 'false',
          }),
        );
      }

      const ringRadius = 16;
      const ringCircumference = 2 * Math.PI * ringRadius;
      const ringDash = ringCircumference * fraction;
      const ring = h(
        'svg',
        { width: 36, height: 36, viewBox: '0 0 36 36', 'aria-hidden': 'true', focusable: 'false', style: { transform: 'rotate(-90deg)' } },
        h('circle', {
          cx: 18,
          cy: 18,
          r: ringRadius,
          fill: 'none',
          stroke: 'currentColor',
          strokeOpacity: 0.16,
          strokeWidth: 2.6,
        }),
        h('circle', {
          cx: 18,
          cy: 18,
          r: ringRadius,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2.6,
          strokeLinecap: 'round',
          strokeDasharray: ringDash + ' ' + ringCircumference,
          style: { transition: 'stroke-dasharray 300ms linear' },
        }),
      );

      const toggleLabel = timer.running
        ? t('action.pause')
        : timer.remainingMs < duration
          ? t('action.resume')
          : t('action.start');

      const main = h(
        'div',
        { className: 'dsh-pomodoro__main' },
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-pomodoro__ring',
            title: toggleLabel,
            'aria-label': toggleLabel,
            onClick: start,
          },
          ring,
          h('span', { className: 'dsh-pomodoro__glyph' }, h(Icon, { name: timer.running ? 'pause' : 'play', size: 12 })),
        ),
        h(
          'div',
          { className: 'dsh-pomodoro__info' },
          h('div', { className: 'dsh-pomodoro__time' }, clock),
          h(
            'div',
            { className: 'dsh-pomodoro__sub' },
            h('span', { className: 'dsh-pomodoro__phase' }, phaseLabel),
            h('span', { className: 'dsh-pomodoro__dots', 'aria-hidden': 'true' }, dots),
          ),
        ),
        h(
          'div',
          { className: 'dsh-pomodoro__actions' },
          h(IconButton, { label: t('action.reset'), icon: 'reset', onClick: reset }),
          h(IconButton, { label: t('action.skip'), icon: 'skip', onClick: skip }),
          h(IconButton, {
            label: settingsOpen ? t('action.closeSettings') : t('action.settings'),
            icon: 'settings',
            active: settingsOpen,
            expanded: settingsOpen,
            controls: uid + '-settings',
            onClick: () => {
              setSettingsOpen((open) => !open);
              setNotice('');
            },
          }),
        ),
      );

      const panelId = uid + '-settings';
      const settingsPanel = settingsOpen
        ? h(
            'div',
            {
              className: 'dsh-pomodoro__settings',
              id: panelId,
              role: 'group',
              'aria-label': t('settings.title'),
            },
            h(
              'div',
              { className: 'dsh-pomodoro__grid' },
              h(NumberField, {
                id: uid + '-focus',
                label: t('settings.focus'),
                unit: t('unit.min'),
                value: settings.focus,
                min: LIMITS.focus[0],
                max: LIMITS.focus[1],
                onCommit: (value) => updateSettings('focus', value),
              }),
              h(NumberField, {
                id: uid + '-short',
                label: t('settings.short'),
                unit: t('unit.min'),
                value: settings.short,
                min: LIMITS.short[0],
                max: LIMITS.short[1],
                onCommit: (value) => updateSettings('short', value),
              }),
              h(NumberField, {
                id: uid + '-long',
                label: t('settings.long'),
                unit: t('unit.min'),
                value: settings.long,
                min: LIMITS.long[0],
                max: LIMITS.long[1],
                onCommit: (value) => updateSettings('long', value),
              }),
              h(NumberField, {
                id: uid + '-long-every',
                label: t('settings.longEvery'),
                unit: t('unit.pomodoro'),
                value: settings.longEvery,
                min: LIMITS.longEvery[0],
                max: LIMITS.longEvery[1],
                onCommit: (value) => updateSettings('longEvery', value),
              }),
            ),
            h(
              'div',
              { className: 'dsh-pomodoro__checks' },
              h(Checkbox, {
                label: t('settings.autoStart'),
                checked: settings.autoStart,
                onChange: (value) => updateSettings('autoStart', value),
              }),
              h(Checkbox, {
                label: t('settings.sound'),
                checked: settings.sound,
                onChange: (value) => {
                  if (value) primeAudio();
                  updateSettings('sound', value);
                },
              }),
              h(Checkbox, {
                label: t('settings.notify'),
                checked: settings.notify,
                onChange: handleNotifyToggle,
              }),
            ),
            h(
              'div',
              { className: 'dsh-pomodoro__notify-row' },
              h(
                'span',
                { className: 'dsh-pomodoro__notify-state', 'data-state': notificationState },
                t('settings.notifyState.' + notificationState),
              ),
              notificationState === 'unsupported'
                ? null
                : h(
                    'button',
                    {
                      type: 'button',
                      className: 'dsh-pomodoro__link',
                      onClick: handleTestNotification,
                    },
                    t('action.testNotification'),
                  ),
            ),
            notice
              ? h(
                  'p',
                  {
                    className: 'dsh-pomodoro__note',
                    role: 'alert',
                    'data-tone': noticeTone,
                  },
                  notice,
                )
              : null,
            h(
              'div',
              { className: 'dsh-pomodoro__footer' },
              h('span', {}, t('settings.today') + ' ' + todayCount),
              h(
                'button',
                { type: 'button', className: 'dsh-pomodoro__link', onClick: resetSettings },
                t('settings.resetDefaults'),
              ),
            ),
          )
        : null;

      const alertNode =
        completion && completion.seq !== seenAlert
          ? h(
              'div',
              { className: 'dsh-pomodoro__alert', role: 'status', 'aria-live': 'polite' },
              h(
                'span',
                { className: 'dsh-pomodoro__alert-text' },
                h(
                  'strong',
                  {},
                  t(completion.wasFocus ? 'alert.focusDone' : 'alert.breakDone'),
                ),
                t('alert.next')
                  .replace('{phase}', t('phase.' + completion.nextPhase))
                  .replace('{minutes}', String(settings[completion.nextPhase])) +
                  ' · ' +
                  t(completion.autoStart ? 'alert.autoStarted' : 'alert.waiting'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dsh-pomodoro__alert-close',
                  title: t('action.dismiss'),
                  'aria-label': t('action.dismiss'),
                  onClick: () => setSeenAlert(completion.seq),
                },
                '×',
              ),
            )
          : null;

      const statusText = t('status.current')
        .replace('{phase}', phaseLabel)
        .replace('{time}', settings[timer.phase] + ' ' + t('unit.min'));

      return h(
        React.Fragment,
        null,
        h('style', { 'data-dsh-pomodoro': '' }, CSS),
        h(
          'div',
          {
            className: 'dsh-pomodoro',
            'data-phase': timer.phase,
            ref: rootRef,
            onPointerDownCapture: () => {
              if (settings.sound) primeAudio();
            },
          },
          settingsPanel,
          alertNode,
          main,
          h('span', { className: 'dsh-pomodoro__sr', role: 'status', 'aria-live': 'polite' }, statusText),
        ),
      );

      function handleNotifyToggle(value) {
        if (!value) {
          updateSettings('notify', false);
          setNotice('');
          return;
        }
        const NotificationCtor = window.Notification;
        if (!NotificationCtor) {
          warn(t('settings.notifyUnsupported'));
          return;
        }
        if (NotificationCtor.permission === 'granted') {
          updateSettings('notify', true);
          setNotice('');
          return;
        }
        if (NotificationCtor.permission === 'denied') {
          warn(t('settings.notifyDenied'));
          return;
        }
        const settle = (permission) => {
          if (permission === 'granted') {
            updateSettings('notify', true);
            setNotice('');
          } else {
            warn(t('settings.notifyDenied'));
          }
        };
        try {
          const result = NotificationCtor.requestPermission(settle);
          if (result && typeof result.then === 'function') {
            result.then(settle, () => warn(t('settings.notifyDenied')));
          }
        } catch (err) {
          warn(t('settings.notifyDenied'));
        }
      }

      function handleTestNotification() {
        const NotificationCtor = window.Notification;
        if (!NotificationCtor) {
          warn(t('settings.notifyUnsupported'));
          return;
        }
        const fire = () => {
          try {
            new NotificationCtor(t('notify.testTitle'), {
              body: t('notify.testBody'),
              tag: 'dsh-pomodoro-test',
              silent: true,
            });
            setNotice(t('settings.testSent'));
            setNoticeTone('success');
          } catch (err) {
            warn(t('settings.notifyDenied'));
          }
        };
        if (NotificationCtor.permission === 'granted') {
          fire();
          return;
        }
        if (NotificationCtor.permission === 'denied') {
          warn(t('settings.notifyDenied'));
          return;
        }
        const settle = (permission) => {
          if (permission === 'granted') fire();
          else warn(t('settings.notifyDenied'));
        };
        try {
          const result = NotificationCtor.requestPermission(settle);
          if (result && typeof result.then === 'function') {
            result.then(settle, () => warn(t('settings.notifyDenied')));
          }
        } catch (err) {
          warn(t('settings.notifyDenied'));
        }
      }
    }

    /* ------------------------------------------------------------------ */
    /* Plugin                                                              */
    /* ------------------------------------------------------------------ */

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'pomodoro-timer: dictionaries');
        const t = ctx.locale.bind(NS);
        setTranslator(t);
        ctx.effect(() => () => setTranslator(null), 'pomodoro-timer: translator');
        ctx.effect(() => {
          if (typeof ctx.on !== 'function') return undefined;
          return ctx.on('locale/change', () => emit());
        }, 'pomodoro-timer: locale refresh');

        ctx.slots.inject('conversation.composer.dock', function* () {
          yield ctx.slots.register(
            {
              name: 'conversation.composer.dock',
              id: 'pomodoro-timer',
              order: 2,
              inject: () => ({ t }),
            },
            PomodoroTimer,
          );
        });
      },
    };
  },
});
