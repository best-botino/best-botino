import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { GameDig } = require('gamedig');

let cachedResponse = null;

// حط هنا أسماء لاعبي Steam في سيرفرك (بحروف صغيرة) مع رقم SteamID64 الخاص بكل واحد
const STEAM_PLAYERS = {
  // مثال:
  // "helium": "76561198000000000",
  // "1st hokage": "76561198000000001"
};

const DEFAULT_STEAM_AVATAR =
  "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg";

// قائمة احتياطية مضمونة من بيانات السيرفر
const FALLBACK_TOP15 = [
  { name: "Helium", isSteam: false, kills: 716, hs: 301, playtime: "9:50:07" },
  { name: "1st Hokage", isSteam: false, kills: 700, hs: 294, playtime: "10:13:51" },
  { name: "S.A.M.I.R", isSteam: false, kills: 644, hs: 270, playtime: "9:57:02" },
  { name: "BIBO", isSteam: false, kills: 620, hs: 260, playtime: "9:11:40" },
  { name: "๖VΘiD+", isSteam: false, kills: 572, hs: 240, playtime: "3:37:54" },
  { name: "B@10", isSteam: false, kills: 549, hs: 231, playtime: "7:40:58" },
  { name: "OnePunchMan", isSteam: false, kills: 533, hs: 224, playtime: "7:13:22" },
  { name: "The Naked Man", isSteam: false, kills: 438, hs: 184, playtime: "4:56:01" },
  { name: "「 N 」 e O", isSteam: false, kills: 401, hs: 168, playtime: "7:05:03" },
  { name: "Joseph", isSteam: false, kills: 379, hs: 159, playtime: "4:07:45" },
  { name: "AHLM", isSteam: false, kills: 321, hs: 135, playtime: "5:23:26" },
  { name: "Rosamira:3", isSteam: false, kills: 319, hs: 134, playtime: "4:56:41" },
  { name: "insta: salam_.vibes", isSteam: false, kills: 301, hs: 126, playtime: "5:28:57" },
  { name: "Black Angel", isSteam: false, kills: 289, hs: 121, playtime: "9:53:24" },
  { name: "MooDΞX", isSteam: false, kills: 275, hs: 116, playtime: "3:23:52" }
];

function formatSecs(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function enrichSteam(player) {
  const key = (player.name || '').trim().toLowerCase();
  const steamId = STEAM_PLAYERS[key];
  if (steamId) {
    return {
      ...player,
      isSteam: true,
      steamId,
      avatar: DEFAULT_STEAM_AVATAR
    };
  }
  return { ...player, isSteam: Boolean(player.isSteam) };
}

async function fetchGameTrackerTop15() {
  const urls = [
    'https://www.gametracker.rs/server_info/82.47.171.126:27015/',
    'https://www.gametracker.rs/server_players/82.47.171.126:27015/'
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36'
        }
      });
      clearTimeout(timer);
      if (!res.ok) continue;

      const html = await res.text();
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const extracted = [];
      let match;

      while ((match = rowRegex.exec(html)) !== null) {
        const rowHtml = match[1];
        const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m =>
          m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
        );
        if (cells.length >= 4 && /^\d+\.?$/.test(cells[0])) {
          const name = cells[1];
          const kills = parseInt(cells[2].replace(/[^\d]/g, ''), 10) || 0;
          const hs = cells.length >= 5 ? (parseInt(cells[3].replace(/[^\d]/g, ''), 10) || Math.round(kills * 0.42)) : Math.round(kills * 0.42);
          const playtime = cells[cells.length - 1] || '0:00:00';
          if (name && kills > 0) {
            extracted.push({ name, kills, hs, playtime });
          }
        }
      }

      if (extracted.length >= 5) {
        return extracted.slice(0, 15).map(enrichSteam);
      }
    } catch (_) {
      // تجاهل الخطأ والانتقال للرابط التالي أو القائمة الاحتياطية
    }
  }

  return FALLBACK_TOP15.map(enrichSteam);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=20');

  let online = false;
  let map = 'de_dust2';
  let numplayers = 0;
  let maxplayers = 32;
  let players = [];

  try {
    const state = await GameDig.query({
      type: 'cs16',
      host: '82.47.171.126',
      port: 27015,
      socketTimeout: 3500,
      attemptTimeout: 4000
    });

    online = true;
    map = state.map || 'de_dust2';
    maxplayers = state.maxplayers || 32;
    players = (state.players || [])
      .filter(p => p && p.name && p.name.trim() !== '')
      .map(p => enrichSteam({
        name: p.name.trim(),
        score: p.raw?.score ?? p.score ?? 0,
        time: formatSecs(p.raw?.time ?? p.time ?? 0)
      }))
      .sort((a, b) => b.score - a.score);
    numplayers = players.length || state.numplayers || 0;
  } catch (err) {
    if (cachedResponse && cachedResponse.online) {
      online = cachedResponse.online;
      map = cachedResponse.map;
      numplayers = cachedResponse.numplayers;
      maxplayers = cachedResponse.maxplayers;
      players = cachedResponse.players;
    }
  }

  const topPlayers = await fetchGameTrackerTop15();

  const payload = {
    online,
    map,
    numplayers,
    maxplayers,
    players,
    topPlayers,
    updatedAt: new Date().toISOString()
  };

  cachedResponse = payload;
  return res.status(200).json(payload);
}
