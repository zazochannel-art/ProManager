import { BriefcaseBusiness, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Download, FileText, MoreHorizontal, Pencil, Plus, Search, SlidersHorizontal, Wallet, Wrench, X } from 'lucide-react';
import React, { useMemo, useState } from 'react';

const money = n => new Intl.NumberFormat('ro-MD').format(n) + ' MDL';

function Status({ value }) {
  const cls = value === 'Acceptată' || value === 'Achitată' ? 'done' : value === 'Expirată' ? 'waiting' : 'scheduled';
  return <span className={`status ${cls}`}><i />{value}</span>;
}

function Stat({ title, value, icon: Icon, caption }) {
  return <section className="stat-card"><div className="stat-top"><span>{title}</span><span className="stat-icon"><Icon size={18} /></span></div><div className="stat-value">{value}</div><div className="stat-foot"><span className="stat-caption">{caption}</span></div></section>;
}

export function WorkPage({ jobs, onAdd, updateJobs }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Toate statusurile');
  const visibleJobs = useMemo(() => jobs.filter(job => {
    const matchesQuery = [job.id, job.title, job.client, job.type].join(' ').toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (status === 'Toate statusurile' || job.status === status);
  }), [jobs, query, status]);
  function updateStatus(id, nextStatus) {
    updateJobs(jobs.map(job => job.id === id ? { ...job, status: nextStatus } : job));
  }
  function exportCsv() {
    const rows = [['ID', 'Lucrare', 'Client', 'Tip', 'Data', 'Status', 'Valoare'], ...visibleJobs.map(job => [job.id, job.title, job.client, job.type, job.date, job.status, job.amount])];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'promanager-lucrari.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }
  return <>
    <div className="page-heading"><div><h1>Lucrări</h1><p>Gestionează proiectele și activitatea echipei.</p></div><button className="btn primary" onClick={onAdd}><Plus size={18} /> Lucrare nouă</button></div>
    <div className="toolbar"><div className="search-box"><Search size={17} /><input aria-label="Caută lucrări" placeholder="Caută după lucrare, client..." value={query} onChange={event => setQuery(event.target.value)} /></div><label className="filter-select"><SlidersHorizontal size={16} /><select aria-label="Filtrează după status" value={status} onChange={event => setStatus(event.target.value)}><option>Toate statusurile</option><option>Programată</option><option>În lucru</option><option>În așteptare</option><option>Finalizată</option></select></label><button className="btn secondary" onClick={exportCsv}><Download size={16} /> Exportă</button></div>
    <section className="panel full-table-panel"><div className="table-summary"><strong>Toate lucrările</strong><span>{visibleJobs.length} din {jobs.length}</span></div><div className="table-wrap"><table><thead><tr><th>LUCRARE</th><th>CLIENT</th><th>DATA</th><th>STATUS</th><th>VALOARE</th><th /></tr></thead><tbody>
      {visibleJobs.map(job => <tr key={job.id}><td><div className="job-name">{job.title}<small>{job.id} · {job.type}</small></div></td><td>{job.client}</td><td className="date-cell">{job.date}</td><td><select className={`inline-status ${job.status === 'Finalizată' ? 'status-done' : job.status === 'În lucru' ? 'status-progress' : job.status === 'În așteptare' ? 'status-waiting' : ''}`} aria-label={`Status ${job.id}`} value={job.status} onChange={event => updateStatus(job.id, event.target.value)}><option>Programată</option><option>În lucru</option><option>În așteptare</option><option>Finalizată</option></select></td><td className="amount-cell">{money(job.amount)}</td><td><button className="row-more" title={`Lucrare ${job.id}`} aria-label={`Lucrare ${job.id}`}><MoreHorizontal size={18} /></button></td></tr>)}
    </tbody></table>{visibleJobs.length === 0 && <div className="empty-state">Nu am găsit lucrări pentru filtrele selectate.</div>}</div></section>
  </>;
}

const monthKeys = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function jobDateParts(job) {
  if (job.dateISO) {
    const [year, month, day] = job.dateISO.split('-').map(Number);
    return { year, month: month - 1, day };
  }
  const match = String(job.date).toLowerCase().match(/^(\d{1,2})\s+([a-zăâîșț.]+)/i);
  if (!match) return null;
  const day = Number(match[1]);
  const monthKey = match[2].replace('.', '').slice(0, 3);
  const month = monthKeys.indexOf(monthKey);
  if (month < 0) return null;
  return { year: new Date().getFullYear(), month, day };
}

export function InteractiveCalendarPage({ jobs, onAdd }) {
  const today = new Date();
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7;
  const days = Array.from({ length: cellCount }, (_, index) => {
    const day = index - offset + 1;
    return { date: new Date(year, monthIndex, day), current: day >= 1 && day <= daysInMonth };
  });
  const monthLabel = new Intl.DateTimeFormat('ro-MD', { month: 'long', year: 'numeric' }).format(month);
  const isToday = date => date.getDate() === today.getDate() && date.getMonth() === today.getMonth() && date.getFullYear() === today.getFullYear();
  const jobsForDate = date => jobs.filter(job => {
    const parts = jobDateParts(job);
    return parts && parts.year === date.getFullYear() && parts.month === date.getMonth() && parts.day === date.getDate();
  });
  return <>
    <div className="page-heading"><div><h1>Calendar</h1><p>Programul echipei și lucrările planificate.</p></div><button className="btn primary" onClick={onAdd}><Plus size={18} /> Programează o lucrare</button></div>
    <section className="panel calendar-panel"><div className="calendar-head"><button className="icon-btn calendar-nav" aria-label="Luna precedentă" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}><ChevronLeft /></button><h2>{monthLabel}</h2><button className="icon-btn calendar-nav" aria-label="Luna următoare" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}><ChevronRight /></button><button className="btn secondary today-btn" onClick={() => setMonth(new Date(today.getFullYear(), today.getMonth(), 1))}><CalendarDays size={15} /> Astăzi</button></div>
      <div className="week-grid">{['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'].map(label => <div className="week-label" key={label}>{label}</div>)}{days.map(({ date, current }, index) => <div key={`${date.toISOString()}-${index}`} className={`day-cell ${isToday(date) ? 'today' : ''} ${current ? '' : 'outside'}`}><span>{date.getDate()}</span>{jobsForDate(date).map(job => <div key={job.id} className={`calendar-event ${job.status === 'Finalizată' ? 'pale' : ''}`} title={`${job.title} · ${job.client}`}>{job.date.split(',')[1]?.trim() || '09:00'} · {job.title}</div>)}</div>)}</div>
      {jobs.length === 0 && <div className="calendar-empty">Nu ai lucrări programate încă.</div>}
    </section>
  </>;
}

export function OverviewPage({ jobs, clients, quotes, expenses, onPage, onAdd }) {
  const completedValue = jobs.filter(job => job.status === 'Finalizată').reduce((sum, job) => sum + Number(job.amount || 0), 0);
  const activeJobs = jobs.filter(job => job.status === 'În lucru' || job.status === 'Programată');
  const pendingQuotes = quotes.filter(quote => quote.status === 'În așteptare');
  const pendingQuoteValue = pendingQuotes.reduce((sum, quote) => sum + Number(quote.amount || 0), 0);
  const recordedExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const statusGroups = [
    { label: 'Programate', key: 'Programată', color: 'scheduled' },
    { label: 'În lucru', key: 'În lucru', color: 'progress' },
    { label: 'Finalizate', key: 'Finalizată', color: 'done' },
    { label: 'În așteptare', key: 'În așteptare', color: 'waiting' },
  ].map(group => ({ ...group, count: jobs.filter(job => job.status === group.key).length }));
  const maxCount = Math.max(1, ...statusGroups.map(group => group.count));
  const upcoming = jobs.filter(job => job.status !== 'Finalizată').slice(0, 4);
  return <>
    <div className="page-heading"><div><h1>Bună dimineața, Igor</h1><p>Un sumar al activității companiei tale.</p></div><div className="heading-actions"><button className="btn secondary" onClick={() => onPage('Calendar')}><CalendarDays size={17} /> Calendar</button><button className="btn primary" onClick={onAdd}><Plus size={18} /> Lucrare nouă</button></div></div>
    <div className="stats-grid">
      <Stat title="Valoare finalizată" value={money(completedValue)} caption="lucrări marcate finalizate" icon={Check} />
      <Stat title="Lucrări active" value={activeJobs.length} caption={`${jobs.filter(job => job.status === 'În lucru').length} în desfășurare`} icon={BriefcaseBusiness} />
      <Stat title="Clienți" value={clients.length} caption="în agenda companiei" icon={FileText} />
      <Stat title="Devize în așteptare" value={money(pendingQuoteValue)} caption={`${pendingQuotes.length} devize de urmărit`} icon={Clock3} />
    </div>
    <div className="dashboard-grid">
      <section className="panel revenue-panel"><div className="panel-header"><div><h2>Lucrări după status</h2><p>Distribuția portofoliului curent</p></div><button className="text-button" onClick={() => onPage('Lucrări')}>Vezi lucrările <ChevronRight size={15} /></button></div>
        <div className="status-chart">{statusGroups.map(group => <div className="status-chart-row" key={group.key}><span>{group.label}</span><div className="status-track"><i className={`status-bar ${group.color}`} style={{ width: `${(group.count / maxCount) * 100}%` }} /></div><strong>{group.count}</strong></div>)}</div>
        <div className="overview-note"><Wallet size={16} /><span>Cheltuieli înregistrate</span><strong>{money(recordedExpenses)}</strong></div>
      </section>
      <section className="panel schedule-panel"><div className="panel-header"><div><h2>Lucrări de urmărit</h2><p>{new Intl.DateTimeFormat('ro-MD', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p></div><button className="text-button" onClick={() => onPage('Calendar')}>Calendar <ChevronRight size={15} /></button></div>
        {upcoming.length ? <div className="schedule-list">{upcoming.slice(0, 3).map((job, index) => <div className="schedule-row" key={job.id}><div className="time-col">{job.date.split(',')[1]?.trim() || `${String(9 + index).padStart(2, '0')}:00`}<span /></div><div className={`schedule-entry ${['lavender', 'peach', 'mint'][index]}`}><div className="schedule-title">{job.title}</div><div className="schedule-client">{job.client}<span className="dot-sep">·</span>{job.type}</div></div></div>)}</div> : <div className="empty-state">Nu ai lucrări active. Adaugă o lucrare nouă.</div>}
        <button className="schedule-add" onClick={onAdd}><Plus size={16} /> Adaugă o lucrare</button>
      </section>
    </div>
    <section className="panel work-panel"><div className="panel-header"><div><h2>Lucrări recente</h2><p>Ultimele lucrări din portofoliu</p></div><button className="text-button" onClick={() => onPage('Lucrări')}>Toate lucrările <ChevronRight size={15} /></button></div><div className="table-wrap"><table><thead><tr><th>LUCRARE</th><th>CLIENT</th><th>STATUS</th><th>VALOARE</th></tr></thead><tbody>{jobs.slice(0, 4).map(job => <tr key={job.id}><td><div className="job-name">{job.title}<small>{job.id} · {job.type}</small></div></td><td>{job.client}</td><td><Status value={job.status} /></td><td className="amount-cell">{money(job.amount)}</td></tr>)}</tbody></table>{jobs.length === 0 && <div className="empty-state">Adaugă prima lucrare pentru a vedea sumarul.</div>}</div></section>
  </>;
}

export function ClientPage({ clients, onAdd, updateClients }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('recent');
  const [editing, setEditing] = useState(null);
  const visibleClients = useMemo(() => clients.filter(client => [client.name, client.contact, client.email].join(' ').toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'ro') : sort === 'jobs' ? b.jobs - a.jobs : 0), [clients, query, sort]);
  function saveClient(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const originalName = editing.originalName;
    updateClients(clients.map(client => client.name === originalName ? { ...client, name: form.get('name').trim(), contact: form.get('phone').trim() || '—', email: form.get('email').trim() || '—' } : client));
    setEditing(null);
  }
  function exportCsv() {
    const rows = [['Nume', 'Telefon', 'Email', 'Lucrări', 'Total cheltuit'], ...visibleClients.map(client => [client.name, client.contact, client.email, client.jobs, client.spent])];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'promanager-clienti.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }
  return <>
    <div className="page-heading"><div><h1>Clienți</h1><p>Toate relațiile tale, într-un singur loc.</p></div><button className="btn primary" onClick={onAdd}><Plus size={18} /> Client nou</button></div>
    <div className="toolbar"><div className="search-box"><Search size={17} /><input placeholder="Caută după nume, telefon sau email..." value={query} onChange={event => setQuery(event.target.value)} /></div><label className="filter-select"><SlidersHorizontal size={16} /><select aria-label="Sortează clienții" value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Ordine implicită</option><option value="name">Nume: A–Z</option><option value="jobs">Cele mai multe lucrări</option></select></label><button className="btn secondary" onClick={exportCsv}><Download size={16} /> Exportă</button></div>
    <section className="panel full-table-panel"><div className="table-summary"><strong>Toți clienții</strong><span>{visibleClients.length} din {clients.length}</span></div><div className="table-wrap"><table><thead><tr><th>CLIENT</th><th>TELEFON</th><th>EMAIL</th><th>LUCRĂRI</th><th>TOTAL CHELTUIT</th><th>ACȚIUNI</th></tr></thead><tbody>
      {visibleClients.map(client => <tr key={client.name}><td><div className="client-cell client-strong"><span className={`avatar ${client.color}`}>{client.initials}</span>{client.name}</div></td><td className="date-cell">{client.contact}</td><td className="date-cell">{client.email}</td><td>{client.jobs}</td><td className="amount-cell">{client.spent}</td><td><button className="row-more" title="Editează clientul" aria-label={`Editează ${client.name}`} onClick={() => setEditing({ ...client, originalName: client.name })}><Pencil size={16} /></button></td></tr>)}
    </tbody></table>{visibleClients.length === 0 && <div className="empty-state">Nu am găsit clienți pentru căutarea ta.</div>}</div></section>
    {editing && <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && setEditing(null)}><form className="modal" onSubmit={saveClient}><div className="modal-head"><div><h2>Editează clientul</h2><p>Actualizează informațiile de contact.</p></div><button type="button" className="icon-btn" onClick={() => setEditing(null)}><X size={19} /></button></div><label>Nume client<input required autoFocus name="name" defaultValue={editing.name} /></label><label>Telefon<input name="phone" defaultValue={editing.contact === '—' ? '' : editing.contact} /></label><label>Email<input type="email" name="email" defaultValue={editing.email === '—' ? '' : editing.email} /></label><div className="modal-actions"><button type="button" className="btn secondary" onClick={() => setEditing(null)}>Anulează</button><button className="btn primary"><Check size={17} /> Salvează modificările</button></div></form></div>}
  </>;
}

export function QuotesPage({ quotes, onAdd, updateQuotes }) {
  const total = quotes.reduce((sum, quote) => sum + Number(quote.amount || 0), 0);
  const accepted = quotes.filter(quote => quote.status === 'Acceptată').length;
  const pending = quotes.filter(quote => quote.status === 'În așteptare').length;
  function setStatus(id, status) {
    updateQuotes(quotes.map(quote => quote.id === id ? { ...quote, status } : quote));
  }
  return <>
    <div className="page-heading"><div><h1>Devize</h1><p>Oferte și estimări pentru lucrările tale.</p></div><button className="btn primary" onClick={onAdd}><Plus size={18} /> Deviz nou</button></div>
    <div className="stats-grid mini-stats">
      <Stat title="Valoare propusă" value={money(total)} caption={`${quotes.length} devize înregistrate`} icon={FileText} />
      <Stat title="Acceptate" value={accepted} caption="devize confirmate" icon={Check} />
      <Stat title="În așteptare" value={pending} caption="așteaptă răspuns" icon={Clock3} />
      <Stat title="Convertite în lucrări" value={accepted} caption="devize acceptate" icon={BriefcaseBusiness} />
    </div>
    <section className="panel full-table-panel">
      <div className="panel-header quote-heading"><div><h2>Devize recente</h2><p>Ofertele trimise clienților</p></div><button className="btn secondary" onClick={onAdd}><Plus size={16} /> Deviz nou</button></div>
      <div className="table-wrap"><table><thead><tr><th>DEVIZ</th><th>CLIENT</th><th>DATA</th><th>STATUS</th><th>VALOARE</th><th /></tr></thead><tbody>
        {quotes.map(quote => <tr key={quote.id}><td><div className="job-name">{quote.id}<small>{quote.title}</small></div></td><td>{quote.client}</td><td className="date-cell">{quote.date}</td><td><select className="inline-status" aria-label={`Status ${quote.id}`} value={quote.status} onChange={e => setStatus(quote.id, e.target.value)}><option>În așteptare</option><option>Acceptată</option><option>Expirată</option></select></td><td className="amount-cell">{money(quote.amount)}</td><td><button className="row-more" title="Deviz"><MoreHorizontal size={18} /></button></td></tr>)}
      </tbody></table>{quotes.length === 0 && <div className="empty-state">Nu există devize. Creează primul deviz pentru a începe.</div>}</div>
    </section>
  </>;
}

export function ExpensesPage({ expenses, onAdd, updateExpenses }) {
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const unpaid = expenses.filter(expense => expense.status === 'În așteptare').reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const materials = expenses.filter(expense => /material|consumabil/i.test(expense.category)).reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  function setStatus(id, status) {
    updateExpenses(expenses.map(expense => expense.id === id ? { ...expense, status } : expense));
  }
  function exportCsv() {
    const csv = [['Categorie', 'Furnizor', 'Data', 'Status', 'Valoare'], ...expenses.map(item => [item.category, item.vendor, item.date, item.status, item.amount])].map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'promanager-cheltuieli.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }
  return <>
    <div className="page-heading"><div><h1>Cheltuieli</h1><p>Urmărește costurile și păstrează controlul asupra profitului.</p></div><button className="btn primary" onClick={onAdd}><Plus size={18} /> Cheltuială nouă</button></div>
    <div className="stats-grid mini-stats">
      <Stat title="Cheltuieli înregistrate" value={money(total)} caption="total în listă" icon={Wallet} />
      <Stat title="Cheltuieli în așteptare" value={money(unpaid)} caption="neachitate" icon={Clock3} />
      <Stat title="Materiale și consumabile" value={money(materials)} caption="din total cheltuieli" icon={Wrench} />
      <Stat title="Înregistrări" value={expenses.length} caption="cheltuieli în listă" icon={FileText} />
    </div>
    <section className="panel full-table-panel">
      <div className="panel-header quote-heading"><div><h2>Cheltuieli recente</h2><p>Costurile înregistrate de companie</p></div><button className="btn secondary" onClick={exportCsv}><Download size={16} /> Exportă</button></div>
      <div className="table-wrap"><table><thead><tr><th>CATEGORIE</th><th>FURNIZOR</th><th>DATA</th><th>STATUS</th><th>VALOARE</th><th /></tr></thead><tbody>
        {expenses.map(expense => <tr key={expense.id}><td><div className="job-name">{expense.category}<small>{expense.id}</small></div></td><td>{expense.vendor}</td><td className="date-cell">{expense.date}</td><td><select className="inline-status" aria-label={`Status ${expense.id}`} value={expense.status} onChange={e => setStatus(expense.id, e.target.value)}><option>Achitată</option><option>În așteptare</option></select></td><td className="amount-cell">{money(expense.amount)}</td><td><button className="row-more" title="Cheltuială"><MoreHorizontal size={18} /></button></td></tr>)}
      </tbody></table>{expenses.length === 0 && <div className="empty-state">Nu există cheltuieli. Înregistrează prima cheltuială.</div>}</div>
    </section>
  </>;
}
