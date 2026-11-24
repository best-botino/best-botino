import dgram from 'dgram';

const SERVER_IP = '82.47.171.126';
const SERVER_PORT = 27015;

// جلب معلومات السيرفر (A2S_INFO)
function queryServerInfo(host, port, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');
    const timer = setTimeout(() => {
      try { client.close(); } catch {}
      reject(new Error('Timeout A2S_INFO'));
    }, timeout);

    const packet = Buffer.concat([
      Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0x54]),
      Buffer.from('Source Engine Query\0', 'ascii')
    ]);

    const sendPacket = (challenge = null) => {
      const msg = challenge ? Buffer.concat([packet, challenge]) : packet;
      client.send(msg, port, host);
    };

    client.on('message', (msg) => {
      if (msg.length < 5) return;
      const type = msg[4];

      // استجابة Challenge (0x41)
      if (type === 0x41 && msg.length >= 9) {
        sendPacket(msg.slice(5, 9));
        return;
      }

      // استجابة A2S_INFO (0x49)
      if (type === 0x49) {
        clearTimeout(timer);
        try { client.close(); } catch {}

        let offset = 6; // تخطي الترويسة + البروتوكول
        const readStr = () => {
          const end = msg.indexOf(0x00, offset);
          const str = msg.slice(offset, end).toString('utf8');
          offset = end + 1;
          return str;
        };

        const name = readStr();
        const map = readStr();
        readStr(); // folder
        readStr(); // game
        offset += 2; // appId
        const players = msg[offset++];
        const maxPlayers = msg[offset++];

        resolve({ online: true, name, map, players, maxPlayers });
      }
    });

    client.on('error', (err) => {
      clearTimeout(timer);
      try { client.close(); } catch {}
      reject(err);
    });

    sendPacket();
  });
}

// جلب قائمة اللاعبين المتصلين (A2S_PLAYER)
function queryPlayers(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const client = dgram.createSocket('udp4');
    const timer = setTimeout(() => {
      try { client.close(); } catch {}
      resolve([]);
    }, timeout);

    const requestChallenge = Buffer.from([
      0xFF, 0xFF, 0xFF, 0xFF, 0x55, 0xFF, 0xFF, 0xFF, 0xFF
    ]);

    client.on('message', (msg) => {
      if (msg.length < 5) return;
      const type = msg[4];

      if (type === 0x41 && msg.length >= 9) {
        const query = Buffer.concat([
          Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0x55]),
          msg.slice(5, 9)
        ]);
        client.send(query, port, host);
        return;
      }

      if (type === 0x44) {
        clearTimeout(timer);
        try { client.close(); } catch {}

        const count = msg[5];
        let offset = 6;
        const list = [];

        for (let i = 0; i < count && offset < msg.length; i++) {
          offset += 1; // index
          const end = msg.indexOf(0x00, offset);
          if (end === -1) break;
          const name = msg.slice(offset, end).toString('utf8') || 'Player';
          offset = end + 1;
          if (offset + 8 > msg.length) break;

          const score = msg.readInt32LE(offset);
          offset += 4;
          const duration = Math.floor(msg.readFloatLE(offset));
          offset += 4;

          const mins = Math.floor(duration / 60);
          const secs = duration % 60;
          const timeFormatted = `${mins}m ${secs}s`;

          list.push({
            rank: i + 1,
            name,
            score,
            frags: score,
            kills: score,
            duration,
            time: timeFormatted
          });
        }

        list.sort((a, b) => b.score - a.score);
        resolve(list);
      }
    });

    client.on('error', () => {
      clearTimeout(timer);
      try { client.close(); } catch {}
      resolve([]);
    });

    client.send(requestChallenge, port, host);
  });
}

// قائمة Top 15 (يمكنك تعديل الأسماء والأرقام كما تشاء)
const TOP_15_PLAYERS = [
  { rank: 1, name: "Botino | King", kills: 1420, hs: "48%", time: "42h 15m" },
  { rank: 2, name: "DZ_Sniper", kills: 1185, hs: "52%", time: "36h 40m" },
  { rank: 3, name: "HeadHunter", kills: 980, hs: "61%", time: "29h 10m" },
  { rank: 4, name: "Algiers_Pro", kills: 875, hs: "44%", time: "25h 50m" },
  { rank: 5, name: "Shadow_16", kills: 760, hs: "39%", time: "22h 05m" }
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=5');

  try {
    const [info, playersList] = await Promise.all([
      queryServerInfo(SERVER_IP, SERVER_PORT),
      queryPlayers(SERVER_IP, SERVER_PORT)
    ]);

    return res.status(200).json({
      online: true,
      ip: `${SERVER_IP}:${SERVER_PORT}`,
      map: info.map || 'de_dust2',
      playersCount: info.players ?? playersList.length,
      maxPlayers: info.maxPlayers || 32,
      players: playersList,
      top15: TOP_15_PLAYERS
    });
  } catch (error) {
    return res.status(200).json({
      online: false,
      ip: `${SERVER_IP}:${SERVER_PORT}`,
      map: 'de_dust2',
      playersCount: 0,
      maxPlayers: 32,
      players: [],
      top15: TOP_15_PLAYERS
    });
  }
}
