import { proctorRequest } from "./client";
import {
  captureBinding,
  type CaptureLaunch,
} from "../../assessment-core/src/capture-launch";
import {
  CandidateCapture,
  type CandidateCaptureView,
} from "../../proctor-web/src/candidate-capture";
import { CaptureJournal } from "../../proctor-web/src/capture-journal";
import { CaptureUploads } from "../../proctor-web/src/capture-runtime";
import { acquireCapture, CaptureRecorder } from "../../proctor-web/src/capture";
import { captureDigest } from "../../proctor-web/src/capture-upload";
import { captureTransport, evidenceEndpoint } from "./capture-transport";
import {captureDeviceKey,type SavedCaptureDevice} from './capture-devices';
import {CandidateLive} from '../../proctor-web/src/candidate-live';
import {livePorts} from './live-proctor';
async function hold(scope: string): Promise<() => void> {
  let release!: () => void,
    yes!: (value: () => void) => void,
    no!: (cause: unknown) => void;
  const lifetime = new Promise<void>((resolve) => release = resolve),
    ready = new Promise<() => void>((resolve, reject) => {
      yes = resolve;
      no = reject;
    });
  void navigator.locks.request("schood-candidate-capture:" + scope, {
    ifAvailable: true,
  }, async (lock) => {
    if (!lock) {
      no(
        new Error(
          "Required exam capture is already open in another tab. Close that tab first.",
        ),
      );
      return;
    }
    yes(release);
    await lifetime;
  }).catch(no);
  return ready;
}
export async function openCandidateCapture(
  tenant: string,
  actor: string,
  registration: string,
  changed: (value: CandidateCaptureView) => void,
) {
  evidenceEndpoint();
  if (!navigator.locks || !crypto.subtle || !window.isSecureContext) {
    throw new Error(
      "Required capture needs a secure supported browser with device locking.",
    );
  }
  const scope = `${tenant}:${actor}:${registration}`,
    key = captureDeviceKey(tenant,actor,registration),
    release = await hold(scope);
  let journal: CaptureJournal | null = null,
    controller: CandidateCapture | null = null;
  try {
    const raw = sessionStorage.getItem(key),
      saved = raw ? JSON.parse(raw) : {
        device_id: crypto.randomUUID(),
        token_hash: await captureDigest(
          crypto.getRandomValues(new Uint8Array(32)),
        ),
        open_key: crypto.randomUUID(),
      };
    const binding = captureBinding(saved);
    if (
      typeof saved.open_key !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(saved.open_key)
    ) {
      throw new Error(
        "Capture device data is invalid. Preserve this device and contact your institution.",
      );
    }
    sessionStorage.setItem(key, JSON.stringify(saved));
    const opened = await proctorRequest<CaptureLaunch>(
      "capture/commands",
      tenant,
      {
        action: "capture.open",
        data: { registration_id: registration, ...binding },
      },
      saved.open_key,
      actor,
    );
    const current = await proctorRequest<CaptureLaunch>(
      "capture/sessions/" + opened.session_id,
      tenant,
      undefined,
      undefined,
      actor,
    );
    if (current.registration_id !== registration) {
      throw new Error("Capture registration changed.");
    }
    sessionStorage.setItem(key,JSON.stringify({...saved,session_id:current.session_id}));
    journal = await CaptureJournal.create(
      `${tenant}:${actor}:${current.session_id}`,
    );
    const store = journal,
      backend = captureTransport(tenant, actor, () => {
        void controller?.close("capture_error").catch(() => {});
      }),
      uploads = new CaptureUploads(store, backend);
    const live=current.monitoring_mode==='live'?new CandidateLive(()=>livePorts(tenant,actor,current.session_id,binding),()=>controller?.liveChanged()):undefined;
    controller = new CandidateCapture(current, {
      ...(live?{live}:{}),
      store,
      uploads,
      acquire: (source) => acquireCapture(source),
      recorder: (id, stream, sink, status) => {
        if (!(stream instanceof MediaStream)) {
          throw new Error(
            "The browser did not provide a native capture stream.",
          );
        }
        return new CaptureRecorder(id, stream, sink, status);
      },
      heartbeat: () =>
        proctorRequest<CaptureLaunch>(
          "capture/commands",
          tenant,
          {
            action: "capture.heartbeat",
            data: { session_id: current.session_id, ...binding },
          },
          crypto.randomUUID(),
          actor,
        ).catch((cause) => {
          if (
            [401, 403].includes((cause as { status?: number })?.status ?? 0) ||
            /signed-in account changed|sign in to continue/i.test(
              (cause as Error)?.message ?? "",
            )
          ) void controller?.close("capture_error").catch(() => {});
          throw cause;
        }),
    }, changed);
    const device = controller;
    if (current.state === "completed") {
      const states = await store.states();
      if (states.some((state) => state.phase !== "sealed")) {
        throw new Error(
          "Completed monitoring still has saved footage. Preserve this device and contact your institution.",
        );
      }
      if (!current.attempt_id) sessionStorage.removeItem(key);
      throw new Error(
        current.attempt_id
          ? "This monitored assessment is already completed."
          : "The previous preparation was cancelled. Choose Prepare capture again.",
      );
    }
    await device.recover();
    let disposed = false;
    return {
      controller: device,
      registration,
      session: current.session_id,
      async startBinding() {
        await device.tick();
        if (!device.view().ready) {
          throw new Error(
            "Keep all required sources recording and wait for saved-media confirmation before starting.",
          );
        }
        return { session_id: current.session_id, ...binding };
      },
      async cancel() {
        await device.close("user_stop");
        await proctorRequest(
          "capture/commands",
          tenant,
          {
            action: "capture.cancel",
            data: { session_id: current.session_id, ...binding },
          },
          "capture-cancel:" + current.session_id,
          actor,
        );
        sessionStorage.removeItem(key);
        await this.dispose();
      },
      async dispose(
        reason: "runtime_end" | "user_stop" | "capture_error" = "runtime_end",
      ) {
        if (disposed) return;
        disposed = true;
        try {
          await device.close(reason);
          if(reason==='runtime_end'){
            const latest=await proctorRequest<CaptureLaunch>('capture/sessions/'+current.session_id,tenant,undefined,undefined,actor);
            if(latest.state==='completed')sessionStorage.removeItem(key);
          }
        } finally {
          store.close();
          release();
        }
      },
    };
  } catch (cause) {
    try {
      await controller?.close("capture_error");
    } catch { /* Keep saved bytes when closure cannot be confirmed. */ }
    journal?.close();
    release();
    throw cause;
  }
}
/** Explicit post-exam recovery never opens devices or creates an academic attempt. */
export async function recoverCompletedCapture(tenant:string,actor:string,reference:SavedCaptureDevice){
 const state=await proctorRequest<CaptureLaunch>('capture/sessions/'+reference.session,tenant,undefined,undefined,actor);
 if(state.registration_id!==reference.registration)throw new Error('Saved recording registration changed.');
 if(state.state!=='completed')throw new Error('This monitoring session is still open. Resume its exam sitting to recover capture safely.');
 const store=await CaptureJournal.create(`${tenant}:${actor}:${reference.session}`);
 try{
  const uploads=new CaptureUploads(store,captureTransport(tenant,actor,()=>{}));
  for(const entry of await store.states()){
   if(entry.meta.session_id!==reference.session)throw new Error('Saved recording scope changed. Preserve this device.');
   if(entry.phase!=='sealed')await uploads.close(entry.meta.recording_id,(entry.close_reason as 'runtime_end'|'track_lost'|'user_stop'|'capture_error'|null)??'runtime_end');
  }
  if((await store.states()).some(entry=>entry.phase!=='sealed'))throw new Error('Some footage still needs confirmation. Keep this device and retry.');
  sessionStorage.removeItem(captureDeviceKey(tenant,actor,reference.registration));
 }finally{store.close();}
}
