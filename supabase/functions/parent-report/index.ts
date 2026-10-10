import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createParentReportHandler } from "./handler.ts";

serve(createParentReportHandler());
