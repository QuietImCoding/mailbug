import { inngest } from "./client.ts";
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

await inngest.send({
  // Use an id specific to the event type & payload
  id: `retrieveTextFile`,
  name: "textFile/retrieve",
  // user: { external_id: "6463da8211cdbbcb191dd7da" },
  ts: Date.now(),
  // v: "2024-05-15.1"
});

const app = express();
const port = 3000;

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, (err) => {
  if (err) {
    console.error(err);
    return;
  }
  console.log(`Example app listening on port ${port}`);
});
