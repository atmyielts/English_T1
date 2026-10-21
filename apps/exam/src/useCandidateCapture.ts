import { useEffect, useRef, useState } from "react";
import type { openCandidateCapture } from "../../../packages/assessment-web/src/candidate-capture";
import {savedCaptureDevices,type SavedCaptureDevice} from '../../../packages/assessment-web/src/capture-devices';
import type {
  CandidateCaptureView,
  CaptureSource,
} from "../../../packages/proctor-web/src/candidate-capture";
import { useAppT } from "./i18n/index.ts";
import { errorText } from "../../../packages/assessment-web/src/i18n/errors.ts";
export function useCandidateCapture(tenant: string, actor: string) {
  const t = useAppT(), translate = useRef(t);
  translate.current = t;
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
    setRecoveryNotice('');try{setDevices(savedCaptureDevices(tenant,actor));}catch{setDevices([]);setError(translate.current('exam.capture.devicesUnreadable'));}
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
          errorText(cause, translate.current, "exam.capture.failed"),
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
          errorText(cause, translate.current, "exam.capture.prepareFailed"),
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
      if(version.current===token){try{setDevices(savedCaptureDevices(tenant,actor));}catch{setError(translate.current('exam.capture.devicesSupport'));}}
    }
  }
  return {
    view,
    busy,
    error,
    devices,recoveryNotice,
    recoverSaved:(reference:SavedCaptureDevice)=>work(async()=>{const token=version.current;const{recoverCompletedCapture}=await import('../../../packages/assessment-web/src/candidate-capture');if(token!==version.current)return;await recoverCompletedCapture(tenant,actor,reference);if(token===version.current){setDevices(savedCaptureDevices(tenant,actor));setRecoveryNotice(translate.current('exam.capture.recovered'));}}),
    prepare,
    ready: engine.current?.controller.view().ready === true,
    registration: engine.current?.registration,
    start: (source: CaptureSource) =>
      work(async () => {
        if (!engine.current) {
          throw new Error(translate.current("exam.capture.prepareFirst"));
        }
        await engine.current.controller.start(source);
      }),
    recover: () =>
      work(async () => {
        const current=engine.current,token=version.current;
        if (!current) {
          throw new Error(translate.current("exam.capture.prepareFirst"));
        }
        await current.controller.recover();
        if(version.current===token&&engine.current===current)await current.controller.tick();
      }),
    sync: () =>
      work(async () => {
        await engine.current?.controller.tick();
      }),
    reconnectLive:(source:CaptureSource)=>work(async()=>{if(!engine.current)throw new Error(translate.current('exam.capture.prepareFirst'));await engine.current.controller.reconnectLive(source);}),
    binding: async () => {
      if (!engine.current) {
        throw new Error(translate.current("exam.capture.prepareBeforeStart"));
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
