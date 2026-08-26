import { inngest } from "./inngest/client.ts";
import { serve } from "inngest/express";
import express from "express";

export const retrieveTextFile = inngest.createFunction(
  { id: "retrieveTextFile", triggers: { event: "textFile/retrieve" } },
  async ({ step }) => {
    // The fetching of the text file is offloaded to the Inngest Platform
    const response = await step.fetch(
      "https://webhook.site/77773948-ff0a-49d3-b0ea-d9617c84e641",
    );

    // The Inngest function run is resumed when the HTTP request is complete
    await step.run("extract-text", async () => {
      const text = await response.text();
      const exampleOccurences = text.match(/example/g);
      console.log("in the extract handler!");
      return exampleOccurences?.length;
    });
  },
);

const app = express();
const port = 3000;

// Required so the serve handler can read incoming JSON POST payloads
app.use(express.json());

// Registers the functions with Inngest — this is the endpoint the dev server polls
app.use("/api/inngest", serve({ client: inngest, functions: [retrieveTextFile] }));

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Trigger the event on demand, after the functions are registered
app.get("/send", async (req, res, next) => {
  await inngest
    .send({ name: "textFile/retrieve", ts: Date.now() })
    .catch(next);
  res.send("Event sent!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
