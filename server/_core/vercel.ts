import type { IncomingMessage, ServerResponse } from "http";
import { createApiApp } from "./index";

const app = createApiApp() as unknown as (
  req: IncomingMessage,
  res: ServerResponse
) => void;

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req, res);
}
