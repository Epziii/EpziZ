import { configDotenv } from "dotenv";

configDotenv({
  path: "./config.env",
  quiet: true,
});
export default {
  prefix: ["!", "."],
  botName: "EpziZ",
  OwnerName: "Epzi",
  ownerNumber: "94764998808",
  ownerEmail: "yurensasanka0@gmail.com",
  ownerGithub: "https://github.com/Epziii",
  telegramChannel: "https://t.me/EpziVerse",
  telegramGroup: "https://t.me/+hmw3mLs1YFhlNjhl",
  website: "https://ck-tours.top",
  reactEmoji: "✨",
  aza: { bank: process.env.BANK_NAME, number: process.env.BANK_NUMBER, AccName: process.env.BANK_ACCOUNT_NAME },
};
