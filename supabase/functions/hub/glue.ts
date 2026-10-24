// The routes that tie Schood English together across skills and devices:
// the journey timeline, the in-app inbox, content search and "continue
// anywhere". One dispatch for hub/index.ts; each lives in its own module.
import { handleInboxRoute } from "./inbox.ts";
import { handleJourneyRoute } from "./journey.ts";
import { handleResumeRoute } from "./resume.ts";
import { handleSearchRoute } from "./search.ts";

export type GlueCtx = {
  sb: any;
  req: Request;
  url: URL;
  route: string;
  userId: string;
  languageId: string;
  products: Record<string, { productId?: string | null }>;
};

const GLUE_ROUTE = /^\/(journey|inbox|search|resume)(\/|$)/;

/** Handles /journey, /inbox*, /search and /resume*; null for any other route. */
export const handleGlueRoute = async (ctx: GlueCtx): Promise<Response | null> => {
  if (!GLUE_ROUTE.test(ctx.route)) return null;
  return await handleJourneyRoute(ctx)
    ?? await handleInboxRoute(ctx)
    ?? await handleSearchRoute(ctx)
    ?? await handleResumeRoute(ctx);
};
