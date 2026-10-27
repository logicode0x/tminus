// A guide or a comparison (src/articles.mjs): the answer first, then its sections, the common questions and where to go next. Laid out
// like the docs, one readable column. The guides index lists them all.
import { Link } from '../router.jsx';
import { ARTICLES, GUIDES_PAGE, CHECKED, articleFor, pieces } from '../../src/articles.mjs';

const dated = new Date(`${CHECKED}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** A paragraph's text with its `[text](/path)` links. */
const Text = ({ children }) => pieces(children).map(([text, href], i) => (href ? <Link key={i} href={href}>{text}</Link> : text));

function Table({ table }) {
  const [head, ...cols] = table.head;
  return (
    <div className={`docs-table article-table${table.even ? ' even' : ''}`}>
      <table>
        <thead><tr><th scope="col">{head}</th>{cols.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>{table.rows.map(([label, ...cells]) => <tr key={label}><th scope="row">{label}</th>{cells.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function Article({ path }) {
  const a = articleFor(path);
  if (!a) return <main className="page narrow"><h1>Nothing here</h1><p>There is no guide at this address. <Link href="/guides">See every guide</Link></p></main>;
  return (
    <main className="page narrow article">
      {a.kind !== 'page' && <nav className="crumbs" aria-label="Breadcrumb"><Link href="/guides">Guides</Link></nav>}
      <article className="docs-body">
        <h1>{a.title}</h1>
        <p className="lede"><Text>{a.lead}</Text></p>
        {a.table && <Table table={a.table} />}
        {a.sections.map(s => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.p?.map((p, i) => <p key={i}><Text>{p}</Text></p>)}
            {s.list && (s.ordered
              ? <ol className="docs-steps">{s.list.map((li, i) => <li key={i}><Text>{li}</Text></li>)}</ol>
              : <ul className="docs-list">{s.list.map((li, i) => <li key={i}><Text>{li}</Text></li>)}</ul>)}
          </section>
        ))}
        {a.faq?.length > 0 && (
          <section>
            <h2>Questions</h2>
            {a.faq.map(f => <div key={f.q}><h3>{f.q}</h3><p><Text>{f.a}</Text></p></div>)}
          </section>
        )}
        <section className="article-next">
          <p className="ctas"><Link className="button primary large" href={a.cta.href}>{a.cta.label}</Link></p>
          <h2>Read next</h2>
          <ul className="docs-list">{a.related.map(r => articleFor(r)).filter(Boolean).map(r => <li key={r.path}><Link href={r.path}>{r.title}</Link></li>)}</ul>
          <p className="quiet">Checked on {dated}. Launchpads change their fees and options; tell us on X if something here is out of date.</p>
        </section>
      </article>
    </main>
  );
}

/** /guides: every guide and comparison. */
export function Guides() {
  const group = kind => ARTICLES.filter(a => a.kind === kind);
  return (
    <main className="page narrow article">
      <article className="docs-body">
        <h1>{GUIDES_PAGE.title}</h1>
        <p className="lede">{GUIDES_PAGE.description} New here? Start with <Link href="/start">how to launch a token on Meteora, step by step</Link>.</p>
        <section>
          <h2>Guides</h2>
          <ul className="guide-list">{group('guide').map(a => <li key={a.path}><Link href={a.path}><b>{a.title}</b><span>{a.description}</span></Link></li>)}</ul>
        </section>
        <section>
          <h2>Comparisons</h2>
          <ul className="guide-list">{group('compare').map(a => <li key={a.path}><Link href={a.path}><b>{a.title}</b><span>{a.description}</span></Link></li>)}</ul>
        </section>
      </article>
    </main>
  );
}
