import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// ---------------------------------------------------------------------------
// Garde anti-oubli : un texte visible écrit en dur dans un composant, hors de
// `tr('…', '…')`, reste en français pour qui a choisi l'anglais. Ce test lit
// les sources et échoue sur le texte JSX et les attributs lus par l'humain.
//
// Des regex, pas de parseur : on cherche le texte entre une fin de balise et
// la balise suivante, et les attributs en chaîne littérale. Assez pour
// attraper l'oubli ordinaire ; les cas en mémoire plus bas prouvent qu'il le
// voit vraiment, et qu'il laisse tranquilles tr(), les classes et les
// commentaires.
// ---------------------------------------------------------------------------

/** Pareil dans les deux langues, ou nom propre : pas besoin de tr(). */
const NEUTRAL = new Set([
  'SUNWAVE',
  'Sunwave',
  'Lisboa',
  'Langue · Language',
  'Français',
  'English',
  'Navigation',
]);

const ROOT = join(process.cwd(), 'src');

function isNeutralPiece(t: string): boolean {
  if (t === '') return true;
  if (!/\p{L}/u.test(t)) return true; // symboles, nombres, ponctuation
  if (/^\d{1,2}\s?h(\s?\d{2})?$/.test(t)) return true; // « 16h », « 16h30 »
  if (/^v\d+(\.\d+)*$/.test(t)) return true; // « v1.0 »
  return NEUTRAL.has(t);
}

/** Neutre en entier, ou fait de morceaux neutres séparés par « · » (« Lisboa · 16:00 »). */
function isNeutral(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim();
  return isNeutralPiece(t) || t.split(/\s*[·•|]\s*/).every((piece) => isNeutralPiece(piece.trim()));
}

/** Retire les commentaires `{/* … *\/}`, `/* … *\/` et `// …` (pas `https://`). */
function stripComments(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
}

/** Retire les expressions `{…}` (deux niveaux d'imbrication suffisent ici). */
function stripExpressions(text: string): string {
  return text.replace(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g, ' ');
}

// Fin de balise JSX : `>` collé à un nom, une chaîne, une accolade ou un `/`
// (`<p>`, `"…">`, `{x}>`, `/>`), ou seul en début de ligne (balise sur
// plusieurs lignes). Exclut `=>` et les comparaisons `a > b`. Le texte court
// jusqu'à la prochaine balise, expressions `{…}` comprises.
const JSX_TEXT =
  /(?:(?<=[\w"'}/])|(?<=^[ \t]*))>((?:[^<>{}]|\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})*)<(?=[A-Za-z/>])/gm;

const ATTR =
  /\s(aria-label|title|placeholder|alt|label)=(?:"([^"]*)"|'([^']*)'|\{\s*(?:"([^"]*)"|'([^']*)'|`([^`$]*)`)\s*\})/g;

interface Finding {
  line: number;
  text: string;
}

function findHardcoded(source: string): Finding[] {
  const src = stripComments(source);
  const found: Finding[] = [];
  const lineOf = (index: number) => src.slice(0, index).split('\n').length;

  for (const m of src.matchAll(JSX_TEXT)) {
    const text = stripExpressions(m[1]);
    // Du code TypeScript pris entre deux chevrons (génériques, comparaisons) :
    // un texte d'interface n'a ni `;`, ni `=`, ni `&&`.
    // Et une parenthèse fermante en tête trahit la fin d'un `( <>…</> )`.
    if (/[;=]|&&|\|\|/.test(text) || /^\s*\)/.test(text)) continue;
    if (!isNeutral(text)) found.push({ line: lineOf(m.index ?? 0), text: text.replace(/\s+/g, ' ').trim() });
  }

  for (const m of src.matchAll(ATTR)) {
    const value = m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? '';
    if (!isNeutral(value)) found.push({ line: lineOf(m.index ?? 0), text: `${m[1]}="${value}"` });
  }
  return found;
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return tsxFiles(p);
    return e.name.endsWith('.tsx') ? [p] : [];
  });
}

describe('findHardcoded — le détecteur voit ce qu’il doit voir', () => {
  const caught = [
    ['texte entre balises', '<p>Bonjour le monde</p>'],
    ['aria-label en dur', '<button aria-label="Fermer" onClick={close} />'],
    ['placeholder en dur', '<input placeholder="Rechercher un lieu" />'],
    ['title entre accolades', "<span title={'À vérifier'}>☀</span>"],
    ['texte autour d’une expression', '<p>Il reste {n} lieux</p>'],
    ['mot français à côté d’un nom propre', '<span>Lisboa · Maintenant</span>'],
    ['texte sur sa propre ligne', '<p\n  className="x"\n>\n  Au soleil\n</p>'],
  ] as const;
  for (const [name, tsx] of caught) {
    it(`détecte : ${name}`, () => {
      expect(findHardcoded(tsx)).not.toEqual([]);
    });
  }

  const ignored = [
    ['tr() entre balises', "<p>{tr('Bonjour', 'Hello')}</p>"],
    ['tr() dans un attribut', "<button aria-label={tr('Fermer', 'Close')} />"],
    ['classes', '<div className="text-sm font-semibold">{x}</div>'],
    ['commentaire JSX', '<div>{/* Le soleil passe derrière le Tage */}</div>'],
    ['commentaire de ligne', 'const a = 1; // Le soleil se couche à l’ouest\n<p>{a}</p>'],
    ['nom propre', '<h1>SUNWAVE</h1>'],
    ['heure et symboles', '<span>16h</span><span>·</span><span>12</span>'],
    ['comparaison et génériques', 'const ok = a > b && c < d;\nconst r = useRef<HTMLDivElement>(null);\nif (x < y) go();'],
    ['fonction fléchée', 'const f = () => <p>{tr("Oui", "Yes")}</p>;'],
    ['fragments dans un objet', 'const P = {\n  a: (\n    <>\n      <path d="M1" />\n    </>\n  ),\n  b: (\n    <>\n      <circle r="2" />\n    </>\n  ),\n};'],
    ['nom propre et heure séparés par ·', '<span>Lisboa · {time}</span>'],
  ] as const;
  for (const [name, tsx] of ignored) {
    it(`ignore : ${name}`, () => {
      expect(findHardcoded(tsx)).toEqual([]);
    });
  }
});

describe('aucun texte visible écrit en dur hors de tr()', () => {
  const files = [...tsxFiles(join(ROOT, 'components')), join(ROOT, 'App.tsx')];

  it('trouve bien les composants', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('src/components/**/*.tsx et src/App.tsx', () => {
    const report = files.flatMap((f) =>
      findHardcoded(readFileSync(f, 'utf8')).map((x) => `${relative(process.cwd(), f)}:${x.line}  ${x.text}`)
    );
    expect(report, `Texte en dur — l’envelopper dans tr('…', '…') :\n${report.join('\n')}`).toEqual([]);
  });
});
