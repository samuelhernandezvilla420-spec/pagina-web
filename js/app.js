const leagues = [
  { id: 'eng.1', providerId: 47, name: 'Premier League', badge: 'PL' },
  { id: 'esp.1', providerId: 87, name: 'LaLiga', badge: 'LL' },
  { id: 'ita.1', providerId: 55, name: 'Serie A', badge: 'SA' },
  { id: 'ger.1', providerId: 54, name: 'Bundesliga', badge: 'BL' },
  { id: 'fra.1', providerId: 53, name: 'Ligue 1', badge: 'L1' },
  { id: 'uefa.champions', providerId: 42, name: 'Champions League', badge: 'CL' },
  { id: 'uefa.europa', providerId: 73, name: 'Europa League', badge: 'EL' },
  { id: 'mex.1', providerId: 230, name: 'Liga MX', badge: 'MX' },
  { id: 'bra.1', providerId: 268, name: 'Brasileirão', badge: 'BR' },
  { id: 'arg.1', providerId: 112, name: 'Primera Argentina', badge: 'AR' },
  { id: 'usa.1', providerId: 130, name: 'MLS', badge: 'MLS' },
];

const state = { date: new Date(), league: 'all', filter: 'all', matches: [], favorites: new Set(), isLoading: false, standingsLeague: leagues[0].id };
try { state.favorites = new Set(JSON.parse(localStorage.getItem('football-favorites') || '[]')); } catch { state.favorites = new Set(); }

const feed = document.querySelector('#match-feed');
const message = document.querySelector('#feed-message');
const dateLabel = document.querySelector('#date-label');
const updateLabel = document.querySelector('#last-update');
const playersList = document.querySelector('#players-list');
const standingsSelect = document.querySelector('#standings-league');
const standingsBody = document.querySelector('#standings-body');
const standingsStatus = document.querySelector('#standings-status');
const dateFormatter = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
let standingsRequestId = 0;

leagues.forEach((league) => {
  const option = makeElement('option', '', league.name);
  option.value = league.id;
  standingsSelect.append(option);
});
standingsSelect.value = state.standingsLeague;

function dateKey(date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function makeElement(tag, className = '', text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

async function requestJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function setMessage(text = '') {
  message.textContent = text;
  message.classList.toggle('visible', Boolean(text));
}

function matchState(event) {
  const status = event.status || {};
  if (status.ongoing || (status.started && !status.finished)) return 'live';
  if (status.finished || status.cancelled) return 'finished';
  return 'upcoming';
}

function findLeague(group) {
  const names = normalize(`${group.name || ''} ${group.parentLeagueName || ''}`);
  const country = String(group.ccode || '').toUpperCase();
  if (/femenil|women|feminine/.test(names)) return null;
  const parentId = Number(group.parentLeagueId || group.id);
  const providerMatch = leagues.find((league) => league.providerId === parentId);
  if (providerMatch) return providerMatch;
  if (/champions league/.test(names)) return leagues.find((league) => league.id === 'uefa.champions');
  if (/europa league/.test(names)) return leagues.find((league) => league.id === 'uefa.europa');
  if (country === 'ENG' && /premier league/.test(names)) return leagues.find((league) => league.id === 'eng.1');
  if (/laliga|la liga/.test(names) || (country === 'ESP' && /primera/.test(names))) return leagues.find((league) => league.id === 'esp.1');
  if ((country === 'GER' || country === 'DEU') && /bundesliga/.test(names)) return leagues.find((league) => league.id === 'ger.1');
  if (country === 'FRA' && /ligue 1/.test(names)) return leagues.find((league) => league.id === 'fra.1');
  if (/liga mx/.test(names)) return leagues.find((league) => league.id === 'mex.1');
  if (/mls|major league soccer/.test(names)) return leagues.find((league) => league.id === 'usa.1');
  if (country === 'BRA' || /brasileirao|campeonato brasileiro/.test(names)) return leagues.find((league) => league.id === 'bra.1');
  if (country === 'ARG' || /primera argentina|liga profesional/.test(names)) return leagues.find((league) => league.id === 'arg.1');
  if (country === 'ITA' || (/serie a/.test(names) && country !== 'BRA')) return leagues.find((league) => league.id === 'ita.1');
  return null;
}

function teamName(competitor) {
  return competitor.team?.displayName || competitor.team?.shortDisplayName || competitor.longName || competitor.name || competitor.displayName || 'Por confirmar';
}

function renderTeam(competitor, winner, status) {
  const line = makeElement('div', `team-line${winner ? ' winner' : ''}`);
  const team = competitor.team || competitor;
  const logoUrl = team.logo || (team.id ? `https://images.fotmob.com/image_resources/logo/teamlogo/${team.id}.png` : '');
  if (logoUrl) {
    const logo = makeElement('img');
    logo.src = logoUrl;
    logo.alt = '';
    logo.loading = 'lazy';
    logo.onerror = () => logo.remove();
    line.append(logo);
  } else {
    line.append(makeElement('span', 'team-placeholder', (team.abbreviation || team.displayName?.[0] || team.name?.[0] || '?').slice(0, 2)));
  }
  line.append(makeElement('span', 'team-name', teamName(competitor)));
  if (status !== 'upcoming') line.append(makeElement('span', 'team-score', competitor.score ?? '0'));
  return line;
}

function renderMatch(event) {
  const home = event.home;
  const away = event.away;
  if (!home || !away) return null;
  const status = matchState(event);
  const row = makeElement('article', 'match-row');
  const statusElement = makeElement('div', `match-status status-${status}`);
  if (status === 'live') {
    statusElement.append(makeElement('span', '', event.status?.liveTime?.short?.replace(/[\u200e\u200f]/g, '') || 'EN VIVO'));
    statusElement.append(makeElement('span', 'live-time', 'EN VIVO'));
  } else if (status === 'finished') statusElement.append(makeElement('span', '', 'FINAL'));
  else {
    const start = event.status?.utcTime ? new Date(event.status.utcTime) : null;
    statusElement.append(makeElement('span', '', start ? new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false }).format(start) : '—'));
  }
  row.append(statusElement);
  const teams = makeElement('div', 'teams');
  const homeWon = status !== 'upcoming' && Number(home.score) > Number(away.score);
  const awayWon = status !== 'upcoming' && Number(away.score) > Number(home.score);
  teams.append(renderTeam(home, homeWon, status), renderTeam(away, awayWon, status));
  row.append(teams);
  const actions = makeElement('div', 'match-actions');
  const isFavorite = state.favorites.has(event.id);
  const favorite = makeElement('button', `favorite-button${isFavorite ? ' favorited' : ''}`, isFavorite ? '★' : '☆');
  favorite.type = 'button';
  favorite.setAttribute('aria-label', isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos');
  favorite.addEventListener('click', () => {
    if (state.favorites.has(event.id)) state.favorites.delete(event.id);
    else state.favorites.add(event.id);
    try { localStorage.setItem('football-favorites', JSON.stringify([...state.favorites])); } catch { /* Favoritos disponibles durante esta visita. */ }
    renderMatches();
  });
  actions.append(favorite);
  const link = makeElement('a', 'match-link', '›');
  link.href = `https://www.fotmob.com/matches/${encodeURIComponent(event.id)}`;
  link.target = '_blank';
  link.rel = 'noreferrer';
  link.setAttribute('aria-label', `Detalles de ${teamName(home)} contra ${teamName(away)} en FotMob`);
  actions.append(link);
  row.append(actions);
  return row;
}

function renderMatches() {
  feed.replaceChildren();
  const liveCount = state.matches.filter((match) => match.status === 'live').length;
  const liveIndicator = document.querySelector('#live-indicator');
  liveIndicator.classList.toggle('has-live', liveCount > 0);
  liveIndicator.querySelector('.live-copy').textContent = liveCount ? `${liveCount} EN VIVO` : 'MARCADORES';
  liveIndicator.querySelector('span:first-child').hidden = liveCount === 0;
  let visibleMatches = state.matches;
  if (state.league !== 'all') visibleMatches = visibleMatches.filter((match) => match.leagueId === state.league);
  if (state.filter === 'favorites') visibleMatches = visibleMatches.filter((match) => state.favorites.has(match.event.id));
  else if (state.filter !== 'all') visibleMatches = visibleMatches.filter((match) => match.status === state.filter);

  const grouped = new Map();
  visibleMatches.forEach((match) => {
    if (!grouped.has(match.leagueId)) grouped.set(match.leagueId, []);
    grouped.get(match.leagueId).push(match);
  });
  grouped.forEach((matches, leagueId) => {
    const league = leagues.find((item) => item.id === leagueId);
    const block = makeElement('section', 'league-block');
    const heading = makeElement('div', 'competition-heading');
    const label = makeElement('div', 'competition-name');
    label.append(makeElement('span', 'competition-badge', league?.badge || matches[0].leagueBadge || '⚽'));
    label.append(makeElement('span', '', league?.name || matches[0].leagueName));
    heading.append(label, makeElement('span', 'match-count', `${matches.length} ${matches.length === 1 ? 'partido' : 'partidos'}`));
    block.append(heading);
    matches.forEach(({ event }) => {
      const row = renderMatch(event);
      if (row) block.append(row);
    });
    feed.append(block);
  });

  if (feed.childElementCount === 0 && !state.isLoading && !message.classList.contains('visible')) {
    const empty = makeElement('div', 'empty-state');
    empty.append(makeElement('strong', '', state.filter === 'favorites' ? 'Aún no hay favoritos' : 'No hay partidos para mostrar'));
    empty.append(makeElement('span', '', state.filter === 'favorites' ? 'Marca una estrella junto a un partido para guardarlo aquí.' : 'Prueba otra fecha o competición. La programación depende del calendario oficial.'));
    feed.append(empty);
  }
}

async function loadScores() {
  if (state.isLoading) return;
  state.isLoading = true;
  feed.setAttribute('aria-busy', 'true');
  document.querySelector('#refresh-button').classList.add('refreshing');
  updateLabel.textContent = 'Actualizando marcadores…';
  setMessage('');
  const selectedDate = dateKey(state.date);
  try {
    const data = await requestJson(`/api/matches?date=${selectedDate}`);
    state.matches = (data.leagues || []).flatMap((group) => {
      const league = findLeague(group);
      const leagueName = league?.name || group.parentLeagueName || group.name || 'Otras competiciones';
      const leagueId = league?.id || `other:${group.id || leagueName}`;
      const leagueBadge = league?.badge || leagueName.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
      return (group.matches || []).map((event) => ({ event, leagueId, leagueName, leagueBadge, status: matchState(event), date: event.status?.utcTime || (event.timeTS ? new Date(event.timeTS).toISOString() : state.date.toISOString()) }));
    }).sort((first, second) => new Date(first.date) - new Date(second.date));
    setMessage('');
  } catch {
    state.matches = [];
    setMessage('No fue posible conectar con FotMob. Revisa tu conexión e inténtalo de nuevo.');
  }
  state.isLoading = false;
  feed.setAttribute('aria-busy', 'false');
  document.querySelector('#refresh-button').classList.remove('refreshing');
  updateLabel.textContent = `Actualizado ${new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(new Date())}`;
  renderMatches();
}

function playerFromLeader(leader, league) {
  const athlete = leader.participant || leader.player || leader.athlete || {};
  const team = leader.team || athlete.team || {};
  const stat = leader.value ?? leader.statValue ?? leader.goals ?? leader.stat?.value ?? '';
  const imageId = athlete.id || leader.playerId;
  const headshot = athlete.imageUrl || athlete.image || athlete.headshot || (imageId ? `https://images.fotmob.com/image_resources/playerImages/${imageId}.png` : '');
  const statText = String(stat);
  return { name: athlete.name || athlete.fullName || leader.playerName || leader.name || '', team: team.name || team.teamName || athlete.teamName || league.name, league: league.name, stat: statText, goals: Number.parseFloat(statText.replace(',', '.')) || 0, headshot };
}

async function loadPlayers() {
  playersList.setAttribute('aria-busy', 'true');
  const results = await Promise.allSettled(leagues.map(async (league) => {
    const data = await requestJson(`/api/leagues?id=${league.providerId}`);
    const scorerCategory = data.stats?.players?.find((category) => /top scorer|goal/i.test(category.header || ''));
    const scorerRows = scorerCategory?.topThree || [];
    return scorerRows.slice(0, 3).map((leader) => playerFromLeader(leader, league)).filter((player) => player.name);
  }));
  const topPlayers = results.filter((result) => result.status === 'fulfilled').flatMap((result) => result.value).sort((first, second) => second.goals - first.goals).filter((player, index, players) => players.findIndex((candidate) => candidate.name === player.name) === index).slice(0, 5);
  playersList.replaceChildren();
  if (!topPlayers.length) playersList.append(makeElement('div', 'player-loading', 'No se pudieron cargar los goleadores ahora.'));
  else topPlayers.forEach((player) => {
    const card = makeElement('article', 'player-card');
    const avatar = makeElement('div', 'player-avatar');
    if (player.headshot) {
      const image = makeElement('img');
      image.src = player.headshot;
      image.alt = '';
      image.loading = 'lazy';
      image.onerror = () => { image.remove(); avatar.textContent = player.name.slice(0, 1).toUpperCase(); };
      avatar.append(image);
    } else avatar.textContent = player.name.slice(0, 1).toUpperCase();
    const info = makeElement('div', 'player-info');
    info.append(makeElement('strong', '', player.name), makeElement('span', '', `${player.team} · ${player.league}`));
    const goals = makeElement('div', 'player-goals', player.stat || '0');
    goals.append(makeElement('span', '', 'GOLES'));
    card.append(avatar, info, goals);
    playersList.append(card);
  });
  playersList.setAttribute('aria-busy', 'false');
}

function getStandingsRows(data) {
  const groups = Array.isArray(data.table) ? data.table : Object.values(data.table || {});
  const selectedGroup = groups.find((group) => Array.isArray(group.data?.table?.all) && group.data.table.all.length);
  return selectedGroup?.data?.table?.all || [];
}

function renderStandings(rows) {
  standingsBody.replaceChildren();
  if (!rows.length) {
    const row = makeElement('tr');
    const cell = makeElement('td', 'standings-empty', 'No hay una tabla disponible para esta competición.');
    cell.colSpan = 10;
    row.append(cell);
    standingsBody.append(row);
    return;
  }
  rows.forEach((team) => {
    const row = makeElement('tr');
    const position = makeElement('td', 'standing-position', team.idx ?? '—');
    const teamCell = makeElement('td', 'standing-team');
    const logo = makeElement('img');
    logo.src = `https://images.fotmob.com/image_resources/logo/teamlogo/${team.id}.png`;
    logo.alt = '';
    logo.loading = 'lazy';
    logo.onerror = () => logo.remove();
    teamCell.append(logo, makeElement('span', '', team.shortName || team.name || 'Equipo'));
    const [goalsFor, goalsAgainst] = String(team.scoresStr || '0-0').split('-').map(Number);
    const cells = [team.played, team.wins, team.draws, team.losses, goalsFor, goalsAgainst, team.goalConDiff, team.pts];
    row.append(position, teamCell);
    cells.forEach((value, index) => row.append(makeElement('td', index === cells.length - 1 ? 'standing-points' : '', value ?? '—')));
    standingsBody.append(row);
  });
}

async function loadStandings() {
  const requestId = ++standingsRequestId;
  const league = leagues.find((item) => item.id === state.standingsLeague);
  if (!league) return;
  standingsStatus.textContent = `Cargando tabla de ${league.name}…`;
  standingsSelect.disabled = false;
  standingsBody.setAttribute('aria-busy', 'true');
  try {
    const data = await requestJson(`/api/leagues?id=${league.providerId}`);
    if (requestId !== standingsRequestId) return;
    const rows = getStandingsRows(data);
    renderStandings(rows);
    standingsStatus.textContent = rows.length ? `${league.name} · ${rows.length} equipos · temporada ${data.overview?.season?.name || data.details?.selectedSeason || ''}` : `No hay posiciones disponibles para ${league.name}.`;
  } catch {
    if (requestId !== standingsRequestId) return;
    renderStandings([]);
    standingsStatus.textContent = `No se pudo cargar la tabla de ${league.name}. Inténtalo de nuevo.`;
  }
  standingsBody.setAttribute('aria-busy', 'false');
}

function updateDate() {
  dateLabel.textContent = dateFormatter.format(state.date);
}

document.querySelectorAll('[data-league]').forEach((button) => button.addEventListener('click', () => {
  state.league = button.dataset.league;
  document.querySelectorAll('[data-league]').forEach((option) => option.classList.toggle('selected', option === button));
  if (state.league !== 'all') {
    state.standingsLeague = state.league;
    standingsSelect.value = state.league;
    loadStandings();
  }
  renderMatches();
  document.querySelector('#competiciones').classList.remove('mobile-open');
}));
document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
  state.filter = button.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach((option) => option.classList.toggle('active', option === button));
  renderMatches();
}));
document.querySelector('#previous-day').addEventListener('click', () => { state.date.setDate(state.date.getDate() - 1); updateDate(); loadScores(); });
document.querySelector('#next-day').addEventListener('click', () => { state.date.setDate(state.date.getDate() + 1); updateDate(); loadScores(); });
document.querySelector('#today-button').addEventListener('click', () => { state.date = new Date(); updateDate(); loadScores(); });
document.querySelector('#refresh-button').addEventListener('click', loadScores);
standingsSelect.addEventListener('change', () => {
  state.standingsLeague = standingsSelect.value;
  loadStandings();
});
document.querySelector('#standings-refresh').addEventListener('click', loadStandings);
document.querySelector('#mobile-filter-button').addEventListener('click', () => document.querySelector('#competiciones').classList.toggle('mobile-open'));

const gallery = document.querySelector('#gallery');
const gallerySlides = [...document.querySelectorAll('.gallery-slide')];
const galleryDots = [...document.querySelectorAll('.gallery-dot')];
const galleryCounter = document.querySelector('#gallery-counter');
const galleryAnnouncement = document.querySelector('#gallery-announcement');
let galleryIndex = 0;
let galleryTimer;
let galleryPointerStart = null;

function showGallerySlide(index) {
  galleryIndex = (index + gallerySlides.length) % gallerySlides.length;
  gallerySlides.forEach((slide, slideIndex) => {
    const active = slideIndex === galleryIndex;
    slide.hidden = !active;
    slide.classList.toggle('active', active);
    slide.setAttribute('aria-label', `${slideIndex + 1} de ${gallerySlides.length}`);
  });
  galleryDots.forEach((dot, dotIndex) => {
    const active = dotIndex === galleryIndex;
    dot.classList.toggle('active', active);
    if (active) dot.setAttribute('aria-current', 'true');
    else dot.removeAttribute('aria-current');
  });
  galleryCounter.innerHTML = `${String(galleryIndex + 1).padStart(2, '0')} <span>/ ${String(gallerySlides.length).padStart(2, '0')}</span>`;
  galleryAnnouncement.textContent = `Imagen ${galleryIndex + 1} de ${gallerySlides.length}: ${gallerySlides[galleryIndex].querySelector('h2').textContent}`;
}

function stopGallery() {
  window.clearInterval(galleryTimer);
}

function startGallery() {
  stopGallery();
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && !document.hidden) {
    galleryTimer = window.setInterval(() => showGallerySlide(galleryIndex + 1), 6000);
  }
}

document.querySelector('#gallery-previous').addEventListener('click', () => { showGallerySlide(galleryIndex - 1); startGallery(); });
document.querySelector('#gallery-next').addEventListener('click', () => { showGallerySlide(galleryIndex + 1); startGallery(); });
galleryDots.forEach((dot, index) => dot.addEventListener('click', () => { showGallerySlide(index); startGallery(); }));
gallery.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') { showGallerySlide(galleryIndex - 1); startGallery(); }
  if (event.key === 'ArrowRight') { showGallerySlide(galleryIndex + 1); startGallery(); }
});
gallery.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch') galleryPointerStart = event.clientX;
}, { passive: true });
gallery.addEventListener('pointerup', (event) => {
  if (galleryPointerStart === null) return;
  const distance = event.clientX - galleryPointerStart;
  if (Math.abs(distance) > 45) showGallerySlide(galleryIndex + (distance < 0 ? 1 : -1));
  galleryPointerStart = null;
  startGallery();
});
gallery.addEventListener('pointercancel', () => { galleryPointerStart = null; });
gallery.addEventListener('mouseenter', stopGallery);
gallery.addEventListener('mouseleave', startGallery);
gallery.addEventListener('focusin', stopGallery);
gallery.addEventListener('focusout', (event) => { if (!gallery.contains(event.relatedTarget)) startGallery(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stopGallery(); else startGallery(); });

updateDate();
loadScores();
loadPlayers();
loadStandings();
showGallerySlide(0);
startGallery();
window.setInterval(loadScores, 60_000);
window.setInterval(loadPlayers, 15 * 60_000);
window.setInterval(loadStandings, 15 * 60_000);