# Specification

Mailbug is a system that organizes your email while you sleep. It polls from your IMAP email server periodically, recognizes new emails, and sends them through an inngest pipeline which classifies each email according to a provided json spec and outputs a json blob which is processed to create a web dashboard. 

The backend should use sqlite and typescript (via kysely), and read an incoming stream of json files structured like:

{ 
    category: "marketing"
    priority: 1
    actions: [
        { "ntfy": "NEW MARKETING EMAIL" }
    ]
}

and store them in tables which can be sorted by categories, senders and topics. 

These should be served to a dashboard frontend via a "statistics" api to generate a dashboard of emails

# Parts of the system

- [ ] Mail ingestion cron job (via inngest), calls an LLM via configuration file describing which actions are available and which categories / priorities to use.
  - [ ] Validating outputs of llm agents as valid json and conforming to json spec
- [ ] Backend code serving APIs for the mail overviews / dashboard. 
- [ ] Actions engine which uses inngest to trigger functions like "add to calendar", "remind me in N days", "webhook"
