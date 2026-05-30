import type { IncomingMessage, ServerResponse } from "http";
import { createApiApp } from "../server/_core/index";

const app = createApiApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return app(req, res);
}
