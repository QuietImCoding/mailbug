import { Inngest } from "inngest";

const inngest = new Inngest({
  id: "mailbug",
  isDev: process.env.INNGEST_DEV === "1",
});

export { inngest };
