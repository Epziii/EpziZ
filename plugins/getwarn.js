import { getWarns, isSenderAdmin } from "../lib/index.js";
import normaliseJidToPN from "../lib/normaliseJidToPN.js";

export default {
  name: "getwarn",
  description: "Get the number of warnings a user has",
  category: "Group",
  usage: ".getwarn @user",
  execute: async (sock, msg, args, mellow = {}) => {
    const { chatID, chatIDisGroup, senderID, ctxInfo } = mellow;
    if (!chatIDisGroup) {
      return sock.sendMessage(chatID, {
        text: "This command only works in groups.",
      });
    }
    const isAdmin = await isSenderAdmin(sock, senderID, chatID);
    if (!isAdmin) {
      return sock.sendMessage(chatID, { text: "You are not an admin." });
    }
    let targetJid = ctxInfo?.participant || ctxInfo?.mentionedJid?.[0];
    if (!targetJid) {
      return sock.sendMessage(chatID, {
        text: "Please mention or reply to a user to get their warnings.",
      });
    }
    targetJid = (await normaliseJidToPN(sock, targetJid)) + "@s.whatsapp.net";
    const warnCount = await getWarns(chatID, targetJid);
    if (!warnCount) {
      return sock.sendMessage(chatID, { text: `@${targetJid.split("@")[0]} has no warnings.`, mentions: [targetJid] });
    }
    return sock.sendMessage(chatID, {
      text: `Warning count for @${targetJid.split("@")[0]}: ${warnCount}`,
      mentions: [targetJid],
    });
  },
};
