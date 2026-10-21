async (page) => {
  const result = await page.evaluate(async () => {
    const { CaptureRecorder, CaptureJournal, uploadCapture } =
      window.ProctorCaptureFixture;
    const recording = crypto.randomUUID(),
      scope = `capture-test:candidate:tenant:session:${crypto.randomUUID()}`,
      journal = await CaptureJournal.create(scope),
      states = [];
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    document.body.append(canvas);
    const ctx = canvas.getContext("2d");
    let frame = 0;
    const draw = setInterval(() => {
      ctx.fillStyle = "#f6f1e8";
      ctx.fillRect(0, 0, 320, 180);
      ctx.fillStyle = "#182743";
      ctx.font = "20px sans-serif";
      ctx.fillText("Synthetic Schood capture", 24, 40);
      ctx.fillStyle = "#276bd4";
      ctx.fillRect((frame++ * 3) % 260, 80, 60, 50);
    }, 40);
    const stream = canvas.captureStream(15),
      recorder = new CaptureRecorder(
        recording,
        stream,
        journal,
        (s) => states.push(s),
      );
    await journal.initialize({recording_id:recording,session_id:crypto.randomUUID(),source:'camera',mime:recorder.mime});
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, 5600));
    await recorder.stop("runtime_end");
    clearInterval(draw);
    const initial = await journal.pending(recording);
    if (initial.length < 2 || !initial.every((s) => s.bytes.length > 0)) {
      throw new Error(
        "Native recorder did not persist timeslice and final bytes.",
      );
    }
    if (!stream.getTracks().every((t) => t.readyState === "ended")) {
      throw new Error("Physical tracks remained active.");
    }
    journal.close();
    const recovered = await CaptureJournal.create(scope),
      segments = await recovered.pending(recording);
    if (
      segments.length !== initial.length ||
      segments.some((s, i) =>
        s.sequence !== i + 1 || s.start_ms !== (i ? segments[i - 1].end_ms : 0)
      )
    ) throw new Error("Encrypted recovery ordering or intervals changed.");
    const foreign = await CaptureJournal.create(scope + ":other-user");
    if ((await foreign.pending(recording)).length) {
      throw new Error("Foreign scope read footage.");
    }
    foreign.close();
    const blob = new Blob(segments.map((s) => s.bytes), {
        type: recorder.mime,
      }),
      video = document.createElement("video"),
      objectUrl = URL.createObjectURL(blob);
    video.muted = true;
    video.src = objectUrl;
    document.body.append(video);
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () =>
        reject(new Error("Actual capture container could not decode"));
    });
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 350));
    if (
      video.videoWidth !== 320 || video.currentTime <= 0 ||
      video.getVideoPlaybackQuality().totalVideoFrames === 0
    ) throw new Error("Native capture did not decode actual video frames.");
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
    const raw = await new Promise((resolve, reject) => {
      const req = indexedDB.open("schood-proctor-capture", 2);
      req.onsuccess = () => {
        const db = req.result,
          read = db.transaction("segments").objectStore("segments").index(
            "scope",
          ).getAll(scope);
        read.onsuccess = () => {
          db.close();
          resolve(read.result);
        };
        read.onerror = () => reject(read.error);
      };
      req.onerror = () => reject(req.error);
    });
    if (
      raw.some((row) =>
        row.bytes || row.encrypted.byteLength <= row.byte_length ||
        new Uint8Array(row.encrypted).slice(0, 16).join(",") ===
          segments[0].bytes.slice(0, 16).join(",")
      )
    ) throw new Error("Journal contains plaintext capture.");
    const calls = [];
    let lost = true;
    const head = "a".repeat(64),
      backend = {
        async command(action, data, key) {
          calls.push({ action, data, key });
          if (lost) {
            lost = false;
            throw new Error("Lost canonical reservation reply");
          }
          return {
            sequence: data.sequence,
            head_hash: head,
            state: "reserved",
          };
        },
        async part() {},
        async complete(_id, sequence) {
          return { sequence, head_hash: head, state: "committed" };
        },
      };
    try {
      await uploadCapture(segments[0], "0".repeat(64), backend);
      throw new Error("Lost reply was not surfaced");
    } catch (error) {
      if (error.message !== "Lost canonical reservation reply") throw error;
    }
    if ((await recovered.pending(recording)).length !== segments.length) {
      throw new Error("Lost reply discarded saved capture.");
    }
    await uploadCapture(segments[0], "0".repeat(64), backend);
    if (JSON.stringify(calls[0]) !== JSON.stringify(calls[1])) {
      throw new Error("Retry changed reservation identity/manifest.");
    }
    await recovered.opened(recording);
    await recovered.commit(recording,1,'0'.repeat(64),head,segments[0].end_ms);
    if((await recovered.readState(recording)).ack_sequence!==1)throw new Error('Confirmed head was not saved atomically.');
    if ((await recovered.pending(recording)).length !== segments.length - 1) {
      throw new Error("Confirmed receipt was not removable.");
    }
    recovered.close();
    const failureStream = canvas.captureStream(15),
      failureStates = [],
      failure = new CaptureRecorder(crypto.randomUUID(), failureStream, {
        append: async () => {
          throw new Error("Synthetic storage exhaustion");
        },
      }, (s) => failureStates.push(s));
    failure.start();
    const failureDraw = setInterval(() => {
      ctx.fillStyle = frame++ % 2 ? "#182743" : "#276bd4";
      ctx.fillRect(0, 0, 320, 180);
    }, 40);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await failure.stop("runtime_end");
    clearInterval(failureDraw);
    if (
      !failureStates.some((s) => s.state === "failed") ||
      !failureStream.getTracks().every((t) => t.readyState === "ended")
    ) throw new Error("Storage failure did not visibly stop capture.");
    return {
      decoded: true,
      encrypted_recovery: true,
      stop_tracks: true,
      scope_isolation: true,
      lost_reply_retry: true,
      storage_failure_stops: true,
      segments: segments.length,
      captured_bytes: blob.size,
      mime: recorder.mime,
    };
  });
  const rejected=await page.evaluate(()=>{
    const canvas=document.createElement('canvas'),stream=canvas.captureStream(15),supported=MediaRecorder.isTypeSupported;
    try{MediaRecorder.isTypeSupported=()=>false;try{new window.ProctorCaptureFixture.CaptureRecorder(crypto.randomUUID(),stream,{append:async()=>{}},()=>{});throw new Error('Unsupported recording was accepted');}catch(error){if(error.message==='Unsupported recording was accepted')throw error;}}finally{MediaRecorder.isTypeSupported=supported;}
    return stream.getTracks().every(track=>track.readyState==='ended');
  });
  if(!rejected)throw new Error('Unsupported recorder left physical tracks live.');
  return {...result,unsupported_stops:true};
}
