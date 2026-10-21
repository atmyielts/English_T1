import { watchAccount } from "../src/account-watch.ts";
function equal(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
Deno.test(
  "fresh session reads detect cross-service account changes without local auth broadcasts",
  async () => {
    let actor = "candidate";
    const seen: string[] = [];
    const watch = watchAccount(
      { current: () => Promise.resolve(actor), subscribe: () => () => {} },
      (value) => seen.push(value),
    );
    await watch.check();
    actor = "foreign";
    await watch.check();
    await watch.check();
    actor = "";
    await watch.check();
    equal(seen, ["candidate", "foreign", ""]);
    watch.close();
  },
);
Deno.test(
  "newer authentication events fence a stale session read and closed observers cannot republish",
  async () => {
    let event!: (value: string) => void, resolve!: (value: string) => void;
    const seen: string[] = [];
    const watch = watchAccount(
      {
        current: () => new Promise((yes) => (resolve = yes)),
        subscribe: (changed) => {
          event = changed;
          return () => {};
        },
      },
      (value) => seen.push(value),
    );
    const check = watch.check();
    event("new-candidate");
    resolve("old-candidate");
    await check;
    equal(seen, ["new-candidate"]);
    const later = watch.check();
    watch.close();
    resolve("private-candidate");
    await later;
    equal(seen, ["new-candidate"]);
  },
);
Deno.test(
  "overlapping session reads coalesce and storage failures clear private view identity",
  async () => {
    let calls = 0,
      resolve!: (value: string) => void;
    const seen: string[] = [];
    const watch = watchAccount(
      {
        current: () => {
          calls++;
          return new Promise((yes) => (resolve = yes));
        },
        subscribe: () => () => {},
      },
      (value) => seen.push(value),
    );
    const first = watch.check();
    await watch.check();
    equal(calls, 1);
    resolve("candidate");
    await first;
    equal(seen, ["candidate"]);
    watch.close();
    const failing = watchAccount(
      {
        current: () => Promise.reject(new Error("cookie storage unavailable")),
        subscribe: (changed) => {
          changed("candidate");
          return () => {};
        },
      },
      (value) => seen.push(value),
    );
    await failing.check();
    equal(seen, ["candidate", "candidate", ""]);
    failing.close();
  },
);
