const HTTPS = require('https');

const SERVER_IP = '82.47.171.126';
const SERVER_PORT = '27015';

const STEAM_PLAYERS = {
  // ضع هنا أسماء لاعبي Steam بحروف صغيرة مع SteamID64
  // "helium": "76561198000000000"
};

const DEFAULT_STEAM_AVATAR =
  "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg";

const FALLBACK_TOP15 = [
  { rank: 1, name: "Helium", isSteam: false, kills: 716, hs: 301, playtime: "9:50:07", time: "9:50:07" },
  { rank: 2, name: "1st Hokage", isSteam: false, kills: 700, hs: 294, playtime: "10:13:51", time: "10:13:51" },
  { rank: 3, name: "S.A.M.I.R", isSteam: false, kills: 644, hs: 270, playtime: "9:57:02", time: "9:57:02" },
  { rank: 4, name: "BIBO", isSteam: false, kills: 620, hs: 260, playtime: "9:11:40", time: "9:11:40" },
  { rank: 5, name: "๖VΘiD+", isSteam: false, kills: 572, hs: 240, playtime: "3:37:54", time: "3:37:54" },
  { rank: 6, name: "B@10", isSteam: false, kills: 549, hs: 231, playtime: "7:40:58", time: "7:40:58" },
  { rank: 7, name: "OnePunchMan", isSteam: false, kills: 533, hs: 224, playtime: "7:13:22", time: "7:13:22" },
  { rank: 8, name: "The Naked Man", isSteam: false, kills: 438, hs: 184, playtime: "4:56:01", time: "4:56:01" },
  { rank: 9, name: "「 N 」 e O", isSteam: false, kills: 401, hs: 168, playtime: "7:05:03", time: "7:05:03" },
  { rank: 10, name: "Joseph", isSteam: false, kills: 379, hs: 159, playtime: "4:07:45", time: "4:07:45" },
  { rank: 11, name: "AHLM", isSteam: false, kills: 321, hs: 135, playtime: "5:23:26", time: "5:23:26" },
  { rank: 12, name: "Rosamira:3", isSteam: false, kills: 319, hs: 134, playtime: "4:56:41", time: "4:56:41" },
  { rank: 13, name: "insta: salam_.vibes", isSteam: false, kills: 301, hs: 126, playtime: "5:28:57", time: "5:28:57" },
  { rank: 14, name: "Black Angel", isSteam: false, kills: 289, hs: 121, playtime: "9:53:24", time: "9:53:24" },
  { rank: 15, name: "MooDΞX", isSteam: false, kills: 275, hs: 116, playtime: "3:23:52", time: "3:23:52" }
];

function enrichSteam(player) {
  const key = (player.name || '').trim().toLowerCase();
  const steamId = STEAM_PLAYERS[key];
  if (steamId) {
    return { ...player, isSteam: true, steamId, avatar: DEFAULT_STEAM_AVATAR };
  }
  return { ...player, isSteam: Boolean(player.isSteam) };
}

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const req = HTTPS.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      },
      timeout: 4500
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const nextUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : `https://www.gametracker.com${res.headers.location}`;
        return resolve(fetchPage(nextUrl));
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('GT Timeout')); });
  });
}

function stripTags(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

function parseGameTracker(html) {
  // 1. عدد اللاعبين والخريطة
  const playersMatch = html.match(/(\d+)\s*\/\s*(\d+)\s*(?:Players|players)?/i);
  const numplayers = playersMatch ? parseInt(playersMatch[1], 10) : 0;
  const maxplayers = playersMatch ? parseInt(playersMatch[2], 10) : 32;

  const mapMatch = html.match(/Current Map:\s*<\/[^>]+>\s*<[^>]+>([^<]+)/i) ||
                   html.match(/map_([a-zA-Z0-9_-]+)\.jpg/i);
  const map = mapMatch ? mapMatch[1].trim() : 'de_dust2';

  // 2. استخراج جدول اللاعبين المتصلين وجدول Top 15 من الجداول
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  let onlinePlayers = [];
  let topPlayers = [];

  for (const table of tables) {
    const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    if (rows.length < 2) continue;

    const headerText = stripTags(rows[0]).toLowerCase();

    // جدول اللاعبين المتصلين (يحتوي على Name و Score و Time)
    if (headerText.includes('name') && headerText.includes('score') && headerText.includes('time') && !headerText.includes('rank')) {
      for (let i = 1; i < rows.length; i++) {
        const cols = (rows[i].match(/<td[\s\S]*?<\/td>/gi) || []).map(stripTags);
        if (cols.length >= 3 && cols[0] && !cols[0].toLowerCase().includes('no players')) {
          const score = parseInt(cols[1], 10) || 0;
          onlinePlayers.push(enrichSteam({
            rank: onlinePlayers.length + 1,
            name: cols[0],
            score,
            frags: score,
            kills: score,
            time: cols[2] || '0:00:00',
            duration: cols[2] || '0:00:00'
          }));
        }
      }
    }

    // جدول Top Players في GameTracker (يحتوي على Rank و Name و Score/Time)
    if (headerText.includes('rank') && headerText.includes('name')) {
      for (let i = 1; i < rows.length && topPlayers.length < 15; i++) {
        const cols = (rows[i].match(/<td[\s\S]*?<\/td>/gi) || []).map(stripTags);
        if (cols.length >= 4 && cols[1]) {
          const kills = parseInt(cols[2].replace(/,/g, ''), 10) || 0;
          const timeStr = cols[3] || '0:00:00';
          topPlayers.push(enrichSteam({
            rank: parseInt(cols[0].replace(/\D/g, ''), 10) || (topPlayers.length + 1),
            name: cols[1],
            kills,
            hs: Math.round(kills * 0.42),
            playtime: timeStr,
            time: timeStr
          }));
        }
      }
    }
  }

  return {
    online: true,
    map,
    numplayers: onlinePlayers.length || numplayers,
    playersCount: onlinePlayers.length || numplayers,
    maxplayers,
    players: onlinePlayers,
    topPlayers
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=10');

  let result = {
    online: true,
    map: 'de_dust2',
    numplayers: 0,
    playersCount: 0,
    maxplayers: 32,
    players: [],
    topPlayers: []
  };

  try {
    const gtUrl = `https://www.gametracker.com/server_info/${SERVER_IP}:${SERVER_PORT}/`;
    const html = await fetchPage(gtUrl);
    result = parseGameTracker(html);
  } catch (_) {}

  const finalTop15 = (result.topPlayers && result.topPlayers.length > 0)
    ? result.topPlayers
    : FALLBACK_TOP15.map(enrichSteam);

  return res.status(200).json({
    online: result.online,
    map: result.map,
    numplayers: result.numplayers,
    playersCount: result.playersCount,
    maxplayers: result.maxplayers,
    players: result.players,
    topPlayers: finalTop15,
    top15: finalTop15,
    updatedAt: new Date().toISOString()
  });
};
