/**
 * DOM cards: title, level intro, fail, win, and the reveal.
 *
 * German, du-form, dry, Berlin-blunt (DESIGN.md §9). Never quirky-cute, never
 * three exclamation marks. All gift text comes from config/gift.ts and is
 * decoded here at render time.
 */

import { BUILD_LINES, DETAIL_ROWS, gift } from '../config/gift.js';
import { TUNING } from '../config/tuning.js';
import { LEVEL_ORDER, type LevelId } from '../core/input.js';
import { euros } from '../core/levels/pfand.js';
import { buildShareText, copyShareText } from './share.js';

/** The Pfand goal as the Bon reads it — derived, so the copy can't drift from tuning.ts. */
const PFAND_GOAL_EUR = euros(TUNING.pfand.goalBottles * TUNING.pfand.centsPerBottle);

export const LEVEL_TITLE: Record<LevelId, string> = {
  pfand: 'PFANDPIRAT NEUKÖLLN',
  sisyphos: 'SISYPHOS, 6 UHR FRÜH',
  katjes: 'SALZIGE HERINGE',
  kayak: 'KAYAK VR: MIRAGE',
};

export const LEVEL_SUB: Record<LevelId, string> = {
  pfand: 'Sonnenallee, morgens um sieben. Das Pfand gehört dir.',
  sisyphos: 'Der Türsteher schaut dich an. Sei einfach schon drin.',
  katjes: 'Es regnet Katjes. Das Gemüse ist eine Falle.',
  kayak: 'Bleib ruhig. Lass dich treiben.',
};

export const LEVEL_HOWTO: Record<LevelId, string> = {
  pfand: `Tippen = springen. Sammel ${TUNING.pfand.goalBottles} Flaschen, das sind ${PFAND_GOAL_EUR} €.`,
  sisyphos: 'Daumen wischen. Komm an den Türstehern vorbei bis zur Tür.',
  katjes: `Tüte bewegen. ${TUNING.katjes.goalFish} Heringe. Gemüse fassen wir nicht an.`,
  kayak: 'Sanft wischen. Bleib in der Strömung. Hektik kostet Ruhe.',
};

export const LEVEL_FAIL: Record<LevelId, string> = {
  pfand: 'Dreimal danebengetreten. Der Bon bleibt leer.',
  sisyphos: 'Heute nicht.',
  katjes: 'Du hast Gemüse gegessen. In Neukölln.',
  kayak: 'Zu hektisch. Atme.',
};

export const LEVEL_WIN: Record<LevelId, string> = {
  pfand: `${PFAND_GOAL_EUR} €. Der Automat spuckt den Bon aus.`,
  sisyphos: 'Stempel drauf. Du bist drin.',
  katjes: `${TUNING.katjes.goalFish} Heringe. Kein Gemüse. Sauber.`,
  kayak: 'Ruhig geblieben.',
};

export const LEVEL_SHORT: Record<LevelId, string> = {
  pfand: '1 · PFAND',
  sisyphos: '2 · SISYPHOS',
  katjes: '3 · KATJES',
  kayak: '4 · KAYAK',
};

const AFTERHOUR_TITLE = 'AFTERHOUR';
const AFTERHOUR_SUB = 'Kein Ende. Kein Türsteher, der dich noch aufhält.';
const AFTERHOUR_LOCKED_HINT = 'Erst alle vier schaffen.';
const AFTERHOUR_HOWTO = 'Pfand, Sisyphos, Katjes, Kayak — auf Wiederholung, schneller bei jeder Runde.';
const AFTERHOUR_FAIL = 'Vorbei. Die Nacht ist trotzdem gelaufen.';

type El = HTMLElement;

function h(tag: string, className?: string, text?: string): El {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  if (className) b.className = className;
  b.addEventListener('click', (ev) => {
    ev.preventDefault();
    onClick();
  });
  return b;
}

export type Overlay = {
  root: El;
  hide(): void;
  showTitle(o: TitleOptions): void;
  showIntro(level: LevelId, onStart: () => void): void;
  showFail(o: FailOptions): void;
  showWin(level: LevelId, onNext: () => void): void;
  showReveal(o: RevealOptions): void;
  showAfterhourIntro(o: AfterhourIntroOptions): void;
  showAfterhourFail(o: AfterhourFailOptions): void;
  visible(): boolean;
};

export type TitleOptions = {
  revealed: boolean;
  muted: boolean;
  resumeLevel: LevelId;
  hasProgress: boolean;
  onStart: () => void;
  onToggleMute: () => void;
  onGift: () => void;
};

export type FailOptions = {
  level: LevelId;
  canSkip: boolean;
  onRetry: () => void;
  onSkip: () => void;
};

export type RevealOptions = {
  /** Called once the type-on build finishes and the drop should land. */
  onDrop: () => void;
  onPlayAgain: () => void;
  onSelectLevel: (level: LevelId) => void;
  unlocked: number;
  reducedMotion: boolean;
  /** Sum of the four best clear times, in frames. null if a level was skipped rather than won. */
  totalFrames: number | null;
  /** All-time best total, in frames. null before the first full clear. */
  bestFrames: number | null;
  /** Whether this run's total just became the new best. */
  isNewBest: boolean;
  /** A first full clear (a real win on all four, not `?skip=1`) unlocks the 5th tile. */
  afterhourUnlocked: boolean;
  onSelectAfterhour: () => void;
};

export type AfterhourIntroOptions = {
  bestLoops: number;
  bestFrames: number;
  onStart: () => void;
  onBack: () => void;
};

export type AfterhourFailOptions = {
  loops: number;
  frames: number;
  isNewBest: boolean;
  bestLoops: number;
  onRetry: () => void;
  onTitle: () => void;
};

/** Frames (60/s) as m:ss, tabular. */
function formatFrames(frames: number): string {
  const totalSeconds = Math.round(frames / 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function makeOverlay(root: El): Overlay {
  let timers: Array<ReturnType<typeof setTimeout>> = [];

  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  const reset = (): El => {
    clearTimers();
    root.textContent = '';
    root.className = 'on';
    return root;
  };

  const hide = () => {
    clearTimers();
    root.textContent = '';
    root.className = '';
  };

  const later = (ms: number, fn: () => void) => {
    timers.push(setTimeout(fn, ms));
  };

  return {
    root,
    hide,
    visible: () => root.classList.contains('on'),

    showTitle(o) {
      const el = reset();
      el.append(h('p', 'eyebrow', '34 JAHRE ALT'));
      el.append(h('h1', undefined, 'JONAS BIRTHDAY BASH'));
      el.append(h('p', 'lede', 'Geburtstags-Edition'));
      el.append(h('p', undefined, '„Vier Level. Ein Endgegner."'));
      el.append(h('div', 'rule'));
      el.append(h('div', 'spacer'));

      el.append(
        button(o.hasProgress ? `WEITER — ${LEVEL_SHORT[o.resumeLevel]}` : 'LOSGEHEN', o.onStart, 'primary'),
      );
      if (o.revealed) el.append(button(gift('giftButton'), o.onGift));
      // The mute toggle doubles as the iOS audio unlock: it is a real gesture.
      el.append(button(o.muted ? '🔇 TON IST AUS' : '🔊 TON AN?', o.onToggleMute, 'quiet'));
    },

    showIntro(level, onStart) {
      const el = reset();
      el.append(h('p', 'eyebrow', LEVEL_SHORT[level]));
      el.append(h('h1', undefined, LEVEL_TITLE[level]));
      el.append(h('p', 'lede', LEVEL_SUB[level]));
      el.append(h('div', 'rule'));
      el.append(h('p', undefined, LEVEL_HOWTO[level]));
      el.append(h('div', 'spacer'));
      el.append(button('LOS', onStart, 'primary'));
    },

    showFail(o) {
      const el = reset();
      el.append(h('p', 'eyebrow', LEVEL_SHORT[o.level]));
      el.append(h('h1', undefined, LEVEL_FAIL[o.level]));
      el.append(h('div', 'spacer'));
      el.append(button('NOCHMAL', o.onRetry, 'primary'));
      // Never offered before the second fail — it would read as the game not
      // believing in him (DESIGN.md §8.1).
      if (o.canSkip) el.append(button("ÜBERSPRINGEN (WIR VERRATEN'S KEINEM)", o.onSkip, 'quiet'));
    },

    showWin(level, onNext) {
      const el = reset();
      el.append(h('p', 'eyebrow', 'BESTANDEN'));
      el.append(h('h1', undefined, LEVEL_WIN[level]));
      el.append(h('div', 'spacer'));
      el.append(button('WEITER', onNext, 'primary'));
    },

    showReveal(o) {
      const el = reset();
      el.className = 'on reveal';

      const lines = BUILD_LINES.map(() => h('p', 'build-line', ''));
      lines.forEach((l) => el.append(l));

      const body = h('div');
      body.style.display = 'none';
      el.append(body);

      const card = h('div', 'gift-card');
      card.append(h('h1', undefined, gift('cardTitle')));
      card.append(h('p', 'city', gift('cardCity')));
      card.append(h('p', 'tagline', gift('cardTagline')));
      const link = document.createElement('a');
      link.className = 'card-link';
      link.href = gift('cardLinkHref');
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = gift('cardLinkLabel');
      card.append(link);
      body.append(card);

      const details = h('div', 'details');
      const dl = document.createElement('dl');
      for (const row of DETAIL_ROWS) {
        dl.append(h('dt', undefined, gift(row.label)));
        dl.append(h('dd', undefined, gift(row.value)));
      }
      details.append(dl);
      body.append(details);
      body.append(h('p', 'outro', gift('outro')));

      if (o.totalFrames !== null) {
        const score = h('div', 'score');
        score.append(h('p', 'hint', 'DEINE ZEIT'));
        score.append(h('p', 'time num', formatFrames(o.totalFrames)));
        score.append(
          h(
            'p',
            'hint',
            o.isNewBest
              ? 'NEUE BESTZEIT'
              : `BESTZEIT: ${formatFrames(o.bestFrames ?? o.totalFrames)}`,
          ),
        );
        body.append(score);
      }

      body.append(button(gift('playAgain'), o.onPlayAgain, 'primary'));

      const levels = h('div', 'levels');
      for (const level of LEVEL_ORDER) {
        const b = button(LEVEL_SHORT[level], () => o.onSelectLevel(level), 'quiet');
        levels.append(b);
      }
      const ahBtn = button(
        o.afterhourUnlocked ? AFTERHOUR_TITLE : `${AFTERHOUR_TITLE} · ${AFTERHOUR_LOCKED_HINT}`,
        () => o.onSelectAfterhour(),
        'quiet afterhour',
      );
      ahBtn.disabled = !o.afterhourUnlocked;
      levels.append(ahBtn);
      body.append(h('p', 'hint', gift('levelSelect')));
      body.append(levels);

      // Type-on, one line at a time, over a 4-bar build.
      const charMs = o.reducedMotion ? 0 : 34;
      const lineGap = o.reducedMotion ? 300 : 900;
      let t = o.reducedMotion ? 0 : 350;
      BUILD_LINES.forEach((key, i) => {
        const text = gift(key);
        const target = lines[i];
        later(t, () => typeOn(target, text, charMs, later));
        t += lineGap + text.length * charMs;
      });
      later(t, () => {
        body.style.display = 'block';
        body.classList.add('fade-in');
        o.onDrop();
      });
    },

    showAfterhourIntro(o) {
      const el = reset();
      el.append(h('p', 'eyebrow', 'BONUS'));
      el.append(h('h1', undefined, AFTERHOUR_TITLE));
      el.append(h('p', 'lede', AFTERHOUR_SUB));
      el.append(h('div', 'rule'));
      el.append(h('p', undefined, AFTERHOUR_HOWTO));
      if (o.bestLoops > 0) {
        el.append(h('p', 'hint', `BESTE RUNDE: ${o.bestLoops} · ${formatFrames(o.bestFrames)}`));
      }
      el.append(h('div', 'spacer'));
      el.append(button('LOS', o.onStart, 'primary'));
      el.append(button('ZURÜCK', o.onBack, 'quiet'));
    },

    showAfterhourFail(o) {
      const el = reset();
      el.append(h('p', 'eyebrow', AFTERHOUR_TITLE));
      el.append(h('h1', undefined, AFTERHOUR_FAIL));
      el.append(h('p', undefined, `${o.loops} Runden überlebt · ${formatFrames(o.frames)}`));
      if (o.isNewBest) el.append(h('p', 'hint', 'NEUE BESTE RUNDE'));
      else if (o.bestLoops > 0) el.append(h('p', 'hint', `BESTE RUNDE: ${o.bestLoops}`));
      el.append(h('div', 'spacer'));
      el.append(button('NOCHMAL', o.onRetry, 'primary'));
      const shareBtn = button('SCORE TEILEN', () => {
        void copyShareText(buildShareText(o.loops)).then((ok) => {
          shareBtn.textContent = ok ? 'KOPIERT' : buildShareText(o.loops);
        });
      }, 'quiet');
      el.append(shareBtn);
      el.append(button('ZUM TITEL', o.onTitle, 'quiet'));
    },
  };
}

function typeOn(el: El, text: string, charMs: number, later: (ms: number, fn: () => void) => void): void {
  if (charMs <= 0) {
    el.textContent = text;
    return;
  }
  const chars = [...text];
  chars.forEach((_, i) => later(i * charMs, () => (el.textContent = chars.slice(0, i + 1).join(''))));
}
