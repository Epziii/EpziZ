export default {
  name: "repo",
  description: "Get the repository link of the bot",
  category: "Bot",
  usage: "repo",
  execute: async (sock, msg, args) => {
    const remoteJid = msg.key.remoteJid;
    const repoUrl = process.env.REPO_URL || "https://github.com/Epziii/EpziZ.git";
    const link = `Repo link: ${repoUrl}\n\nDon't forget to give a star to the repo`;
    await sock.sendMessage(remoteJid, {
      text: link,
      contextInfo: {
        externalAdReply: {
          title: "EpziZ",
          thumbnailUrl: process.env.BOT_THUMBNAIL || "https://i.ibb.co/fVJQHczm/siGOdOA.jpg",
          sourceUrl: repoUrl,
          mediaType: 1,
          renderLargerThumbnail: true,
        },
      },
    });
  },
};
