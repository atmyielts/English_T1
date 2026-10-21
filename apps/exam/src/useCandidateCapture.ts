import { useEffect, useRef, useState } from "react";
import type { openCandidateCapture } from "../../../packages/assessment-web/src/candidate-capture";
import {savedCaptureDevices,type SavedCaptureDevice} from '../../../packages/assessment-web/src/capture-devices';
import type {
  CandidateCaptureView,
  CaptureSource,
} from "../../../packages/proctor-web/src/candidate-capture";
export function useCandidateCapture(tenant: string, actor: string) {
  const [view, setView] = useState<CandidateCaptureView | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [session, setSession] = useState(""),[devices,setDevices]=useState<SavedCaptureDevice[]>([]),[recoveryNotice,setRecoveryNotice]=useState('');
  const engine = useRef<
      Awaited<ReturnType<typeof openCandidateCapture>> | null
    >(null),
    version = useRef(0);
  useEffect(() => {
    const token = ++version.current;
    setView(null);
    setError("");
    setBusy(false);
    setSession("");
    setRecoveryNotice('');try{setDevices(savedCaptureDevices(tenant,actor));}catch{setDevices([]);setError('Saved recording details could not be read. Preserve this device and contact your institution.');}
    const previous = engine.current;
    engine.current = null;
    void previous?.dispose().catch(() => {});
    return () => {
      if (version.current === token) version.current++;
      const current = engine.current;
      engine.current = null;
      void current?.dispose().catch(() => {});
    };
  }, [tenant, actor]);
  async function work(action: () => Promise<unknown>) {
    const token = version.current;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      if (version.current === token) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Required recording could not continue.",
        );
      }
    } finally {
      if (version.current === token) setBusy(false);
    }
  }
  async function prepare(registration: string) {
    const token = version.current;
    setBusy(true);
    setError("");
    try {
      if (
        engine.current?.registration === registration &&
        !engine.current.controller.view().closed
      ) {
        await engine.current.controller.tick();
        return;
      }
      const old = engine.current;
      engine.current = null;
      await old?.dispose();
      const { openCandidateCapture: open } = await import(
        "../../../packages/assessment-web/src/candidate-capture"
      );
      if (version.current !== token) return;
      const created = await open(tenant, actor, registration, (value) => {
        if (version.current === token) setView(value);
      });
      if (version.current !== token) {
        await created.dispose();
        return;
      }
      engine.current = created;
      setSession(created.session);
    } catch (cause) {
      if (version.current === token) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Capture preparation failed.",
        );
      }
      throw cause;
    } finally {
      if (version.current === token) setBusy(false);
    }
  }
  useEffect(() => {
    if (!session) return;
    const tick = () => {
      const current = engine.current;
      if (current && !current.controller.view().closed) {
        void current.controller.tick().catch(() => {});
      }
    };
    const timer = setInterval(tick, 5000),
      hide = () => {
        void engine.current?.controller.close("capture_error").catch(() => {});
      };
    window.addEventListener("online", tick);
    window.addEventListener("pagehide", hide);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", tick);
      window.removeEventListener("pagehide", hide);
    };
  }, [session]);
  async function dispose(
    reason: "runtime_end" | "user_stop" | "capture_error" = "runtime_end",
  ) {
    const token=version.current;
    setSession("");
    const current = engine.current;
    engine.current = null;
    try{await current?.dispose(reason);}finally{
      if(version.current===token){try{setDevices(savedCaptureDevices(tenant,actor));}catch{setError('Saved recording details need institution support.');}}
    }
  }
  return {
    view,
    busy,
    error,
    devices,recoveryNotice,
    recoverSaved:(reference:SavedCaptureDevice)=>work(async()=>{const token=version.current;const{recoverCompletedCapture}=await import('../../../packages/assessment-web/src/candidate-capture');if(token!==version.current)return;await recoverCompletedCapture(tenant,actor,reference);if(token===version.current){setDevices(savedCaptureDevices(tenant,actor));setRecoveryNotice('Saved footage and its final recording receipts are confirmed.');}}),
    prepare,
    ready: engine.current?.controller.view().ready === true,
    registration: engine.current?.registration,
    start: (source: CaptureSource) =>
      work(async () => {
        if (!engine.current) {
          throw new Error("Prepare required recording first.");
        }
        await engine.current.controller.start(source);
      }),
    recover: () =>
      work(async () => {
        const current=engine.current,token=version.current;
        if (!current) {
          throw new Error("Prepare required recording first.");
        }
        await current.controller.recover();
        if(version.current===token&&engine.current===current)await current.controller.tick();
      }),
    sync: () =>
      work(async () => {
        await engine.current?.controller.tick();
      }),
    reconnectLive:(source:CaptureSource)=>work(async()=>{if(!engine.current)throw new Error('Prepare required recording first.');await engine.current.controller.reconnectLive(source);}),
    binding: async () => {
      if (!engine.current) {
        throw new Error(
          "Prepare required recording before starting.",
        );
      }
      return engine.current.startBinding();
    },
    cancel: async () => {
      const current = engine.current,token=version.current;
      if (current) {
        await current.cancel();
      }
      if(version.current!==token||engine.current!==current)return;
      engine.current = null;
      setSession("");
      setView(null);
      setDevices(savedCaptureDevices(tenant,actor));
    },
    dispose,
  };
}
