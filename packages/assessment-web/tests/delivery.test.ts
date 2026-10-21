import { assertDeliveryReady } from "../src/delivery.ts";
import {IMAGE_RESPONSE_PROTOCOL} from '../../assessment-core/src/image-response.ts';
const requirement = {
  schema_version: "assessment.delivery-requirements.v1",
  prompt_media: ["image", "audio", "video"],
  response_tools: [],
  prompt_media_enabled: true,
};
const setup = {
  mediaUrl: "https://media.schood.online",
  pageUrl: "https://exam.schood.online",
  sharedCookie: true,
  cookieDomain: ".schood.online",
};
Deno.test('academic media requires the enabled protocol, protected topology and each capture-only format group before starting',()=>{
 const required={...requirement,prompt_media:[],media_response_tools:['audio_response','video_response'],media_responses_enabled:true,media_response_protocol:'assessment.media-delivery.v2',media_capture_groups:[{type:'video_response',mimes:['video/webm']},{type:'audio_response',mimes:['audio/webm','audio/mp4']}]};
 fails(()=>assertDeliveryReady({...required,media_response_protocol:'assessment.media-answer.v1'},{...setup,recordingSupported:()=>true}));
 assertDeliveryReady(required,{...setup,recordingSupported:()=>true});
 fails(()=>assertDeliveryReady(required,setup));fails(()=>assertDeliveryReady(required,{...setup,recordingSupported:mime=>mime==='video/webm'}));fails(()=>assertDeliveryReady({...required,media_responses_enabled:false},{...setup,recordingSupported:()=>true}));fails(()=>assertDeliveryReady({...required,media_response_protocol:'old'},{...setup,recordingSupported:()=>true}));fails(()=>assertDeliveryReady({...required,media_capture_groups:[{type:'video_response',mimes:['audio/ogg']}]},{...setup,recordingSupported:()=>true}));fails(()=>assertDeliveryReady(required,{...setup,mediaUrl:undefined,recordingSupported:()=>true}));
 assertDeliveryReady({...required,media_capture_groups:[]},setup);
});
Deno.test('image responses need an explicit compatible server gate and media topology before a clock can start',()=>{
 const required={...requirement,image_response_tools:['hotspot','diagram_labeling'],image_response_protocol:IMAGE_RESPONSE_PROTOCOL,image_responses_enabled:true};
 assertDeliveryReady(required,setup);
 fails(()=>assertDeliveryReady({...required,image_responses_enabled:false},setup));
 fails(()=>assertDeliveryReady({...required,image_response_protocol:'old'},setup));
 fails(()=>assertDeliveryReady({...required,image_response_tools:['script']},setup));
});
function fails(work: () => void) {
  let failed = false;
  try {
    work();
  } catch {
    failed = true;
  }
  if (!failed) throw new Error("Expected delivery to be blocked");
}
Deno.test(
  "text-only assessments do not acquire a media service dependency",
  () => {
    assertDeliveryReady(
      { ...requirement, prompt_media: [], prompt_media_enabled: false },
      { pageUrl: "http://localhost:5180", sharedCookie: false },
    );
  },
);
Deno.test(
  "prompt-media preparation requires enabled delivery and valid credentialed topology",
  () => {
    assertDeliveryReady(requirement, setup);
    assertDeliveryReady(requirement, {
      mediaUrl: "http://localhost:5911",
      pageUrl: "http://localhost:5304",
      sharedCookie: false,
    });
    fails(() =>
      assertDeliveryReady(
        { ...requirement, prompt_media_enabled: false },
        setup,
      ),
    );
    fails(() =>
      assertDeliveryReady(requirement, { ...setup, mediaUrl: undefined }),
    );
    for (const mediaUrl of [
      "http://media.schood.online",
      "https://media.schood.online/path",
      "https://user:secret@media.schood.online",
      "https://media.schood.online/?token=secret",
      "https://media.foreign.invalid",
      "http://127.0.0.1:5911",
    ]) {
      fails(() => assertDeliveryReady(requirement, { ...setup, mediaUrl }));
    }
    fails(() =>
      assertDeliveryReady(requirement, { ...setup, sharedCookie: false }),
    );
    fails(() =>
      assertDeliveryReady(requirement, {
        ...setup,
        pageUrl: "https://exam.schood.online.evil.invalid",
      }),
    );
  },
);
Deno.test(
  "unsupported response capture and malformed preparation never silently downgrade",
  () => {
    fails(() =>
      assertDeliveryReady(
        { ...requirement, response_tools: ["video_response"] },
        setup,
      ),
    );
    for (const value of [
      null,
      [],
      {},
      { ...requirement, prompt_media: ["script"] },
      { ...requirement, schema_version: "old" },
    ])
      fails(() => assertDeliveryReady(value, setup));
  },
);
