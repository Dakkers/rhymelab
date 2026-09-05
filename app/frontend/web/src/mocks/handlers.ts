/**
 * MSW request handlers for the browser worker. A single catch-all over the oRPC
 * endpoint hands each request to `dispatchMock`; anything it doesn't recognise
 * passes through to the real network. Kept apart from `./router` so the router
 * (and the SSR link that shares it) never pulls in `msw`.
 */
import { http, passthrough } from "msw";
import { API_URL, dispatchMock } from "./router";

export const handlers = [
  http.all(`${API_URL}/*`, async ({ request }) => {
    const response = await dispatchMock(request as unknown as Request);
    return response ?? passthrough();
  }),
];
