import dgram from 'dgram';

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
    return { ...player, isSteam: true, steamId, avatar: DEFAULT_STEAM_AVATAR };
  }
  return { ...player, isSteam: Boolean(player.isSteam) };
}

function readCString(buf, offset) {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) end++;
  return { str: buf.toString('utf8', offset, end), next: end + 1 };
}

function querySourceServer(host, port, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4');
    let settled = false;
    let infoData = null;

    const done = (err, res) => {
      if (settled) return;
      settled = true;
      try { socket.close(); } catch (_) {}
      if (err) reject(err);
      else resolve(res);
    };

    const timer = setTimeout(() => done(new Error('timeout')), timeoutMs);

    const infoReq = Buffer.concat([
      Buffer.from([0xff, 0xff, 0xff, 0xff, 0x54]),
      Buffer.from('Source Engine Query\0', 'ascii')
    ]);

    const sendPlayersReq = (challengeBuf = Buffer.from([0xff, 0xff, 0xff, 0xff])) => {
      const pkt = Buffer.concat([Buffer.from([0xff, 0xff, 0xff, 0xff, 0x55]), challengeBuf]);
      socket.send(pkt, port, host);
    };

    socket.on('message', (msg) => {
      if (msg.length < 5) return;
      const type = msg[4];

      if (type === 0x41) {
        const challenge = msg.subarray(5, 9);
        if (!infoData) {
          socket.send(Buffer.concat([infoReq, challenge]), port, host);
        } else {
          sendPlayersReq(challenge);
        }
        return;
      }

      if (type === 0x49) {
        let offset = 6;
        const nameRes = readCString(msg, offset); offset = nameRes.next;
        const mapRes = readCString(msg, offset); offset = mapRes.next;
        const folderRes = readCString(msg, offset); offset = folderRes.next;
        const gameRes = readCString(msg, offset); offset = gameRes.next;
        offset += 2;
        const numplayers = msg[offset] || 0;
        const maxplayers = msg[offset + 1] || 32;
        infoData = { map: mapRes.str || 'de_dust2', numplayers, maxplayers };
        sendPlayersReq();
        return;
      }

      if (type === 0x44) {
        const count = msg[5] || 0;
        let offset = 6;
        const players = [];
        for (let i = 0; i < count && offset < msg.length; i++) {
          offset += 1;
          const pName = readCString(msg, offset);
          offset = pName.next;
          if (offset + 8 > msg.length) break;
          const score = msg.readInt32LE(offset);
          const duration = msg.readFloatLE(offset + 4);
          offset += 8;
          if (pName.str.trim()) {
            const formatted = formatSecs(duration);
            players.push(enrichSteam({
              name: pName.str.trim(),
              score,
              frags: score,
              kills: score,
              time: formatted,
              duration: formatted
            }));
          }
        }
        players.sort((a, b) => b.score - a.score);
        clearTimeout(timer);
        done(null, {
          online: true,
          map: infoData?.map || 'de_dust2',
          numplayers: players.length || infoData?.numplayers || 0,
          playersCount: players.length || infoData?.numplayers || 0,
          maxplayers: infoData?.maxplayers || 32,
          players
        });
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      done(err);
    });

    socket.send(infoReq, port, host);
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  let serverState = {
    online: false,
    map: 'de_dust2',
    numplayers: 0,
    playersCount: 0,
    maxplayers: 32,
    players: []
  };

  try {
    serverState = await querySourceServer('82.47.171.126', 27015, 3000);
  } catch (_) {}

  const topPlayers = FALLBACK_TOP15.map(enrichSteam);

  return res.status(200).json({
    ...serverState,
    topPlayers,
    top15: topPlayers,
    updatedAt: new Date().toISOString()
  });
}
