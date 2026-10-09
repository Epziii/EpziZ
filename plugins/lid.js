export default {
  name: "lid",
  description: "Get the LID of a user",
  category: "Dev",
  usage: "lid",
  execute: async (sock, msg, args, mellow = {}) => {
    const { chatID, chatIDisGroup } = mellow;
    if (chatIDisGroup) {
      return sock.sendMessage(chatID, {
        text: chatID,
      });
    } else {
      await sock.sendMessage(chatID, { text: chatID });
    }
  },
};
