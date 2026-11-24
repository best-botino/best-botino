import { GameDig } from 'gamedig';

let cachedResponse = null;

// حط هنا أسماء لاعبي Steam في سيرفرك (بحروف صغيرة) مع رقم SteamID64 الخاص بكل واحد
const STEAM_PLAYERS = {
  // مثال:
  // "helium": "76561198000000000",
  // "1st hokage": "76561198000000001"
};

const DEFAULT_STEAM_AVATAR =
  "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_medium.jpg";

// قائمة احتياطية من نفس بيانات السيرفر عند تعذّر الوصول المباشر إلى GameTracker من Vercel
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
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

async function enrichSteamPlayers(list) {
  return Promise.all(list.map(async (p) => {
    const key = (p.name || "").trim().toLowerCase();
    const steamId = STEAM_PLAYERS[key];
    if (!steamId) return p;

    const profileUrl = `https://steamcommunity.com/profiles/${steamId}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${profileUrl}/?xml=1`, { signal: controller.signal });
      clearTimeout(timer);

      const xml = await res.text();
      const avatarMatch = xml.match(/<avatarMedium><!\[CDATA\[(.*?)\]\]><\/avatarMedium>/i);

      return {
        ...p,
        isSteam: true,
        avatar: avatarMatch ? avatarMatch[1] : DEFAULT_STEAM_AVATAR,
        steamProfileUrl: profileUrl
      };
    } catch (_) {
      return {
        ...p,
        isSteam: true,
        avatar: DEFAULT_STEAM_AVATAR,
        steamProfileUrl: profileUrl
      };
    }
  }));
}

async function fetchGameTrackerData() {
  const result = {
    onlinePlayers: [],
    topPlayers: [],
    map: null,
    numplayers: 0,
    maxplayers: 32
  };

  const urls = [
    'https://www.gametracker.rs/server_info/82.47.171.126:27015',
    'https://www.gametracker.rs/server_players/82.47.171.126:27015'
  ];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);

      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      clearTimeout(timer);

      if (!res.ok) continue;
      const html = await res.text();
      if (!html) continue;

      // استخراج الخريطة وعدد اللاعبين من صفحة server_info إذا توفرت
      const mapMatch = html.match(/\b(de_[a-z0-9_]+|cs_[a-z0-9_]+|awp_[a-z0-9_]+|aim_[a-z0-9_]+|fy_[a-z0-9_]+)\b/i);
      if (mapMatch && !result.map) {
        result.map = mapMatch[1].toLowerCase();
      }

      const countMatch = html.match(/Players[\s\S]{0,120}?(\d+)\s*\/\s*(\d+)/i);
      if (countMatch) {
        result.numplayers = Number(countMatch[1]) || 0;
        result.maxplayers = Number(countMatch[2]) || 32;
      }

      const tables = html.match(/<table[\s\S]*?<\/table>/