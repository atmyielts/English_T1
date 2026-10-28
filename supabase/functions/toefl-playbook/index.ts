import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createPlaybookHandler } from "../_shared/exam-playbook.ts";
import { productionDeps } from "../_shared/exam-playbook-runtime.ts";
import { TOEFL_PLAYBOOK_CONFIG } from "../_shared/toefl-playbook.ts";

serve(createPlaybookHandler(TOEFL_PLAYBOOK_CONFIG, productionDeps(TOEFL_PLAYBOOK_CONFIG)));
