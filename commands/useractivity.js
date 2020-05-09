const wait = require('util').promisify(setTimeout);
const ExcelJS = require('exceljs');
// const path = require('path');
/* global BigInt */

module.exports = {
  name: 'useractivity',
  description: 'Caches last active times for users in the channel, and sends an xls file to the command user.',
  usage: '',
  cooldown: 0,
  guildOnly: true,
  staffOnly: true,
  args: false,
  async execute(msg, args, client) {
    if (global.currentlyCaching == 1) {return msg.channel.send('Sorry! I\'m busy with someone else\'s request. Please try again in a few minutes.'); }
    global.currentlyCaching = 1;
    msg.author.send('Please wait a moment while I cache user data...');
    const now = new Date();
    const fakeMsgIdNow = (BigInt(now) - BigInt(1420070400000)) << BigInt(22);
    const usrMap = new Map;
    for (let g of await client.guilds.cache) {
      g = g[1];
      const currentGuildUsrs = await g.members.cache;
      for (let gc of g.channels.cache) {
        gc = gc[1];
        if (gc.type === 'text' && gc.permissionsFor(g.me).has(['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY'])) {
          // console.log(gc.name);
          let oldestSeenMessage = fakeMsgIdNow;
          let prevLastSeen;
          let oldestMsg = fakeMsgIdNow;
          // fetch messages repeatedly, looping until the channels's last message ID matches our last message ID.
          while (prevLastSeen != oldestSeenMessage) {
            prevLastSeen = oldestSeenMessage;
            await gc.messages.fetch({ limit: 100, before: oldestSeenMessage }).then(messages => {
              if (messages.size > 0) {
                for (let message of messages) {
                  message = message[1];
                  // if the usrmap doesn't have the author at all, add them with value = message ID, so long as they are still currently in the guild
                  if (!usrMap.has(message.author.id) && !message.author.bot && currentGuildUsrs.has(message.author.id)) {usrMap.set(message.author.id, message.id);}
                  // if the usrmap has the author and the msgID stored is less than (older than) the one we're looking at, replace it.
                  if (!message.author.bot && (usrMap.get(message.author.id) < message.id)) {usrMap.set(message.author.id, message.id);}
                  if (message.id < oldestMsg) {oldestMsg = message.id;}
                }
              }
            });
            oldestSeenMessage = oldestMsg;
            await wait(200);
          }
        }
      }
    }
    for (let g of await client.guilds.cache) {
      g = g[1];
      for (let m of await g.members.cache) {
        m = m[1];
        if (!usrMap.has(m.id) && !m.user.bot) {
          usrMap.set(m.id, 0);
        }
      }
    }

    const xlsUsrList = new ExcelJS.Workbook;
    const listSheet = xlsUsrList.addWorksheet('User List');
    const colHeaders = ['username', 'lastSeen'];
    const colData = [];
    colHeaders.forEach(hdr => {
      colData.push({ header: hdr, key: hdr, width: 9 });
    });
    listSheet.columns = colData;
    // const data = [];
    for (const usr of usrMap) {
      const usrObj = await client.users.fetch(usr[0]);
      let datelastactive = 'N/A';
      if (usr[1] != 0) {
        const msgUnixDate = (BigInt(usr[1]) >> BigInt(22)) + BigInt(1420070400000);
        // const dateoptions = { timeZone: 'America/Los_Angeles', timeZoneName: 'short', hour: '2-digit', minute: '2-digit', hour12: false };
        datelastactive = new Date(Number(msgUnixDate));
        // data.push(`${usrObj.tag} last message: ${datelastactive.toLocaleString('en-US', dateoptions)}`);
      }
      listSheet.addRow({ username: usrObj.tag, lastSeen: datelastactive });
    }
    await xlsUsrList.xlsx.writeFile('./usrs.xlsx');
    // await wait(200);
    msg.author.send({ files: ['./usrs.xlsx'] });
    // msg.channel.send(data.join('\n'));
    global.currentlyCaching = 0;
  },
};