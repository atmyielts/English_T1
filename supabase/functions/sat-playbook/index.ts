import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createPlaybookHandler } from "../_shared/exam-playbook.ts";
import { productionDeps } from "../_shared/exam-playbook-runtime.ts";
import { SAT_PLAYBOOK_CONFIG } from "../_shared/sat-playbook.ts";

serve(createPlaybookHandler(SAT_PLAYBOOK_CONFIG, productionDeps(SAT_PLAYBOOK_CONFIG)));
