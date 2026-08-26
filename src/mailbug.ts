import { inngest } from "./client.ts";

export default inngest.createFunction(
  {
    id: "import-product-images",
    triggers: { event: "shop/product.imported" },
  },
  async ({ event, step, runId }) => {
    // Your function code
  }
);

await inngest.send({
  // Use an id specific to the event type & payload
  id: "cart-checkout-completed-ed12c8bde",
  name: "storefront/cart.checkout.completed",
  data: { cartId: "ed12c8bde" },
  // user: { external_id: "6463da8211cdbbcb191dd7da" },
  ts: Date.now(),
  // v: "2024-05-15.1"
});
