// teacher-studio is the same service as academy under a second name (the Academy
// app falls back to it when academy answers 404/405). academy only calls serve()
// when it is the entry module (`if (import.meta.main)`), so importing it for its
// side effects starts no server; this entry serves the exported handler itself.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleAcademyRequest } from "../academy/index.ts";

serve(handleAcademyRequest);
