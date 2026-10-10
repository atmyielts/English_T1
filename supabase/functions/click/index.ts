import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { handleClickRequest } from "./handler.ts";

serve(handleClickRequest);
